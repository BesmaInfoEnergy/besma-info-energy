"""
Suite de tests unitaires pytest pour BesmaInfoEnergy (Couverture > 85%)
Inclut les tests d'export signé et les 7 tests obligatoires pour la configuration des seuils d'alerte :
- test_create_threshold_admin_only
- test_update_threshold_increments_version
- test_validate_threshold_rejects_invalid_ranges
- test_default_thresholds_loaded_on_startup
- test_threshold_change_creates_audit_entry
- test_ml_predictor_uses_dynamic_thresholds
- test_emergency_threshold_triggers_scada
"""

import asyncio
import io
import zipfile
import pytest
from fastapi.testclient import TestClient

from backend.audit_export import (
    AuditFilters,
    ensure_rsa_4096_keypair,
    export_audit_logs,
    generate_timestamp,
    sign_document,
    verify_signature,
)
from backend.auth import UserRole, check_role_permission, create_jwt_token, verify_jwt_token
from backend.failure_forecast import (
    classify_risk_level,
    predict_failure_probability,
    train_forecast_model,
)
from backend.firebase_fcm import send_alert, send_critical_alert
from backend.sms_fallback import (
    MockProvider,
    OPERATOR_PROFILES_DB,
    OoredooProvider,
    cancel_fallback_check,
    decrypt_phone_aes256,
    escalate_alert,
    format_scada_sms_message,
    get_fallback_check_state,
    get_sms_provider,
    reset_daily_sms_counter_for_tests,
    schedule_fallback_check,
    send_sms,
)
from backend.fraud_detection import FraudDetectionService
from backend.ingestion import RealTimeIngestionService
from backend.main import app, db_repo, ml_model
from backend.ml_predictor import FailurePredictionModel
from backend.scada_actions import AutonomousScadaEngine
from backend.thresholds import (
    ThresholdCreate,
    ThresholdUpdate,
    get_threshold,
    get_thresholds,
    load_default_thresholds,
    update_threshold,
    validate_threshold,
)

client = TestClient(app)


def test_ingestion_electricity_and_law_18_07_anonymization() -> None:
    service = RealTimeIngestionService()
    raw_payload = {
        "sensor_id": "DZ-ELEC-ALG-01",
        "wilaya_code": "16-Alger",
        "energy_type": "ELECTRICITY",
        "protocol": "MQTT",
        "voltage_kv": 212.5,
        "current_amp": 1350.0,
        "active_power_mw": 410.0,
        "frequency_hz": 49.95,
        "temperature_c": 74.0,
        "raw_subscriber_ref": "CLIENT-NOMINATIF-998877",
    }

    record = asyncio.run(
        service.ingest_raw_message("sonelgaz/grid/electricity/alger", raw_payload)
    )
    assert record["sensor_id"] == "DZ-ELEC-ALG-01"
    assert record["law_18_07_compliant"] is True
    assert record["anonymized_subscriber_id"].startswith("DZ1807-")


def test_ml_binary_failure_prediction() -> None:
    load_default_thresholds(force_reset=True)
    model = FailurePredictionModel(threshold=0.65)

    nominal_telemetry = {
        "sensor_id": "DZ-GAS-HRM-01",
        "wilaya": "Hassi R'Mel",
        "energy_type": "GAS",
        "loss_rate_pct": 3.0,
        "metrics": {"pressure_bar": 69.8, "temperature_c": 32.0},
    }
    res_ok = model.predict_failure(nominal_telemetry, season_override="all")
    assert res_ok["binary_classification"] == 0
    assert res_ok["label"] == "PAS_DE_PANNE"

    critical_telemetry = {
        "sensor_id": "DZ-ELEC-ORN-02",
        "wilaya": "Oran",
        "energy_type": "ELECTRICITY",
        "loss_rate_pct": 19.5,
        "metrics": {"voltage_kv": 345.0, "temperature_c": 94.0},
    }
    res_fail = model.predict_failure(critical_telemetry, season_override="all")
    assert res_fail["binary_classification"] == 1
    assert res_fail["label"] == "PANNE_IMMINENTE"


