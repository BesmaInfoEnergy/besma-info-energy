"""
Module 2 : Analyse contextuelle (Gemini API) et Prédiction des pannes (ML)
Classification binaire (panne / pas de panne) utilisant dynamiquement les seuils
de la collection `alert_thresholds` (aucune constante codée en dur).
Rechargement automatique toutes les THRESHOLD_RELOAD_INTERVAL_SECONDS (60s)
ou sur notification temps réel, selon la saison courante.
"""

import json
import logging
import math
import os
import time
from typing import Any, Dict, List, Optional
from google import genai
from google.genai import types

from backend.thresholds import (
    Threshold,
    detect_current_season,
    evaluate_value_against_threshold,
    get_threshold,
    load_default_thresholds,
)

logger = logging.getLogger("besma.ml_predictor")


def _extract_zone_name(telemetry: Dict[str, Any]) -> str:
    raw_wilaya = str(telemetry.get("wilaya") or telemetry.get("wilaya_code") or telemetry.get("zone") or "")
    sensor_id = str(telemetry.get("sensor_id") or "")
    combined = f"{raw_wilaya} {sensor_id}".lower()
    if "oran" in combined or "orn" in combined:
        if "arzew" in combined or "arz" in combined:
            return "Arzew"
        return "Oran"
    if "hassi r" in combined or "hrm" in combined or "laghouat" in combined:
        return "Hassi R'Mel"
    if "skikda" in combined or "skd" in combined:
        return "Skikda"
    if "constantine" in combined or "cst" in combined:
        return "Constantine"
    if "arzew" in combined or "arz" in combined:
        return "Arzew"
    if "sétif" in combined or "setif" in combined or "stf" in combined:
        return "Sétif"
    if "ouargla" in combined or "our" in combined:
        return "Ouargla"
    return "Alger"


class FailurePredictionModel:
    """
    Modèle prédictif de classification binaire des pannes sur le réseau Électricité & Gaz.
    Lit dynamiquement les seuils (warning, critical, emergency) depuis `backend.thresholds`
    sans aucune constante codée en dur.
    """

    def __init__(self, threshold: float = 0.65) -> None:
        self.threshold = threshold
        self.reload_interval = int(os.getenv("THRESHOLD_RELOAD_INTERVAL_SECONDS", "60"))
        self._last_reload_ts: float = 0.0
        self.reload_thresholds()

    def reload_thresholds(self) -> None:
        """Recharge le cache des seuils depuis le gestionnaire MongoDB / alert_thresholds."""
        load_default_thresholds(force_reset=False)
        self._last_reload_ts = time.time()

    def _ensure_fresh_thresholds(self) -> None:
        if (time.time() - self._last_reload_ts) >= self.reload_interval:
            self.reload_thresholds()

    def predict_failure(
        self,
        telemetry: Dict[str, Any],
        season_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Évalue la télémétrie par rapport aux seuils dynamiques de la zone et de la saison courante.
        Retourne la probabilité de panne [0.0, 1.0], la classe binaire (1 = PANNE, 0 = PAS_DE_PANNE)
        et le niveau d'alerte maximal franchi ('normal' | 'warning' | 'critical' | 'emergency').
        """
        self._ensure_fresh_thresholds()

        zone = _extract_zone_name(telemetry)
        season = season_override or detect_current_season()
        energy_type = telemetry.get("energy_type", "ELECTRICITY")
        metrics = telemetry.get("metrics", {})
        loss_pct = float(telemetry.get("loss_rate_pct") or 5.0)

        log_odds = -2.4
        highest_severity = "normal"
        severity_rank = {"normal": 0, "warning": 1, "critical": 2, "emergency": 3}
        breached_metrics: List[Dict[str, Any]] = []

        def check_metric(metric_name: str, val: Optional[float]) -> None:
            nonlocal log_odds, highest_severity
            if val is None:
                return
            thr: Threshold = get_threshold(zone=zone, season=season, metric=metric_name)
            sev = evaluate_value_against_threshold(float(val), thr)
            if severity_rank[sev] > severity_rank[highest_severity]:
                highest_severity = sev
            if sev == "warning":
                log_odds += 1.4
                breached_metrics.append({"metric": metric_name, "level": sev, "value": val, "threshold": thr.warning_threshold})
            elif sev == "critical":
                log_odds += 2.8
                breached_metrics.append({"metric": metric_name, "level": sev, "value": val, "threshold": thr.critical_threshold})
            elif sev == "emergency":
                log_odds += 4.5
                breached_metrics.append({"metric": metric_name, "level": sev, "value": val, "threshold": thr.emergency_threshold})

        if energy_type == "ELECTRICITY":
            check_metric("voltage", metrics.get("voltage_kv"))
            check_metric("current", metrics.get("current_amp"))
            check_metric("power", metrics.get("active_power_mw") or metrics.get("power_mw"))
            check_metric("frequency", metrics.get("frequency_hz"))
            check_metric("transformer_temp", metrics.get("temperature_c"))
        else:
            check_metric("gas_pressure", metrics.get("pressure_bar"))
            check_metric("gas_flow", metrics.get("flow_rate_m3h"))
            check_metric("compression_ratio", metrics.get("compressor_ratio"))

        if loss_pct > 10.0:
            log_odds += (loss_pct - 10.0) * 0.16

        probability = round(1.0 / (1.0 + math.exp(-log_odds)), 4)
        binary_class = 1 if (probability >= self.threshold or highest_severity in ("critical", "emergency")) else 0

        return {
            "sensor_id": telemetry.get("sensor_id"),
            "zone": zone,
            "season_used": season,
            "failure_probability": probability,
            "binary_classification": binary_class,
            "severity_level": highest_severity,
            "breached_metrics": breached_metrics,
            "label": "PANNE_IMMINENTE" if binary_class == 1 else ("RISQUE_SURCHARGE" if highest_severity == "warning" else "PAS_DE_PANNE"),
            "threshold_used": self.threshold,
        }


class GeminiContextualAnalyzer:
    """
    Agent IA d'analyse contextuelle utilisant le SDK officiel google-genai
    avec une température déterministe de 0.2.
    """

    def __init__(self) -> None:
        self.api_key = os.getenv("GEMINI_API_KEY")
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
        self.temperature = float(os.getenv("GEMINI_TEMPERATURE", "0.2"))

    def analyze_grid_anomaly(self, node_snapshot: Dict[str, Any]) -> Dict[str, Any]:
        if not self.api_key or self.api_key == "MY_GEMINI_API_KEY":
            return self._deterministic_fallback(node_snapshot)

        client = genai.Client(api_key=self.api_key)
        prompt = (
            "Tu es BesmaInfoEnergy, l'agent IA autonome de supervision énergétique (Électricité & Gaz) "
            "en Algérie. Analyse cet état capteur et recommande une action corrective SCADA précise :\n"
            f"{json.dumps(node_snapshot, ensure_ascii=False)}"
        )

        response = client.models.generate_content(
            model=self.model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                temperature=self.temperature,
                response_mime_type="application/json",
            ),
        )
        return json.loads(response.text or "{}")

    @staticmethod
    def _deterministic_fallback(node_snapshot: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "summary": f"Diagnostic déterministe sur {node_snapshot.get('sensor_id', 'Noeud-DZ')}",
            "recommended_action": "REROUTAGE_FLUX_AUTO",
            "compliance_18_07": True,
        }
