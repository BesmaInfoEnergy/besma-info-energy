"""
Module d'Analytique Temporelle 24h, Détection d'Anomalies (Seuils + Z-Score > 3σ)
et Statut Topologique des 8 Zones Nationales (BesmaInfoEnergy)

Fonctions exposées :
1. get_time_series(zone, hours=24, metrics=None) -> TimeSeriesResult
   - Agrégation par fenêtres de 5 minutes (ANALYTICS_AGGREGATION_WINDOW_MINUTES)
   - Retourne les séries temporelles [{timestamp, metric, value, unit}] et les seuils
     warning/critical/emergency associés pour chaque métrique.
2. detect_anomalies(zone, hours=24) -> list[Anomaly]
   - Détection hybride : dépassement de seuil dynamique + détection statistique (z-score > 3.0)
   - Classification : PIC_NORMAL, PIC_ANORMAL, FRANCHISSEMENT_SEUIL, URGENCE
3. get_zones_status() -> dict[str, ZoneStatus]
   - Pour chacune des 8 zones : statut actuel (normal/warning/critical/emergency),
     dernière alerte, dernière action SCADA et coordonnées géographiques/topologiques.
"""

import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel

from backend.thresholds import (
    METRIC_EXPECTED_UNITS,
    ZONES_ALGERIE,
    evaluate_value_against_threshold,
    get_threshold,
    load_default_thresholds,
)

ANALYTICS_AGGREGATION_WINDOW_MINUTES = int(os.getenv("ANALYTICS_AGGREGATION_WINDOW_MINUTES", "5"))
ANALYTICS_ANOMALY_ZSCORE_THRESHOLD = float(os.getenv("ANALYTICS_ANOMALY_ZSCORE_THRESHOLD", "3.0"))
ANALYTICS_MAX_POINTS_RETURNED = int(os.getenv("ANALYTICS_MAX_POINTS_RETURNED", "1000"))
ANALYTICS_CACHE_TTL_SECONDS = int(os.getenv("ANALYTICS_CACHE_TTL_SECONDS", "30"))

DEFAULT_TREND_METRICS = ["voltage", "power", "transformer_temp", "gas_pressure"]


class TimeSeriesPoint(BaseModel):
    timestamp: str
    metric: str
    value: float
    unit: str
    severity: Literal["normal", "warning", "critical", "emergency"] = "normal"
    z_score: float = 0.0
    is_anomaly: bool = False


class MetricThresholdSummary(BaseModel):
    metric: str
    warning_threshold: float
    critical_threshold: float
    emergency_threshold: float
    direction: Literal["above", "below"]
    unit: str


class TimeSeriesResult(BaseModel):
    zone: str
    hours: int
    window_minutes: int
    metrics: List[str]
    points: List[TimeSeriesPoint]
    aligned_series: List[Dict[str, Any]]
    thresholds: Dict[str, MetricThresholdSummary]
    mongo_pipeline_stage: str = "$bucket / $group (5m window)"


class Anomaly(BaseModel):
    id: str
    zone: str
    timestamp: str
    metric: str
    unit: str
    value: float
    threshold_crossed: Optional[float] = None
    z_score: float
    severity: Literal["normal", "warning", "critical", "emergency"]
    classification: Literal["PIC_NORMAL", "PIC_ANORMAL", "FRANCHISSEMENT_SEUIL", "URGENCE"]
    scada_action_triggered: str
    description: str


class ZoneStatus(BaseModel):
    zone: str
    node_id: str
    wilaya: str
    energy_type: Literal["ELECTRICITY", "GAS", "HYBRID"]
    status: Literal["normal", "warning", "critical", "emergency"]
    last_alert: str
    last_scada_action: str
    voltage_kv: float
    power_mw: float
    transformer_temp_c: float
    gas_pressure_bar: float
    failure_probability: float
    coordinates: Dict[str, float]


