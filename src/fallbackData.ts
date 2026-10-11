import {
  GridOverviewResponse,
  GridNode,
  IngestionPacket,
  ScadaActionLog,
  FraudAnomalyCase,
  UserAccount,
  Role,
  SourceFileItem,
} from './types';

export const USERS_FALLBACK: Record<Role, UserAccount> = {
  admin: {
    id: 'USR-DZ-001',
    username: 'admin',
    fullName: 'Dr. Besma Benali (Architecte Réseau National)',
    role: 'admin',
    wilayaScope: 'National (58 Wilayas)',
    department: 'Direction Centrale SCADA & IA - Alger',
  },
  operateur: {
    id: 'USR-DZ-002',
    username: 'operateur',
    fullName: 'Karim Mansouri (Ingénieur Dispatching)',
    role: 'operateur',
    wilayaScope: 'Région Centre & Est',
    department: 'Centre National de Conduite (CNC)',
  },
  lecteur: {
    id: 'USR-DZ-003',
    username: 'lecteur',
    fullName: 'Amina Khelifi (Auditrice Conformité Loi 18-07)',
    role: 'lecteur',
    wilayaScope: 'Lecture Seule - Audit National',
    department: 'Inspection Générale & Régulation',
  },
};

export const INITIAL_GRID_NODES: GridNode[] = [
  {
    id: 'DZ-ELEC-ALG-01',
    name: 'Poste HTB/MT El Hamma 220kV',
    wilaya: 'Alger (16)',
    region: 'Nord-Centre',
    type: 'ELECTRICITY',
    protocol: 'MQTT',
    topic: 'sonelgaz/grid/electricity/alger/elhamma01',
    coordinates: { x: 48, y: 16, lat: 36.7525, lng: 3.042 },
    status: 'WARNING',
    voltageKv: 211.4,
    nominalVoltageKv: 220.0,
    currentAmp: 1420,
    activePowerMw: 485.2,
    frequencyHz: 49.94,
    transformerTempC: 78.5,
    technicalLossPct: 4.8,
    nonTechnicalLossPct: 11.4,
    failureProbability: 0.68,
    mlClassification: 'RISQUE_SURCHARGE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-GAS-HRM-01',
    name: 'Station Compression SC-1 Hassi R’Mel',
    wilaya: 'Laghouat (03)',
    region: 'Sud-Hassi',
    type: 'GAS',
    protocol: 'KAFKA',
    topic: 'sonelgaz.grid.gas.hassirmel.sc1',
    coordinates: { x: 46, y: 46, lat: 32.929, lng: 3.268 },
    status: 'NOMINAL',
    pressureBar: 71.2,
    nominalPressureBar: 70.0,
    flowRateM3h: 148500,
    gasTempC: 34.2,
    compressorRatio: 1.42,
    technicalLossPct: 2.1,
    nonTechnicalLossPct: 1.8,
    failureProbability: 0.09,
    mlClassification: 'PAS_DE_PANNE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-ELEC-ORN-02',
    name: 'Poste Interconnexion Es Senia 400kV',
    wilaya: 'Oran (31)',
    region: 'Ouest',
    type: 'ELECTRICITY',
    protocol: 'MQTT',
    topic: 'sonelgaz/grid/electricity/oran/essenia02',
    coordinates: { x: 22, y: 24, lat: 35.697, lng: -0.63 },
    status: 'CRITICAL',
    voltageKv: 374.5,
    nominalVoltageKv: 400.0,
    currentAmp: 1890,
    activePowerMw: 642.0,
    frequencyHz: 49.82,
    transformerTempC: 91.2,
    technicalLossPct: 6.4,
    nonTechnicalLossPct: 13.8,
    failureProbability: 0.89,
    mlClassification: 'PANNE_IMMINENTE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-GAS-SKD-01',
    name: 'Terminal Gazoduc GK1/GK2 Skikda',
    wilaya: 'Skikda (21)',
    region: 'Est',
    type: 'GAS',
    protocol: 'KAFKA',
    topic: 'sonelgaz.grid.gas.skikda.gk1',
    coordinates: { x: 74, y: 15, lat: 36.876, lng: 6.909 },
    status: 'WARNING',
    pressureBar: 62.4,
    nominalPressureBar: 68.0,
    flowRateM3h: 112400,
    gasTempC: 29.8,
    compressorRatio: 1.56,
    technicalLossPct: 3.9,
    nonTechnicalLossPct: 9.7,
    failureProbability: 0.61,
    mlClassification: 'RISQUE_SURCHARGE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-ELEC-CST-01',
    name: 'Poste Répartition El Khroub 220kV',
    wilaya: 'Constantine (25)',
    region: 'Est',
    type: 'ELECTRICITY',
    protocol: 'MQTT',
    topic: 'sonelgaz/grid/electricity/constantine/khroub01',
    coordinates: { x: 70, y: 21, lat: 36.365, lng: 6.614 },
    status: 'NOMINAL',
    voltageKv: 219.1,
    nominalVoltageKv: 220.0,
    currentAmp: 940,
    activePowerMw: 312.5,
    frequencyHz: 50.01,
    transformerTempC: 61.0,
    technicalLossPct: 3.4,
    nonTechnicalLossPct: 6.2,
    failureProbability: 0.14,
    mlClassification: 'PAS_DE_PANNE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-GAS-ARZ-02',
    name: 'Noeud Distribution Gazier Arzew GP1Z',
    wilaya: 'Oran - Arzew (31)',
    region: 'Ouest',
    type: 'GAS',
    protocol: 'KAFKA',
    topic: 'sonelgaz.grid.gas.arzew.gp1z',
    coordinates: { x: 26, y: 21, lat: 35.852, lng: -0.318 },
    status: 'NOMINAL',
    pressureBar: 67.8,
    nominalPressureBar: 68.0,
    flowRateM3h: 134900,
    gasTempC: 31.0,
    compressorRatio: 1.38,
    technicalLossPct: 2.5,
    nonTechnicalLossPct: 4.1,
    failureProbability: 0.12,
    mlClassification: 'PAS_DE_PANNE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-ELEC-STF-01',
    name: 'Centrale Cycle Combiné Ain Arnat',
    wilaya: 'Sétif (19)',
    region: 'Est',
    type: 'ELECTRICITY',
    protocol: 'MQTT',
    topic: 'sonelgaz/grid/electricity/setif/ainarnat01',
    coordinates: { x: 61, y: 22, lat: 36.189, lng: 5.41 },
    status: 'NOMINAL',
    voltageKv: 220.8,
    nominalVoltageKv: 220.0,
    currentAmp: 1110,
    activePowerMw: 398.4,
    frequencyHz: 50.0,
    transformerTempC: 64.3,
    technicalLossPct: 3.1,
    nonTechnicalLossPct: 5.8,
    failureProbability: 0.11,
    mlClassification: 'PAS_DE_PANNE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
  {
    id: 'DZ-ELEC-OUR-01',
    name: 'Poste Sud Hassi Messaoud Nord 220kV',
    wilaya: 'Ouargla (30)',
    region: 'Sud-Hassi',
    type: 'ELECTRICITY',
    protocol: 'MQTT',
    topic: 'sonelgaz/grid/electricity/ouargla/hmd01',
    coordinates: { x: 62, y: 56, lat: 31.68, lng: 6.072 },
    status: 'NOMINAL',
    voltageKv: 218.2,
    nominalVoltageKv: 220.0,
    currentAmp: 870,
    activePowerMw: 278.0,
    frequencyHz: 49.98,
    transformerTempC: 69.5,
    technicalLossPct: 4.1,
    nonTechnicalLossPct: 3.2,
    failureProbability: 0.19,
    mlClassification: 'PAS_DE_PANNE',
    lastUpdated: new Date().toISOString(),
    scadaMode: 'AUTO',
  },
];

export const INITIAL_SCADA_LOGS: ScadaActionLog[] = [
  {
    id: 'SCADA-ACT-9041',
    timestamp: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    nodeId: 'DZ-ELEC-ORN-02',
    nodeName: 'Poste Interconnexion Es Senia 400kV',
    wilaya: 'Oran (31)',
    triggerType: 'AUTONOMOUS_AI',
    actionType: 'REROUTAGE_FLUX',
    commandSent: 'IEC-61850 MMS: TRANSFER_LOAD_110MW -> BUSBAR_B_ARZEW',
    previousState: 'Charge 96.4% (374.5 kV / 91.2°C)',
    newState: 'Délestage partiel vers Poste Arzew (Charge cible 78%)',
    estimatedLossReductionPct: 3.4,
    operatorUsername: 'Besma-Autonomous-Core',
    status: 'EXECUTED',
  },
  {
    id: 'SCADA-ACT-9040',
    timestamp: new Date(Date.now() - 1000 * 60 * 32).toISOString(),
    nodeId: 'DZ-GAS-SKD-01',
    nodeName: 'Terminal Gazoduc GK1/GK2 Skikda',
    wilaya: 'Skikda (21)',
    triggerType: 'ML_PROTECTION_RULE',
    actionType: 'REGULATION_PRESSION',
    commandSent: 'MODBUS-TCP: VALVE_REG_GK1 SET_PRESSURE=66.5_BAR',
    previousState: 'Chute pression 62.4 bar (Fuite/Tirage anormal)',
    newState: 'Stabilisation vanne principale +4.1 bar',
    estimatedLossReductionPct: 2.1,
    operatorUsername: 'Besma-Autonomous-Core',
    status: 'VERIFIED',
  },
  {
    id: 'SCADA-ACT-9039',
    timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    nodeId: 'DZ-ELEC-ALG-01',
    nodeName: 'Poste HTB/MT El Hamma 220kV',
    wilaya: 'Alger (16)',
    triggerType: 'OPERATOR_MANUAL',
    actionType: 'INSPECTION_FRAUDE',
    commandSent: 'AMI-SMARTGRID: ISOLATE_FEEDER_MT_14_ROUIBA',
    previousState: 'Perte non technique détectée : 11.4%',
    newState: 'Brigade télémétrie envoyée & équilibrage de phase actif',
    estimatedLossReductionPct: 4.2,
    operatorUsername: 'operateur',
    status: 'VERIFIED',
  },
];

export const INITIAL_FRAUD_CASES: FraudAnomalyCase[] = [
  {
    id: 'FRD-DZ-2026-101',
    detectedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
    wilaya: 'Oran (31)',
    commune: 'Zone Industrielle Es Senia Sud',
    sectorType: 'Industriel',
    nodeId: 'DZ-ELEC-ORN-02',
    anonymizedSubscriberId: 'SHA256:9f84b2c1e7a0482d',
    energyType: 'ELECTRICITY',
    declaredLoadKwOrM3: 450,
    measuredLoadKwOrM3: 1180,
    unaccountedDeltaPct: 61.8,
    anomalyConfidenceScore: 0.96,
    behavioralPattern:
      'Consommation nocturne constante (00h-05h) incompatible avec profil déclaré + facteur de puissance asymétrique',
    status: 'DETECTED',
    estimatedMonthlyLossDzd: 4850000,
  },
  {
    id: 'FRD-DZ-2026-102',
    detectedAt: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    wilaya: 'Alger (16)',
    commune: 'Dar El Beïda / Zone Activités',
    sectorType: 'Commercial',
    nodeId: 'DZ-ELEC-ALG-01',
    anonymizedSubscriberId: 'SHA256:3c71e804a1b953f2',
    energyType: 'ELECTRICITY',
    declaredLoadKwOrM3: 120,
    measuredLoadKwOrM3: 315,
    unaccountedDeltaPct: 61.9,
    anomalyConfidenceScore: 0.93,
    behavioralPattern:
      'Chute d’impédance sur départ MT n°4 et contournement partiel du transformateur de comptage',
    status: 'INSPECTION_DISPATCHED',
    estimatedMonthlyLossDzd: 1620000,
  },
  {
    id: 'FRD-DZ-2026-103',
    detectedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    wilaya: 'Skikda (21)',
    commune: 'Périphérie Industrielle Hamadi Krouma',
    sectorType: 'Industriel',
    nodeId: 'DZ-GAS-SKD-01',
    anonymizedSubscriberId: 'SHA256:7a12f09c44d8e110',
    energyType: 'GAS',
    declaredLoadKwOrM3: 2400,
    measuredLoadKwOrM3: 4950,
    unaccountedDeltaPct: 51.5,
    anomalyConfidenceScore: 0.91,
    behavioralPattern:
      'Dépressurisation localisée de 1.8 bar sans corrélation avec les vannes de facturation aval',
    status: 'DETECTED',
    estimatedMonthlyLossDzd: 3290000,
  },
  {
    id: 'FRD-DZ-2026-104',
    detectedAt: new Date(Date.now() - 1000 * 60 * 320).toISOString(),
    wilaya: 'Sétif (19)',
    commune: 'El Eulma - Zone Entrepôts',
    sectorType: 'Commercial',
    nodeId: 'DZ-ELEC-STF-01',
    anonymizedSubscriberId: 'SHA256:5d90a32e18f7c401',
    energyType: 'ELECTRICITY',
    declaredLoadKwOrM3: 85,
    measuredLoadKwOrM3: 210,
    unaccountedDeltaPct: 59.5,
    anomalyConfidenceScore: 0.88,
    behavioralPattern:
      'Signature harmonique de groupes frigorifiques non déclarés sur phase L2/L3',
    status: 'RESOLVED_CONFIRMED',
    estimatedMonthlyLossDzd: 940000,
  },
];

export function buildPacketsFromNodes(nodes: GridNode[]): IngestionPacket[] {
  return nodes.map((node, index) => ({
    packetId: `PKT-${Date.now().toString(36).toUpperCase()}-${100 + index}`,
    timestamp: new Date().toISOString(),
    nodeId: node.id,
    nodeName: node.name,
    wilaya: node.wilaya,
    protocol: node.protocol,
    topic: node.topic,
    energyType: node.type,
    metrics: {
      voltageKv: node.voltageKv,
      currentAmp: node.currentAmp,
      powerMw: node.activePowerMw,
      pressureBar: node.pressureBar,
      flowRateM3h: node.flowRateM3h,
      temperatureC:
        node.type === 'ELECTRICITY'
          ? node.transformerTempC || 65
          : node.gasTempC || 30,
    },
    lossRatePct: Number((node.technicalLossPct + node.nonTechnicalLossPct).toFixed(1)),
    anonymizedMeterHash: `DZ1807-${node.id.replace(/[^A-Z0-9]/g, '').toLowerCase()}9a2f`,
    validatedSchema: true,
    latencyMs: 9 + (index % 6),
  }));
}

export function createFallbackOverview(
  nodes: GridNode[] = INITIAL_GRID_NODES,
  scadaLogs: ScadaActionLog[] = INITIAL_SCADA_LOGS,
  fraudCases: FraudAnomalyCase[] = INITIAL_FRAUD_CASES,
  packets?: IngestionPacket[]
): GridOverviewResponse {
  const totalLossSum = nodes.reduce(
    (acc, n) => acc + n.technicalLossPct + n.nonTechnicalLossPct,
    0
  );
  const avgTotalLossPct = Number((totalLossSum / nodes.length).toFixed(2));
  const avgNonTechLossPct = Number(
    (nodes.reduce((acc, n) => acc + n.nonTechnicalLossPct, 0) / nodes.length).toFixed(2)
  );
  const criticalCount = nodes.filter((n) => n.status === 'CRITICAL').length;
  const warningCount = nodes.filter((n) => n.status === 'WARNING').length;

  return {
    timestamp: new Date().toISOString(),
    complianceStatus: {
      law: 'Loi n° 18-07 du 10 juin 2018 (Protection des personnes physiques dans le traitement des données)',
      hostingMode: 'LOCAL_DZ_SONELGAZ_DATACENTER',
      piiAnonymization: 'SHA-256 Strict Actif',
    },
    kpis: {
      nationalLossRatePct: avgTotalLossPct,
      baselineHistoricalLossPct: 18.4,
      nonTechnicalFraudLossPct: avgNonTechLossPct,
      activeSensorsCount: 4820,
      criticalNodesCount: criticalCount,
      warningNodesCount: warningCount,
      autonomousActions24h: scadaLogs.length,
      estimatedSavingsMwh: 14280,
    },
    nodes,
    recentIngestion: packets || buildPacketsFromNodes(nodes),
    scadaLogs,
    fraudCases,
  };
}

export const FALLBACK_SOURCE_FILES: SourceFileItem[] = [
  {
    path: 'backend/ingestion.py',
    category: '1. Ingestion MQTT/Kafka',
    description: 'Collecteur asynchrone temps réel Électricité & Gaz (MQTT/Kafka) conforme Loi 18-07',
    content: `"""
Module 1 : Ingestion de données en temps réel (BesmaInfoEnergy)
Collecte asynchrone des capteurs Électricité (tension, courant, puissance)
et Gaz (pression, débit) via MQTT ou Apache Kafka.
Conforme à la Loi algérienne n° 18-07 (anonymisation SHA-256 à la source).
"""
import asyncio, hashlib, json, os
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class EnergyType(str, Enum):
    ELECTRICITY = "ELECTRICITY"
    GAS = "GAS"

class SensorTelemetryPayload(BaseModel):
    sensor_id: str = Field(..., min_length=4, max_length=64)
    wilaya_code: str = Field(..., min_length=2, max_length=32)
    energy_type: EnergyType
    voltage_kv: Optional[float] = None
    current_amp: Optional[float] = None
    active_power_mw: Optional[float] = None
    pressure_bar: Optional[float] = None
    flow_rate_m3h: Optional[float] = None
    temperature_c: float

    def anonymize_subscriber_id(self) -> str:
        salt = os.getenv("PII_HASH_SALT", "SONELGAZ_DZ_1807_SALT")
        digest = hashlib.sha256(f"{salt}:{self.sensor_id}".encode()).hexdigest()[:16]
        return f"DZ1807-{digest}"
`,
  },
  {
    path: 'backend/ml_predictor.py',
    category: '2. Analyse & Prédiction ML',
    description: 'Classification binaire des pannes & intégration Gemini API (Température 0.2)',
    content: `"""
Module 2 : Analyse contextuelle (Gemini API) et Prédiction des pannes (ML)
"""
import math, os, json
from typing import Any, Dict
from google import genai
from google.genai import types

class FailurePredictionModel:
    def __init__(self, threshold: float = 0.65) -> None:
        self.threshold = threshold

    def predict_failure(self, telemetry: Dict[str, Any]) -> Dict[str, Any]:
        metrics = telemetry.get("metrics", {})
        temp_c = float(metrics.get("temperature_c") or 60.0)
        loss_pct = float(telemetry.get("loss_rate_pct") or 5.0)
        log_odds = -2.5 + max(0.0, (temp_c - 65.0) * 0.12) + max(0.0, (loss_pct - 10.0) * 0.18)
        prob = round(1.0 / (1.0 + math.exp(-log_odds)), 4)
        binary = 1 if prob >= self.threshold else 0
        return {
            "failure_probability": prob,
            "binary_classification": binary,
            "label": "PANNE_IMMINENTE" if binary == 1 else "PAS_DE_PANNE",
        }
`,
  },
  {
    path: 'backend/scada_actions.py',
    category: '3. Action Autonome SCADA',
    description: 'Moteur de règles métier et commandes automatiques SCADA (IEC-61850 / Modbus-TCP)',
    content: `"""
Module 3 : Action Autonome SCADA (BesmaInfoEnergy)
"""
from datetime import datetime, timezone
from typing import Any, Dict, List

class AutonomousScadaEngine:
    def evaluate_and_act(self, telemetry: Dict[str, Any], ml_prediction: Dict[str, Any]) -> Dict[str, Any]:
        prob = float(ml_prediction.get("failure_probability", 0.0))
        sensor_id = telemetry.get("sensor_id", "UNKNOWN")
        commands: List[str] = []
        if prob >= 0.65:
            commands.append(f"IEC-61850 MMS: TRANSFER_LOAD_30PCT FROM {sensor_id} TO BUSBAR_SECOURS")
        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "sensor_id": sensor_id,
            "triggered": len(commands) > 0,
            "scada_commands": commands,
        }
`,
  },
];

export const ZONES_TOPOLOGY_DEFAULTS: Record<string, {
  zone: string;
  node_id: string;
  wilaya: string;
  energy_type: 'ELECTRICITY' | 'GAS';
  voltage: number;
  power: number;
  transformer_temp: number;
  gas_pressure: number;
  coordinates: { lat: number; lng: number; x: number; y: number };
  last_alert: string;
  last_scada_action: string;
}> = {
  Alger: {
    zone: 'Alger',
    node_id: 'DZ-ELEC-ALG-01',
    wilaya: 'Alger (16)',
    energy_type: 'ELECTRICITY',
    voltage: 218.5,
    power: 425.0,
    transformer_temp: 71.0,
    gas_pressure: 66.8,
    coordinates: { lat: 36.7538, lng: 3.0588, x: 495, y: 95 },
    last_alert: 'Pointe résidentielle soirée (+8% charge nominale)',
    last_scada_action: 'Équilibrage automatique jeu de barres 220kV El Harrach',
  },
  Oran: {
    zone: 'Oran',
    node_id: 'DZ-ELEC-ORN-02',
    wilaya: 'Oran (31)',
    energy_type: 'ELECTRICITY',
    voltage: 351.0,
    power: 612.0,
    transformer_temp: 91.5,
    gas_pressure: 63.2,
    coordinates: { lat: 35.6971, lng: -0.6308, x: 225, y: 145 },
    last_alert: 'Surcharge critique Poste 400kV Es Senia & échauffement transfo (91.5°C)',
    last_scada_action: 'IEC-61850 MMS: TRANSFER_LOAD_25PCT -> BUSBAR_SECOURS_ORN02',
  },
  "Hassi R'Mel": {
    zone: "Hassi R'Mel",
    node_id: 'DZ-GAS-HRM-01',
    wilaya: 'Laghouat (03)',
    energy_type: 'GAS',
    voltage: 221.0,
    power: 310.0,
    transformer_temp: 66.0,
    gas_pressure: 70.2,
    coordinates: { lat: 32.9294, lng: 3.2711, x: 465, y: 305 },
    last_alert: 'Aucune alerte — Pression nominale hub national',
    last_scada_action: 'Maintien consigne turbocompresseur SC-01 (70.2 bar)',
  },
  Skikda: {
    zone: 'Skikda',
    node_id: 'DZ-GAS-SKI-02',
    wilaya: 'Skikda (21)',
    energy_type: 'GAS',
    voltage: 214.0,
    power: 465.0,
    transformer_temp: 77.5,
    gas_pressure: 59.2,
    coordinates: { lat: 36.8764, lng: 6.9092, x: 705, y: 90 },
    last_alert: 'Chute de pression Gazoduc GK1 (59.2 bar < 60 bar)',
    last_scada_action: 'MODBUS-TCP: BOOST_COMPRESSOR_RATIO=1.67 ON SKIKDA_GK1',
  },
  Constantine: {
    zone: 'Constantine',
    node_id: 'DZ-ELEC-CST-03',
    wilaya: 'Constantine (25)',
    energy_type: 'ELECTRICITY',
    voltage: 206.5,
    power: 505.0,
    transformer_temp: 78.2,
    gas_pressure: 65.4,
    coordinates: { lat: 36.365, lng: 6.6147, x: 675, y: 135 },
    last_alert: 'Appel de charge industriel El Khroub (Tension 206.5 kV)',
    last_scada_action: 'Compensation réactive banc condensateurs +45 MVAR',
  },
  Arzew: {
    zone: 'Arzew',
    node_id: 'DZ-GAS-ARZ-03',
    wilaya: 'Oran / Arzew (31)',
    energy_type: 'GAS',
    voltage: 219.0,
    power: 380.0,
    transformer_temp: 69.5,
    gas_pressure: 67.5,
    coordinates: { lat: 35.8505, lng: -0.318, x: 270, y: 125 },
    last_alert: 'Flux GNL nominal sur complexe GP1Z/GP2Z',
    last_scada_action: "Régulation nominale vannes d'admission GNL",
  },
  Sétif: {
    zone: 'Sétif',
    node_id: 'DZ-ELEC-SET-04',
    wilaya: 'Sétif (19)',
    energy_type: 'ELECTRICITY',
    voltage: 207.8,
    power: 492.0,
    transformer_temp: 76.4,
    gas_pressure: 64.8,
    coordinates: { lat: 36.1898, lng: 5.4108, x: 595, y: 140 },
    last_alert: 'Surveillance thermique transformateur Ain Arnat (76.4°C)',
    last_scada_action: 'Activation ventilation forcée aéroréfrigérants',
  },
  Ouargla: {
    zone: 'Ouargla',
    node_id: 'DZ-ELEC-OUR-05',
    wilaya: 'Ouargla (30)',
    energy_type: 'ELECTRICITY',
    voltage: 219.5,
    power: 340.0,
    transformer_temp: 73.0,
    gas_pressure: 68.4,
    coordinates: { lat: 31.9527, lng: 5.3335, x: 605, y: 365 },
    last_alert: 'Fonctionnement nominal Pôle Sud-Est',
    last_scada_action: 'Couplage poste HTB Touggourt-Ouargla',
  },
};

export function buildZonesTopologyStatus() {
  const result: Record<string, any> = {};
  for (const [zName, cfg] of Object.entries(ZONES_TOPOLOGY_DEFAULTS)) {
    let status: 'normal' | 'warning' | 'critical' | 'emergency' = 'normal';
    if (zName === 'Oran') status = 'emergency';
    else if (zName === 'Skikda') status = 'critical';
    else if (zName === 'Constantine' || zName === 'Sétif') status = 'warning';

    const probMap = { normal: 0.11, warning: 0.48, critical: 0.78, emergency: 0.92 };
    result[zName] = {
      zone: zName,
      node_id: cfg.node_id,
      wilaya: cfg.wilaya,
      energy_type: cfg.energy_type,
      status,
      last_alert: cfg.last_alert,
      last_scada_action: cfg.last_scada_action,
      voltage_kv: cfg.voltage,
      power_mw: cfg.power,
      transformer_temp_c: cfg.transformer_temp,
      gas_pressure_bar: cfg.gas_pressure,
      failure_probability: probMap[status],
      coordinates: cfg.coordinates,
    };
  }
  return result;
}

export function buildAnalyticsTrendsAndAnomalies(zone: string = 'Alger') {
  const cleanZone = ZONES_TOPOLOGY_DEFAULTS[zone] ? zone : 'Alger';
  const cfg = ZONES_TOPOLOGY_DEFAULTS[cleanZone];

  const thresholds = {
    voltage: {
      metric: 'voltage',
      warning_threshold: cleanZone === 'Oran' ? 382.0 : 209.0,
      critical_threshold: cleanZone === 'Oran' ? 370.0 : 198.0,
      emergency_threshold: cleanZone === 'Oran' ? 355.0 : 188.0,
      direction: 'below' as const,
      unit: 'kV',
    },
    power: {
      metric: 'power',
      warning_threshold: 480.0,
      critical_threshold: 580.0,
      emergency_threshold: 650.0,
      direction: 'above' as const,
      unit: 'MW',
    },
    transformer_temp: {
      metric: 'transformer_temp',
      warning_threshold: 75.0,
      critical_threshold: 85.0,
      emergency_threshold: 92.0,
      direction: 'above' as const,
      unit: '°C',
    },
    gas_pressure: {
      metric: 'gas_pressure',
      warning_threshold: 64.0,
      critical_threshold: 60.0,
      emergency_threshold: 55.0,
      direction: 'below' as const,
      unit: 'bar',
    },
  };

  const totalBuckets = 96; // Échantillonnage rapide 24h pour un rendu < 2s fluide
  const now = Date.now();
  const aligned_series: any[] = [];
  const anomalies: any[] = [];

  for (let i = 0; i < totalBuckets; i++) {
    const ts = new Date(now - (totalBuckets - i) * 15 * 60 * 1000).toISOString();
    const pct = i / totalBuckets;
    const angle = pct * Math.PI * 2;
    const dailyMod = Math.sin(angle - 1.2) * 0.6 + Math.cos(angle * 2) * 0.4;

    const isSpike1 = pct >= 0.33 && pct <= 0.37;
    const isSpike2 = pct >= 0.66 && pct <= 0.71;
    const isSpike3 = pct >= 0.86 && pct <= 0.90;

    let voltage = Number((cfg.voltage - dailyMod * 4.5).toFixed(2));
    if (isSpike2) voltage = Number((voltage - (cleanZone === 'Oran' ? 25.0 : 19.5)).toFixed(2));

    let power = Number((cfg.power + dailyMod * 40.0).toFixed(1));
    if (isSpike1) power = Number((power + 130.0).toFixed(1));
    if (isSpike2) power = Number((power + 185.0).toFixed(1));

    let transformer_temp = Number((cfg.transformer_temp + dailyMod * 4.0).toFixed(1));
    if (isSpike2) transformer_temp = Number((transformer_temp + 18.5).toFixed(1));
    else if (isSpike3) transformer_temp = Number((transformer_temp + 10.5).toFixed(1));

    let gas_pressure = Number((cfg.gas_pressure - dailyMod * 1.8).toFixed(2));
    if (isSpike1) gas_pressure = Number((gas_pressure - 8.5).toFixed(2));

    const evalSev = (val: number, t: typeof thresholds.voltage) => {
      if (t.direction === 'above') {
        if (val >= t.emergency_threshold) return 'emergency';
        if (val >= t.critical_threshold) return 'critical';
        if (val >= t.warning_threshold) return 'warning';
        return 'normal';
      }
      if (val <= t.emergency_threshold) return 'emergency';
      if (val <= t.critical_threshold) return 'critical';
      if (val <= t.warning_threshold) return 'warning';
      return 'normal';
    };

    const vSev = evalSev(voltage, thresholds.voltage);
    const pSev = evalSev(power, thresholds.power);
    const tSev = evalSev(transformer_temp, thresholds.transformer_temp);
    const gSev = evalSev(gas_pressure, thresholds.gas_pressure);

    const hasAnomaly =
      vSev !== 'normal' || pSev !== 'normal' || tSev !== 'normal' || gSev !== 'normal';

    const rank = { normal: 0, warning: 1, critical: 2, emergency: 3 };
    let maxSev: 'normal' | 'warning' | 'critical' | 'emergency' = 'normal';
    for (const s of [vSev, pSev, tSev, gSev] as const) {
      if (rank[s] > rank[maxSev]) maxSev = s;
    }

    const zScore = isSpike2 ? 3.85 : isSpike1 ? 3.25 : isSpike3 ? 2.65 : 0.75;

    aligned_series.push({
      timestamp: ts,
      timeLabel: ts.slice(11, 16),
      zone: cleanZone,
      hasAnomaly,
      maxSeverity: maxSev,
      voltage,
      voltage_severity: vSev,
      voltage_zscore: zScore,
      power,
      power_severity: pSev,
      power_zscore: zScore,
      transformer_temp,
      transformer_temp_severity: tSev,
      transformer_temp_zscore: zScore,
      gas_pressure,
      gas_pressure_severity: gSev,
      gas_pressure_zscore: zScore,
    });

    if (tSev !== 'normal' || vSev === 'emergency' || gSev === 'critical') {
      const mName =
        tSev !== 'normal'
          ? 'transformer_temp'
          : vSev === 'emergency'
          ? 'voltage'
          : 'gas_pressure';
      const mVal =
        mName === 'transformer_temp'
          ? transformer_temp
          : mName === 'voltage'
          ? voltage
          : gas_pressure;
      const mThr = thresholds[mName];
      const sev = mName === 'transformer_temp' ? tSev : mName === 'voltage' ? vSev : gSev;

      anomalies.push({
        id: `ANOM-${cleanZone.slice(0, 3).toUpperCase()}-${1000 + i}`,
        zone: cleanZone,
        timestamp: ts,
        metric: mName,
        unit: mThr.unit,
        value: mVal,
        threshold_crossed:
          sev === 'emergency'
            ? mThr.emergency_threshold
            : sev === 'critical'
            ? mThr.critical_threshold
            : mThr.warning_threshold,
        z_score: zScore,
        severity: sev,
        classification: sev === 'emergency' ? 'URGENCE' : 'FRANCHISSEMENT_SEUIL',
        scada_action_triggered:
          sev === 'emergency'
            ? `IEC-61850 MMS: DELESTAGE_SELECTIF & REROUTAGE_SECOURS (${cleanZone.toUpperCase()})`
            : `IEC-61850 MMS: REGULATION_TENSION_REGLEUR_EN_CHARGE (${cleanZone.toUpperCase()})`,
        description: `${
          sev === 'emergency' ? 'URGENCE' : 'FRANCHISSEMENT_SEUIL'
        } sur ${mName} (${mVal} ${mThr.unit}, z=${zScore}σ)`,
      });
    }
  }

  return {
    trends: {
      zone: cleanZone,
      hours: 24,
      window_minutes: 5,
      metrics: ['voltage', 'power', 'transformer_temp', 'gas_pressure'],
      aligned_series,
      thresholds,
    },
    anomalies: anomalies.reverse().slice(0, 25),
  };
}

export function classifyRiskLevel(
  probability: number
): 'NORMAL' | 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY' {
  if (probability < 0.3) return 'NORMAL';
  if (probability < 0.5) return 'INFO';
  if (probability < 0.7) return 'WARNING';
  if (probability <= 0.9) return 'CRITICAL';
  return 'EMERGENCY';
}

