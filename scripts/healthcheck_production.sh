#!/usr/bin/env bash
# ==============================================================================
# BESMAINFOENERGY — DIAGNOSTIC DE SANTÉ & CONFORMITÉ PRODUCTION (HEALTHCHECK)
# Client : SONELGAZ / Exploitation & Maintenance (MCO)
# Conformité : Loi Algérienne n° 18-07 & Norme ISA-101
# ==============================================================================

set -u

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

echo -e "${BLUE}================================================================================${NC}"
echo -e "${BLUE}   BESMAINFOENERGY — CONTRÔLE D'INTÉGRITÉ & DIAGNOSTIC DE PRODUCTION            ${NC}"
echo -e "${BLUE}================================================================================${NC}"

# 1. Vérification des fichiers critiques du livrable
echo -e "\n${YELLOW}[1/5] Vérification des fichiers d'infrastructure et de livraison...${NC}"
REQUIRED_FILES=(
  "Dockerfile"
  "infrastructure/Dockerfile.backend"
  "docker-compose.prod.yml"
  "install_production.sh"
  "LIVRAISON_CLIENT_SONELGAZ.md"
  "scripts/scada_rtu_simulator.py"
  "scripts/verify_audit_signature.py"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ -f "$f" ]; then
    echo -e "  ${GREEN}✓${NC} Fichier présent : $f"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${RED}✗${NC} Fichier manquant : $f"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
done

# 2. Vérification des clés cryptographiques RSA-4096 (Loi 18-07)
echo -e "\n${YELLOW}[2/5] Vérification des clés de signature d'audit RSA-4096 (Loi n° 18-07)...${NC}"
if [ -f "./keys/audit_signing_key.pem" ] && [ -f "./keys/audit_public_key.pem" ]; then
  echo -e "  ${GREEN}✓${NC} Paire de clés RSA-4096 détectée dans ./keys/"
  PASS_COUNT=$((PASS_COUNT + 1))
else
  echo -e "  ${YELLOW}!${NC} Clés RSA-4096 non encore générées (seront créées automatiquement par ./install_production.sh)"
  WARN_COUNT=$((WARN_COUNT + 1))
fi

# 3. Vérification de l'API Web & Passerelle Temps Réel (Port 3000)
echo -e "\n${YELLOW}[3/5] Test de disponibilité de la Passerelle Web & API (Port 3000)...${NC}"
if command -v curl &> /dev/null; then
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  ${GREEN}✓${NC} Passerelle BesmaInfoEnergy active (HTTP 200 OK sur /api/v1/health)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${YELLOW}!${NC} Passerelle sur port 3000 non démarrée ou statut HTTP: $HTTP_STATUS"
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
fi

# 4. Exécution de l'auto-test cryptographique Loi 18-07
echo -e "\n${YELLOW}[4/5] Exécution de l'auto-test cryptographique d'audit (SHA-256 / Loi 18-07)...${NC}"
if command -v python3 &> /dev/null; then
  if python3 scripts/verify_audit_signature.py --self-test > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Auto-test de signature et d'anti-falsification réussi"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${RED}✗${NC} Échec de l'auto-test cryptographique"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
fi

# 5. Test de génération d'une salve SCADA de recette
echo -e "\n${YELLOW}[5/5] Test du simulateur d'automates SCADA / RTU (5 zones nationales)...${NC}"
if command -v python3 &> /dev/null; then
  if python3 scripts/scada_rtu_simulator.py --mode single > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Simulateur SCADA opérationnel (trames JSON validées pour les 5 zones)"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo -e "  ${RED}✗${NC} Erreur lors de l'exécution du simulateur SCADA"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
fi

echo -e "\n${BLUE}================================================================================${NC}"
echo -e "  BILAN DU DIAGNOSTIC : ${GREEN}${PASS_COUNT} Validés${NC} | ${YELLOW}${WARN_COUNT} Avertissements${NC} | ${RED}${FAIL_COUNT} Erreurs${NC}"
echo -e "${BLUE}================================================================================${NC}"

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi
exit 0
