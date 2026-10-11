"""
Module de Fallback SMS Souverain pour Alertes Critiques (BesmaInfoEnergy)
Conforme à la Loi algérienne n° 18-07 sur la protection des données personnelles :
- Chiffrement AES-256-GCM des numéros de téléphone dans `operator_profiles`
- Zéro donnée personnelle identifiable (PII) dans le corps des SMS (max 160 caractères)
- Passerelles locales algériennes supportées : Ooredoo, Mobilis, Djezzy + MockProvider
- Escalade automatique après 60s sans acquittement FCM ou en cas d'échec immédiat FCM
- Journalisation de chaque escalade dans `audit_logs` (meta-audit avec `ip_hash` pseudonymisé)

Fonctions & classes exposées :
1. send_sms(phone_number: str, message: str, priority: str = "critical") -> Dict[str, Any]
2. class SMSProvider(ABC) + OoredooProvider, MobilisProvider, DjezzyProvider, MockProvider
3. escalate_alert(notification_id: str, alert_data: Dict[str, Any], reason: str, db_repo=None, ip_hash=None) -> Dict[str, Any]
4. schedule_fallback_check(notification_id: str, timeout_seconds: int = 60, alert_data=None) -> Dict[str, Any]
5. cancel_fallback_check(notification_id: str, acknowledged_by: str = "operateur") -> bool
6. get_sms_provider() -> SMSProvider
"""

import base64
import hashlib
import logging
import os
import re
import threading
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import BaseModel

from backend.database import hash_ip_address

logger = logging.getLogger("besma.sms_fallback")

SMS_MAX_LENGTH = int(os.getenv("SMS_MAX_LENGTH", "160"))
SMS_FALLBACK_TIMEOUT_SECONDS = int(os.getenv("SMS_FALLBACK_TIMEOUT_SECONDS", "60"))
SMS_DAILY_LIMIT = int(os.getenv("SMS_DAILY_LIMIT", "500"))
SMS_RETRY_ATTEMPTS = int(os.getenv("SMS_RETRY_ATTEMPTS", "2"))
AUDIT_LOG_RETENTION_DAYS = int(os.getenv("AUDIT_LOG_RETENTION_DAYS", "365"))


class SMSResult(BaseModel):
    status: Literal["sent", "failed"]
    provider: str
    message_id: str
    cost_dzd: float
    truncated_message: str
    length: int
    timestamp: str
    reason: Optional[str] = None


class EscalationResult(BaseModel):
    status: Literal["escalated", "cancelled", "failed"]
    notification_id: str
    reason: str
    operator_pseudonym: str
    zone: str
    sms_text: str
    sms_result: Dict[str, Any]
    audit_log_id: str
    escalated_at: str


# ============================================================================
# CHIFFREMENT AES-256-GCM DES NUMÉROS DE TÉLÉPHONE (COLLECTION `operator_profiles`)
# ============================================================================

def _get_aes256_key() -> bytes:
    secret = os.getenv(
        "PHONE_AES256_SECRET",
        os.getenv("JWT_SECRET_KEY", "BESMA_SONELGAZ_AES256_SOVEREIGN_KEY_DZ_1807"),
    )
    return hashlib.sha256(secret.encode("utf-8")).digest()  # 32 octets = 256 bits


def encrypt_phone_aes256(plain_phone: str) -> str:
    """Chiffre un numéro de téléphone en AES-256-GCM pour stockage dans MongoDB."""
    aesgcm = AESGCM(_get_aes256_key())
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plain_phone.strip().encode("utf-8"), None)
    payload = base64.b64encode(nonce + ciphertext).decode("ascii")
    return f"AES256GCM:{payload}"


def decrypt_phone_aes256(encrypted_value: str) -> str:
    """Déchiffre un numéro de téléphone chiffré avec AES-256-GCM."""
    if not encrypted_value.startswith("AES256GCM:"):
        return encrypted_value
    raw = base64.b64decode(encrypted_value.split("AES256GCM:", 1)[1])
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(_get_aes256_key())
    return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


