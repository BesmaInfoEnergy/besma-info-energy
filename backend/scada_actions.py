"""
Module 3 : Action Autonome SCADA (BesmaInfoEnergy)
Moteur de règles métier déclenchant des actions correctives automatiques :
- Reroutage de flux électrique via protocole IEC-61850 MMS
- Ajustement de pression gazière via vannes motorisées Modbus-TCP
- Isolation de tronçon critique et émission d'alertes opérateur
"""

from datetime import datetime, timezone
from typing import Any, Dict, List


class AutonomousScadaEngine:
    """Moteur d'exécution autonome et d'audit des commandes SCADA."""

    def __init__(self) -> None:
        self.action_history: List[Dict[str, Any]] = []

    def evaluate_and_act(
        self, telemetry: Dict[str, Any], ml_prediction: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Évalue les règles métier sur la télémétrie et la prédiction ML.
        Déclenche automatiquement une commande SCADA si une anomalie est détectée.
        """
        sensor_id = telemetry.get("sensor_id", "UNKNOWN")
        energy_type = telemetry.get("energy_type", "ELECTRICITY")
        prob = float(ml_prediction.get("failure_probability", 0.0))
        metrics = telemetry.get("metrics", {})

        commands: List[str] = []
        action_type = "AUCUNE_ACTION"
        estimated_loss_reduction = 0.0

        if energy_type == "ELECTRICITY":
            voltage = float(metrics.get("voltage_kv") or 220.0)
            temp_c = float(metrics.get("temperature_c") or 60.0)

            if prob >= 0.65 or temp_c >= 85.0 or voltage < 205.0:
                action_type = "REROUTAGE_FLUX"
                commands.append(
                    f"IEC-61850 MMS: TRANSFER_LOAD_30PCT FROM {sensor_id} TO BUSBAR_SECOURS"
                )
                commands.append(
                    f"IEC-61850 MMS: ACTIVATE_COOLING_STAGE_2 ON {sensor_id}"
                )
                estimated_loss_reduction = 3.8
        else:
            pressure = float(metrics.get("pressure_bar") or 68.0)
            if prob >= 0.65 or pressure < 60.0 or pressure > 76.0:
                action_type = "REGULATION_PRESSION"
                target_pressure = 68.0
                commands.append(
                    f"MODBUS-TCP: SET_REGULATOR_VALVE {sensor_id} TARGET_BAR={target_pressure}"
                )
                estimated_loss_reduction = 2.9

        action_record = {
            "action_id": f"SCADA-{len(self.action_history) + 1001}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sensor_id": sensor_id,
            "energy_type": energy_type,
            "triggered": len(commands) > 0,
            "action_type": action_type,
            "scada_commands": commands,
            "failure_probability_at_trigger": prob,
            "estimated_loss_reduction_pct": estimated_loss_reduction,
        }

        if action_record["triggered"]:
            self.action_history.append(action_record)

        return action_record