export const ZONE_FORECAST_PROFILES_TS: Record<
  string,
  {
    display_name: string;
    base_prob: number;
    peak_boost: number;
    peak_hour_offset: number;
    energy_type: 'ELECTRICITY' | 'GAS';
    operator_assigned: string;
  }
> = {
  alger: {
    display_name: 'Alger',
    base_prob: 0.44,
    peak_boost: 0.34, // Peak ~ 0.78 (CRITICAL)
    peak_hour_offset: 19,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Amine Benali (Brigade HTB Alger)',
  },
  oran: {
    display_name: 'Oran',
    base_prob: 0.56,
    peak_boost: 0.37, // Peak ~ 0.93 (EMERGENCY > 0.90)
    peak_hour_offset: 14,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Karim Mansouri (Brigade 400kV Es Senia)',
  },
  "hassi r'mel": {
    display_name: "Hassi R'Mel",
    base_prob: 0.14,
    peak_boost: 0.11, // Peak ~ 0.25 (NORMAL)
    peak_hour_offset: 26,
    energy_type: 'GAS',
    operator_assigned: "Ing. Yacine Touati (Centre Gazier Hassi R'Mel)",
  },
  skikda: {
    display_name: 'Skikda',
    base_prob: 0.48,
    peak_boost: 0.33, // Peak ~ 0.81 (CRITICAL)
    peak_hour_offset: 22,
    energy_type: 'GAS',
    operator_assigned: 'Ing. Sofiane Khelifi (Terminal GNL Skikda GK1)',
  },
  constantine: {
    display_name: 'Constantine',
    base_prob: 0.35,
    peak_boost: 0.27, // Peak ~ 0.62 (WARNING)
    peak_hour_offset: 18,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Nadia Boudiaf (Dispatching Est Constantine)',
  },
  arzew: {
    display_name: 'Arzew',
    base_prob: 0.22,
    peak_boost: 0.19, // Peak ~ 0.41 (INFO)
    peak_hour_offset: 30,
    energy_type: 'GAS',
    operator_assigned: 'Ing. Mourad Brahimi (Pôle GNL Arzew)',
  },
  sétif: {
    display_name: 'Sétif',
    base_prob: 0.33,
    peak_boost: 0.25, // Peak ~ 0.58 (WARNING)
    peak_hour_offset: 20,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Farid Zerrouki (Poste HTB Ain Arnat)',
  },
  setif: {
    display_name: 'Sétif',
    base_prob: 0.33,
    peak_boost: 0.25,
    peak_hour_offset: 20,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Farid Zerrouki (Poste HTB Ain Arnat)',
  },
  ouargla: {
    display_name: 'Ouargla',
    base_prob: 0.18,
    peak_boost: 0.1, // Peak ~ 0.28 (NORMAL)
    peak_hour_offset: 16,
    energy_type: 'ELECTRICITY',
    operator_assigned: 'Ing. Rachid Saidi (Pôle Sud-Est Ouargla)',
  },
};