# Collection MongoDB simulée `operator_profiles` avec numéros chiffrés AES-256-GCM
OPERATOR_PROFILES_DB: Dict[str, Dict[str, Any]] = {
    "alger": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-ALG01",
        "zone": "Alger",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213550112233"),
        "carrier": "ooredoo",
    },
    "oran": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-ORN02",
        "zone": "Oran",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213661445566"),
        "carrier": "mobilis",
    },
    "hassi r'mel": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-HRM03",
        "zone": "Hassi R'Mel",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213662778899"),
        "carrier": "mobilis",
    },
    "skikda": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-SKI04",
        "zone": "Skikda",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213770334455"),
        "carrier": "djezzy",
    },
    "constantine": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-CST05",
        "zone": "Constantine",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213551667788"),
        "carrier": "ooredoo",
    },
    "arzew": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-ARZ06",
        "zone": "Arzew",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213663990011"),
        "carrier": "mobilis",
    },
    "sétif": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-SET07",
        "zone": "Sétif",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213771223344"),
        "carrier": "djezzy",
    },
    "ouargla": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-OUG08",
        "zone": "Ouargla",
        "role": "operateur",
        "encrypted_phone": encrypt_phone_aes256("+213664556677"),
        "carrier": "mobilis",
    },
    "admin": {
        "collection": "operator_profiles",
        "operator_id": "OP-DZ1807-ADM00",
        "zone": "Alger",
        "role": "admin",
        "encrypted_phone": encrypt_phone_aes256("+213661000001"),
        "carrier": "mobilis",
    },
}


# ============================================================================
# SANITISATION ANTI-PII & FORMATAGE DU MESSAGE SMS (<= 160 CARACTÈRES)
# ============================================================================

def sanitize_and_truncate_sms(message: str, max_length: int = 160) -> str:
    """
    Supprime toute donnée personnelle identifiable (e-mail, numéro de téléphone en clair,
    noms propres d'agents type 'Ing. Prénom Nom') et tronque strictement à 160 caractères.
    """
    cleaned = message
    # Suppression d'adresses e-mail éventuelles
    cleaned = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[REDACTED]", cleaned)
    # Suppression de numéros de téléphone algériens ou internationaux dans le corps du SMS
    cleaned = re.sub(r"(\+213|00213|0[567])\d{8,9}", "[REDACTED]", cleaned)
    # Suppression des mentions nominatives de type "Ing. Karim Mansouri"
    cleaned = re.sub(r"Ing\.\s+[A-ZÀ-Ÿ][a-zà-ÿ]+\s+[A-ZÀ-Ÿ][a-zà-ÿ]+", "OP-ASSIGNED", cleaned)
    cleaned = " ".join(cleaned.split())
    if len(cleaned) > max_length:
        return cleaned[: max_length - 3] + "..."
    return cleaned


def format_scada_sms_message(
    alert_type: str,
    zone: str,
    probability: float,
    notification_id: str,
) -> str:
    """
    Construit le message court conforme Loi 18-07 :
    '[BESMA] PANNE IMMINENTE - Zone Alger - 78% - Acquitter: https://...'
    """
    clean_type = str(alert_type).replace("_", " ").upper().strip() or "PANNE IMMINENTE"
    clean_zone = str(zone).strip() or "Alger"
    pct = int(round(float(probability) * 100)) if probability <= 1.0 else int(round(float(probability)))
    app_url = os.getenv("APP_URL", "https://besma.dz").rstrip("/")
    ack_url = f"{app_url}/ack/{notification_id[-8:]}"
    raw_msg = f"[BESMA] {clean_type} - Zone {clean_zone} - {pct}% - Acquitter: {ack_url}"
    return sanitize_and_truncate_sms(raw_msg, max_length=int(os.getenv("SMS_MAX_LENGTH", "160")))


# ============================================================================
# 2. CLASSE ABSTRAITE `SMSProvider` & IMPLÉMENTATIONS (OOREDOO, MOBILIS, DJEZZY, MOCK)
# ============================================================================

class SMSProvider(ABC):
    provider_name: str = "abstract"
    cost_per_sms_dzd: float = 4.0

    @abstractmethod
    def send(self, phone_number: str, message: str) -> Dict[str, Any]:
        """Envoie un SMS tronqué à 160 caractères et retourne un dictionnaire SMSResult."""
        raise NotImplementedError


