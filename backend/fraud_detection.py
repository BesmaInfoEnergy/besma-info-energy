"""
Module 4 : Détection de Fraude et Pertes Non Techniques (BesmaInfoEnergy)
Analyse comportementale des données de consommation pour identifier :
- Les branchements illicites (contournement de compteur)
- Les usages industriels/commerciaux non déclarés la nuit
- Les fuites ou soutirages anormaux sur le réseau gazier
Respect strict de la Loi algérienne n° 18-07 (identifiants anonymisés SHA-256).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List


class FraudDetectionService:
    """Détecteur comportemental de pertes non techniques (NTL - Non-Technical Losses)."""

    def __init__(self, anomaly_ratio_threshold: float = 0.35) -> None:
        self.anomaly_ratio_threshold = anomaly_ratio_threshold

    def analyze_consumption_profile(
        self,
        anonymized_subscriber_id: str,
        wilaya: str,
        energy_type: str,
        declared_load: float,
        measured_feeder_load: float,
        night_usage_ratio: float = 0.5,
    ) -> Dict[str, Any]:
        """
        Compare la puissance/débit déclaré avec la mesure physique sur le départ MT/Gaz
        et évalue la signature temporelle.
        """
        if measured_feeder_load <= 0:
            return {
                "anonymized_subscriber_id": anonymized_subscriber_id,
                "is_fraud_suspected": False,
                "unaccounted_ratio": 0.0,
                "confidence_score": 0.0,
            }

        unaccounted_delta = max(0.0, measured_feeder_load - declared_load)
        unaccounted_ratio = round(unaccounted_delta / measured_feeder_load, 4)

        # Pondération avec le profil nocturne anormal
        confidence = min(
            0.99,
            round(unaccounted_ratio * 1.15 + max(0.0, (night_usage_ratio - 0.6) * 0.4), 3),
        )
        is_suspected = unaccounted_ratio >= self.anomaly_ratio_threshold

        return {
            "anonymized_subscriber_id": anonymized_subscriber_id,
            "wilaya": wilaya,
            "energy_type": energy_type,
            "declared_load": declared_load,
            "measured_feeder_load": measured_feeder_load,
            "unaccounted_ratio": unaccounted_ratio,
            "unaccounted_pct": round(unaccounted_ratio * 100, 2),
            "confidence_score": confidence,
            "is_fraud_suspected": is_suspected,
            "law_18_07_pseudonymized": anonymized_subscriber_id.startswith("DZ1807-")
            or anonymized_subscriber_id.startswith("SHA256:"),
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }
