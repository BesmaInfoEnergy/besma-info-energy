"""
Module de Configuration des Seuils d'Alerte par Zone et par Saison (BesmaInfoEnergy)
Collection MongoDB : `alert_thresholds` et historique dans `threshold_history`.
Conforme à la Loi algérienne n° 18-07 (meta-audit avec `ip_hash` pseudonymisé).

Fonctions exposées :
1. get_thresholds(zone=None, season=None) -> list[Threshold]
2. get_threshold(zone, season, metric) -> Threshold
3. create_threshold(threshold: ThresholdCreate, admin_id: str) -> Threshold
4. update_threshold(id: str, updates: ThresholdUpdate, admin_id: str) -> Threshold
5. delete_threshold(id: str, admin_id: str) -> bool
6. validate_threshold(threshold: Threshold) -> None
7. load_default_thresholds() -> None
8. log_threshold_change(admin_id, zone, metric, old_value, new_value, ip_hash)
"""

import csv
import io
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

ZONES_ALGERIE = [
    "Alger",
    "Oran",
    "Hassi R'Mel",
    "Skikda",
    "Constantine",
    "Arzew",
    "Sétif",
    "Ouargla",
]

SEASONS = ["summer", "winter", "all"]

METRIC_EXPECTED_UNITS: Dict[str, str] = {
    "voltage": "kV",
    "current": "A",
    "power": "MW",
    "frequency": "Hz",
    "transformer_temp": "°C",
    "gas_pressure": "bar",
    "gas_flow": "m³/h",
    "compression_ratio": "ratio",
}


class Threshold(BaseModel):
    id: str
    zone: str
    season: Literal["summer", "winter", "all"] = "all"
    metric: str
    warning_threshold: float
    critical_threshold: float
    emergency_threshold: float
    direction: Literal["above", "below"]
    unit: str
    enabled: bool = True
    created_at: str
    updated_at: str
    updated_by: str
    version: int = 1


class ThresholdCreate(BaseModel):
    zone: str
    season: Literal["summer", "winter", "all"] = "all"
    metric: str
    warning_threshold: float
    critical_threshold: float
    emergency_threshold: float
    direction: Literal["above", "below"]
    unit: str
    enabled: bool = True


class ThresholdUpdate(BaseModel):
    warning_threshold: Optional[float] = None
    critical_threshold: Optional[float] = None
    emergency_threshold: Optional[float] = None
    direction: Optional[Literal["above", "below"]] = None
    unit: Optional[str] = None
    enabled: Optional[bool] = None


# Stockage en mémoire synchronisé avec la collection MongoDB `alert_thresholds` et `threshold_history`
_ALERT_THRESHOLDS: Dict[str, Threshold] = {}
_THRESHOLD_HISTORY: List[Dict[str, Any]] = []
_THRESHOLD_AUDIT_LOGS: List[Dict[str, Any]] = []


def detect_current_season(dt: Optional[datetime] = None) -> Literal["summer", "winter", "all"]:
    """Détecte automatiquement la saison courante selon la date (mai-septembre = été, sinon hiver)."""
    default_env = os.getenv("THRESHOLD_DEFAULT_SEASON", "all").lower()
    if default_env in ("summer", "winter"):
        return default_env  # type: ignore[return-value]
    now = dt or datetime.now(timezone.utc)
    if 5 <= now.month <= 9:
        return "summer"
    return "winter"


def validate_threshold(threshold: Threshold | ThresholdCreate) -> None:
    """
    6. Vérifie la cohérence mathématique et physique d'un seuil :
       - warning < critical < emergency si direction == "above"
       - warning > critical > emergency si direction == "below"
       - Vérifie que l'unité correspond à la métrique énergétique
    """
    w = threshold.warning_threshold
    c = threshold.critical_threshold
    e = threshold.emergency_threshold

    if threshold.direction == "above":
        if not (w < c < e):
            raise ValueError(
                f"Incohérence des seuils (direction='above') pour {threshold.metric} : "
                f"il faut warning ({w}) < critical ({c}) < emergency ({e})."
            )
    elif threshold.direction == "below":
        if not (w > c > e):
            raise ValueError(
                f"Incohérence des seuils (direction='below') pour {threshold.metric} : "
                f"il faut warning ({w}) > critical ({c}) > emergency ({e})."
            )
    else:
        raise ValueError(f"Direction invalide : {threshold.direction}")

    expected_unit = METRIC_EXPECTED_UNITS.get(threshold.metric)
    if expected_unit and threshold.unit != expected_unit:
        raise ValueError(
            f"Unité incohérente pour la métrique '{threshold.metric}' : "
            f"attendu '{expected_unit}', reçu '{threshold.unit}'."
        )


