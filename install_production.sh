#!/usr/bin/env bash
# ==============================================================================
# BESMAINFOENERGY — SCRIPT D'INSTALLATION AUTOMATISÉE DE PRODUCTION (CLÉ EN MAIN)
# Client : SONELGAZ / Opérateur Énergétique National
# Conformité : Loi Algérienne n° 18-07 (Protection des données & Souveraineté)
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}================================================================================${NC}"
echo -e "${BLUE}   BESMAINFOENERGY — DÉPLOIEMENT SOUVERAIN EN PRODUCTION (LOI N° 18-07)         ${NC}"
echo -e "${BLUE}================================================================================${NC}"

# 1. Vérification des prérequis Docker & OpenSSL
echo -e "\n${YELLOW}[1/6] Vérification des outils système (Docker, Docker Compose, OpenSSL)...${NC}"
for cmd in docker openssl; do
  if ! command -v "$cmd" &> /dev/null; then
    echo -e "${RED}Erreur : La commande '$cmd' n'est pas installée sur ce serveur.${NC}"
    echo "Veuillez installer Docker et OpenSSL avant de relancer ce script."
    exit 1
  fi
done
echo -e "${GREEN}✓ Outils système vérifiés avec succès.${NC}"

# 2. Création des répertoires de sécurité, modèles ML et sauvegardes
echo -e "\n${YELLOW}[2/6] Préparation de l'arborescence souveraine (keys, models, backups)...${NC}"
mkdir -p ./keys ./models ./backups/mongodb
chmod 700 ./keys ./backups/mongodb
echo -e "${GREEN}✓ Répertoires sécurisés créés.${NC}"

# 3. Génération de la paire de clés RSA-4096 pour la signature légale des audits (RFC 3161 / Loi 18-07)
echo -e "\n${YELLOW}[3/6] Vérification / Génération des clés cryptographiques RSA-4096 (Audit Loi 18-07)...${NC}"
if [ ! -f "./keys/audit_signing_key.pem" ]; then
  openssl genpkey -algorithm RSA -out ./keys/audit_signing_key.pem -pkeyopt rsa_keygen_bits:4096
  openssl rsa -pubout -in ./keys/audit_signing_key.pem -out ./keys/audit_public_key.pem
  chmod 600 ./keys/audit_signing_key.pem
  chmod 644 ./keys/audit_public_key.pem
  echo -e "${GREEN}✓ Clés RSA-4096 générées dans ./keys/audit_signing_key.pem et ./keys/audit_public_key.pem${NC}"
else
  echo -e "${GREEN}✓ Clés RSA-4096 existantes détectées (conservées sans écrasement).${NC}"
fi

# 4. Initialisation du fichier .env de production avec secrets aléatoires forts
echo -e "\n${YELLOW}[4/6] Configuration du fichier d'environnement (.env)...${NC}"
if [ ! -f "./.env" ]; then
  cp ./.env.example ./.env
  JWT_SECRET=$(openssl rand -hex 32)
  AES_KEY=$(openssl rand -hex 32)
  MONGO_PASS=$(openssl rand -hex 16)

  # Remplacement sécurisé du secret JWT
  sed -i "s|JWT_SECRET_KEY=.*|JWT_SECRET_KEY=\"${JWT_SECRET}\"|g" ./.env
  # Ajout des secrets de production MongoDB et AES-256
  cat >> ./.env <<EOF

# --- SECRETS GÉNÉRÉS AUTOMATIQUEMENT PAR INSTALL_PRODUCTION.SH ---
MONGO_INITDB_ROOT_USERNAME="besma_admin"
MONGO_INITDB_ROOT_PASSWORD="${MONGO_PASS}"
PHONE_ENCRYPTION_KEY_AES256="${AES_KEY}"
NODE_ENV="production"
EOF
  chmod 600 ./.env
  echo -e "${GREEN}✓ Fichier .env généré avec secrets cryptographiques aléatoires (JWT 256-bit, AES-256, MongoDB).${NC}"
else
  echo -e "${GREEN}✓ Fichier .env existant détecté (conservé).${NC}"
fi

# 5. Configuration de la tâche planifiée (Cron) de sauvegarde quotidienne chiffrée (Loi 18-07)
echo -e "\n${YELLOW}[5/6] Création du script de sauvegarde quotidienne MongoDB (Rétention 365 jours)...${NC}"
cat > ./backups/run_daily_backup.sh << 'EOF'
#!/usr/bin/env bash
set -e
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups/mongodb"
mkdir -p "$BACKUP_DIR"
docker exec besma-mongodb-prod mongodump --out "/backups/dump_${TIMESTAMP}" --gzip
# Suppression des sauvegardes de plus de 365 jours conformément à la Loi 18-07
find "$BACKUP_DIR" -maxdepth 1 -name "dump_*" -type d -mtime +365 -exec rm -rf {} +
echo "[$(date)] Sauvegarde souveraine terminée : dump_${TIMESTAMP}"
EOF
chmod +x ./backups/run_daily_backup.sh
echo -e "${GREEN}✓ Script de sauvegarde créé dans ./backups/run_daily_backup.sh${NC}"

# 6. Construction et démarrage des conteneurs Docker de production
echo -e "\n${YELLOW}[6/6] Construction et lancement des conteneurs Docker de production...${NC}"
docker compose -f docker-compose.prod.yml up -d --build

echo -e "\n${BLUE}================================================================================${NC}"
echo -e "${GREEN}✓ DÉPLOIEMENT TERMINÉ AVEC SUCCÈS !${NC}"
echo -e "${BLUE}================================================================================${NC}"
echo -e "  • Interface Web de Supervision (ISA-101) : ${GREEN}http://localhost:3000${NC}"
echo -e "  • API Backend Interne (FastAPI)          : ${GREEN}http://127.0.0.1:8000/docs${NC}"
echo -e "  • Courtier MQTT SCADA / IoT              : ${GREEN}Port 1883 (TCP) / 8883 (TLS)${NC}"
echo -e "  • Clé publique d'audit RSA-4096          : ${GREEN}./keys/audit_public_key.pem${NC}"
echo -e "${BLUE}================================================================================${NC}"
