"""
Module 5 : API REST & WebSocket FastAPI (BesmaInfoEnergy)
Inclut les 8 endpoints de gestion des seuils d'alerte par zone (/api/v1/thresholds*) :
- GET    /api/v1/thresholds
- POST   /api/v1/thresholds
- PUT    /api/v1/thresholds/{id}
- DELETE /api/v1/thresholds/{id}
- GET    /api/v1/thresholds/history/{zone}
- POST   /api/v1/thresholds/simulate
- GET    /api/v1/thresholds/export
- POST   /api/v1/thresholds/import
"""

from typing import Any, Dict, List, Literal, Optional
from fastapi import Depends, FastAPI, HTTPException, Header, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from backend.analytics import (
    detect_anomalies,
    get_time_series,
    get_zones_status,
)
from backend.audit_export import (
    AuditFilters,
    build_signed_audit_zip,
    ensure_rsa_4096_keypair,
    export_audit_logs,
    generate_timestamp,
    log_export_event,
    sign_document,
)
from backend.auth import UserRole, check_role_permission, create_jwt_token, verify_jwt_token
from backend.database import SovereignMongoRepository, hash_ip_address
from backend.failure_forecast import (
    get_forecast_history,
    predict_failure_probability,
    schedule_preventive_intervention,
)
from backend.firebase_fcm import send_critical_alert
from backend.sms_fallback import (
    cancel_fallback_check,
    escalate_alert,
    get_escalation_policy,
    get_sms_gateway_status,
    get_sms_history,
    update_escalation_policy,
)
from backend.fraud_detection import FraudDetectionService
from backend.ingestion import RealTimeIngestionService
from backend.ml_predictor import FailurePredictionModel, GeminiContextualAnalyzer
from backend.scada_actions import AutonomousScadaEngine
from backend.thresholds import (
    ThresholdCreate,
    ThresholdUpdate,
    create_threshold,
    delete_threshold,
    export_thresholds_to_csv,
    get_threshold_history,
    get_thresholds,
    import_thresholds_from_csv,
    load_default_thresholds,
    update_threshold,
)

# Initialisation au premier démarrage : Clés RSA-4096 & Seuils SONELGAZ par défaut
ensure_rsa_4096_keypair()
load_default_thresholds()

app = FastAPI(
    title="BesmaInfoEnergy API",
    description="Agent IA autonome d'optimisation de la distribution du gaz et de l'électricité (Conforme Loi 18-07)",
    version="1.3.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_repo = SovereignMongoRepository()
ingestion_service = RealTimeIngestionService()
ml_model = FailurePredictionModel(threshold=0.65)
gemini_analyzer = GeminiContextualAnalyzer()
scada_engine = AutonomousScadaEngine()
fraud_service = FraudDetectionService(anomaly_ratio_threshold=0.35)


class LoginRequest(BaseModel):
    username: str
    password: str
    role: UserRole = UserRole.OPERATEUR


class AcknowledgeNotificationRequest(BaseModel):
    notification_id: str = Field(..., min_length=3)
    comment: Optional[str] = Field(default="Acquittement opérateur SCADA")


class RegisterFcmTokenRequest(BaseModel):
    fcm_token: str = Field(..., min_length=8)
    zone_hash: Optional[str] = Field(default="DZ1807-ALGER-01")
    is_refresh: bool = Field(default=False)


class TriggerCriticalAlertRequest(BaseModel):
    alert_type: str = Field(default="PANNE_IMMINENTE")
    location_hash: str = Field(default="DZ1807-ORN-02")
    probability: float = Field(default=0.89, ge=0.0, le=1.0)
    device_tokens: Optional[List[str]] = None


class AuditExportRequest(BaseModel):
    format: Literal["csv", "pdf"] = Field(default="csv")
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    operator_id: Optional[str] = None
    action_type: Optional[str] = None


class ThresholdSimulateRequest(BaseModel):
    zone: str = "Alger"
    season: Literal["summer", "winter", "all"] = "all"
    energy_type: Literal["ELECTRICITY", "GAS"] = "ELECTRICITY"
    metrics: Dict[str, float]


class ThresholdImportCsvRequest(BaseModel):
    csv_content: str


def get_current_user(authorization: str = Header(default="")) -> Dict[str, Any]:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Jeton Bearer requis.")
    token = authorization.replace("Bearer ", "").strip()
    payload = verify_jwt_token(token)
    if not payload:
        raise HTTPException(status_code=403, detail="Jeton JWT invalide ou expiré.")
    return payload


@app.post("/api/v1/auth/token")
async def login(req: LoginRequest) -> Dict[str, Any]:
    token = create_jwt_token(username=req.username, role=req.role)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": req.role.value,
        "compliance": "Loi Algérienne 18-07",
    }


