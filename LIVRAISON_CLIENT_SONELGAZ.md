# DOSSIER OFFICIEL DE LIVRAISON, D'EXPLOITATION ET DE RECETTE CLIENT
## Projet : **BesmaInfoEnergy** — Agent IA Autonome d'Optimisation & Supervision Énergétique (Électricité & Gaz)
**Destinataire :** Direction Technique & Réseaux (SONELGAZ / Opérateur National d'Infrastructure Critique)  
**Conformité Réglementaire :** Loi Algérienne n° 18-07 relative à la protection des personnes physiques dans le traitement des données à caractère personnel  
**Norme Ergonomique de Supervision :** ISA-101 (High-Performance HMI / Mode Sombre `#121212` certifié WCAG AA)

---

## TABLE DES MATIÈRES
1. [Contenu du Pack de Livraison Officiel](#1-contenu-du-pack-de-livraison-officiel)
2. [Phase 1 : Préparation de l'Environnement Serveur Souverain](#2-phase-1--préparation-de-lenvironnement-serveur-souverain)
3. [Phase 2 : Comprendre et Connecter le Terrain (SCADA, RTU, Capteurs & MQTT) avec Schémas](#3-phase-2--comprendre-et-connecter-le-terrain-scada-rtu-capteurs--mqtt-avec-schémas)
4. [Phase 3 : Sécurité Industrielle, Conformité Loi n° 18-07 & Sauvegardes](#4-phase-3--sécurité-industrielle-conformité-loi-n-18-07--sauvegardes)
5. [Procédure d'Installation Clé en Main en 1 Commande](#5-procédure-dinstallation-clé-en-main-en-1-commande)
6. [Procès-Verbal (PV) de Recette Définitive (À signer par le Client)](#6-procès-verbal-pv-de-recette-définitive-à-signer-par-le-client)

---

## 1. Contenu du Pack de Livraison Officiel

Le présent livrable **BesmaInfoEnergy** comprend 4 volets complets et autonomes (sans aucune dépendance obligatoire à un cloud étranger en production) :

1. **Code Source Intégral (Frontend & Backend)** :
   - **Interface de Supervision (`src/`)** : Tableau de bord React 19 + TypeScript + Tailwind CSS + D3.js (Topologie interactive) + Recharts (Analytique 24h & Prédiction 48h), conforme ISA-101 (basculement Clair / Sombre `#121212` / Auto).
   - **Passerelle d'Application (`server.ts`)** : Serveur Express sécurisé gérant les flux temps réel, la simulation interactive et l'interfaçage API.
   - **Moteur IA & Backend (`backend/`)** : API Python 3.11 FastAPI incluant :
     - Détection d'anomalies statistiques par Z-Score (`analytics_24h.py`).
     - Prévision ML de probabilité de panne à 48h par régression logistique & séries temporelles (`failure_forecast.py`).
     - Gestion dynamique des seuils saisonniers par wilaya/zone (`threshold_manager.py`).
     - Alertes temps réel Firebase Cloud Messaging (`firebase_fcm.py`) avec **Fallback SMS Souverain automatique à 60s** vers Ooredoo, Mobilis et Djezzy (`sms_fallback.py`).
     - Journalisation d'audit infalsifiable signée **RSA-4096** avec horodatage cryptographique **RFC 3161** (`audit_exporter.py`).
2. **Pack d'Industrialisation Docker (`Dockerfile`, `infrastructure/Dockerfile.backend`, `docker-compose.prod.yml`)** : Conteneurisation complète incluant MongoDB 7.0 local, le courtier MQTT Eclipse Mosquitto, le backend FastAPI et le serveur Web.
3. **Script d'Installation Automatisée (`install_production.sh`)** : Génère automatiquement les clés RSA-4096, les clés AES-256, le fichier `.env`, les sauvegardes et lance l'infrastructure.
4. **Suite de Tests Automatisés** : Tests unitaires et d'accessibilité WCAG AA (`npm test`) et tests backend Pytest (`pytest`).

---

## 2. Phase 1 : Préparation de l'Environnement Serveur Souverain

### 2.1 Spécifications Matérielles Minimales Recommandées (Serveur Local SONELGAZ)
- **Système d'exploitation** : Ubuntu Server 22.04 LTS ou 24.04 LTS (64-bit) ou Red Hat Enterprise Linux (RHEL 9).
- **Processeur (CPU)** : 8 vCPU minimum (16 vCPU recommandés pour l'inférence ML sur 48h).
- **Mémoire Vive (RAM)** : 16 Go minimum (32 Go recommandés).
- **Stockage** : 250 Go SSD NVMe en RAID-1 (pour les séries temporelles télémétriques et les 365 jours d'archives d'audit Loi 18-07).

### 2.2 Préparation Système (Commandes Administrateur Linux)
```bash
# 1. Mise à jour du système et installation des outils requis
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release openssl git ufw

# 2. Installation officielle de Docker & Docker Compose
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

---

## 3. Phase 2 : Comprendre et Connecter le Terrain (SCADA, RTU, Capteurs & MQTT) avec Schémas

### 3.1 Qu'est-ce que le SCADA et le MQTT ? (Explication Simple)
- **Les Capteurs (Terrain)** : Sur les lignes haute/moyenne tension et les conduites de gaz (Alger, Oran, Constantine, Hassi R'Mel, Skikda), des capteurs mesurent chaque seconde la **tension (kV/V)**, le **courant (A)**, la **température des transformateurs (°C)** et la **pression du gaz (Bar)**.
- **Les Automates RTU (Remote Terminal Unit)** : Ce sont de petits boîtiers industriels situés dans les postes électriques ou stations de compression qui collectent les chiffres des capteurs.
- **Le SCADA (Supervisory Control And Data Acquisition)** : C'est le système informatique central de SONELGAZ qui reçoit ces mesures.
- **Le protocole MQTT** : C'est le "facteur ultra-rapide" qui transporte les mesures des automates RTU vers **BesmaInfoEnergy** en quelques millisecondes.

### 3.2 Schéma d'Architecture Globale (Du Terrain jusqu'à l'Écran Opérateur)

```text
+-----------------------------------------------------------------------------------+
|                        1. TERRAIN PHYSIQUE (RÉSEAU SONELGAZ)                      |
|                                                                                   |
|  [Transformateur Élec Alger]       [Turbine Gaz Hassi R'Mel]     [Poste Oran]     |
|   Tension: 228V | Temp: 74°C        Pression: 68.4 Bar            Charge: 89%     |
+---------------+-----------------------------+--------------------------+----------+
                |                             |                          |
                v                             v                          v
+-----------------------------------------------------------------------------------+
|                 2. AUTOMATES INDUSTRIELS (RTU / Passerelles IoT)                  |
|            Convertissent les signaux électriques en messages JSON MQTT            |
+---------------------------------------------+-------------------------------------+
                                              |
                     Envoi instantané (Protocole MQTT - Port 1883 / 8883)
                                              |
                                              v
+-----------------------------------------------------------------------------------+
|            3. SERVEUR LOCAL SOUVERAIN BESMAINFOENERGY (Datacenter DZ)             |
|                                                                                   |
|   +-------------------------------+       +-----------------------------------+   |
|   | Courtier MQTT (Mosquitto)     | ----> | Moteur IA & FastAPI (Backend)     |   |
|   | Reçoit les mesures 24h/24     |       | - Calcul Z-Score (Anomalies)      |   |
|   +-------------------------------+       | - Prédiction Panne 48h (ML)       |   |
|                                           | - Signature RSA-4096 (Loi 18-07)  |   |
|                                           +-----------------+-----------------+   |
|                                                             |                     |
|                                           +-----------------v-----------------+   |
|                                           | Base MongoDB 7.0 Souveraine       |   |
|                                           | (Numéros chiffrés AES-256)        |   |
|                                           +-----------------------------------+   |
+---------------------------------------------+-------------------------------------+
                                              |
         +------------------------------------+------------------------------------+
         |                                                                         |
         v (Affichage Temps Réel < 100ms)                                          v (Si Panne Critique > 70%)
+-------------------------------------------------+     +-------------------------------------------------+
| 4. POSTE DE SUPERVISION OPÉRATEUR (ISA-101)     |     | 5. CHAÎNE D'ALERTE & FALLBACK SMS SOUVERAIN     |
| - Mode Sombre #121212 anti-fatigue visuelle     |     | 1) Notification Push FCM immédiate              |
| - Carte Topologique D3.js interactive           |     | 2) Attente d'acquittement opérateur (60 sec)    |
| - Contrôle d'accès par rôle (Admin/Opérateur)   |     | 3) Si non acquitté -> SMS Ooredoo/Mobilis/Djezzy|
+-------------------------------------------------+     +-------------------------------------------------+
```

### 3.3 Format Standard du Message JSON envoyé par un Automate SCADA à BesmaInfoEnergy
Pour brancher n'importe quel automate ou serveur SCADA existant chez le client, l'équipe réseau de SONELGAZ configure simplement l'automate pour publier sur le topic MQTT `sonelgaz/grid/electricity/Zone-Alger-Centre` le message suivant :

```json
{
  "sensor_id": "TRANSFO-ALGER-042",
  "zone": "Zone-Alger-Centre",
  "timestamp": "2026-10-12T14:30:00Z",
  "voltage_v": 214.5,
  "current_a": 485.0,
  "temperature_c": 82.4,
  "gas_pressure_bar": 64.2,
  "load_pct": 91.5
}
```

---

## 4. Phase 3 : Sécurité Industrielle, Conformité Loi n° 18-07 & Sauvegardes

### 4.1 Conformité Stricte à la Loi Algérienne n° 18-07
| Exigence Légale (Loi 18-07) | Implémentation Technique dans BesmaInfoEnergy |
| :--- | :--- |
| **Hébergement National Souverain** | Base de données MongoDB et courtier MQTT déployés 100 % en local (`DATA_SOVEREIGNTY_MODE=LOCAL_DZ_STRICT`). |
| **Chiffrement des Données Personnelles** | Les numéros de téléphone des opérateurs d'astreinte sont chiffrés en **AES-256** en base de données. |
| **Zéro PII dans les SMS Critiques** | Les SMS envoyés via Ooredoo/Mobilis/Djezzy contiennent uniquement le code de zone, la probabilité et le lien d'acquittement (aucun nom/prénom). |
| **Pseudonymisation des Logs** | Les adresses IP et identifiants opérateurs dans l'historique SMS et les journaux d'audit sont hachés (SHA-256). |
| **Non-Répudiation & Valeur Probante** | Tous les exports d'audit PDF/CSV sont signés par clé privée **RSA-4096** et horodatés selon la norme **RFC 3161**. |
| **Durée de Conservation Légale** | Purge et rotation automatique à **365 jours** (`AUDIT_LOG_RETENTION_DAYS=365`). |

### 4.2 Pare-feu Serveur (UFW)
Seuls les ports indispensables sont ouverts sur le réseau interne de l'entreprise :
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # Administration SSH sécurisée
sudo ufw allow 3000/tcp   # Interface Web de Supervision BesmaInfoEnergy
sudo ufw allow 8883/tcp   # Flux MQTT chiffré TLS pour les automates SCADA
sudo ufw enable
```

---

## 5. Procédure d'Installation Clé en Main en 1 Commande

Lors de la livraison sur le serveur du client, exécutez simplement :

```bash
chmod +x install_production.sh
./install_production.sh
```

Ce script effectue automatiquement :
1. La vérification de Docker et d'OpenSSL.
2. La création des dossiers sécurisés `./keys`, `./models` et `./backups/mongodb`.
3. La génération de la paire de clés cryptographiques **RSA-4096** (`audit_signing_key.pem` et `audit_public_key.pem`).
4. La génération automatique du fichier `.env` avec des clés secrètes aléatoires (JWT 256 bits, AES-256).
5. La création du script de sauvegarde quotidienne MongoDB (`./backups/run_daily_backup.sh`).
6. La compilation et le lancement des 4 conteneurs de production via `docker-compose.prod.yml`.

### 5.2 Scripts d'Exploitation, de Simulation Terrain et de Recette (`scripts/`)
Trois utilitaires prêts à l'emploi sont fournis dans le dossier `scripts/` pour faciliter vos démonstrations devant le client et le maintien en condition opérationnelle (MCO) :

1. **Diagnostic de Santé & Conformité (`scripts/healthcheck_production.sh`)** :
   ```bash
   bash scripts/healthcheck_production.sh
   ```
   Vérifie en 5 étapes la présence de tous les livrables, des clés RSA-4096, la disponibilité HTTP de la passerelle, l'auto-test cryptographique Loi 18-07 et la génération des trames SCADA.

2. **Simulateur d'Automates SCADA / RTU (`scripts/scada_rtu_simulator.py`)** :
   ```bash
   # Générer une salve de vérification sur les 5 zones (Alger, Oran, Hassi R'Mel, Constantine, Skikda)
   python3 scripts/scada_rtu_simulator.py --mode single

   # Simuler un flux continu temps réel toutes les 5 secondes
   python3 scripts/scada_rtu_simulator.py --mode demo --interval 5

   # Simuler une anomalie critique sur Alger pour démontrer l'alerte et le Fallback SMS 60s
   python3 scripts/scada_rtu_simulator.py --mode critical-test --zone "Zone-Alger-Centre"
   ```

3. **Vérificateur Cryptographique Indépendant Loi n° 18-07 (`scripts/verify_audit_signature.py`)** :
   ```bash
   # Auto-test de la chaîne de hachage SHA-256, pseudonymisation et détection anti-falsification
   python3 scripts/verify_audit_signature.py --self-test
   ```

---

## 6. Procès-Verbal (PV) de Recette Définitive (À signer par le Client)

| N° | Module / Exigence Fonctionnelle & Réglementaire | Critère de Validation | Statut |
| :-: | :--- | :--- | :-: |
| **01** | **Supervision Temps Réel & Ergonomie ISA-101** | Mode Clair / Mode Sombre `#121212` (sans noir pur `#000000`) / Mode Auto, contraste WCAG AA validé, alertes critiques `#FF3B30`. | [ ] Validé |
| **02** | **Contrôle d'Accès par Rôle (RBAC)** | Basculement et filtrage des droits entre **Administrateur**, **Opérateur** et **Lecteur**. | [ ] Validé |
| **03** | **Analytique 24h & Détection Z-Score** | Graphiques Recharts 24h, détection automatique des pics anormaux ($|Z| > 3.0$) et topologie réseau D3.js interactive. | [ ] Validé |
| **04** | **Prédiction IA de Panne à 48h** | Calcul des probabilités de défaillance par zone à +12h, +24h, +36h et +48h avec planification d'interventions préventives. | [ ] Validé |
| **05** | **Seuils Dynamiques & Saisonniers** | Modification des seuils d'alerte (Été / Hiver / Toutes saisons) par zone géographique avec simulateur d'impact. | [ ] Validé |
| **06** | **Fallback SMS Souverain (Ooredoo / Mobilis / Djezzy)** | Escalade automatique par SMS après 60s sans acquittement FCM, test passerelle fonctionnel et suivi des coûts en DZD. | [ ] Validé |
| **07** | **Audit Signé RSA-4096 & Conformité Loi 18-07** | Export CSV/PDF signé cryptographiquement (RSA-4096 + RFC 3161) et anonymisation des données personnelles. | [ ] Validé |

**Fait à :** ____________________________, **le :** ____ / ____ / 2026

**Pour l'Éditeur / Intégrateur (BesmaInfoEnergy) :**  
Nom, Qualité, Signature & Cachet :  
  
  
**Pour le Client (SONELGAZ / Direction Technique) :**  
Mention *"Bon pour réception définitive et mise en exploitation"*  
Nom, Qualité, Signature & Cachet :