ZONE_BASELINES: Dict[str, Dict[str, Any]] = {
    "Alger": {
        "node_id": "DZ-ELEC-ALG-01",
        "wilaya": "Alger (16)",
        "energy_type": "ELECTRICITY",
        "voltage": 218.5,
        "power": 425.0,
        "transformer_temp": 71.0,
        "gas_pressure": 66.8,
        "current": 1340.0,
        "frequency": 49.96,
        "gas_flow": 124000.0,
        "compression_ratio": 1.38,
        "coordinates": {"lat": 36.7538, "lng": 3.0588, "x": 495, "y": 95},
        "last_alert": "Pointe résidentielle soirée (+8% charge nominale)",
        "last_scada_action": "Équilibrage automatique jeu de barres 220kV El Harrach",
    },
    "Oran": {
        "node_id": "DZ-ELEC-ORN-02",
        "wilaya": "Oran (31)",
        "energy_type": "ELECTRICITY",
        "voltage": 351.0,  # Sous le seuil emergency (355 kV) -> emergency/critical
        "power": 612.0,
        "transformer_temp": 91.5,
        "gas_pressure": 63.2,
        "current": 1790.0,
        "frequency": 49.68,
        "gas_flow": 138000.0,
        "compression_ratio": 1.54,
        "coordinates": {"lat": 35.6971, "lng": -0.6308, "x": 225, "y": 145},
        "last_alert": "Surcharge critique Poste 400kV Es Senia & échauffement transfo (91.5°C)",
        "last_scada_action": "IEC-61850 MMS: TRANSFER_LOAD_25PCT -> BUSBAR_SECOURS_ORN02",
    },
    "Hassi R'Mel": {
        "node_id": "DZ-GAS-HRM-01",
        "wilaya": "Laghouat (03)",
        "energy_type": "GAS",
        "voltage": 221.0,
        "power": 310.0,
        "transformer_temp": 66.0,
        "gas_pressure": 70.2,
        "current": 980.0,
        "frequency": 50.01,
        "gas_flow": 132000.0,
        "compression_ratio": 1.42,
        "coordinates": {"lat": 32.9294, "lng": 3.2711, "x": 465, "y": 305},
        "last_alert": "Aucune alerte — Pression nominale hub national",
        "last_scada_action": "Maintien consigne turbocompresseur SC-01 (70.2 bar)",
    },
    "Skikda": {
        "node_id": "DZ-GAS-SKI-02",
        "wilaya": "Skikda (21)",
        "energy_type": "GAS",
        "voltage": 214.0,
        "power": 465.0,
        "transformer_temp": 77.5,
        "gas_pressure": 59.2,  # Franchissement seuil critical (60 bar)
        "current": 1490.0,
        "frequency": 49.88,
        "gas_flow": 168000.0,
        "compression_ratio": 1.67,
        "coordinates": {"lat": 36.8764, "lng": 6.9092, "x": 705, "y": 90},
        "last_alert": "Chute de pression Gazoduc GK1 (59.2 bar < 60 bar)",
        "last_scada_action": "MODBUS-TCP: BOOST_COMPRESSOR_RATIO=1.67 ON SKIKDA_GK1",
    },
    "Constantine": {
        "node_id": "DZ-ELEC-CST-03",
        "wilaya": "Constantine (25)",
        "energy_type": "ELECTRICITY",
        "voltage": 206.5,  # Warning (< 209 kV)
        "power": 505.0,
        "transformer_temp": 78.2,
        "gas_pressure": 65.4,
        "current": 1510.0,
        "frequency": 49.84,
        "gas_flow": 129000.0,
        "compression_ratio": 1.44,
        "coordinates": {"lat": 36.365, "lng": 6.6147, "x": 675, "y": 135},
        "last_alert": "Appel de charge industriel El Khroub (Tension 206.5 kV)",
        "last_scada_action": "Compensation réactive banc condensateurs +45 MVAR",
    },
    "Arzew": {
        "node_id": "DZ-GAS-ARZ-03",
        "wilaya": "Oran / Arzew (31)",
        "energy_type": "GAS",
        "voltage": 219.0,
        "power": 380.0,
        "transformer_temp": 69.5,
        "gas_pressure": 67.5,
        "current": 1190.0,
        "frequency": 49.97,
        "gas_flow": 136000.0,
        "compression_ratio": 1.46,
        "coordinates": {"lat": 35.8505, "lng": -0.318, "x": 270, "y": 125},
        "last_alert": "Flux GNL nominal sur complexe GP1Z/GP2Z",
        "last_scada_action": "Régulation nominale vannes d'admission GNL",
    },
    "Sétif": {
        "node_id": "DZ-ELEC-SET-04",
        "wilaya": "Sétif (19)",
        "energy_type": "ELECTRICITY",
        "voltage": 207.8,
        "power": 492.0,
        "transformer_temp": 76.4,
        "gas_pressure": 64.8,
        "current": 1465.0,
        "frequency": 49.89,
        "gas_flow": 126000.0,
        "compression_ratio": 1.43,
        "coordinates": {"lat": 36.1898, "lng": 5.4108, "x": 595, "y": 140},
        "last_alert": "Surveillance thermique transformateur Ain Arnat (76.4°C)",
        "last_scada_action": "Activation ventilation forcée aéroréfrigérants",
    },
    "Ouargla": {
        "node_id": "DZ-ELEC-OUR-05",
        "wilaya": "Ouargla (30)",
        "energy_type": "ELECTRICITY",
        "voltage": 219.5,
        "power": 340.0,
        "transformer_temp": 73.0,
        "gas_pressure": 68.4,
        "current": 1120.0,
        "frequency": 49.98,
        "gas_flow": 118000.0,
        "compression_ratio": 1.39,
        "coordinates": {"lat": 31.9527, "lng": 5.3335, "x": 605, "y": 365},
        "last_alert": "Fonctionnement nominal Pôle Sud-Est",
        "last_scada_action": "Couplage poste HTB Touggourt-Ouargla",
    },
}