# ============================================================================
# ENDPOINTS CONFIGURATION DES SEUILS D'ALERTE PAR ZONE (/api/v1/thresholds)
# ============================================================================

@app.get("/api/v1/thresholds")
async def api_list_thresholds(
    zone: Optional[str] = Query(default=None),
    season: Optional[str] = Query(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    items = get_thresholds(zone=zone, season=season)
    return {"thresholds": [t.model_dump() for t in items], "count": len(items)}


@app.get("/api/v1/thresholds/export")
async def api_export_thresholds_csv(
    zone: Optional[str] = Query(default=None),
    season: Optional[str] = Query(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Response:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")
    csv_data = export_thresholds_to_csv(zone=zone, season=season)
    return Response(
        content=csv_data.encode("utf-8"),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="sonelgaz_thresholds.csv"'},
    )


@app.post("/api/v1/thresholds/import")
async def api_import_thresholds_csv(
    req: ThresholdImportCsvRequest,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")
    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)
    try:
        imported = import_thresholds_from_csv(
            csv_text=req.csv_content,
            admin_id=user.get("sub", "admin"),
            ip_hash=ip_hash,
            db_repo=db_repo,
        )
        ml_model.reload_thresholds()
        return {"status": "imported", "count": len(imported), "thresholds": [t.model_dump() for t in imported]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.get("/api/v1/thresholds/history/{zone}")
async def api_get_threshold_history(
    zone: str,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")
    history = get_threshold_history(zone=zone)
    return {"zone": zone, "history": history}


@app.post("/api/v1/thresholds/simulate")
async def api_simulate_thresholds(
    req: ThresholdSimulateRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    telemetry_payload = {
        "sensor_id": f"SIM-{req.zone.upper()[:3]}-01",
        "zone": req.zone,
        "wilaya": req.zone,
        "energy_type": req.energy_type,
        "metrics": req.metrics,
    }
    prediction = ml_model.predict_failure(telemetry_payload, season_override=req.season)
    severity = prediction["severity_level"]

    fcm_dispatch = None
    scada_result = {"triggered": False, "action_type": "AUCUNE_ACTION", "scada_commands": []}

    if severity in ("warning", "critical", "emergency"):
        fcm_dispatch = send_critical_alert(
            alert_type=prediction["label"],
            location_hash=f"DZ1807-{req.zone.upper()[:4]}",
            probability=prediction["failure_probability"],
            severity_level=severity,
        )

    if severity == "emergency":
        scada_result = scada_engine.evaluate_and_act(
            telemetry_payload,
            {"failure_probability": max(0.85, prediction["failure_probability"]), "binary_classification": 1},
        )

    return {
        "simulation": True,
        "zone": req.zone,
        "season": req.season,
        "ml_prediction": prediction,
        "fcm_notification": fcm_dispatch,
        "scada_action": scada_result,
    }


@app.post("/api/v1/thresholds")
async def api_create_threshold(
    req: ThresholdCreate,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Création de seuil strictement réservée aux administrateurs.")

    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)
    try:
        created = create_threshold(
            threshold=req,
            admin_id=user.get("sub", "admin"),
            ip_hash=ip_hash,
            db_repo=db_repo,
        )
        ml_model.reload_thresholds()
        return {"threshold": created.model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.put("/api/v1/thresholds/{threshold_id}")
async def api_update_threshold(
    threshold_id: str,
    req: ThresholdUpdate,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Modification de seuil strictement réservée aux administrateurs.")

    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)
    try:
        updated = update_threshold(
            id=threshold_id,
            updates=req,
            admin_id=user.get("sub", "admin"),
            ip_hash=ip_hash,
            db_repo=db_repo,
        )
        ml_model.reload_thresholds()
        return {"threshold": updated.model_dump()}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@app.delete("/api/v1/thresholds/{threshold_id}")
async def api_delete_threshold(
    threshold_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(status_code=403, detail="Suppression de seuil strictement réservée aux administrateurs.")

    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)
    deleted = delete_threshold(
        id=threshold_id,
        admin_id=user.get("sub", "admin"),
        ip_hash=ip_hash,
        db_repo=db_repo,
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Seuil introuvable.")
    ml_model.reload_thresholds()
    return {"deleted": True, "id": threshold_id}


# ============================================================================
# EXPORT SIGNÉ DES JOURNAUX D'AUDIT (/api/v1/audit/export)
# ============================================================================

@app.post("/api/v1/audit/export")
async def export_signed_audit_archive(
    req: AuditExportRequest,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Response:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : L'export signé des journaux d'audit est strictement réservé aux administrateurs.",
        )

    filters = AuditFilters(
        date_from=req.date_from,
        date_to=req.date_to,
        operator_id=req.operator_id,
        action_type=req.action_type,
    )

    records = await db_repo.get_audit_logs(limit=100000)
    export_res = export_audit_logs(format=req.format, filters=filters, audit_records=records)
    signature_bytes = sign_document(export_res.content)
    ts_token = generate_timestamp(export_res.content_hash)

    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)

    await log_export_event(
        db_repo=db_repo,
        operator_id=user.get("sub", "admin"),
        filters=filters,
        format=req.format,
        ip_hash=ip_hash,
        content_hash=export_res.content_hash,
    )

    zip_bytes = build_signed_audit_zip(
        export_res=export_res,
        signature_bytes=signature_bytes,
        ts_token=ts_token,
    )

    zip_filename = f"{export_res.filename_stem}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{zip_filename}"',
            "X-Audit-Content-Hash": export_res.content_hash,
            "X-Audit-Row-Count": str(export_res.row_count),
        },
    )


@app.post("/api/v1/notifications/acknowledge")
async def acknowledge_notification(
    req: AcknowledgeNotificationRequest,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : Rôle Admin ou Opérateur requis pour acquitter une alerte critique.",
        )

    client_ip = request.client.host if request.client else "127.0.0.1"
    cancelled_escalation = cancel_fallback_check(
        notification_id=req.notification_id,
        acknowledged_by=user.get("sub", "operateur"),
    )
    audit_entry = await db_repo.record_notification_acknowledgment(
        notification_id=req.notification_id,
        operator_username=user.get("sub", "operateur"),
        operator_role=user["role"],
        raw_ip=client_ip,
        comment=req.comment or "Acquittement opérateur SCADA",
    )

    return {
        "status": "acknowledged",
        "notification_id": req.notification_id,
        "escalation_cancelled": cancelled_escalation,
        "audit_log": audit_entry,
    }


@app.post("/api/v1/notifications/register-token")
async def register_operator_fcm_token(
    req: RegisterFcmTokenRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    topics = ["alertes-critiques", f"alertes-zone-{req.zone_hash or 'DZ1807-NATIONAL'}"]
    stored = await db_repo.upsert_operator_token(
        operator_username=user.get("sub", "operateur"),
        operator_role=user["role"],
        fcm_token=req.fcm_token,
        topics=topics,
        refreshed=req.is_refresh,
    )
    return {
        "status": "registered",
        "operator_token": stored,
    }


@app.post("/api/v1/notifications/send-critical")
async def trigger_critical_fcm_alert(
    req: TriggerCriticalAlertRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR]):
        raise HTTPException(status_code=403, detail="Rôle insuffisant.")

    tokens_docs = await db_repo.get_all_operator_tokens()
    tokens = req.device_tokens or [d["fcm_token"] for d in tokens_docs]
    result = send_critical_alert(
        alert_type=req.alert_type,
        location_hash=req.location_hash,
        probability=req.probability,
        device_tokens=tokens,
    )
    return result


@app.post("/api/v1/telemetry/ingest")
async def ingest_sensor_packet(
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR]):
        raise HTTPException(status_code=403, detail="Rôle insuffisant pour l'ingestion.")

    normalized = await ingestion_service.ingest_raw_message(
        topic=f"sonelgaz/grid/{payload.get('energy_type', 'electricity').lower()}",
        raw_payload=payload,
    )
    await db_repo.insert_telemetry(normalized)
    prediction = ml_model.predict_failure(normalized)
    sev = prediction.get("severity_level", "normal")
    scada_action = scada_engine.evaluate_and_act(normalized, prediction)

    fcm_alert = None
    if sev in ("warning", "critical", "emergency") or prediction["binary_classification"] == 1:
        fcm_alert = send_critical_alert(
            alert_type=prediction["label"],
            location_hash=normalized["anonymized_subscriber_id"],
            probability=prediction["failure_probability"],
            device_tokens=[],
            severity_level=sev if sev in ("warning", "critical", "emergency") else "critical",
        )

    if scada_action["triggered"]:
        await db_repo.log_scada_action(scada_action)

    return {
        "telemetry": normalized,
        "ml_prediction": prediction,
        "autonomous_scada": scada_action,
        "fcm_alert": fcm_alert,
    }


@app.post("/api/v1/fraud/evaluate")
async def evaluate_fraud(
    data: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    return fraud_service.analyze_consumption_profile(
        anonymized_subscriber_id=data.get("anonymized_subscriber_id", "DZ1807-0000"),
        wilaya=data.get("wilaya", "Alger (16)"),
        energy_type=data.get("energy_type", "ELECTRICITY"),
        declared_load=float(data.get("declared_load", 100.0)),
        measured_feeder_load=float(data.get("measured_feeder_load", 250.0)),
        night_usage_ratio=float(data.get("night_usage_ratio", 0.75)),
    )


@app.get("/api/v1/grid/history")
async def get_history(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    recent = await db_repo.get_recent_telemetry(limit=25)
    audit_logs = await db_repo.get_audit_logs(limit=50)
    operator_tokens = await db_repo.get_all_operator_tokens()
    return {
        "total_ingested": ingestion_service.total_ingested,
        "recent_telemetry": recent,
        "scada_actions": scada_engine.action_history,
        "audit_logs": audit_logs,
        "operator_tokens": operator_tokens,
    }


# ============================================================================
# ENDPOINTS ANALYTIQUE 24H, ANOMALIES & TOPOLOGIE DES 8 ZONES (/api/v1/analytics/*)
# ============================================================================

@app.get("/api/v1/analytics/trends")
async def api_get_analytics_trends(
    zone: str = Query(default="Alger"),
    hours: int = Query(default=24, ge=1, le=168),
    metrics: Optional[str] = Query(default=None),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    # Accessible en lecture à tous les rôles (admin, operateur, lecteur)
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR, UserRole.LECTEUR]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    metric_list = [m.strip() for m in metrics.split(",")] if metrics else None
    result = get_time_series(zone=zone, hours=hours, metrics=metric_list)
    return result.model_dump()


@app.get("/api/v1/analytics/anomalies")
async def api_get_analytics_anomalies(
    zone: str = Query(default="Alger"),
    hours: int = Query(default=24, ge=1, le=168),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR, UserRole.LECTEUR]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    anomalies = detect_anomalies(zone=zone, hours=hours)
    return {
        "zone": zone,
        "hours": hours,
        "count": len(anomalies),
        "anomalies": [a.model_dump() for a in anomalies],
    }


@app.get("/api/v1/analytics/zones-status")
async def api_get_analytics_zones_status(
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR, UserRole.LECTEUR]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    statuses = get_zones_status()
    return {
        "zones": {k: v.model_dump() for k, v in statuses.items()},
        "count": len(statuses),
    }


@app.websocket("/ws/analytics/{zone}")
async def websocket_analytics_stream(websocket: WebSocket, zone: str) -> None:
    await websocket.accept()
    try:
        series = get_time_series(zone=zone, hours=1, metrics=["voltage", "power", "transformer_temp", "gas_pressure"])
        anomalies = detect_anomalies(zone=zone, hours=24)
        latest_row = series.aligned_series[-1] if series.aligned_series else {}
        await websocket.send_json({
            "type": "ANALYTICS_STREAM_TICK",
            "zone": series.zone,
            "interval_seconds": 5,
            "latest_metrics": latest_row,
            "latest_anomaly": anomalies[0].model_dump() if anomalies else None,
        })
        while True:
            msg = await websocket.receive_text()
            await websocket.send_json({
                "type": "ANALYTICS_STREAM_ACK",
                "zone": series.zone,
                "received": msg,
                "latest_metrics": latest_row,
            })
    except WebSocketDisconnect:
        pass


# ============================================================================
# ENDPOINTS PROJECTION ML DE PROBABILITÉ DE PANNE À 48H (/api/v1/forecast/*)
# ============================================================================

class ScheduleInterventionRequest(BaseModel):
    scheduled_at: str
    priority: Literal["low", "medium", "high", "critical"] = "high"
    notes: str = ""


@app.get("/api/v1/forecast/{zone}/history")
async def api_get_forecast_history(
    zone: str,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : L'historique comparatif des projections ML est réservé aux administrateurs.",
        )
    history = get_forecast_history(zone=zone)
    return {"zone": zone, "history": history, "count": len(history)}


@app.post("/api/v1/forecast/{zone}/schedule-intervention")
async def api_schedule_forecast_intervention(
    zone: str,
    req: ScheduleInterventionRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : Seuls les rôles Admin et Opérateur peuvent planifier une intervention préventive.",
        )
    task = schedule_preventive_intervention(
        zone=zone,
        scheduled_at=req.scheduled_at,
        priority=req.priority,
        notes=req.notes,
        created_by=user.get("sub", "operateur"),
        db_repo=db_repo,
    )
    return {"status": "scheduled", "intervention": task}


@app.get("/api/v1/forecast/{zone}")
async def api_get_zone_failure_forecast(
    zone: str,
    hours: int = Query(default=48, ge=1, le=168),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR, UserRole.LECTEUR]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    forecast = predict_failure_probability(zone=zone, hours=hours)
    return forecast.model_dump()


@app.websocket("/ws/supervision")
async def websocket_supervision(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_text()
            await websocket.send_json({"status": "ACK", "received": msg})
    except WebSocketDisconnect:
        pass


# ============================================================================
# ENDPOINTS FALLBACK SMS & POLITIQUE D'ESCALADE (/api/v1/sms/* & /escalate)
# ============================================================================

class EscalateNotificationRequest(BaseModel):
    reason: Literal["no_acknowledgment", "operator_request", "system_failure"] = "no_acknowledgment"
    zone: Optional[str] = "Alger"
    alert_type: Optional[str] = "PANNE IMMINENTE"
    probability: Optional[float] = 0.78


@app.post("/api/v1/notifications/{notification_id}/escalate")
async def api_manual_escalate_notification(
    notification_id: str,
    req: EscalateNotificationRequest,
    request: Request,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : L'escalade SMS manuelle est strictement réservée aux administrateurs.",
        )
    client_ip = request.client.host if request.client else "127.0.0.1"
    ip_hash = hash_ip_address(client_ip)
    result = escalate_alert(
        notification_id=notification_id,
        alert_data={
            "zone": req.zone or "Alger",
            "alert_type": req.alert_type or "PANNE IMMINENTE",
            "probability": req.probability or 0.78,
        },
        reason=req.reason,
        db_repo=db_repo,
        ip_hash=ip_hash,
    )
    return result


@app.get("/api/v1/sms/status")
async def api_get_sms_status(
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : L'état de la passerelle SMS est réservé aux administrateurs.",
        )
    return get_sms_gateway_status()


@app.get("/api/v1/sms/history")
async def api_get_sms_history(
    limit: int = Query(default=100, ge=1, le=500),
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : L'historique des SMS est réservé aux administrateurs.",
        )
    history = get_sms_history(limit=limit)
    return {"history": history, "count": len(history)}


@app.get("/api/v1/escalation/policy")
async def api_get_escalation_policy(
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN, UserRole.OPERATEUR]):
        raise HTTPException(status_code=403, detail="Accès refusé.")
    return {"policy": get_escalation_policy()}


@app.put("/api/v1/escalation/policy")
async def api_update_escalation_policy(
    updates: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    if not check_role_permission(user["role"], [UserRole.ADMIN]):
        raise HTTPException(
            status_code=403,
            detail="Accès refusé : La modification de la politique d'escalade est réservée aux administrateurs.",
        )
    updated = update_escalation_policy(updates=updates, updated_by=user.get("sub", "admin"))
    return {"status": "saved", "policy": updated}


# ============================================================================
# PRÉFÉRENCE DE THÈME UTILISATEUR ISA-101 (PATCH /api/v1/users/me/theme)
# ============================================================================

class UserThemePreferenceRequest(BaseModel):
    theme_preference: Literal["light", "dark", "auto"]


_USER_THEME_PREFERENCES_STORE: Dict[str, str] = {
    "admin": "light",
    "operateur": "light",
    "lecteur": "light",
}


@app.patch("/api/v1/users/me/theme")
async def api_update_user_theme_preference(
    req: UserThemePreferenceRequest,
    user: Dict[str, Any] = Depends(get_current_user),
) -> Dict[str, Any]:
    username = user.get("sub", "operateur")
    _USER_THEME_PREFERENCES_STORE[username] = req.theme_preference
    return {
        "status": "updated",
        "username": username,
        "theme_preference": req.theme_preference,
        "collection": "users",
        "isa_101_compliant": True,
    }



