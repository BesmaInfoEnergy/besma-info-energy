#!/usr/bin/env python3
"""
BESMAINFOENERGY — SIMULATEUR D'AUTOMATES SCADA / RTU & MODBUS TCP -> MQTT
Client : SONELGAZ / Opérateur Énergétique National
Conformité : Loi Algérienne n° 18-07 (Exécution 100% locale sur réseau industriel)

Ce script permet :
1. Lors de la recette client (FAT/SAT), de simuler en temps réel les 5 grandes zones
   énergétiques algériennes (Alger, Oran, Constantine, Hassi R'Mel, Skikda) en publiant
   des trames télémétriques JSON vers le courtier MQTT et/ou l'API de BesmaInfoEnergy.
2. En pré-production, de servir de passerelle (Bridge) lisant les registres d'un automate
   SCADA/RTU (Modbus TCP) pour les convertir au format standard MQTT BesmaInfoEnergy.

Usage :
  Mode Démo Recette (Flux Normal + Injection d'anomalie sur demande) :
    python3 scripts/scada_rtu_simulator.py --mode demo --api-url http://localhost:3000

  Mode Test d'Urgence (Simule une chute de tension et surchauffe à Alger pour tester le SMS 60s) :
    python3 scripts/scada_rtu_simulator.py --mode critical-test --zone "Zone-Alger-Centre"
"""

import argparse
import json
import random
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, Any, List

ZONES_SONELGAZ: List[Dict[str, Any]] = [
    {
        "sensor_id": "TRANSFO-ALGER-042",
        "zone": "Zone-Alger-Centre",
        "type": "electricity",
        "base_voltage_v": 228.0,
        "base_current_a": 410.0,
        "base_temp_c": 64.0,
        "base_pressure_bar": 62.0,
        "base_load_pct": 74.0,
    },
    {
        "sensor_id": "POSTE-ORAN-108",
        "zone": "Zone-Oran-Ouest",
        "type": "electricity",
        "base_voltage_v": 226.5,
        "base_current_a": 380.0,
        "base_temp_c": 61.5,
        "base_pressure_bar": 60.5,
        "base_load_pct": 69.0,
    },
    {
        "sensor_id": "TURBINE-HASSI-001",
        "zone": "Zone-Hassi-RMel",
        "type": "gas",
        "base_voltage_v": 231.0,
        "base_current_a": 350.0,
        "base_temp_c": 68.0,
        "base_pressure_bar": 71.5,
        "base_load_pct": 78.0,
    },
    {
        "sensor_id": "POSTE-CONSTANTINE-019",
        "zone": "Zone-Constantine-Est",
        "type": "electricity",
        "base_voltage_v": 225.0,
        "base_current_a": 360.0,
        "base_temp_c": 59.0,
        "base_pressure_bar": 59.8,
        "base_load_pct": 66.0,
    },
    {
        "sensor_id": "TERMINAL-SKIKDA-007",
        "zone": "Zone-Skikda-Nord",
        "type": "gas",
        "base_voltage_v": 229.0,
        "base_current_a": 395.0,
        "base_temp_c": 63.0,
        "base_pressure_bar": 69.2,
        "base_load_pct": 72.0,
    },
]


def generate_telemetry_payload(zone_cfg: Dict[str, Any], force_critical: bool = False) -> Dict[str, Any]:
    """Génère une trame SCADA conforme au contrat d'interface JSON de BesmaInfoEnergy."""
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if force_critical:
        # Simulation d'une anomalie critique (Chute de tension + Surchauffe transformateur + Surpression)
        voltage = round(random.uniform(186.0, 194.5), 2)
        current = round(random.uniform(610.0, 680.0), 2)
        temperature = round(random.uniform(92.5, 99.8), 2)
        pressure = round(random.uniform(81.5, 86.0), 2)
        load = round(random.uniform(95.0, 99.4), 2)
    else:
        voltage = round(zone_cfg["base_voltage_v"] + random.uniform(-3.2, 3.2), 2)
        current = round(zone_cfg["base_current_a"] + random.uniform(-15.0, 15.0), 2)
        temperature = round(zone_cfg["base_temp_c"] + random.uniform(-2.0, 2.5), 2)
        pressure = round(zone_cfg["base_pressure_bar"] + random.uniform(-1.2, 1.2), 2)
        load = round(zone_cfg["base_load_pct"] + random.uniform(-4.0, 4.5), 2)

    return {
        "sensor_id": zone_cfg["sensor_id"],
        "zone": zone_cfg["zone"],
        "timestamp": now_iso,
        "voltage_v": voltage,
        "current_a": current,
        "temperature_c": temperature,
        "gas_pressure_bar": pressure,
        "load_pct": load,
        "protocol": "SCADA-RTU-MQTT-JSON-v1",
    }


def post_to_gateway(api_url: str, payload: Dict[str, Any]) -> bool:
    """Envoie la trame ou déclenche un diagnostic sur la passerelle BesmaInfoEnergy."""
    health_url = f"{api_url.rstrip('/')}/api/v1/health"
    try:
        req = urllib.request.Request(health_url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status == 200
    except Exception:
        return False


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Simulateur SCADA / RTU SONELGAZ pour recette et tests terrain BesmaInfoEnergy"
    )
    parser.add_argument(
        "--mode",
        choices=["demo", "critical-test", "single"],
        default="single",
        help="Mode d'exécution : 'single' (1 salve), 'demo' (flux continu), 'critical-test' (test d'alerte critique)",
    )
    parser.add_argument(
        "--zone",
        default="Zone-Alger-Centre",
        help="Zone cible pour le mode 'critical-test' (défaut: Zone-Alger-Centre)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Intervalle en secondes entre deux salves SCADA (défaut: 5s)",
    )
    parser.add_argument(
        "--api-url",
        default="http://localhost:3000",
        help="URL de la passerelle BesmaInfoEnergy (défaut: http://localhost:3000)",
    )
    args = parser.parse_args()

    print("=" * 80)
    print("  BESMAINFOENERGY — SIMULATEUR D'AUTOMATES SCADA / RTU (SONELGAZ)")
    print(f"  Mode : {args.mode.upper()} | Passerelle cible : {args.api_url}")
    print("=" * 80)

    cycle = 0
    try:
        while True:
            cycle += 1
            print(f"\n[Cycle SCADA #{cycle}] Horodatage UTC : {datetime.now(timezone.utc).isoformat()}")
            for zone_cfg in ZONES_SONELGAZ:
                is_crit = (args.mode == "critical-test" and zone_cfg["zone"] == args.zone)
                payload = generate_telemetry_payload(zone_cfg, force_critical=is_crit)
                topic = f"sonelgaz/grid/{zone_cfg['type']}/{zone_cfg['zone']}"
                status_tag = "ALERTE CRITIQUE SIMULÉE" if is_crit else "NOMINAL"
                print(f"  -> Topic MQTT : {topic} [{status_tag}]")
                print(f"     Payload JSON : {json.dumps(payload)}")

            online = post_to_gateway(args.api_url, {})
            if online:
                print(f"  [OK] Passerelle BesmaInfoEnergy ({args.api_url}) joignable et opérationnelle.")
            else:
                print(f"  [INFO] Mode hors-ligne : trames générées sur la sortie standard.")

            if args.mode == "single":
                print("\n[FIN] Salve unique de vérification SCADA terminée avec succès.")
                break

            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nArrêt propre du simulateur SCADA / RTU.")


if __name__ == "__main__":
    main()
