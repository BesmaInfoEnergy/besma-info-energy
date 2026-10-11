"""
Module 1 : Ingestion de données en temps réel (BesmaInfoEnergy)
Collecte asynchrone des capteurs Électricité (tension, courant, puissance)
et Gaz (pression, débit) via MQTT ou Apache Kafka.
Conforme à la Loi algérienne n° 18-07 (anonymisation SHA-256 à la source).
"""

import asyncio
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Coroutine, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger("besma.ingestion")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


class EnergyType(str, Enum):
    ELECTRICITY = "ELECTRICITY"
    GAS = "GAS"


class BrokerProtocol(str, Enum):
    MQTT = "MQTT"
    KAFKA = "KAFKA"


class SensorTelemetryPayload(BaseModel):
    """Schéma strict de validation des trames capteurs (Électricité & Gaz)."""
    sensor_id: str = Field(..., min_length=4, max_length=64, description="Identifiant unique du capteur ou poste")
    wilaya_code: str = Field(..., min_length=2, max_length=32, description="Code Wilaya algérienne (ex: 16-Alger)")
    energy_type: EnergyType
    protocol: BrokerProtocol = BrokerProtocol.MQTT
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    # Métriques Électricité (HTB / MT / BT)
    voltage_kv: Optional[float] = Field(None, ge=0.0, le=500.0)
    current_amp: Optional[float] = Field(None, ge=0.0, le=10000.0)
    active_power_mw: Optional[float] = Field(None, ge=0.0, le=5000.0)
    frequency_hz: Optional[float] = Field(None, ge=45.0, le=55.0)

    # Métriques Gaz (Transport Haute Pression / Distribution)
    pressure_bar: Optional[float] = Field(None, ge=0.0, le=150.0)
    flow_rate_m3h: Optional[float] = Field(None, ge=0.0, le=1000000.0)

    # Température & identifiant compteur (anonymisé selon Loi 18-07)
    temperature_c: float = Field(..., ge=-20.0, le=150.0)
    raw_subscriber_ref: Optional[str] = Field(None, description="Référence brute hachée immédiatement")

    @field_validator("voltage_kv")
    @classmethod
    def validate_electricity_metrics(cls, v: Optional[float], info: Any) -> Optional[float]:
        if info.data.get("energy_type") == EnergyType.ELECTRICITY and v is None:
            raise ValueError("La tension (voltage_kv) est obligatoire pour un capteur ELECTRICITY.")
        return v

    @field_validator("pressure_bar")
    @classmethod
    def validate_gas_metrics(cls, v: Optional[float], info: Any) -> Optional[float]:
        if info.data.get("energy_type") == EnergyType.GAS and v is None:
            raise ValueError("La pression (pressure_bar) est obligatoire pour un capteur GAS.")
        return v

    def anonymize_subscriber_id(self) -> str:
        """
        Conformité Loi algérienne n° 18-07 :
        Aucune donnée nominative d'abonné n'est stockée en clair.
        """
        salt = os.getenv("PII_HASH_SALT", "SONELGAZ_DZ_1807_SALT")
        source = self.raw_subscriber_ref or self.sensor_id
        digest = hashlib.sha256(f"{salt}:{source}".encode("utf-8")).hexdigest()[:16]
        return f"DZ1807-{digest}"


class RealTimeIngestionService:
    """
    Gestionnaire d'ingestion haute performance supportant MQTT et Kafka,
    avec file d'attente asynchrone pour absorber les pics de milliers de capteurs.
    """

    def __init__(self, max_queue_size: int = 50000) -> None:
        self.broker_type = os.getenv("INGESTION_BROKER_TYPE", "MQTT").upper()
        self.mqtt_host = os.getenv("MQTT_BROKER_HOST", "mqtt.interne.sonelgaz.dz")
        self.mqtt_port = int(os.getenv("MQTT_BROKER_PORT", "8883"))
        self.kafka_bootstrap = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka-01.interne.sonelgaz.dz:9092")
        self._queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=max_queue_size)
        self._subscribers: List[Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = []
        self._ingested_count: int = 0

    def register_downstream_handler(
        self, handler: Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]
    ) -> None:
        """Enregistre un consommateur aval (ML Predictor, Détection Fraude, MongoDB)."""
        self._subscribers.append(handler)

    async def ingest_raw_message(self, topic: str, raw_payload: str | bytes) -> Dict[str, Any]:
        """
        Valide, anonymise (Loi 18-07) et publie une trame capteur dans le pipeline temps réel.
        """
        data = json.loads(raw_payload) if isinstance(raw_payload, (str, bytes)) else raw_payload
        telemetry = SensorTelemetryPayload(**data)

        normalized_record: Dict[str, Any] = {
            "sensor_id": telemetry.sensor_id,
            "wilaya_code": telemetry.wilaya_code,
            "energy_type": telemetry.energy_type.value,
            "protocol": telemetry.protocol.value,
            "topic": topic,
            "timestamp": telemetry.timestamp.isoformat(),
            "metrics": {
                "voltage_kv": telemetry.voltage_kv,
                "current_amp": telemetry.current_amp,
                "active_power_mw": telemetry.active_power_mw,
                "frequency_hz": telemetry.frequency_hz,
                "pressure_bar": telemetry.pressure_bar,
                "flow_rate_m3h": telemetry.flow_rate_m3h,
                "temperature_c": telemetry.temperature_c,
            },
            "anonymized_subscriber_id": telemetry.anonymize_subscriber_id(),
            "law_18_07_compliant": True,
        }

        await self._queue.put(normalized_record)
        self._ingested_count += 1

        for handler in self._subscribers:
            await handler(normalized_record)

        return normalized_record

    @property
    def total_ingested(self) -> int:
        return self._ingested_count
