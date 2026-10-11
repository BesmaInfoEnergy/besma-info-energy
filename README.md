# BesmaInfoEnergy — Agent IA Autonome d'Optimisation Électricité & Gaz

**BesmaInfoEnergy** est une plateforme industrielle de supervision, de prédiction de pannes par apprentissage automatique et de régulation autonome SCADA conçue pour réduire les pertes techniques et non techniques (estimées entre 15 % et 20 %) sur le réseau électrique et gazier national algérien.

---

## 1. Conformité Réglementaire & Loi Algérienne n° 18-07

- **Souveraineté des données** : En production, l'intégralité des séries temporelles, journaux SCADA et profils de consommation est hébergée sur des serveurs nationaux sécurisés (centres de données SONELGAZ).
- **Pseudonymisation à la source** : Conformément à la **Loi n° 18-07 du 10 juin 2018** relative à la protection des personnes physiques dans le traitement des données à caractère personnel, aucun nom ou identifiant client en clair n'est transmis aux modèles IA. Tous les identifiants de compteurs sont hachés via `SHA-256` avec sel cryptographique dès le module d'ingestion (`DZ1807-<hash>`).
- **Zéro secret en dur** : Toutes les clés API (`GEMINI_API_KEY`), secrets JWT (`JWT_SECRET_KEY`) et chaînes de connexion (`MONGODB_URI`) sont injectés par variables d'environnement (`.env`).

---

## 2. Architecture des 7 Modules Générés

1. **Module d'ingestion de données (`backend/ingestion.py` & `server.ts`)** : Collecte asynchrone en temps réel des capteurs Électricité (tension kV, courant A, puissance MW, fréquence Hz) et Gaz (pression bar, débit m³/h) via MQTT et Apache Kafka.
2. **Module d'analyse et de prédiction (`backend/ml_predictor.py`)** : Classification binaire des pannes (`PANNE_IMMINENTE` / `PAS_DE_PANNE`) et diagnostic contextuel déterministe via **Gemini API** (`température = 0.2`).
3. **Module d'action autonome (`backend/scada_actions.py`)** : Déclenchement automatique d'ordres SCADA (`IEC-61850 MMS` pour le reroutage électrique, `Modbus-TCP` pour la régulation de pression gazière).
4. **Module de détection de fraude (`backend/fraud_detection.py`)** : Analyse comportementale des écarts entre puissance/débit déclaré et charge mesurée sur départ pour localiser les pertes non techniques.
5. **API REST & WebSocket (`backend/main.py` & `server.ts`)** : Endpoints sécurisés pour l'état du réseau, l'historique SCADA, l'ingestion et l'analyse Gemini.
6. **Tableau de bord React + TypeScript + Tailwind CSS (`src/App.tsx`)** : Interface de supervision unifiée avec synoptique national, courbes temps réel, journal SCADA, inspection des fraudes et explorateur du code source.
7. **Système d'authentification JWT & RBAC (`backend/auth.py`)** : Contrôle d'accès strict selon 3 rôles (`admin`, `operateur`, `lecteur`).

---

## 3. Démarrage Rapide

### Lancement avec Docker Compose (Production / Démo locale)
```bash
cp .env.example .env
docker-compose -f infrastructure/docker-compose.yml up --build
```

### Exécution des Tests Unitaires Python (Couverture > 80%)
```bash
pip install -r requirements.txt
pytest --cov=backend backend/tests/
```

### Lancement de l'Interface Full-Stack Interactive
```bash
npm install
npm run dev
```