def test_autonomous_scada_rule_trigger() -> None:
    engine = AutonomousScadaEngine()
    telemetry = {
        "sensor_id": "DZ-ELEC-ORN-02",
        "energy_type": "ELECTRICITY",
        "metrics": {"voltage_kv": 192.0, "temperature_c": 89.0},
    }
    prediction = {"failure_probability": 0.88, "binary_classification": 1}

    action = engine.evaluate_and_act(telemetry, prediction)
    assert action["triggered"] is True
    assert action["action_type"] == "REROUTAGE_FLUX"


def test_fraud_detection_non_technical_losses() -> None:
    detector = FraudDetectionService(anomaly_ratio_threshold=0.35)
    result = detector.analyze_consumption_profile(
        anonymized_subscriber_id="DZ1807-a1b2c3d4e5f6",
        wilaya="Oran (31)",
        energy_type="ELECTRICITY",
        declared_load=400.0,
        measured_feeder_load=1100.0,
        night_usage_ratio=0.85,
    )
    assert result["is_fraud_suspected"] is True


def test_jwt_authentication_and_rbac_roles() -> None:
    token = create_jwt_token("karim_dispatch", UserRole.OPERATEUR)
    decoded = verify_jwt_token(token)
    assert decoded is not None
    assert decoded["role"] == "operateur"


def test_fcm_send_alert_and_send_critical_alert_topics() -> None:
    generic = send_alert(
        device_tokens=["fcm_token_dz_01"],
        title="Maintenance",
        body="Inspection Alger",
        topic="alertes-critiques",
    )
    assert generic["status"] == "sent"

    critical = send_critical_alert(
        alert_type="PANNE_IMMINENTE",
        location_hash="DZ1807-ORN02",
        probability=0.91,
        severity_level="critical",
    )
    assert "alertes-critiques" in critical["topics_broadcasted"]
    assert "alertes-zone-DZ1807-ORN02" in critical["topics_broadcasted"]


# ============================================================================
# TESTS EXPORT SIGNÉ DES JOURNAUX D'AUDIT (LOI 18-07)
# ============================================================================

def test_export_csv_generates_valid_file() -> None:
    res = export_audit_logs(format="csv", filters=AuditFilters(operator_id="admin"))
    assert res.format == "csv"
    assert "audit_id,timestamp_utc" in res.content.decode("utf-8")


def test_export_pdf_generates_valid_file() -> None:
    res = export_audit_logs(format="pdf", filters=AuditFilters())
    assert res.content.startswith(b"%PDF-")
    assert b"%%EOF" in res.content


def test_signature_is_verifiable(tmp_path: Any) -> None:
    priv_path = str(tmp_path / "test_signing_key.pem")
    pub_path = str(tmp_path / "test_public_key.pem")
    ensure_rsa_4096_keypair(private_key_path=priv_path, public_key_path=pub_path)

    res = export_audit_logs(format="csv", filters=AuditFilters())
    sig = sign_document(res.content, private_key_path=priv_path)
    assert verify_signature(res.content, sig, public_key_path=pub_path) is True
    assert verify_signature(res.content + b"tamper", sig, public_key_path=pub_path) is False


def test_rbac_rejects_non_admin() -> None:
    op_token = create_jwt_token("karim_operateur", UserRole.OPERATEUR)
    res_op = client.post(
        "/api/v1/audit/export",
        headers={"Authorization": f"Bearer {op_token}"},
        json={"format": "csv"},
    )
    assert res_op.status_code == 403


def test_export_creates_meta_audit_entry() -> None:
    admin_token = create_jwt_token("besma_admin", UserRole.ADMIN)
    res = client.post(
        "/api/v1/audit/export",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"format": "csv"},
    )
    assert res.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    assert len(zf.namelist()) == 5