export function buildForecast48hForZone(zone: string = 'Alger', hours: number = 48) {
  const key = zone.trim().toLowerCase();
  const profile = ZONE_FORECAST_PROFILES_TS[key] || ZONE_FORECAST_PROFILES_TS.alger;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);

  const past_points: any[] = [];
  for (let hPast = -6; hPast <= 0; hPast++) {
    const ts = new Date(now.getTime() + hPast * 3600 * 1000).toISOString();
    const wave = Math.sin(((hPast + 24) / 24) * 2 * Math.PI) * 0.05;
    const pVal = Number(Math.min(0.98, Math.max(0.05, profile.base_prob + wave)).toFixed(2));
    past_points.push({
      timestamp: ts,
      hour_offset: hPast,
      probability: pVal,
      lower_bound: Number(Math.max(0.01, pVal - 0.04).toFixed(2)),
      upper_bound: Number(Math.min(0.99, pVal + 0.04).toFixed(2)),
      risk_level: classifyRiskLevel(pVal),
      is_past: true,
    });
  }

  const points: any[] = [];
  let peak_probability = 0;
  let peak_timestamp = now.toISOString();

  for (let h = 1; h <= hours; h++) {
    const ts = new Date(now.getTime() + h * 3600 * 1000).toISOString();
    const dist = Math.abs(h - profile.peak_hour_offset);
    const gaussianSpike = profile.peak_boost * Math.exp(-Math.pow(dist / 4.5, 2));
    const diurnal = Math.sin((h / 24) * 2 * Math.PI - 1.1) * 0.05;
    const prob = Number(
      Math.min(0.97, Math.max(0.05, profile.base_prob + gaussianSpike + diurnal)).toFixed(2)
    );
    const halfWidth = Number((0.04 + (h / Math.max(1, hours)) * 0.04).toFixed(2));
    const lower_bound = Number(Math.max(0.01, prob - halfWidth).toFixed(2));
    const upper_bound = Number(Math.min(0.99, prob + halfWidth).toFixed(2));
    const risk_level = classifyRiskLevel(prob);

    if (prob > peak_probability) {
      peak_probability = prob;
      peak_timestamp = ts;
    }

    points.push({
      timestamp: ts,
      hour_offset: h,
      probability: prob,
      lower_bound,
      upper_bound,
      risk_level,
      is_past: false,
    });
  }

  const risk_level = classifyRiskLevel(peak_probability);
  const slugHash = `DZ1807-${profile.display_name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6)
    .toUpperCase()}`;

  let recommended_action = "Maintien du programme d'exploitation normal.";
  let preventive_scada_order: string | null = null;

  if (peak_probability > 0.9) {
    recommended_action = `URGENCE PRÉVENTIVE (>90%) : Exécuter le délestage/reroutage préventif SCADA et mobiliser la brigade sur ${profile.display_name}.`;
    preventive_scada_order =
      profile.energy_type === 'ELECTRICITY'
        ? `IEC-61850 MMS: PREVENTIVE_REROUTE_35PCT ZONE=${profile.display_name.toUpperCase()} BEFORE=${peak_timestamp}`
        : `MODBUS-TCP: PREVENTIVE_PRESSURE_RELIEF_VALVE ZONE=${profile.display_name.toUpperCase()} BEFORE=${peak_timestamp}`;
  } else if (peak_probability >= 0.7) {
    recommended_action = 'Planifier une intervention préventive';
  } else if (peak_probability >= 0.5) {
    recommended_action = `Surveillance renforcée du poste ${profile.display_name} et préparation du jeu de barres de secours.`;
  }

  const fcm_alert_sent =
    peak_probability > 0.7
      ? {
          notification_id: `FCM-FCST-${slugHash}-${Math.floor(100 + Math.random() * 899)}`,
          title: `⚠️ Risque de panne élevé dans 48h - Zone ${profile.display_name}`,
          body: `Probabilité : ${Math.round(peak_probability * 100)}% à ${peak_timestamp}. Intervention recommandée.`,
          topics_broadcasted: [`alertes-zone-${slugHash}`, 'alertes-critiques'],
        }
      : null;

  return {
    zone: zone.toLowerCase(),
    generated_at: new Date().toISOString(),
    horizon_hours: hours,
    confidence_level: 0.95,
    model_path: `./models/forecast_${key.replace(/[^a-z0-9]/g, '_')}_failure_prob.pkl`,
    points,
    past_points,
    peak_probability,
    peak_timestamp,
    risk_level,
    recommended_action,
    preventive_scada_order,
    fcm_alert_sent,
  };
}