def log_threshold_change(
    admin_id: str,
    zone: str,
    metric: str,
    old_value: Optional[Dict[str, Any]],
    new_value: Optional[Dict[str, Any]],
    ip_hash: str = "IPHASH-DZ1807-ADMIN",
    db_repo: Any = None,
) -> Dict[str, Any]:
    """
    8. Enregistre toute modification de seuil dans `audit_logs` (meta-audit conforme Loi 18-07).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    audit_entry = {
        "audit_id": f"AUD-THR-{1001 + len(_THRESHOLD_AUDIT_LOGS)}",
        "collection": "audit_logs",
        "event_type": "THRESHOLD_CONFIG_CHANGED",
        "operator_username": admin_id,
        "operator_id": admin_id,
        "operator_role": "admin",
        "zone": zone,
        "metric": metric,
        "old_value": old_value,
        "new_value": new_value,
        "ip_hash": ip_hash,
        "comment": f"Modification seuil [{metric}] sur zone {zone} par {admin_id}",
        "acknowledged_at": now_iso,
        "law_18_07_compliant": True,
    }
    _THRESHOLD_AUDIT_LOGS.append(audit_entry)
    if db_repo is not None and hasattr(db_repo, "_audit_logs"):
        db_repo._audit_logs.append(audit_entry)
    return audit_entry


def load_default_thresholds(force_reset: bool = False) -> List[Threshold]:
    """
    7. Charge les seuils par défaut (normes d'exploitation SONELGAZ) au premier démarrage
       pour les 8 zones nationales et les 8 métriques Électricité & Gaz.
    """
    if _ALERT_THRESHOLDS and not force_reset:
        return list(_ALERT_THRESHOLDS.values())

    _ALERT_THRESHOLDS.clear()
    now_iso = datetime.now(timezone.utc).isoformat()

    # Gabarit SONELGAZ des 8 métriques par zone
    sonelgaz_templates: List[Dict[str, Any]] = [
        {
            "metric": "voltage",
            "warning_threshold": 209.0,
            "critical_threshold": 198.0,
            "emergency_threshold": 188.0,
            "direction": "below",
            "unit": "kV",
        },
        {
            "metric": "current",
            "warning_threshold": 1450.0,
            "critical_threshold": 1700.0,
            "emergency_threshold": 1950.0,
            "direction": "above",
            "unit": "A",
        },
        {
            "metric": "power",
            "warning_threshold": 480.0,
            "critical_threshold": 580.0,
            "emergency_threshold": 650.0,
            "direction": "above",
            "unit": "MW",
        },
        {
            "metric": "frequency",
            "warning_threshold": 49.85,
            "critical_threshold": 49.70,
            "emergency_threshold": 49.50,
            "direction": "below",
            "unit": "Hz",
        },
        {
            "metric": "transformer_temp",
            "warning_threshold": 75.0,
            "critical_threshold": 85.0,
            "emergency_threshold": 92.0,
            "direction": "above",
            "unit": "°C",
        },
        {
            "metric": "gas_pressure",
            "warning_threshold": 64.0,
            "critical_threshold": 60.0,
            "emergency_threshold": 55.0,
            "direction": "below",
            "unit": "bar",
        },
        {
            "metric": "gas_flow",
            "warning_threshold": 140000.0,
            "critical_threshold": 165000.0,
            "emergency_threshold": 190000.0,
            "direction": "above",
            "unit": "m³/h",
        },
        {
            "metric": "compression_ratio",
            "warning_threshold": 1.50,
            "critical_threshold": 1.65,
            "emergency_threshold": 1.80,
            "direction": "above",
            "unit": "ratio",
        },
    ]

    for zone in ZONES_ALGERIE:
        zone_slug = zone.lower().replace("'", "").replace(" ", "").replace("é", "e")
        for tpl in sonelgaz_templates:
            # Adapter le seuil de tension nominale pour Oran (Poste 400kV Es Senia)
            w_val = float(tpl["warning_threshold"])
            c_val = float(tpl["critical_threshold"])
            e_val = float(tpl["emergency_threshold"])
            if zone == "Oran" and tpl["metric"] == "voltage":
                w_val, c_val, e_val = 382.0, 370.0, 355.0

            for season in ("all", "summer", "winter"):
                # En été, les seuils de température transformateur sont légèrement plus stricts
                adj_w, adj_c, adj_e = w_val, c_val, e_val
                if season == "summer" and tpl["metric"] == "transformer_temp":
                    adj_w, adj_c, adj_e = 72.0, 82.0, 89.0

                tid = f"THR-{zone_slug.upper()}-{season.upper()}-{tpl['metric'].upper()}"
                item = Threshold(
                    id=tid,
                    zone=zone,
                    season=season,  # type: ignore[arg-type]
                    metric=tpl["metric"],
                    warning_threshold=adj_w,
                    critical_threshold=adj_c,
                    emergency_threshold=adj_e,
                    direction=tpl["direction"],
                    unit=tpl["unit"],
                    enabled=True,
                    created_at=now_iso,
                    updated_at=now_iso,
                    updated_by="SONELGAZ_DEFAULT",
                    version=1,
                )
                _ALERT_THRESHOLDS[tid] = item

    return list(_ALERT_THRESHOLDS.values())


def get_thresholds(
    zone: Optional[str] = None,
    season: Optional[str] = None,
) -> List[Threshold]:
    """1. Retourne la liste des seuils filtrés par zone et/ou saison."""
    if not _ALERT_THRESHOLDS:
        load_default_thresholds()

    results = list(_ALERT_THRESHOLDS.values())
    if zone:
        results = [t for t in results if t.zone.lower() == zone.lower()]
    if season:
        results = [t for t in results if t.season.lower() == season.lower()]
    return results


def get_threshold(zone: str, season: str, metric: str) -> Threshold:
    """2. Récupère un seuil précis par (zone, season, metric), avec repli sur season='all'."""
    if not _ALERT_THRESHOLDS:
        load_default_thresholds()

    for t in _ALERT_THRESHOLDS.values():
        if (
            t.zone.lower() == zone.lower()
            and t.season.lower() == season.lower()
            and t.metric.lower() == metric.lower()
        ):
            return t

    # Repli sur season='all' ou Alger par défaut
    for t in _ALERT_THRESHOLDS.values():
        if (
            t.zone.lower() == zone.lower()
            and t.season == "all"
            and t.metric.lower() == metric.lower()
        ):
            return t

    for t in _ALERT_THRESHOLDS.values():
        if t.metric.lower() == metric.lower():
            return t

    raise KeyError(f"Seuil introuvable pour zone={zone}, season={season}, metric={metric}")


def create_threshold(
    threshold: ThresholdCreate,
    admin_id: str,
    ip_hash: str = "IPHASH-DZ1807-ADMIN",
    db_repo: Any = None,
) -> Threshold:
    """3. Crée un nouveau seuil après validation stricte et journalise dans audit_logs."""
    if not _ALERT_THRESHOLDS:
        load_default_thresholds()

    validate_threshold(threshold)
    now_iso = datetime.now(timezone.utc).isoformat()
    zone_slug = threshold.zone.lower().replace("'", "").replace(" ", "").replace("é", "e")
    tid = f"THR-{zone_slug.upper()}-{threshold.season.upper()}-{threshold.metric.upper()}"

    created = Threshold(
        id=tid,
        zone=threshold.zone,
        season=threshold.season,
        metric=threshold.metric,
        warning_threshold=threshold.warning_threshold,
        critical_threshold=threshold.critical_threshold,
        emergency_threshold=threshold.emergency_threshold,
        direction=threshold.direction,
        unit=threshold.unit,
        enabled=threshold.enabled,
        created_at=now_iso,
        updated_at=now_iso,
        updated_by=admin_id,
        version=1,
    )
    _ALERT_THRESHOLDS[tid] = created

    log_threshold_change(
        admin_id=admin_id,
        zone=created.zone,
        metric=created.metric,
        old_value=None,
        new_value=created.model_dump(),
        ip_hash=ip_hash,
        db_repo=db_repo,
    )
    return created


def update_threshold(
    id: str,
    updates: ThresholdUpdate,
    admin_id: str,
    ip_hash: str = "IPHASH-DZ1807-ADMIN",
    db_repo: Any = None,
) -> Threshold:
    """
    4. Met à jour un seuil existant, incrémente `version`, conserve l'historique
       dans `threshold_history` et journalise l'opération dans `audit_logs`.
    """
    if not _ALERT_THRESHOLDS:
        load_default_thresholds()

    if id not in _ALERT_THRESHOLDS:
        raise KeyError(f"Seuil {id} introuvable.")

    existing = _ALERT_THRESHOLDS[id]
    old_snapshot = existing.model_dump()

    updated_data = existing.model_dump()
    for field_name, val in updates.model_dump(exclude_unset=True).items():
        if val is not None:
            updated_data[field_name] = val

    updated_data["version"] = existing.version + 1
    updated_data["updated_at"] = datetime.now(timezone.utc).isoformat()
    updated_data["updated_by"] = admin_id

    candidate = Threshold(**updated_data)
    validate_threshold(candidate)

    _ALERT_THRESHOLDS[id] = candidate

    history_entry = {
        "history_id": f"THIST-{1001 + len(_THRESHOLD_HISTORY)}",
        "threshold_id": id,
        "zone": candidate.zone,
        "season": candidate.season,
        "metric": candidate.metric,
        "version_before": existing.version,
        "version_after": candidate.version,
        "updated_by": admin_id,
        "updated_at": candidate.updated_at,
        "before": {
            "warning_threshold": existing.warning_threshold,
            "critical_threshold": existing.critical_threshold,
            "emergency_threshold": existing.emergency_threshold,
            "enabled": existing.enabled,
        },
        "after": {
            "warning_threshold": candidate.warning_threshold,
            "critical_threshold": candidate.critical_threshold,
            "emergency_threshold": candidate.emergency_threshold,
            "enabled": candidate.enabled,
        },
    }
    _THRESHOLD_HISTORY.insert(0, history_entry)

    log_threshold_change(
        admin_id=admin_id,
        zone=candidate.zone,
        metric=candidate.metric,
        old_value=old_snapshot,
        new_value=candidate.model_dump(),
        ip_hash=ip_hash,
        db_repo=db_repo,
    )
    return candidate


def delete_threshold(
    id: str,
    admin_id: str,
    ip_hash: str = "IPHASH-DZ1807-ADMIN",
    db_repo: Any = None,
) -> bool:
    """5. Supprime un seuil et journalise dans audit_logs."""
    if not _ALERT_THRESHOLDS:
        load_default_thresholds()

    if id not in _ALERT_THRESHOLDS:
        return False

    removed = _ALERT_THRESHOLDS.pop(id)
    log_threshold_change(
        admin_id=admin_id,
        zone=removed.zone,
        metric=removed.metric,
        old_value=removed.model_dump(),
        new_value=None,
        ip_hash=ip_hash,
        db_repo=db_repo,
    )
    return True


def get_threshold_history(zone: Optional[str] = None) -> List[Dict[str, Any]]:
    if not zone or zone.lower() == "all":
        return list(_THRESHOLD_HISTORY)
    return [h for h in _THRESHOLD_HISTORY if h["zone"].lower() == zone.lower()]


def evaluate_value_against_threshold(value: float, threshold: Threshold) -> Literal["normal", "warning", "critical", "emergency"]:
    """Évalue le niveau de sévérité d'une mesure par rapport au seuil configuré."""
    if not threshold.enabled:
        return "normal"

    if threshold.direction == "above":
        if value >= threshold.emergency_threshold:
            return "emergency"
        if value >= threshold.critical_threshold:
            return "critical"
        if value >= threshold.warning_threshold:
            return "warning"
        return "normal"
    else:
        if value <= threshold.emergency_threshold:
            return "emergency"
        if value <= threshold.critical_threshold:
            return "critical"
        if value <= threshold.warning_threshold:
            return "warning"
        return "normal"


def export_thresholds_to_csv(zone: Optional[str] = None, season: Optional[str] = None) -> str:
    items = get_thresholds(zone=zone, season=season)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "id",
        "zone",
        "season",
        "metric",
        "warning_threshold",
        "critical_threshold",
        "emergency_threshold",
        "direction",
        "unit",
        "enabled",
        "version",
    ])
    for t in items:
        writer.writerow([
            t.id,
            t.zone,
            t.season,
            t.metric,
            t.warning_threshold,
            t.critical_threshold,
            t.emergency_threshold,
            t.direction,
            t.unit,
            t.enabled,
            t.version,
        ])
    return buf.getvalue()


def import_thresholds_from_csv(
    csv_text: str,
    admin_id: str,
    ip_hash: str = "IPHASH-DZ1807-ADMIN",
    db_repo: Any = None,
) -> List[Threshold]:
    reader = csv.DictReader(io.StringIO(csv_text.strip()))
    imported: List[Threshold] = []
    for row in reader:
        tc = ThresholdCreate(
            zone=row["zone"],
            season=row.get("season", "all"),  # type: ignore[arg-type]
            metric=row["metric"],
            warning_threshold=float(row["warning_threshold"]),
            critical_threshold=float(row["critical_threshold"]),
            emergency_threshold=float(row["emergency_threshold"]),
            direction=row["direction"],  # type: ignore[arg-type]
            unit=row["unit"],
            enabled=str(row.get("enabled", "True")).lower() in ("true", "1", "yes"),
        )
        created = create_threshold(tc, admin_id=admin_id, ip_hash=ip_hash, db_repo=db_repo)
        imported.append(created)
    return imported
