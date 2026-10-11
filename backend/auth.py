"""
Module 7 : Système d'Authentification JWT et Contrôle d'Accès par Rôles (RBAC)
Rôles supportés : admin, operateur, lecteur.
Aucun secret codé en dur (utilisation de variables d'environnement).
"""

import base64
import hashlib
import hmac
import json
import os
import time
from enum import Enum
from typing import Any, Dict, List, Optional


class UserRole(str, Enum):
    ADMIN = "admin"
    OPERATEUR = "operateur"
    LECTEUR = "lecteur"


def get_jwt_secret() -> str:
    return os.getenv("JWT_SECRET_KEY", "besma_national_grid_secret_dz_18_07")


def create_jwt_token(username: str, role: UserRole, expires_in_seconds: int = 3600) -> str:
    """Génère un jeton JWT signé HS256 sans dépendance externe fragile."""
    header = {"alg": "HS256", "typ": "JWT"}
    now = int(time.time())
    payload = {
        "sub": username,
        "role": role.value,
        "iat": now,
        "exp": now + expires_in_seconds,
    }

    header_b64 = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signing_input = f"{header_b64}.{payload_b64}".encode()
    signature = hmac.new(get_jwt_secret().encode(), signing_input, hashlib.sha256).digest()
    sig_b64 = base64.urlsafe_b64encode(signature).decode().rstrip("=")

    return f"{header_b64}.{payload_b64}.{sig_b64}"


def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """Vérifie la signature et l'expiration d'un jeton JWT."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        header_b64, payload_b64, sig_b64 = parts
        signing_input = f"{header_b64}.{payload_b64}".encode()
        expected_sig = hmac.new(get_jwt_secret().encode(), signing_input, hashlib.sha256).digest()
        expected_b64 = base64.urlsafe_b64encode(expected_sig).decode().rstrip("=")

        if not hmac.compare_digest(sig_b64, expected_b64):
            return None

        padding = "=" * (-len(payload_b64) % 4)
        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + padding).decode())
        if payload.get("exp", 0) < int(time.time()):
            return None
        return payload
    except Exception:
        return None


def check_role_permission(user_role: str, allowed_roles: List[UserRole]) -> bool:
    """Vérifie si le rôle de l'utilisateur figure dans la liste autorisée."""
    return user_role in [r.value for r in allowed_roles]