def _deterministic_wave(step_idx: int, total_steps: int, metric: str, zone: str, base_val: float) -> float:
    """
    Génère une courbe 24h réaliste (profil journalier SONELGAZ avec pointe du soir et anomalies
    caractéristiques reproductibles pour les tests unitaires et la visualisation).
    """
    angle = (step_idx / max(1, total_steps)) * 2.0 * math.pi
    zone_seed = sum(ord(c) for c in zone) % 17

    # Variation journalière régulière
    daily_mod = math.sin(angle - 1.2) * 0.6 + math.cos(angle * 2.0 + zone_seed * 0.2) * 0.4

    # Injection de pics anormaux localisés (ex: à 35%, 68% et 88% de la fenêtre 24h)
    pct = step_idx / max(1, total_steps)
    is_spike_1 = 0.34 <= pct <= 0.365
    is_spike_2 = 0.67 <= pct <= 0.70
    is_spike_3 = 0.87 <= pct <= 0.90

    if metric == "voltage":
        val = base_val - daily_mod * 4.5
        if is_spike_2:
            val -= 24.0 if zone == "Oran" else 19.5  # Chute de tension sous critical/emergency
        elif is_spike_3 and zone in ("Alger", "Constantine", "Oran"):
            val -= 14.0
        return round(val, 2)

    if metric == "power":
        val = base_val + daily_mod * 42.0
        if is_spike_1:
            val += 145.0
        elif is_spike_2:
            val += 195.0  # Pic anormal > 3σ
        return round(val, 2)

    if metric == "transformer_temp":
        val = base_val + daily_mod * 4.2
        if is_spike_2:
            val += 18.5  # Dépassement seuil critique/urgence (> 85-92°C)
        elif is_spike_3:
            val += 11.0
        return round(val, 2)

    if metric == "gas_pressure":
        val = base_val - daily_mod * 1.8
        if is_spike_1 and zone in ("Skikda", "Arzew", "Hassi R'Mel"):
            val -= 8.8  # Chute de pression gazoduc
        elif is_spike_3:
            val -= 6.5
        return round(val, 2)

    if metric == "current":
        val = base_val + daily_mod * 110.0
        if is_spike_2:
            val += 460.0
        return round(val, 2)

    if metric == "frequency":
        val = base_val - daily_mod * 0.06
        if is_spike_2:
            val -= 0.34
        return round(val, 3)

    if metric == "gas_flow":
        val = base_val + daily_mod * 11500.0
        if is_spike_2:
            val += 48000.0
        return round(val, 1)

    return round(base_val + daily_mod * 0.08, 3)