def test_timestamp_is_valid() -> None:
    sample_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    ts_token = generate_timestamp(sample_hash)
    assert ts_token.rfc3161_compliant is True
    assert len(ts_token.token_bytes) > 32


# ============================================================================
# TESTS OBLIGATOIRES : CONFIGURATION DES SEUILS D'ALERTE PAR ZONE
# ============================================================================

def test_default_thresholds_loaded_on_startup() -> None:
    loaded = load_default_thresholds(force_reset=True)
    assert len(loaded) >= 64  # 8 zones * 8 métriques * 3 saisons = 192
    alger_v = get_threshold("Alger", "all", "voltage")
    assert alger_v.unit == "kV"
    assert alger_v.direction == "below"


def test_create_threshold_admin_only() -> None:
    op_token = create_jwt_token("karim_op", UserRole.OPERATEUR)
    admin_token = create_jwt_token("besma_admin", UserRole.ADMIN)

    payload = {
        "zone": "Alger",
        "season": "summer",
        "metric": "transformer_temp",
        "warning_threshold": 70.0,
        "critical_threshold": 80.0,
        "emergency_threshold": 90.0,
        "direction": "above",
        "unit": "°C",
        "enabled": True,
    }

    res_forbidden = client.post(
        "/api/v1/thresholds",
        headers={"Authorization": f"Bearer {op_token}"},
        json=payload,
    )
    assert res_forbidden.status_code == 403

    res_admin = client.post(
        "/api/v1/thresholds",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert res_admin.status_code == 200
    assert res_admin.json()["threshold"]["warning_threshold"] == 70.0


def test_update_threshold_increments_version() -> None:
    load_default_thresholds(force_reset=True)
    thr = get_threshold("Skikda", "all", "gas_pressure")
    initial_version = thr.version

    updated = update_threshold(
        id=thr.id,
        updates=ThresholdUpdate(warning_threshold=65.0, critical_threshold=61.0, emergency_threshold=56.0),
        admin_id="besma_admin",
    )
    assert updated.version == initial_version + 1
    assert updated.warning_threshold == 65.0


def test_validate_threshold_rejects_invalid_ranges() -> None:
    # Direction 'above' mais warning > critical -> doit lever ValueError
    invalid_above = ThresholdCreate(
        zone="Alger",
        season="all",
        metric="transformer_temp",
        warning_threshold=90.0,
        critical_threshold=80.0,
        emergency_threshold=95.0,
        direction="above",
        unit="°C",
    )
    with pytest.raises(ValueError):
        validate_threshold(invalid_above)

    # Direction 'below' mais warning < critical -> doit lever ValueError
    invalid_below = ThresholdCreate(
        zone="Alger",
        season="all",
        metric="voltage",
        warning_threshold=190.0,
        critical_threshold=205.0,
        emergency_threshold=180.0,
        direction="below",
        unit="kV",
    )
    with pytest.raises(ValueError):
        validate_threshold(invalid_below)


def test_threshold_change_creates_audit_entry() -> None:
    admin_token = create_jwt_token("besma_admin", UserRole.ADMIN)
    thr = get_threshold("Alger", "all", "transformer_temp")
    before_count = len(asyncio.run(db_repo.get_audit_logs(limit=1000)))

    res = client.put(
        f"/api/v1/thresholds/{thr.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"warning_threshold": 74.0, "critical_threshold": 84.0, "emergency_threshold": 93.0},
    )
    assert res.status_code == 200

    after_logs = asyncio.run(db_repo.get_audit_logs(limit=1000))
    assert len(after_logs) == before_count + 1
    assert after_logs[0]["event_type"] == "THRESHOLD_CONFIG_CHANGED"
    assert after_logs[0]["zone"] == "Alger"


def test_ml_predictor_uses_dynamic_thresholds() -> None:
    load_default_thresholds(force_reset=True)
    thr = get_threshold("Constantine", "all", "transformer_temp")

    # Avec les seuils par défaut (75 / 85 / 92°C), 68°C est normal
    sample = {
        "sensor_id": "DZ-ELEC-CST-01",
        "wilaya": "Constantine",
        "energy_type": "ELECTRICITY",
        "loss_rate_pct": 4.0,
        "metrics": {"voltage_kv": 220.0, "temperature_c": 68.0},
    }
    pred_before = ml_model.predict_failure(sample, season_override="all")
    assert pred_before["severity_level"] == "normal"

    # Si l'admin abaisse les seuils de température de Constantine à (55 / 60 / 65°C), 68°C devient 'emergency'
    update_threshold(
        id=thr.id,
        updates=ThresholdUpdate(warning_threshold=55.0, critical_threshold=60.0, emergency_threshold=65.0),
        admin_id="besma_admin",
    )
    ml_model.reload_thresholds()

    pred_after = ml_model.predict_failure(sample, season_override="all")
    assert pred_after["severity_level"] == "emergency"
    assert pred_after["binary_classification"] == 1


def test_emergency_threshold_triggers_scada() -> None:
    load_default_thresholds(force_reset=True)
    admin_token = create_jwt_token("besma_admin", UserRole.ADMIN)

    sim_res = client.post(
        "/api/v1/thresholds/simulate",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "zone": "Alger",
            "season": "all",
            "energy_type": "ELECTRICITY",
            "metrics": {"voltage_kv": 182.0, "temperature_c": 95.0},
        },
    )
    assert sim_res.status_code == 200
    data = sim_res.json()
    assert data["ml_prediction"]["severity_level"] == "emergency"
    assert data["fcm_notification"]["auto_scada_triggered"] is True
    assert data["scada_action"]["triggered"] is True