export function buildDefaultSmsHistory() {
  const now = Date.now();
  return [
    {
      sms_id: 'MOB-DZ-94012A',
      timestamp: new Date(now - 1000 * 60 * 11).toISOString(),
      notification_id: 'FCM-NOTIF-ORN02-TIMEOUT',
      operator_id: 'OP-DZ1807-ORN02',
      zone: 'Oran',
      message_type: 'PANNE_IMMINENTE',
      reason: 'no_acknowledgment' as const,
      provider: 'mobilis' as const,
      status: 'sent' as const,
      cost_dzd: 3.8,
      message:
        '[BESMA] PANNE IMMINENTE - Zone Oran - 93% - Acquitter: https://besma.dz/ack/ORN0293A',
      retention_days: 365,
    },
    {
      sms_id: 'OOR-DZ-88310B',
      timestamp: new Date(now - 1000 * 60 * 42).toISOString(),
      notification_id: 'FCM-NOTIF-ALG01-FAIL',
      operator_id: 'OP-DZ1807-ALG01',
      zone: 'Alger',
      message_type: 'SURCHARGE_CRITIQUE',
      reason: 'system_failure' as const,
      provider: 'ooredoo' as const,
      status: 'sent' as const,
      cost_dzd: 4.0,
      message:
        '[BESMA] SURCHARGE CRITIQUE - Zone Alger - 78% - Acquitter: https://besma.dz/ack/ALG0178B',
      retention_days: 365,
    },
    {
      sms_id: 'DJZ-DZ-77204C',
      timestamp: new Date(now - 1000 * 60 * 95).toISOString(),
      notification_id: 'FCM-NOTIF-SKI04-ESC',
      operator_id: 'OP-DZ1807-SKI04',
      zone: 'Skikda',
      message_type: 'PRESSION_GAZ_BASSE',
      reason: 'operator_request' as const,
      provider: 'djezzy' as const,
      status: 'sent' as const,
      cost_dzd: 4.2,
      message:
        '[BESMA] PRESSION GAZ BASSE - Zone Skikda - 81% - Acquitter: https://besma.dz/ack/SKI0481C',
      retention_days: 365,
    },
    {
      sms_id: 'MOCK-SMS-55109D',
      timestamp: new Date(now - 1000 * 60 * 160).toISOString(),
      notification_id: 'FCM-NOTIF-CST05-TEST',
      operator_id: 'OP-DZ1807-CST05',
      zone: 'Constantine',
      message_type: 'TEST_PASSERELLE',
      reason: 'operator_request' as const,
      provider: 'mock' as const,
      status: 'sent' as const,
      cost_dzd: 0.0,
      message:
        '[BESMA] TEST PASSERELLE - Zone Constantine - 62% - Acquitter: https://besma.dz/ack/CST0562D',
      retention_days: 365,
    },
  ];
}

export function buildDefaultSmsStatus() {
  const history = buildDefaultSmsHistory();
  return {
    active_provider: 'mock' as const,
    configured_provider_env: 'mock',
    remaining_credit_dzd: 48500.0,
    cost_per_sms_dzd: 4.0,
    daily_limit: 500,
    sent_today: history.length,
    fallback_timeout_seconds: 60,
    max_length: 160,
    last_sent: history[0] || null,
    encryption: 'AES-256-GCM (operator_profiles)',
    law_18_07_compliant: true,
  };
}

export function buildDefaultEscalationPolicy() {
  return {
    policy_id: 'ESC-POL-SONELGAZ-01',
    collection: 'escalation_policies',
    sms_timeout_seconds: 60,
    voice_call_timeout_seconds: 300,
    active_channels: ['FCM', 'SMS', 'VOICE_CALL'] as Array<'FCM' | 'SMS' | 'VOICE_CALL'>,
    trigger_severities: ['CRITICAL', 'EMERGENCY'] as Array<
      'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'
    >,
    daily_sms_limit: 500,
    retry_attempts: 2,
    updated_at: new Date().toISOString(),
    updated_by: 'admin',
  };
}