def get_time_series(
    zone: str = "Alger",
    hours: int = 24,
    metrics: Optional[List[str]] = None,
) -> TimeSeriesResult:
    """
    1. Retourne les séries temporelles agrégées par fenêtre de 5 minutes sur `hours` heures
       pour la zone demandée, accompagnées des seuils warning/critical/emergency.
    """
    load_default_thresholds()
    clean_zone = zone if zone in ZONE_BASELINES else "Alger"
    requested_metrics = [m.strip() for m in (metrics or DEFAULT_TREND_METRICS) if m.strip()]
    if not requested_metrics:
        requested_metrics = list(DEFAULT_TREND_METRICS)

    window_min = max(1, ANALYTICS_AGGREGATION_WINDOW_MINUTES)
    total_buckets = min(
        int((hours * 60) // window_min),
        max(10, ANALYTICS_MAX_POINTS_RETURNED // max(1, len(requested_metrics))),
    )

    now = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start_time = now - timedelta(minutes=total_buckets * window_min)
    zone_cfg = ZONE_BASELINES[clean_zone]

    thresholds_map: Dict[str, MetricThresholdSummary] = {}
    for m in requested_metrics:
        try:
            thr = get_threshold(clean_zone, "all", m)
            thresholds_map[m] = MetricThresholdSummary(
                metric=m,
                warning_threshold=thr.warning_threshold,
                critical_threshold=thr.critical_threshold,
                emergency_threshold=thr.emergency_threshold,
                direction=thr.direction,
                unit=thr.unit,
            )
        except KeyError:
            unit = METRIC_EXPECTED_UNITS.get(m, "")
            thresholds_map[m] = MetricThresholdSummary(
                metric=m,
                warning_threshold=100.0,
                critical_threshold=120.0,
                emergency_threshold=140.0,
                direction="above",
                unit=unit,
            )

    # Pré-calcul des valeurs par métrique pour évaluer la moyenne et l'écart-type (z-score)
    raw_series_by_metric: Dict[str, List[float]] = {m: [] for m in requested_metrics}
    timestamps_iso: List[str] = []

    for step in range(total_buckets):
        ts = (start_time + timedelta(minutes=(step + 1) * window_min)).isoformat()
        timestamps_iso.append(ts)
        for m in requested_metrics:
            base_val = float(zone_cfg.get(m, 100.0))
            val = _deterministic_wave(step, total_buckets, m, clean_zone, base_val)
            raw_series_by_metric[m].append(val)

    stats_by_metric: Dict[str, tuple[float, float]] = {}
    for m, values in raw_series_by_metric.items():
        mean_val = sum(values) / max(1, len(values))
        variance = sum((x - mean_val) ** 2 for x in values) / max(1, len(values))
        std_val = math.sqrt(variance) if variance > 0 else 1.0
        stats_by_metric[m] = (mean_val, std_val)

    flat_points: List[TimeSeriesPoint] = []
    aligned_rows: List[Dict[str, Any]] = []

    for step, ts in enumerate(timestamps_iso):
        row: Dict[str, Any] = {
            "timestamp": ts,
            "timeLabel": ts[11:16],
            "zone": clean_zone,
            "hasAnomaly": False,
            "maxSeverity": "normal",
        }
        sev_rank = {"normal": 0, "warning": 1, "critical": 2, "emergency": 3}

        for m in requested_metrics:
            val = raw_series_by_metric[m][step]
            mean_val, std_val = stats_by_metric[m]
            z_score = round(abs(val - mean_val) / max(1e-6, std_val), 2)

            thr_obj = get_threshold(clean_zone, "all", m)
            sev = evaluate_value_against_threshold(val, thr_obj)
            is_anom = sev in ("warning", "critical", "emergency") or z_score > ANALYTICS_ANOMALY_ZSCORE_THRESHOLD

            row[m] = val
            row[f"{m}_severity"] = sev
            row[f"{m}_zscore"] = z_score
            if is_anom:
                row["hasAnomaly"] = True
            if sev_rank[sev] > sev_rank[str(row["maxSeverity"])]:
                row["maxSeverity"] = sev

            flat_points.append(
                TimeSeriesPoint(
                    timestamp=ts,
                    metric=m,
                    value=val,
                    unit=thr_obj.unit,
                    severity=sev,
                    z_score=z_score,
                    is_anomaly=is_anom,
                )
            )
        aligned_rows.append(row)

    return TimeSeriesResult(
        zone=clean_zone,
        hours=hours,
        window_minutes=window_min,
        metrics=requested_metrics,
        points=flat_points[:ANALYTICS_MAX_POINTS_RETURNED],
        aligned_series=aligned_rows,
        thresholds=thresholds_map,
    )


def detect_anomalies(zone: str = "Alger", hours: int = 24) -> List[Anomaly]:
    """
    2. Détecte les anomalies sur les dernières `hours` heures pour `zone` :
       - Franchissement de seuil dynamique (warning, critical, emergency)
       - Écart-type statistique z-score > ANALYTICS_ANOMALY_ZSCORE_THRESHOLD (3.0σ)
       Classification : PIC_NORMAL, PIC_ANORMAL, FRANCHISSEMENT_SEUIL, URGENCE
    """
    ts_res = get_time_series(zone=zone, hours=hours, metrics=DEFAULT_TREND_METRICS)
    anomalies: List[Anomaly] = []

    for idx, pt in enumerate(ts_res.points):
        if not pt.is_anomaly:
            continue

        thr_summary = ts_res.thresholds.get(pt.metric)
        crossed_val: Optional[float] = None
        if thr_summary:
            if pt.severity == "emergency":
                crossed_val = thr_summary.emergency_threshold
            elif pt.severity == "critical":
                crossed_val = thr_summary.critical_threshold
            elif pt.severity == "warning":
                crossed_val = thr_summary.warning_threshold

        if pt.severity == "emergency":
            classification: Literal["PIC_NORMAL", "PIC_ANORMAL", "FRANCHISSEMENT_SEUIL", "URGENCE"] = "URGENCE"
            scada_cmd = (
                f"IEC-61850 MMS: DELESTAGE_SELECTIF & REROUTAGE_SECOURS ({zone.upper()})"
                if pt.metric != "gas_pressure"
                else f"MODBUS-TCP: ISOLATION_VANNE_SECURITE & BYPASS_COMPRESSEUR ({zone.upper()})"
            )
        elif pt.severity in ("critical", "warning"):
            classification = "FRANCHISSEMENT_SEUIL"
            scada_cmd = (
                f"IEC-61850 MMS: REGULATION_TENSION_REGLEUR_EN_CHARGE ({zone.upper()})"
                if pt.metric != "gas_pressure"
                else f"MODBUS-TCP: AJUSTEMENT_CONSIGNE_PRESSION ({zone.upper()})"
            )
        elif pt.z_score > ANALYTICS_ANOMALY_ZSCORE_THRESHOLD:
            classification = "PIC_ANORMAL"
            scada_cmd = f"SURVEILLANCE_RENFORCEE_SCADA (Z-Score={pt.z_score}σ)"
        else:
            classification = "PIC_NORMAL"
            scada_cmd = "AUCUNE_ACTION_REQUISE"

        anomalies.append(
            Anomaly(
                id=f"ANOM-{zone[:3].upper()}-{1000 + idx}",
                zone=ts_res.zone,
                timestamp=pt.timestamp,
                metric=pt.metric,
                unit=pt.unit,
                value=pt.value,
                threshold_crossed=crossed_val,
                z_score=pt.z_score,
                severity=pt.severity if pt.severity != "normal" else "warning",
                classification=classification,
                scada_action_triggered=scada_cmd,
                description=(
                    f"{classification} sur {pt.metric} ({pt.value} {pt.unit}"
                    + (f" vs seuil {crossed_val} {pt.unit}" if crossed_val is not None else "")
                    + f", z={pt.z_score}σ)"
                ),
            )
        )

    # Trier du plus récent au plus ancien et limiter aux événements les plus significatifs
    anomalies.sort(key=lambda a: a.timestamp, reverse=True)
    return anomalies[:40]


def get_zones_status() -> Dict[str, ZoneStatus]:
    """
    3. Retourne l'état synthétique des 8 zones nationales (Alger, Oran, Hassi R'Mel,
       Skikda, Constantine, Arzew, Sétif, Ouargla) pour la carte topologique D3.js.
    """
    load_default_thresholds()
    statuses: Dict[str, ZoneStatus] = {}
    sev_order = {"normal": 0, "warning": 1, "critical": 2, "emergency": 3}

    for zone_name in ZONES_ALGERIE:
        cfg = ZONE_BASELINES[zone_name]
        highest_sev: Literal["normal", "warning", "critical", "emergency"] = "normal"

        for m_key in ("voltage", "power", "transformer_temp", "gas_pressure"):
            val = float(cfg[m_key])
            thr = get_threshold(zone_name, "all", m_key)
            sev = evaluate_value_against_threshold(val, thr)
            if sev_order[sev] > sev_order[highest_sev]:
                highest_sev = sev

        prob_map = {
            "normal": 0.11,
            "warning": 0.48,
            "critical": 0.78,
            "emergency": 0.92,
        }

        statuses[zone_name] = ZoneStatus(
            zone=zone_name,
            node_id=cfg["node_id"],
            wilaya=cfg["wilaya"],
            energy_type=cfg["energy_type"],
            status=highest_sev,
            last_alert=cfg["last_alert"],
            last_scada_action=cfg["last_scada_action"],
            voltage_kv=float(cfg["voltage"]),
            power_mw=float(cfg["power"]),
            transformer_temp_c=float(cfg["transformer_temp"]),
            gas_pressure_bar=float(cfg["gas_pressure"]),
            failure_probability=prob_map[highest_sev],
            coordinates=cfg["coordinates"],
        )

    return statuses