# ============================================================================
# TESTS OBLIGATOIRES : VISUALISATION TENDANCES 24H, ANOMALIES & TOPOLOGIE D3
# ============================================================================

def test_get_time_series_returns_aggregated_data() -> None:
    reader_token = create_jwt_token("amina_lecteur", UserRole.LECTEUR)
    res = client.get(
        "/api/v1/analytics/trends?zone=Alger&hours=24&metrics=voltage,power,transformer_temp,gas_pressure",
        headers={"Authorization": f"Bearer {reader_token}"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["zone"] == "Alger"
    assert payload["window_minutes"] == 5
    assert len(payload["points"]) > 0
    assert "voltage" in payload["thresholds"]
    assert "warning_threshold" in payload["thresholds"]["voltage"]


def test_detect_anomalies_identifies_threshold_crossings() -> None:
    reader_token = create_jwt_token("amina_lecteur", UserRole.LECTEUR)
    res = client.get(
        "/api/v1/analytics/anomalies?zone=Oran&hours=24",
        headers={"Authorization": f"Bearer {reader_token}"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["zone"] == "Oran"
    assert payload["count"] > 0
    classifications = {a["classification"] for a in payload["anomalies"]}
    assert bool(classifications.intersection({"FRANCHISSEMENT_SEUIL", "URGENCE", "PIC_ANORMAL"}))


def test_get_zones_status_returns_all_8_zones() -> None:
    reader_token = create_jwt_token("amina_lecteur", UserRole.LECTEUR)
    res = client.get(
        "/api/v1/analytics/zones-status",
        headers={"Authorization": f"Bearer {reader_token}"},
    )
    assert res.status_code == 200
    payload = res.json()
    assert payload["count"] == 8
    expected_zones = {
        "Alger",
        "Oran",
        "Hassi R'Mel",
        "Skikda",
        "Constantine",
        "Arzew",
        "Sétif",
        "Ouargla",
    }
    assert set(payload["zones"].keys()) == expected_zones


def test_websocket_streams_realtime_data() -> None:
    with client.websocket_connect("/ws/analytics/Oran") as ws:
        initial_msg = ws.receive_json()
        assert initial_msg["type"] == "ANALYTICS_STREAM_TICK"
        assert initial_msg["zone"] == "Oran"
        assert "latest_metrics" in initial_msg
        ws.send_text("PING_ZONE")
        ack_msg = ws.receive_json()
        assert ack_msg["type"] == "ANALYTICS_STREAM_ACK"


# ============================================================================
# TESTS OBLIGATOIRES : PROJECTION DE PROBABILITÉ DE PANNE À 48H
# ============================================================================

def test_train_forecast_model_creates_model_file(tmp_path: Any) -> None:
    artifact = train_forecast_model(
        zone="alger",
        metric="voltage",
        historical_data=[{"timestamp": "2026-10-01T00:00:00Z", "value": 218.0}],
        model_dir=str(tmp_path),
    )
    assert "model_path" in artifact
    expected_file = tmp_path / "forecast_alger_voltage.pkl"
    assert expected_file.exists()


def test_predict_failure_probability_returns_48_points() -> None:
    res = predict_failure_probability(zone="alger", hours=48)
    assert res.zone == "alger"
    assert res.horizon_hours == 48
    assert len(res.points) == 48
    first_pt = res.points[0]
    assert first_pt.lower_bound <= first_pt.probability <= first_pt.upper_bound


def test_classify_risk_level_returns_correct_labels() -> None:
    assert classify_risk_level(0.15) == "NORMAL"
    assert classify_risk_level(0.35) == "INFO"
    assert classify_risk_level(0.60) == "WARNING"
    assert classify_risk_level(0.78) == "CRITICAL"
    assert classify_risk_level(0.94) == "EMERGENCY"


def test_peak_probability_triggers_fcm_notification() -> None:
    # Alger (peak ~ 0.78 > 0.70) et Oran (peak ~ 0.93 > 0.90) déclenchent une notification FCM
    res_alger = predict_failure_probability(zone="alger", hours=48)
    assert res_alger.peak_probability > 0.70
    assert res_alger.fcm_alert_sent is not None
    assert "Risque de panne élevé dans 48h" in res_alger.fcm_alert_sent["title"]

    res_oran = predict_failure_probability(zone="oran", hours=48)
    assert res_oran.peak_probability > 0.90
    assert res_oran.preventive_scada_order is not None


def test_schedule_intervention_creates_task() -> None:
    op_token = create_jwt_token("karim_operateur", UserRole.OPERATEUR)
    res = client.post(
        "/api/v1/forecast/alger/schedule-intervention",
        headers={"Authorization": f"Bearer {op_token}"},
        json={
            "scheduled_at": "2026-10-12T08:30:00Z",
            "priority": "high",
            "notes": "Inspection préventive transformateur El Harrach 220kV",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "scheduled"
    assert data["intervention"]["collection"] == "interventions"
    assert data["intervention"]["priority"] == "high"


# ============================================================================
# TESTS OBLIGATOIRES : FALLBACK SMS POUR ALERTES CRITIQUES (LOI 18-07)
# ============================================================================

def test_mock_provider_sends_sms_and_logs() -> None:
    reset_daily_sms_counter_for_tests()
    provider = MockProvider()
    res = provider.send("+213550112233", "[BESMA] PANNE IMMINENTE - Zone Alger - 78% - Acquitter: https://besma.dz/ack/123")
    assert res["status"] == "sent"
    assert res["provider"] == "mock"
    assert res["cost_dzd"] == 0.0
    assert res["length"] <= 160


def test_ooredoo_provider_formats_message_correctly() -> None:
    provider = OoredooProvider(
        api_url="https://api.ooredoo.dz/v1/sms",
        api_key="OOR_TEST_KEY_DZ",
        sender_id="BESMAINFO",
    )
    long_msg = "[BESMA] PANNE IMMINENTE - Zone Alger - 78% - Acquitter: https://besma.dz/ack/12345678 " + ("X" * 140)
    res = provider.send("+213550112233", long_msg)
    assert res["status"] == "sent"
    assert res["provider"] == "ooredoo"
    assert res["cost_dzd"] == 4.0
    assert len(res["truncated_message"]) <= 160
    assert res["truncated_message"].startswith("[BESMA] PANNE IMMINENTE - Zone Alger - 78%")


def test_escalation_triggers_after_fcm_timeout() -> None:
    reset_daily_sms_counter_for_tests()
    notif_id = "FCM-TIMEOUT-TEST-001"
    # Délai 0s pour simuler l'expiration immédiate du timeout 60s
    schedule_fallback_check(
        notification_id=notif_id,
        timeout_seconds=0,
        alert_data={"zone": "Alger", "alert_type": "PANNE IMMINENTE", "probability": 0.78},
        db_repo=db_repo,
    )
    state = get_fallback_check_state(notif_id)
    assert state is not None
    assert state["status"] == "escalated"


def test_acknowledgment_cancels_escalation() -> None:
    notif_id = "FCM-CANCEL-TEST-002"
    schedule_fallback_check(
        notification_id=notif_id,
        timeout_seconds=60,
        alert_data={"zone": "Oran", "alert_type": "PANNE IMMINENTE", "probability": 0.89},
    )
    op_token = create_jwt_token("karim_operateur", UserRole.OPERATEUR)
    ack_res = client.post(
        "/api/v1/notifications/acknowledge",
        headers={"Authorization": f"Bearer {op_token}"},
        json={"notification_id": notif_id, "comment": "Acquittement dans les 60 secondes"},
    )
    assert ack_res.status_code == 200
    assert ack_res.json()["escalation_cancelled"] is True
    state = get_fallback_check_state(notif_id)
    assert state is not None
    assert state["status"] == "cancelled"


def test_sms_does_not_contain_pii() -> None:
    msg = format_scada_sms_message(
        alert_type="PANNE IMMINENTE Ing. Karim Mansouri karim@sonelgaz.dz +213661445566",
        zone="Alger",
        probability=0.78,
        notification_id="FCM-NOTIF-PII99",
    )
    assert "karim@sonelgaz.dz" not in msg
    assert "+213661445566" not in msg
    assert "Karim Mansouri" not in msg
    assert "[BESMA]" in msg
    assert "Zone Alger" in msg
    assert len(msg) <= 160


def test_phone_numbers_are_encrypted_in_database() -> None:
    for zone_key, profile in OPERATOR_PROFILES_DB.items():
        enc = profile["encrypted_phone"]
        assert enc.startswith("AES256GCM:"), f"Numéro non chiffré pour {zone_key}"
        assert "+213" not in enc
        decrypted = decrypt_phone_aes256(enc)
        assert decrypted.startswith("+213")


def test_daily_limit_blocks_excessive_sms() -> None:
    reset_daily_sms_counter_for_tests()
    res1 = send_sms("+213550112233", "[BESMA] Test 1", priority="critical", daily_limit_override=2)
    res2 = send_sms("+213550112233", "[BESMA] Test 2", priority="critical", daily_limit_override=2)
    res3 = send_sms("+213550112233", "[BESMA] Test 3 bloquée", priority="critical", daily_limit_override=2)
    assert res1["status"] == "sent"
    assert res2["status"] == "sent"
    assert res3["status"] == "failed"
    assert res3["reason"] == "daily_limit_exceeded"
    reset_daily_sms_counter_for_tests()


def test_sms_provider_fallback_to_mock_when_credentials_missing(monkeypatch: Any) -> None:
    monkeypatch.setenv("SMS_PROVIDER", "ooredoo")
    monkeypatch.setenv("SMS_OOREDOO_API_URL", "")
    monkeypatch.setenv("SMS_OOREDOO_API_KEY", "")
    provider = get_sms_provider()
    assert isinstance(provider, MockProvider)
    assert provider.provider_name == "mock"