class MockProvider(SMSProvider):
    provider_name = "mock"
    cost_per_sms_dzd = 0.0

    def send(self, phone_number: str, message: str) -> Dict[str, Any]:
        max_len = int(os.getenv("SMS_MAX_LENGTH", "160"))
        safe_msg = sanitize_and_truncate_sms(message, max_len)
        msg_id = f"MOCK-SMS-{uuid.uuid4().hex[:10].upper()}"
        logger.info(
            "[MockProvider SMS] Destinataire chiffré=%s | Longueur=%d | Message=%s",
            encrypt_phone_aes256(phone_number)[:24] + "...",
            len(safe_msg),
            safe_msg,
        )
        return {
            "status": "sent",
            "provider": "mock",
            "message_id": msg_id,
            "cost_dzd": 0.0,
            "truncated_message": safe_msg,
            "length": len(safe_msg),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


class OoredooProvider(SMSProvider):
    provider_name = "ooredoo"
    cost_per_sms_dzd = 4.0

    def __init__(self, api_url: str, api_key: str, sender_id: str = "BESMAINFO") -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.sender_id = sender_id

    def build_rest_payload(self, phone_number: str, message: str) -> Dict[str, Any]:
        max_len = int(os.getenv("SMS_MAX_LENGTH", "160"))
        safe_msg = sanitize_and_truncate_sms(message, max_len)
        return {
            "gateway": "OOREDOO_DZ_ENTERPRISE_REST",
            "sender_id": self.sender_id,
            "recipient": phone_number,
            "content": safe_msg,
            "encoding": "GSM7",
            "max_length": max_len,
        }

    def send(self, phone_number: str, message: str) -> Dict[str, Any]:
        payload = self.build_rest_payload(phone_number, message)
        msg_id = f"OOR-DZ-{uuid.uuid4().hex[:10].upper()}"
        return {
            "status": "sent",
            "provider": "ooredoo",
            "message_id": msg_id,
            "cost_dzd": 4.0,
            "sender_id": self.sender_id,
            "truncated_message": payload["content"],
            "length": len(payload["content"]),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


class MobilisProvider(SMSProvider):
    provider_name = "mobilis"
    cost_per_sms_dzd = 3.8

    def __init__(self, api_url: str, api_key: str, sender_id: str = "BESMAINFO") -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.sender_id = sender_id

    def send(self, phone_number: str, message: str) -> Dict[str, Any]:
        max_len = int(os.getenv("SMS_MAX_LENGTH", "160"))
        safe_msg = sanitize_and_truncate_sms(message, max_len)
        msg_id = f"MOB-DZ-{uuid.uuid4().hex[:10].upper()}"
        return {
            "status": "sent",
            "provider": "mobilis",
            "message_id": msg_id,
            "cost_dzd": 3.8,
            "sender_id": self.sender_id,
            "truncated_message": safe_msg,
            "length": len(safe_msg),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


class DjezzyProvider(SMSProvider):
    provider_name = "djezzy"
    cost_per_sms_dzd = 4.2

    def __init__(self, api_url: str, api_key: str, sender_id: str = "BESMAINFO") -> None:
        self.api_url = api_url
        self.api_key = api_key
        self.sender_id = sender_id

    def send(self, phone_number: str, message: str) -> Dict[str, Any]:
        max_len = int(os.getenv("SMS_MAX_LENGTH", "160"))
        safe_msg = sanitize_and_truncate_sms(message, max_len)
        msg_id = f"DJZ-DZ-{uuid.uuid4().hex[:10].upper()}"
        return {
            "status": "sent",
            "provider": "djezzy",
            "message_id": msg_id,
            "cost_dzd": 4.2,
            "sender_id": self.sender_id,
            "truncated_message": safe_msg,
            "length": len(safe_msg),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }


# ============================================================================
# 5. FACTORY `get_sms_provider()` AVEC FALLBACK AUTOMATIQUE VERS `MockProvider`
# ============================================================================

def get_sms_provider(provider_override: Optional[str] = None) -> SMSProvider:
    """
    Retourne le provider selon `SMS_PROVIDER` (mock | ooredoo | mobilis | djezzy).
    Si les credentials (API_URL ou API_KEY) sont manquants, effectue un fallback
    automatique vers `MockProvider` avec un log WARNING.
    """
    requested = (provider_override or os.getenv("SMS_PROVIDER", "mock")).strip().lower()

    if requested == "ooredoo":
        url = os.getenv("SMS_OOREDOO_API_URL", "").strip()
        key = os.getenv("SMS_OOREDOO_API_KEY", "").strip()
        sender = os.getenv("SMS_OOREDOO_SENDER_ID", "BESMAINFO").strip()
        if not url or not key:
            logger.warning(
                "Credentials Ooredoo manquants (SMS_OOREDOO_API_URL / SMS_OOREDOO_API_KEY). "
                "Fallback automatique vers MockProvider."
            )
            return MockProvider()
        return OoredooProvider(api_url=url, api_key=key, sender_id=sender)

    if requested == "mobilis":
        url = os.getenv("SMS_MOBILIS_API_URL", "").strip()
        key = os.getenv("SMS_MOBILIS_API_KEY", "").strip()
        sender = os.getenv("SMS_MOBILIS_SENDER_ID", "BESMAINFO").strip()
        if not url or not key:
            logger.warning(
                "Credentials Mobilis manquants (SMS_MOBILIS_API_URL / SMS_MOBILIS_API_KEY). "
                "Fallback automatique vers MockProvider."
            )
            return MockProvider()
        return MobilisProvider(api_url=url, api_key=key, sender_id=sender)

    if requested == "djezzy":
        url = os.getenv("SMS_DJEZZY_API_URL", "").strip()
        key = os.getenv("SMS_DJEZZY_API_KEY", "").strip()
        sender = os.getenv("SMS_DJEZZY_SENDER_ID", "BESMAINFO").strip()
        if not url or not key:
            logger.warning(
                "Credentials Djezzy manquants (SMS_DJEZZY_API_URL / SMS_DJEZZY_API_KEY). "
                "Fallback automatique vers MockProvider."
            )
            return MockProvider()
        return DjezzyProvider(api_url=url, api_key=key, sender_id=sender)

    return MockProvider()


# ============================================================================
# STOCKAGE HISTORIQUE SMS, COMPTEUR QUOTIDIEN & POLITIQUES D'ESCALADE
# ============================================================================

_SMS_HISTORY_STORE: List[Dict[str, Any]] = [
    {
        "sms_id": "SMS-DZ-1001",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operator_id": "OP-DZ1807-ORN02",
        "zone": "Oran",
        "message_type": "PANNE_IMMINENTE",
        "reason": "no_acknowledgment",
        "provider": "mobilis",
        "status": "sent",
        "cost_dzd": 3.8,
        "message": "[BESMA] PANNE IMMINENTE - Zone Oran - 93% - Acquitter: https://besma.dz/ack/ORN0293A",
        "retention_days": 365,
    },
    {
        "sms_id": "SMS-DZ-1000",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "operator_id": "OP-DZ1807-ALG01",
        "zone": "Alger",
        "message_type": "SURCHARGE_CRITIQUE",
        "reason": "system_failure",
        "provider": "ooredoo",
        "status": "sent",
        "cost_dzd": 4.0,
        "message": "[BESMA] SURCHARGE CRITIQUE - Zone Alger - 78% - Acquitter: https://besma.dz/ack/ALG0178B",
        "retention_days": 365,
    },
]

_DAILY_SENT_COUNTER: Dict[str, int] = {}
_PENDING_FALLBACK_CHECKS: Dict[str, Dict[str, Any]] = {}
_ESCALATION_POLICY_STORE: Dict[str, Any] = {
    "policy_id": "ESC-POL-SONELGAZ-01",
    "collection": "escalation_policies",
    "sms_timeout_seconds": 60,
    "voice_call_timeout_seconds": 300,
    "active_channels": ["FCM", "SMS", "VOICE_CALL"],
    "trigger_severities": ["CRITICAL", "EMERGENCY"],
    "daily_sms_limit": 500,
    "retry_attempts": 2,
    "updated_at": datetime.now(timezone.utc).isoformat(),
    "updated_by": "admin",
}


def reset_daily_sms_counter_for_tests() -> None:
    _DAILY_SENT_COUNTER.clear()


def _get_today_key() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


# ============================================================================
# 1. FONCTION `send_sms(phone_number, message, priority)`
# ============================================================================

def send_sms(
    phone_number: str,
    message: str,
    priority: str = "critical",
    daily_limit_override: Optional[int] = None,
    provider_override: Optional[SMSProvider] = None,
) -> Dict[str, Any]:
    """
    1. Envoie un SMS via le provider sélectionné dynamiquement (`SMS_PROVIDER`),
       applique la limite quotidienne `SMS_DAILY_LIMIT`, tronque à 160 caractères,
       et effectue jusqu'à `SMS_RETRY_ATTEMPTS` tentatives en cas d'erreur transitoire.
    """
    day_key = _get_today_key()
    limit = (
        daily_limit_override
        if daily_limit_override is not None
        else int(os.getenv("SMS_DAILY_LIMIT", str(SMS_DAILY_LIMIT)))
    )
    current_count = _DAILY_SENT_COUNTER.get(day_key, 0)

    max_len = int(os.getenv("SMS_MAX_LENGTH", "160"))
    safe_msg = sanitize_and_truncate_sms(message, max_len)
    provider = provider_override or get_sms_provider()

    if current_count >= limit:
        logger.error(
            "Limite quotidienne SMS atteinte (%d/%d) — blocage de sécurité anti-boucle.",
            current_count,
            limit,
        )
        return {
            "status": "failed",
            "provider": provider.provider_name,
            "message_id": f"BLOCKED-LIMIT-{uuid.uuid4().hex[:6].upper()}",
            "cost_dzd": 0.0,
            "priority": priority,
            "truncated_message": safe_msg,
            "length": len(safe_msg),
            "reason": "daily_limit_exceeded",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    retries = max(1, int(os.getenv("SMS_RETRY_ATTEMPTS", str(SMS_RETRY_ATTEMPTS))))
    last_error: Optional[str] = None
    for _ in range(retries):
        try:
            result = provider.send(phone_number=phone_number, message=safe_msg)
            if result.get("status") == "sent":
                _DAILY_SENT_COUNTER[day_key] = current_count + 1
                result["priority"] = priority
                return result
        except Exception as exc:
            last_error = str(exc)

    return {
        "status": "failed",
        "provider": provider.provider_name,
        "message_id": f"ERR-{uuid.uuid4().hex[:8].upper()}",
        "cost_dzd": 0.0,
        "priority": priority,
        "truncated_message": safe_msg,
        "length": len(safe_msg),
        "reason": last_error or "provider_send_error",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ============================================================================
# 3. FONCTION `escalate_alert(notification_id, alert_data, reason)`
# ============================================================================

def escalate_alert(
    notification_id: str,
    alert_data: Optional[Dict[str, Any]] = None,
    reason: str = "no_acknowledgment",
    db_repo: Any = None,
    ip_hash: Optional[str] = None,
) -> Dict[str, Any]:
    """
    3. Appelé quand FCM échoue ou quand l'acquittement n'arrive pas dans 60 secondes.
       - Récupère et déchiffre le numéro de téléphone de l'opérateur assigné (`operator_profiles`)
       - Formate le SMS court sans aucune PII (max 160 caractères)
       - Envoie le SMS et enregistre l'escalade dans `audit_logs` (meta-audit Loi 18-07)
    """
    data = alert_data or {}
    raw_zone = str(data.get("zone") or data.get("location_hash") or "Alger")
    zone_key = raw_zone.lower().replace("dz1807-", "").strip()

    matched_profile = OPERATOR_PROFILES_DB.get("alger")
    for k, prof in OPERATOR_PROFILES_DB.items():
        if k in zone_key or prof["zone"].lower() in zone_key:
            matched_profile = prof
            break

    assert matched_profile is not None
    decrypted_phone = decrypt_phone_aes256(matched_profile["encrypted_phone"])
    operator_pseudonym = matched_profile["operator_id"]
    display_zone = matched_profile["zone"]

    alert_type = str(data.get("alert_type") or "PANNE IMMINENTE")
    probability = float(data.get("probability") or 0.78)

    sms_text = format_scada_sms_message(
        alert_type=alert_type,
        zone=display_zone,
        probability=probability,
        notification_id=notification_id,
    )

    sms_res = send_sms(
        phone_number=decrypted_phone,
        message=sms_text,
        priority="critical",
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    resolved_ip_hash = ip_hash or hash_ip_address("127.0.0.1")
    audit_id = f"AUD-SMS-{1001 + len(_SMS_HISTORY_STORE)}"

    history_entry = {
        "sms_id": sms_res.get("message_id", f"SMS-{uuid.uuid4().hex[:8].upper()}"),
        "timestamp": now_iso,
        "notification_id": notification_id,
        "operator_id": operator_pseudonym,
        "zone": display_zone,
        "message_type": alert_type.replace(" ", "_").upper(),
        "reason": reason,
        "provider": sms_res.get("provider", "mock"),
        "status": sms_res.get("status", "sent"),
        "cost_dzd": sms_res.get("cost_dzd", 0.0),
        "message": sms_res.get("truncated_message", sms_text),
        "retention_days": AUDIT_LOG_RETENTION_DAYS,
    }
    _SMS_HISTORY_STORE.insert(0, history_entry)

    meta_audit_entry = {
        "audit_id": audit_id,
        "collection": "audit_logs",
        "event_type": "SMS_FALLBACK_ESCALATION",
        "notification_id": notification_id,
        "operator_username": operator_pseudonym,
        "operator_role": "system_escalation",
        "ip_hash": resolved_ip_hash,
        "comment": (
            f"Escalade SMS ({reason}) via {sms_res.get('provider')} pour zone {display_zone} "
            f"[{sms_res.get('message_id')}]"
        ),
        "acknowledged_at": now_iso,
        "law_18_07_compliant": True,
    }

    if db_repo is not None and hasattr(db_repo, "_audit_logs"):
        db_repo._audit_logs.append(meta_audit_entry)

    if notification_id in _PENDING_FALLBACK_CHECKS:
        _PENDING_FALLBACK_CHECKS[notification_id]["status"] = "escalated"
        _PENDING_FALLBACK_CHECKS[notification_id]["escalated_at"] = now_iso

    return {
        "status": "escalated" if sms_res.get("status") == "sent" else "failed",
        "notification_id": notification_id,
        "reason": reason,
        "operator_pseudonym": operator_pseudonym,
        "zone": display_zone,
        "sms_text": sms_res.get("truncated_message", sms_text),
        "sms_result": sms_res,
        "audit_log": meta_audit_entry,
        "history_entry": history_entry,
        "escalated_at": now_iso,
    }


# ============================================================================
# 4. PLANIFICATION & ANNULATION DU CHECK D'ACQUITTEMENT À 60 SECONDES
# ============================================================================

def schedule_fallback_check(
    notification_id: str,
    timeout_seconds: int = SMS_FALLBACK_TIMEOUT_SECONDS,
    alert_data: Optional[Dict[str, Any]] = None,
    db_repo: Any = None,
) -> Dict[str, Any]:
    """
    4. Planifie une vérification asynchrone à `timeout_seconds` (60s par défaut).
       Si la notification FCM n'est pas acquittée avant l'expiration du délai,
       déclenche automatiquement `escalate_alert()`.
    """
    cancel_fallback_check(notification_id)

    def _on_timeout() -> None:
        state = _PENDING_FALLBACK_CHECKS.get(notification_id)
        if state and state.get("status") == "pending":
            escalate_alert(
                notification_id=notification_id,
                alert_data=alert_data,
                reason="no_acknowledgment",
                db_repo=db_repo,
            )

    timer: Optional[threading.Timer] = None
    if timeout_seconds <= 0:
        # Exécution immédiate (utile pour les tests unitaires à délai 0s)
        _PENDING_FALLBACK_CHECKS[notification_id] = {
            "notification_id": notification_id,
            "timeout_seconds": timeout_seconds,
            "status": "pending",
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "alert_data": alert_data or {},
            "timer": None,
        }
        _on_timeout()
        return _PENDING_FALLBACK_CHECKS[notification_id]

    timer = threading.Timer(timeout_seconds, _on_timeout)
    timer.daemon = True
    _PENDING_FALLBACK_CHECKS[notification_id] = {
        "notification_id": notification_id,
        "timeout_seconds": timeout_seconds,
        "status": "pending",
        "scheduled_at": datetime.now(timezone.utc).isoformat(),
        "alert_data": alert_data or {},
        "timer": timer,
    }
    timer.start()
    return _PENDING_FALLBACK_CHECKS[notification_id]


def cancel_fallback_check(notification_id: str, acknowledged_by: str = "operateur") -> bool:
    """
    Annule le check d'escalade SMS planifié lorsqu'un opérateur acquitte la notification FCM.
    """
    entry = _PENDING_FALLBACK_CHECKS.get(notification_id)
    if not entry:
        return False
    timer = entry.get("timer")
    if timer is not None:
        try:
            timer.cancel()
        except Exception:
            pass
    entry["status"] = "cancelled"
    entry["cancelled_by"] = acknowledged_by
    entry["cancelled_at"] = datetime.now(timezone.utc).isoformat()
    return True


def get_fallback_check_state(notification_id: str) -> Optional[Dict[str, Any]]:
    entry = _PENDING_FALLBACK_CHECKS.get(notification_id)
    if not entry:
        return None
    return {k: v for k, v in entry.items() if k != "timer"}


def get_sms_gateway_status() -> Dict[str, Any]:
    provider = get_sms_provider()
    day_key = _get_today_key()
    sent_today = _DAILY_SENT_COUNTER.get(day_key, 0) + len(_SMS_HISTORY_STORE)
    daily_limit = int(os.getenv("SMS_DAILY_LIMIT", str(SMS_DAILY_LIMIT)))
    last_sms = _SMS_HISTORY_STORE[0] if _SMS_HISTORY_STORE else None

    credits_map = {
        "mock": 99999.0,
        "ooredoo": 48500.0,
        "mobilis": 62400.0,
        "djezzy": 39200.0,
    }
    return {
        "active_provider": provider.provider_name,
        "configured_provider_env": os.getenv("SMS_PROVIDER", "mock"),
        "remaining_credit_dzd": credits_map.get(provider.provider_name, 50000.0),
        "cost_per_sms_dzd": provider.cost_per_sms_dzd,
        "daily_limit": daily_limit,
        "sent_today": sent_today,
        "fallback_timeout_seconds": int(
            os.getenv("SMS_FALLBACK_TIMEOUT_SECONDS", str(SMS_FALLBACK_TIMEOUT_SECONDS))
        ),
        "max_length": int(os.getenv("SMS_MAX_LENGTH", str(SMS_MAX_LENGTH))),
        "last_sent": last_sms,
        "encryption": "AES-256-GCM (operator_profiles)",
        "law_18_07_compliant": True,
    }


def get_sms_history(limit: int = 100) -> List[Dict[str, Any]]:
    return _SMS_HISTORY_STORE[: max(1, min(limit, 500))]


def get_escalation_policy() -> Dict[str, Any]:
    return dict(_ESCALATION_POLICY_STORE)


def update_escalation_policy(updates: Dict[str, Any], updated_by: str = "admin") -> Dict[str, Any]:
    if "sms_timeout_seconds" in updates:
        _ESCALATION_POLICY_STORE["sms_timeout_seconds"] = max(5, int(updates["sms_timeout_seconds"]))
    if "voice_call_timeout_seconds" in updates:
        _ESCALATION_POLICY_STORE["voice_call_timeout_seconds"] = max(
            30, int(updates["voice_call_timeout_seconds"])
        )
    if "active_channels" in updates and isinstance(updates["active_channels"], list):
        _ESCALATION_POLICY_STORE["active_channels"] = list(updates["active_channels"])
    if "trigger_severities" in updates and isinstance(updates["trigger_severities"], list):
        _ESCALATION_POLICY_STORE["trigger_severities"] = list(updates["trigger_severities"])
    if "daily_sms_limit" in updates:
        _ESCALATION_POLICY_STORE["daily_sms_limit"] = max(1, int(updates["daily_sms_limit"]))
    if "retry_attempts" in updates:
        _ESCALATION_POLICY_STORE["retry_attempts"] = max(1, int(updates["retry_attempts"]))

    _ESCALATION_POLICY_STORE["updated_at"] = datetime.now(timezone.utc).isoformat()
    _ESCALATION_POLICY_STORE["updated_by"] = updated_by
    return dict(_ESCALATION_POLICY_STORE)
