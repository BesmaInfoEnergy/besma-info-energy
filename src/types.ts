export type Role = 'admin' | 'operateur' | 'lecteur';

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  wilayaScope: string;
  department: string;
}

export interface GridNode {
  id: string;
  name: string;
  wilaya: string;
  region: 'Nord-Centre' | 'Ouest' | 'Est' | 'Sud-Hassi';
  type: 'ELECTRICITY' | 'GAS';
  protocol: 'MQTT' | 'KAFKA';
  topic: string;
  coordinates: { x: number; y: number; lat: number; lng: number };
  status: 'NOMINAL' | 'WARNING' | 'CRITICAL';
  voltageKv?: number;
  nominalVoltageKv?: number;
  currentAmp?: number;
  activePowerMw?: number;
  frequencyHz?: number;
  transformerTempC?: number;
  pressureBar?: number;
  nominalPressureBar?: number;
  flowRateM3h?: number;
  gasTempC?: number;
  compressorRatio?: number;
  technicalLossPct: number;
  nonTechnicalLossPct: number;
  failureProbability: number;
  mlClassification: 'PAS_DE_PANNE' | 'RISQUE_SURCHARGE' | 'PANNE_IMMINENTE';
  lastUpdated: string;
  scadaMode: 'AUTO' | 'MANUAL_OVERRIDE';
  activeRerouteTarget?: string;
}

export interface IngestionPacket {
  packetId: string;
  timestamp: string;
  nodeId: string;
  nodeName: string;
  wilaya: string;
  protocol: 'MQTT' | 'KAFKA';
  topic: string;
  energyType: 'ELECTRICITY' | 'GAS';
  metrics: {
    voltageKv?: number;
    currentAmp?: number;
    powerMw?: number;
    pressureBar?: number;
    flowRateM3h?: number;
    temperatureC: number;
  };
  lossRatePct: number;
  anonymizedMeterHash: string;
  validatedSchema: boolean;
  latencyMs: number;
}

export interface ScadaActionLog {
  id: string;
  timestamp: string;
  nodeId: string;
  nodeName: string;
  wilaya: string;
  triggerType: 'AUTONOMOUS_AI' | 'OPERATOR_MANUAL' | 'ML_PROTECTION_RULE';
  actionType: 'REROUTAGE_FLUX' | 'REGULATION_PRESSION' | 'DELESTAGE_SELECTIF' | 'ISOLATION_TRONCON' | 'INSPECTION_FRAUDE';
  commandSent: string;
  previousState: string;
  newState: string;
  estimatedLossReductionPct: number;
  operatorUsername: string;
  status: 'EXECUTED' | 'VERIFIED';
}

export interface FraudAnomalyCase {
  id: string;
  detectedAt: string;
  wilaya: string;
  commune: string;
  sectorType: 'Industriel' | 'Commercial' | 'Agricole' | 'Résidentiel Dense';
  nodeId: string;
  anonymizedSubscriberId: string;
  energyType: 'ELECTRICITY' | 'GAS';
  declaredLoadKwOrM3: number;
  measuredLoadKwOrM3: number;
  unaccountedDeltaPct: number;
  anomalyConfidenceScore: number;
  behavioralPattern: string;
  status: 'DETECTED' | 'INSPECTION_DISPATCHED' | 'RESOLVED_CONFIRMED';
  estimatedMonthlyLossDzd: number;
}

export interface GridOverviewResponse {
  timestamp: string;
  complianceStatus: {
    law: string;
    hostingMode: string;
    piiAnonymization: string;
  };
  kpis: {
    nationalLossRatePct: number;
    baselineHistoricalLossPct: number;
    nonTechnicalFraudLossPct: number;
    activeSensorsCount: number;
    criticalNodesCount: number;
    warningNodesCount: number;
    autonomousActions24h: number;
    estimatedSavingsMwh: number;
  };
  nodes: GridNode[];
  recentIngestion: IngestionPacket[];
  scadaLogs: ScadaActionLog[];
  fraudCases: FraudAnomalyCase[];
}

export interface GeminiAnalysisResult {
  source: string;
  model: string;
  temperature: number;
  nodeAnalyzed: string;
  analysis: {
    summary: string;
    rootCauseAnalysis: string;
    recommendedScadaCommand: string;
    expectedLossReductionPct: number;
    priorityLevel: string;
    complianceCheck1807: string;
    actionSteps: string[];
  };
}

export interface SourceFileItem {
  path: string;
  category: string;
  description: string;
  content: string;
}

export type ThresholdSeason = 'summer' | 'winter' | 'all';

export type ThresholdMetricKey =
  | 'voltage'
  | 'current'
  | 'power'
  | 'frequency'
  | 'transformer_temp'
  | 'gas_pressure'
  | 'gas_flow'
  | 'compression_ratio';

export interface ThresholdItem {
  id: string;
  zone: string;
  season: ThresholdSeason;
  metric: ThresholdMetricKey;
  warning_threshold: number;
  critical_threshold: number;
  emergency_threshold: number;
  direction: 'above' | 'below';
  unit: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string;
  version: number;
}

export interface ThresholdHistoryItem {
  history_id: string;
  threshold_id: string;
  zone: string;
  season: ThresholdSeason;
  metric: ThresholdMetricKey;
  version_before: number;
  version_after: number;
  updated_by: string;
  updated_at: string;
  before: {
    warning_threshold: number;
    critical_threshold: number;
    emergency_threshold: number;
    enabled: boolean;
  };
  after: {
    warning_threshold: number;
    critical_threshold: number;
    emergency_threshold: number;
    enabled: boolean;
  };
}

