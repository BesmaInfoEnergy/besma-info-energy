"""
Module de Notifications Push & Alertes Temps Réel via Firebase Cloud Messaging (FCM)
Routage par niveau de seuil (warning / critical / emergency) :
- warning   -> topic `alertes-zone-<hash>` uniquement
- critical  -> topics `alertes-zone-<hash>` + `alertes-critiques`
- emergency -> tous les topics + déclenchement automatique SCADA (`trigger_scada: True`)
"""

import hashlib
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

logger = logging.getLogger("besma.firebase_fcm")


class FirebaseAlertDispatcher:
    def __init__(self) -> None:
        self.service_account_path = os.getenv(
            "FIREBASE_SERVICE_ACCOUNT_PATH", "./firebase-service-account.json"
        )
        self.sender_id = os.getenv("FIREBASE_SENDER_ID", "1040592056755")
        self.project_id = os.getenv("VITE_FIREBASE_PROJECT_ID", "besma-info-energy")
        self._credentials_loaded = False
        self._client_email: Optional[str] = None
        self._dispatched_notifications: List[Dict[str, Any]] = []
        self._load_service_account_metadata()

    def _load_service_account_metadata(self) -> None:
        candidates = [
            Path(self.service_account_path),
            Path("backend") / Path(self.service_account_path).name,
            Path("/app/backend/firebase-service-account.json"),
        ]
        for candidate in candidates:
            if candidate.exists() and candidate.is_file():
                try:
                    data = json.loads(candidate.read_text(encoding="utf-8"))
                    if data.get("type") == "service_account":
                        self._credentials_loaded = True
                        self.project_id = data.get("project_id", self.project_id)
                        self._client_email = data.get("client_email")
                        break
                except Exception as exc:
                    logger.warning("Impossible de lire le compte de service Firebase: %s", exc)

    def get_status(self) -> Dict[str, Any]:
        return {
            "configured": self._credentials_loaded,
            "project_id": self.project_id,
            "sender_id": self.sender_id,
            "service_account_path": self.service_account_path,
            "client_email": self._client_email,
            "supported_topics": ["alertes-critiques", "alertes-zone-<hash>", "alertes-urgence-nationale"],
        }

    def send_alert(
        self,
        device_tokens: Optional[List[str]],
        title: str,
        body: str,
        data: Optional[Dict[str, str]] = None,
        topic: Optional[str] = None,
    ) -> Dict[str, Any]:
        tokens = [t for t in (device_tokens or []) if t]
        resolved_topic = topic or ("alertes-critiques" if not tokens else None)
        notification_id = f"FCM-NOTIF-{uuid.uuid4().hex[:10].upper()}"

        payload = {
            "notification_id": notification_id,
            "notification": {
                "title": title,
                "body": body,
            },
            "data": {
                **(data or {}),
                "notification_id": notification_id,
                "sender_id": self.sender_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "law_18_07_compliant": "true",
            },
            "targets": {
                "device_tokens_count": len(tokens),
                "device_tokens": tokens,
                "topic": resolved_topic,
            },
            "fcm_project": self.project_id,
            "credentials_active": self._credentials_loaded,
            "status": "sent",
        }
        self._dispatched_notifications.append(payload)
        return payload

    def send_critical_alert(
        self,
        alert_type: str,
        location_hash: str,
        probability: float,
        device_tokens: Optional[List[str]] = None,
        severity_level: Literal["warning", "critical", "emergency"] = "critical",
    ) -> Dict[str, Any]:
        """
        Alerte typée SCADA dont le niveau (warning / critical / emergency) détermine les canaux FCM :
        - warning   -> topic `alertes-zone-<hash>` uniquement
        - critical  -> topics `alertes-zone-<hash>` + `alertes-critiques`
        - emergency -> tous les topics (`alertes-zone-<hash>`, `alertes-critiques`, `alertes-urgence-nationale`) + déclenchement SCADA automatique
        """
        clean_hash = (
            location_hash
            if location_hash.startswith("DZ1807-") or len(location_hash) <= 20
            else hashlib.sha256(location_hash.encode("utf-8")).hexdigest()[:12]
        )
        zone_topic = f"alertes-zone-{clean_hash}"

        if severity_level == "warning":
            topics_broadcasted = [zone_topic]
            primary_topic = zone_topic
            auto_scada = False
        elif severity_level == "emergency":
            topics_broadcasted = [zone_topic, "alertes-critiques", "alertes-urgence-nationale"]
            primary_topic = "alertes-urgence-nationale"
            auto_scada = True
        else:
            topics_broadcasted = [zone_topic, "alertes-critiques"]
            primary_topic = "alertes-critiques"
            auto_scada = False

        prob_pct = round(float(probability) * 100, 1)
        title = f"[SCADA {severity_level.upper()}] {alert_type} ({prob_pct}%)"
        body = (
            f"Seuil {severity_level.upper()} franchi sur zone {clean_hash}. "
            f"Probabilité ML : {prob_pct}%."
        )

        data_payload = {
            "alert_type": str(alert_type),
            "severity_level": severity_level,
            "location_hash": str(clean_hash),
            "probability": str(round(float(probability), 4)),
            "primary_topic": primary_topic,
            "zone_topic": zone_topic,
            "auto_scada_triggered": str(auto_scada).lower(),
        }

        try:
            primary_dispatch = self.send_alert(
                device_tokens=device_tokens,
                title=title,
                body=body,
                data=data_payload,
                topic=primary_topic,
            )
            notification_id = primary_dispatch["notification_id"]
            timeout_sec = int(os.getenv("SMS_FALLBACK_TIMEOUT_SECONDS", "60"))
            from backend.sms_fallback import schedule_fallback_check

            schedule_fallback_check(
                notification_id=notification_id,
                timeout_seconds=timeout_sec,
                alert_data={
                    "alert_type": alert_type,
                    "zone": clean_hash,
                    "location_hash": clean_hash,
                    "probability": float(probability),
                    "severity_level": severity_level,
                },
            )
        except Exception as exc:
            logger.error("Échec envoi FCM (%s) — déclenchement immédiat du fallback SMS.", exc)
            fallback_notif_id = f"FCM-FAIL-{uuid.uuid4().hex[:8].upper()}"
            from backend.sms_fallback import escalate_alert

            escalation = escalate_alert(
                notification_id=fallback_notif_id,
                alert_data={
                    "alert_type": alert_type,
                    "zone": clean_hash,
                    "location_hash": clean_hash,
                    "probability": float(probability),
                    "severity_level": severity_level,
                },
                reason="system_failure",
            )
            return {
                "notification_id": fallback_notif_id,
                "status": "escalated_to_sms",
                "alert_type": alert_type,
                "severity_level": severity_level,
                "location_hash": clean_hash,
                "probability": round(float(probability), 4),
                "topics_broadcasted": topics_broadcasted,
                "auto_scada_triggered": auto_scada,
                "sms_escalation": escalation,
            }

        return {
            **primary_dispatch,
            "alert_type": alert_type,
            "severity_level": severity_level,
            "location_hash": clean_hash,
            "probability": round(float(probability), 4),
            "topics_broadcasted": topics_broadcasted,
            "auto_scada_triggered": auto_scada,
            "sms_fallback_scheduled_seconds": timeout_sec,
        }


fcm_dispatcher = FirebaseAlertDispatcher()


def send_alert(
    device_tokens: Optional[List[str]],
    title: str,
    body: str,
    data: Optional[Dict[str, str]] = None,
    topic: Optional[str] = None,
) -> Dict[str, Any]:
    return fcm_dispatcher.send_alert(
        device_tokens=device_tokens,
        title=title,
        body=body,
        data=data,
        topic=topic,
    )


def send_critical_alert(
    alert_type: str,
    location_hash: str,
    probability: float,
    device_tokens: Optional[List[str]] = None,
    severity_level: Literal["warning", "critical", "emergency"] = "critical",
) -> Dict[str, Any]:
    return fcm_dispatcher.send_critical_alert(
        alert_type=alert_type,
        location_hash=location_hash,
        probability=probability,
        device_tokens=device_tokens,
        severity_level=severity_level,
    )