export interface ThresholdSimulationResult {
  simulation: boolean;
  zone: string;
  season: ThresholdSeason;
  ml_prediction: {
    sensor_id: string;
    zone: string;
    season: string;
    binary_classification: 0 | 1;
    failure_probability: number;
    severity_level: 'normal' | 'warning' | 'critical' | 'emergency';
    label: string;
    breached_metrics: Array<{
      metric: string;
      measured_value: number;
      severity: string;
      threshold_id: string;
      unit: string;
    }>;
  };
  fcm_notification: {
    notification_id: string;
    severity_level: string;
    title: string;
    body: string;
    topics_broadcasted: string[];
    auto_scada_triggered: boolean;
  } | null;
  scada_action: {
    triggered: boolean;
    action_type: string;
    scada_commands: string[];
  };
}

export type SeverityStatus = 'normal' | 'warning' | 'critical' | 'emergency';

export interface MetricThresholdSummary {
  metric: string;
  warning_threshold: number;
  critical_threshold: number;
  emergency_threshold: number;
  direction: 'above' | 'below';
  unit: string;
}

export interface AnalyticsAlignedRow {
  timestamp: string;
  timeLabel: string;
  zone: string;
  hasAnomaly: boolean;
  maxSeverity: SeverityStatus;
  voltage?: number;
  voltage_severity?: SeverityStatus;
  voltage_zscore?: number;
  power?: number;
  power_severity?: SeverityStatus;
  power_zscore?: number;
  transformer_temp?: number;
  transformer_temp_severity?: SeverityStatus;
  transformer_temp_zscore?: number;
  gas_pressure?: number;
  gas_pressure_severity?: SeverityStatus;
  gas_pressure_zscore?: number;
  [key: string]: any;
}

export interface AnalyticsTrendsResponse {
  zone: string;
  hours: number;
  window_minutes: number;
  metrics: string[];
  aligned_series: AnalyticsAlignedRow[];
  thresholds: Record<string, MetricThresholdSummary>;
}

export interface AnalyticsAnomalyItem {
  id: string;
  zone: string;
  timestamp: string;
  metric: string;
  unit: string;
  value: number;
  threshold_crossed: number | null;
  z_score: number;
  severity: SeverityStatus;
  classification: 'PIC_NORMAL' | 'PIC_ANORMAL' | 'FRANCHISSEMENT_SEUIL' | 'URGENCE';
  scada_action_triggered: string;
  description: string;
}

export interface ZoneTopologyStatus {
  zone: string;
  node_id: string;
  wilaya: string;
  energy_type: 'ELECTRICITY' | 'GAS' | 'HYBRID';
  status: SeverityStatus;
  last_alert: string;
  last_scada_action: string;
  voltage_kv: number;
  power_mw: number;
  transformer_temp_c: number;
  gas_pressure_bar: number;
  failure_probability: number;
  coordinates: {
    lat: number;
    lng: number;
    x: number;
    y: number;
  };
}

export type ForecastRiskLevel =
  | 'NORMAL'
  | 'INFO'
  | 'WARNING'
  | 'CRITICAL'
  | 'EMERGENCY';

export interface ForecastPointItem {
  timestamp: string;
  hour_offset: number;
  probability: number;
  lower_bound: number;
  upper_bound: number;
  risk_level: ForecastRiskLevel;
  is_past?: boolean;
}

export interface Forecast48hResponse {
  zone: string;
  generated_at: string;
  horizon_hours: number;
  confidence_level?: number;
  model_path?: string;
  points: ForecastPointItem[];
  past_points?: ForecastPointItem[];
  peak_probability: number;
  peak_timestamp: string;
  risk_level: ForecastRiskLevel;
  recommended_action: string;
  preventive_scada_order?: string | null;
  fcm_alert_sent?: {
    notification_id: string;
    title: string;
    body: string;
    topics_broadcasted: string[];
  } | null;
}

export interface PreventiveInterventionTask {
  intervention_id: string;
  collection: string;
  zone: string;
  scheduled_at: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
  assigned_operator: string;
  created_by: string;
  created_at: string;
  status: 'SCHEDULED' | 'COMPLETED';
  fcm_notification_id?: string;
  law_18_07_compliant: boolean;
}

export interface ForecastHistoryEntry {
  forecast_id: string;
  zone: string;
  generated_at: string;
  peak_probability: number;
  peak_timestamp?: string;
  risk_level: ForecastRiskLevel;
  model_accuracy_pct: number;
}

export type SMSProviderName = 'mock' | 'ooredoo' | 'mobilis' | 'djezzy';

export interface SMSHistoryItem {
  sms_id: string;
  timestamp: string;
  notification_id?: string;
  operator_id: string;
  zone: string;
  message_type: string;
  reason?: 'no_acknowledgment' | 'operator_request' | 'system_failure';
  provider: SMSProviderName;
  status: 'sent' | 'failed';
  cost_dzd: number;
  message: string;
  retention_days?: number;
}

export interface SMSGatewayStatus {
  active_provider: SMSProviderName;
  configured_provider_env: string;
  remaining_credit_dzd: number;
  cost_per_sms_dzd: number;
  daily_limit: number;
  sent_today: number;
  fallback_timeout_seconds: number;
  max_length: number;
  last_sent: SMSHistoryItem | null;
  encryption: string;
  law_18_07_compliant: boolean;
}

export interface EscalationPolicyConfig {
  policy_id: string;
  collection: string;
  sms_timeout_seconds: number;
  voice_call_timeout_seconds: number;
  active_channels: Array<'FCM' | 'SMS' | 'VOICE_CALL'>;
  trigger_severities: Array<'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY'>;
  daily_sms_limit: number;
  retry_attempts: number;
  updated_at: string;
  updated_by: string;
}




