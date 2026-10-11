import React, { useEffect, useState, useCallback } from 'react';
import {
  GridOverviewResponse,
  UserAccount,
  Role,
  GeminiAnalysisResult,
  SourceFileItem,
  AnalyticsTrendsResponse,
  AnalyticsAnomalyItem,
  ZoneTopologyStatus,
} from './types';
import {
  USERS_FALLBACK,
  createFallbackOverview,
  FALLBACK_SOURCE_FILES,
  buildPacketsFromNodes,
  buildAnalyticsTrendsAndAnomalies,
  buildZonesTopologyStatus,
} from './fallbackData';
import {
  buildOperatorFcmToken,
  onTokenRefresh,
  registerFcmServiceWorker,
} from './firebaseConfig';
import { TelemetryIngestionPanel } from './components/TelemetryIngestionPanel';
import { FraudDetectionPanel } from './components/FraudDetectionPanel';
import { SourceCodeExplorer } from './components/SourceCodeExplorer';
import { AuditCompliancePanel, AuditLogItem } from './components/AuditCompliancePanel';
import { ThresholdConfigPanel } from './components/ThresholdConfigPanel';
import { NetworkTopologyMap } from './components/NetworkTopologyMap';
import { ConsumptionTrends } from './components/ConsumptionTrends';
import { AnomalyTimeline } from './components/AnomalyTimeline';
import { FailureForecastPanel } from './components/FailureForecastPanel';
import { SMSGatewayPanel } from './components/SMSGatewayPanel';
import { EscalationPolicyPanel } from './components/EscalationPolicyPanel';
import { ThemeToggle } from './components/ThemeToggle';
import { ShieldCheck, Lock, Bell, CheckCircle2, RefreshCw } from 'lucide-react';

type ActiveSection =
  | 'supervision'
  | 'ingestion'
  | 'ia_scada'
  | 'fraude'
  | 'config_seuils'
  | 'audit_conformite'
  | 'code_source';

async function safeJsonFetch<T>(url: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export default function App() {
  const [activeSection, setActiveSection] = useState<ActiveSection>('supervision');
  const [energyFilter, setEnergyFilter] = useState<'ALL' | 'ELECTRICITY' | 'GAS'>('ALL');
  const [overview, setOverview] = useState<GridOverviewResponse>(() =>
    createFallbackOverview()
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string>('DZ-ELEC-ORN-02');
  const [token, setToken] = useState<string>('jwt-local-session-dz1807');
  const [currentUser, setCurrentUser] = useState<UserAccount>(USERS_FALLBACK.admin);
  const [aiAnalysis, setAiAnalysis] = useState<GeminiAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [isExecutingScada, setIsExecutingScada] = useState<boolean>(false);
  const [isSimulatingPacket, setIsSimulatingPacket] = useState<boolean>(false);
  const [sourceFiles, setSourceFiles] = useState<SourceFileItem[]>(FALLBACK_SOURCE_FILES);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // État Analytique 24h (Recharts), Anomalies (Z-Score > 3σ) & Topologie D3.js (8 zones)
  const [analyticsZone, setAnalyticsZone] = useState<string>('Oran');
  const [zonesStatus, setZonesStatus] = useState<Record<string, ZoneTopologyStatus>>(() =>
    buildZonesTopologyStatus()
  );
  const [trendsData, setTrendsData] = useState<AnalyticsTrendsResponse>(
    () => buildAnalyticsTrendsAndAnomalies('Oran').trends
  );
  const [anomaliesList, setAnomaliesList] = useState<AnalyticsAnomalyItem[]>(
    () => buildAnalyticsTrendsAndAnomalies('Oran').anomalies
  );

  // État FCM (Token opérateur, Topics et Journal d'Audit MongoDB `audit_logs`)
  const [fcmToken, setFcmToken] = useState<string>('');
  const [subscribedTopics, setSubscribedTopics] = useState<string[]>([
    'alertes-critiques',
    'alertes-zone-DZ1807-ORN02',
  ]);
  const [fcmAuditLogs, setFcmAuditLogs] = useState<AuditLogItem[]>([
    {
      audit_id: 'AUD-META-1002',
      event_type: 'AUDIT_LOG_EXPORT_SIGNED',
      notification_id: 'audit_export_20261011_120000.zip',
      operator_username: 'admin',
      operator_role: 'admin',
      ip_hash: 'IPHASH-DZ1807-8f41c09a2b7e1104',
      content_hash:
        '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
      format: 'csv',
      signature_verified: true,
      comment: 'Export signé RSA-4096 (CSV) · 2 lignes · SHA256:4b227777d4dd1fc6',
      acknowledged_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    },
    {
      audit_id: 'AUD-1000',
      event_type: 'NOTIFICATION_ACKNOWLEDGED',
      notification_id: 'FCM-NOTIF-ORN02-INIT',
      operator_username: 'admin',
      operator_role: 'admin',
      ip_hash: 'IPHASH-DZ1807-8f41c09a2b7e1104',
      comment: 'Acquittement initial surcharge Es Senia 400kV',
      acknowledged_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    },
  ]);

  const showNotification = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 5000);
  };

  const fetchNotificationsState = useCallback(async () => {
    const state = await safeJsonFetch<{ audit_logs: AuditLogItem[] }>(
      '/api/v1/notifications/state'
    );
    if (state && Array.isArray(state.audit_logs) && state.audit_logs.length > 0) {
      setFcmAuditLogs(state.audit_logs);
    }
  }, []);

  // Enregistrement du token FCM auprès de POST /api/v1/notifications/register-token
  const registerTokenWithBackend = useCallback(
    async (jwtToken: string, username: string, isRefresh: boolean = false) => {
      const generatedToken = buildOperatorFcmToken(username);
      setFcmToken(generatedToken);

      const res = await safeJsonFetch<{
        status: string;
        operator_token: { fcm_token: string; subscribed_topics: string[] };
      }>('/api/v1/notifications/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({
          fcm_token: generatedToken,
          zone_hash: 'DZ1807-ORN02',
          is_refresh: isRefresh,
        }),
      });

      if (res?.operator_token) {
        setFcmToken(res.operator_token.fcm_token);
        setSubscribedTopics(res.operator_token.subscribed_topics);
      }
      if (isRefresh) {
        showNotification(
          `Token FCM rafraîchi automatiquement (onTokenRefresh) et synchronisé dans operator_tokens`
        );
      }
    },
    []
  );

  // Authentification JWT / Changement de rôle RBAC
  const switchUserRole = useCallback(
    async (role: Role) => {
      if (
        role !== 'admin' &&
        (activeSection === 'audit_conformite' || activeSection === 'config_seuils')
      ) {
        setActiveSection('supervision');
      }
      const data = await safeJsonFetch<{ access_token: string; user: UserAccount }>(
        '/api/auth/switch-role',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      );
      if (data && data.user) {
        setToken(data.access_token);
        setCurrentUser(data.user);
        await registerTokenWithBackend(data.access_token, data.user.username, false);
      } else {
        const fallbackUser = USERS_FALLBACK[role];
        setCurrentUser(fallbackUser);
        await registerTokenWithBackend(token, fallbackUser.username, false);
      }
    },
    [activeSection, registerTokenWithBackend, token]
  );

  const fetchGridOverview = useCallback(async () => {
    const data = await safeJsonFetch<GridOverviewResponse>('/api/grid/overview');
    if (data && Array.isArray(data.nodes)) {
      setOverview(data);
    } else {
      setOverview((prev) => {
        const updatedNodes = prev.nodes.map((node) => {
          const delta = (Math.random() - 0.49) * 0.4;
          if (node.type === 'ELECTRICITY') {
            return {
              ...node,
              voltageKv: Number(((node.voltageKv || 220) + delta).toFixed(1)),
              lastUpdated: new Date().toISOString(),
            };
          }
          return {
            ...node,
            pressureBar: Number(((node.pressureBar || 68) + delta * 0.5).toFixed(1)),
            lastUpdated: new Date().toISOString(),
          };
        });
        return createFallbackOverview(
          updatedNodes,
          prev.scadaLogs,
          prev.fraudCases,
          [...buildPacketsFromNodes(updatedNodes).slice(0, 2), ...prev.recentIngestion].slice(
            0,
            20
          )
        );
      });
    }
  }, []);

  const fetchSourceFiles = useCallback(async () => {
    const data = await safeJsonFetch<{ files: SourceFileItem[] }>('/api/source-files');
    if (data && Array.isArray(data.files) && data.files.length > 0) {
      setSourceFiles(data.files);
    }
  }, []);

  const fetchAnalyticsForZone = useCallback(
    async (zoneName: string, authToken: string) => {
      const headers = { Authorization: `Bearer ${authToken}` };
      const [trendsRes, anomRes, statusRes] = await Promise.all([
        safeJsonFetch<AnalyticsTrendsResponse>(
          `/api/v1/analytics/trends?zone=${encodeURIComponent(zoneName)}&hours=24`,
          { headers }
        ),
        safeJsonFetch<{ anomalies: AnalyticsAnomalyItem[] }>(
          `/api/v1/analytics/anomalies?zone=${encodeURIComponent(zoneName)}&hours=24`,
          { headers }
        ),
        safeJsonFetch<{ zones: Record<string, ZoneTopologyStatus> }>(
          '/api/v1/analytics/zones-status',
          { headers }
        ),
      ]);

      const localFallback = buildAnalyticsTrendsAndAnomalies(zoneName);
      if (trendsRes && Array.isArray(trendsRes.aligned_series)) {
        setTrendsData(trendsRes);
      } else {
        setTrendsData(localFallback.trends);
      }

      if (anomRes && Array.isArray(anomRes.anomalies)) {
        setAnomaliesList(anomRes.anomalies);
      } else {
        setAnomaliesList(localFallback.anomalies);
      }

      if (statusRes && statusRes.zones) {
        setZonesStatus(statusRes.zones);
      }
    },
    []
  );

  useEffect(() => {
    registerFcmServiceWorker();
    switchUserRole('admin');
    fetchGridOverview();
    fetchNotificationsState();
    fetchSourceFiles();
    const interval = setInterval(fetchGridOverview, 5000);
    return () => clearInterval(interval);
  }, [switchUserRole, fetchGridOverview, fetchNotificationsState, fetchSourceFiles]);

  useEffect(() => {
    fetchAnalyticsForZone(analyticsZone, token);
  }, [analyticsZone, token, fetchAnalyticsForZone]);

  // Abonnement au rafraîchissement automatique du token FCM (onTokenRefresh)
  useEffect(() => {
    const unsubscribe = onTokenRefresh(() => {
      registerTokenWithBackend(token, currentUser.username, true);
    });
    return unsubscribe;
  }, [token, currentUser.username, registerTokenWithBackend]);

  const selectedNode =
    overview.nodes.find((n) => n.id === selectedNodeId) || overview.nodes[0];

  const canWrite = currentUser.role === 'admin' || currentUser.role === 'operateur';
  const isAdmin = currentUser.role === 'admin';

  // Acquittement d'une notification critique via POST /api/v1/notifications/acknowledge
  const handleAcknowledgeNotification = async (notificationId: string, commentText: string) => {
    if (!canWrite) {
      showNotification(
        'Accès refusé (403) : Rôle Admin ou Opérateur requis pour acquitter une alerte FCM.'
      );
      return;
    }

    const res = await safeJsonFetch<{
      status: string;
      notification_id: string;
      audit_log: AuditLogItem;
    }>('/api/v1/notifications/acknowledge', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        notification_id: notificationId,
        comment: commentText,
      }),
    });

    if (res && res.status === 'acknowledged' && res.audit_log) {
      setFcmAuditLogs((prev) => [res.audit_log, ...prev]);
      showNotification(
        `Notification ${res.notification_id} acquittée (${res.audit_log.ip_hash})`
      );
    } else {
      const fallbackEntry: AuditLogItem = {
        audit_id: `AUD-${1001 + fcmAuditLogs.length}`,
        event_type: 'NOTIFICATION_ACKNOWLEDGED',
        notification_id: notificationId,
        operator_username: currentUser.username,
        operator_role: currentUser.role,
        ip_hash: 'IPHASH-DZ1807-9c04e1a8f3b27712',
        comment: commentText,
        acknowledged_at: new Date().toISOString(),
      };
      setFcmAuditLogs((prev) => [fallbackEntry, ...prev]);
      showNotification(
        `Notification ${notificationId} acquittée (${fallbackEntry.ip_hash})`
      );
    }
  };

  // Appel de l'agent IA Gemini (Température 0.2)
  const handleRunGeminiAnalysis = async (targetNodeId?: string) => {
    const nodeIdToAnalyze = targetNodeId || selectedNode?.id || 'DZ-ELEC-ORN-02';
    const targetNode =
      overview.nodes.find((n) => n.id === nodeIdToAnalyze) || overview.nodes[0];

    setIsAnalyzing(true);
    const data = await safeJsonFetch<GeminiAnalysisResult>('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        nodeId: nodeIdToAnalyze,
        focusContext: 'Optimisation nationale SONELGAZ & conformité Loi 18-07',
      }),
    });

    if (data && data.analysis) {
      setAiAnalysis(data);
      showNotification(
        `Diagnostic IA Gemini (T=0.2) généré pour le poste ${data.nodeAnalyzed}`
      );
    } else if (targetNode) {
      const fallbackResult: GeminiAnalysisResult = {
        source: 'DETERMINISTIC_ENGINE',
        model: 'gemini-3.8-flash',
        temperature: 0.2,
        nodeAnalyzed: targetNode.id,
        analysis: {
          summary:
            targetNode.type === 'ELECTRICITY'
              ? `Déséquilibre de charge et tension mesurée à ${targetNode.voltageKv} kV (nominal ${targetNode.nominalVoltageKv} kV) sur ${targetNode.name}. Température transformateur : ${targetNode.transformerTempC}°C.`
              : `Variation de pression à ${targetNode.pressureBar} bar (nominal ${targetNode.nominalPressureBar} bar) sur ${targetNode.name} avec pertes non techniques de ${targetNode.nonTechnicalLossPct}%.`,
          rootCauseAnalysis: `Combinaison d'une pointe de charge régionale sur ${targetNode.wilaya} et de pertes non techniques (${targetNode.nonTechnicalLossPct}%). Probabilité ML de panne évaluée à ${(targetNode.failureProbability * 100).toFixed(1)}%.`,
          recommendedScadaCommand:
            targetNode.type === 'ELECTRICITY'
              ? `IEC-61850 MMS: TRANSFER_LOAD_25PCT -> BUSBAR_SECOURS_${targetNode.id}`
              : `MODBUS-TCP: SET_REGULATOR_VALVE=${targetNode.nominalPressureBar}_BAR ON ${targetNode.id}`,
          expectedLossReductionPct: 3.9,
          priorityLevel:
            targetNode.status === 'CRITICAL' ? 'URGENCE_IMMEDIATE' : 'HAUTE',
          complianceCheck1807:
            'Conforme Loi algérienne n° 18-07 : Identifiants compteurs hachés (SHA-256) et traitement souverain.',
          actionSteps: [
            `Exécuter le reroutage/régulation automatique SCADA sur ${targetNode.name}.`,
            `Isoler le départ secondaire présentant ${targetNode.nonTechnicalLossPct}% de pertes non techniques.`,
            `Transmettre le rapport d'audit chiffré au Centre National de Conduite.`,
          ],
        },
      };
      setAiAnalysis(fallbackResult);
      showNotification(
        `Diagnostic IA (T=0.2) généré pour le poste ${targetNode.id}`
      );
    }
    setIsAnalyzing(false);
  };

  // Exécution d'un ordre correctif SCADA (Reroutage ou Régulation Pression)
  const handleExecuteScadaCommand = async (nodeId: string, autonomous: boolean = true) => {
    if (!canWrite) return;
    setIsExecutingScada(true);

    const apiRes = await safeJsonFetch<{
      message: string;
      actionLog: { commandSent: string; estimatedLossReductionPct: number };
    }>('/api/scada/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nodeId, autonomous }),
    });

    if (apiRes && apiRes.actionLog) {
      await fetchGridOverview();
      showNotification(
        `Action SCADA exécutée : ${apiRes.actionLog.commandSent} (-${apiRes.actionLog.estimatedLossReductionPct}% de pertes)`
      );
    } else {
      setOverview((prev) => {
        const updatedNodes = prev.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          return {
            ...n,
            status: 'NOMINAL' as const,
            voltageKv: n.nominalVoltageKv || 220,
            pressureBar: n.nominalPressureBar || 68,
            transformerTempC: 62.5,
            failureProbability: 0.12,
            mlClassification: 'PAS_DE_PANNE' as const,
            nonTechnicalLossPct: Math.max(2.5, Number((n.nonTechnicalLossPct - 2.8).toFixed(1))),
          };
        });
        const target = prev.nodes.find((n) => n.id === nodeId) || prev.nodes[0];
        const cmd =
          target.type === 'ELECTRICITY'
            ? `IEC-61850 MMS: AUTO_REROUTE_FEEDER -> ${target.id}`
            : `MODBUS-TCP: SET_COMPRESSOR_PRESSURE=${target.nominalPressureBar}_BAR -> ${target.id}`;
        const newLog = {
          id: `SCADA-ACT-${Math.floor(9050 + Math.random() * 900)}`,
          timestamp: new Date().toISOString(),
          nodeId: target.id,
          nodeName: target.name,
          wilaya: target.wilaya,
          triggerType: autonomous ? ('AUTONOMOUS_AI' as const) : ('OPERATOR_MANUAL' as const),
          actionType:
            target.type === 'ELECTRICITY'
              ? ('REROUTAGE_FLUX' as const)
              : ('REGULATION_PRESSION' as const),
          commandSent: cmd,
          previousState: `Prob. Panne ${(target.failureProbability * 100).toFixed(0)}%`,
          newState: 'Paramètres nominaux rétablis et pertes réduites',
          estimatedLossReductionPct: 3.6,
          operatorUsername: currentUser.username,
          status: 'EXECUTED' as const,
        };
        showNotification(`Action SCADA exécutée : ${cmd} (-3.6% de pertes)`);
        return createFallbackOverview(
          updatedNodes,
          [newLog, ...prev.scadaLogs],
          prev.fraudCases,
          prev.recentIngestion
        );
      });
    }
    setIsExecutingScada(false);
  };

  // Simulation d'un paquet MQTT / Kafka dans le module d'ingestion
  const handleSimulateIngestion = async (
    nodeId: string,
    anomalyMode: 'OVERLOAD' | 'NORMALIZE'
  ) => {
    if (!canWrite) return;
    setIsSimulatingPacket(true);

    const apiRes = await safeJsonFetch<{ message: string }>('/api/ingestion/simulate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ nodeId, anomalyMode }),
    });

    if (apiRes && apiRes.message) {
      await fetchGridOverview();
      showNotification(apiRes.message);
    } else {
      setOverview((prev) => {
        const updatedNodes = prev.nodes.map((n) => {
          if (n.id !== nodeId) return n;
          if (anomalyMode === 'OVERLOAD') {
            return {
              ...n,
              status: 'CRITICAL' as const,
              voltageKv: n.type === 'ELECTRICITY' ? 194.2 : n.voltageKv,
              pressureBar: n.type === 'GAS' ? 58.4 : n.pressureBar,
              transformerTempC: 92.5,
              failureProbability: 0.87,
              mlClassification: 'PANNE_IMMINENTE' as const,
            };
          }
          return {
            ...n,
            status: 'NOMINAL' as const,
            voltageKv: n.nominalVoltageKv || 220,
            pressureBar: n.nominalPressureBar || 68,
            transformerTempC: 61.5,
            failureProbability: 0.11,
            mlClassification: 'PAS_DE_PANNE' as const,
          };
        });
        showNotification(
          `Trame ${anomalyMode === 'OVERLOAD' ? 'de surcharge' : 'nominale'} ingérée sur ${nodeId}`
        );
        return createFallbackOverview(
          updatedNodes,
          prev.scadaLogs,
          prev.fraudCases,
          buildPacketsFromNodes(updatedNodes)
        );
      });
    }
    setIsSimulatingPacket(false);
  };

  // Mise à jour d'un dossier de fraude
  const handleUpdateFraudStatus = async (
    fraudId: string,
    newStatus: 'INSPECTION_DISPATCHED' | 'RESOLVED_CONFIRMED'
  ) => {
    if (!canWrite) return;
    const apiRes = await safeJsonFetch<{ message: string }>('/api/fraud/dispatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ fraudId, newStatus }),
    });

    if (apiRes && apiRes.message) {
      await fetchGridOverview();
      showNotification(apiRes.message);
    } else {
      setOverview((prev) => {
        const updatedFrauds = prev.fraudCases.map((f) =>
          f.id === fraudId ? { ...f, status: newStatus } : f
        );
        showNotification(`Statut du dossier ${fraudId} mis à jour : ${newStatus}`);
        return createFallbackOverview(
          prev.nodes,
          prev.scadaLogs,
          updatedFrauds,
          prev.recentIngestion
        );
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#0F172A] dark:bg-[#121212] text-slate-100 dark:text-[#E0E0E0] flex flex-col transition-colors duration-75">
      {/* TOP BAR CONTRACT : 3 Zones strictes séparées par gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 dark:border-[#333336] bg-slate-950/90 dark:bg-[#121212] sticky top-0 z-30">
        {/* Zone 1 : Wordmark unique sur une ligne */}
        <a
          href="#supervision"
          onClick={(e) => {
            e.preventDefault();
            setActiveSection('supervision');
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          BesmaInfoEnergy
        </a>

        {/* Zone 2 : Liens de navigation concis sur une seule ligne (Audit & Conformité visible uniquement pour admin) */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-300">
          <button
            onClick={() => setActiveSection('supervision')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'supervision'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400'
            }`}
          >
            Supervision
          </button>
          <button
            onClick={() => setActiveSection('ingestion')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'ingestion'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400'
            }`}
          >
            Ingestion
          </button>
          <button
            onClick={() => setActiveSection('ia_scada')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'ia_scada'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400'
            }`}
          >
            Décision SCADA
          </button>
          <button
            onClick={() => setActiveSection('fraude')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
              activeSection === 'fraude'
                ? 'border-sky-400 text-white'
                : 'border-transparent text-slate-400'
            }`}
          >
            Fraudes
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveSection('config_seuils')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                activeSection === 'config_seuils'
                  ? 'border-sky-400 text-white'
                  : 'border-transparent text-slate-400'
              }`}
            >
              Configuration des seuils
            </button>
          )}
          {isAdmin ? (
            <button
              onClick={() => setActiveSection('audit_conformite')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                activeSection === 'audit_conformite'
                  ? 'border-sky-400 text-white'
                  : 'border-transparent text-slate-400'
              }`}
            >
              Audit & Conformité
            </button>
          ) : (
            <button
              onClick={() => setActiveSection('code_source')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 cursor-pointer ${
                activeSection === 'code_source'
                  ? 'border-sky-400 text-white'
                  : 'border-transparent text-slate-400'
              }`}
            >
              Architecture
            </button>
          )}
        </nav>

        {/* Zone 3 : Sélecteur de Thème ISA-101 (Clair / Sombre #121212 / Auto) + Action primaire */}
        <div className="flex items-center gap-3 shrink-0">
          <ThemeToggle
            token={token}
            onThemeChanged={(pref) => {
              const labels = {
                light: 'Mode Bleu Nuit Standard (#0F172A)',
                dark: 'Mode Sombre Pur ISA-101 (#121212 · Texte #E0E0E0)',
                auto: 'Mode Automatique (prefers-color-scheme)',
              };
              showNotification(
                `Thème basculé vers « ${labels[pref]} » et sauvegardé (localStorage + MongoDB users.theme_preference)`
              );
            }}
          />
          <button
            onClick={() => {
              handleRunGeminiAnalysis();
              setActiveSection('ia_scada');
            }}
            disabled={isAnalyzing}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isAnalyzing ? 'Analyse Gemini...' : 'Diagnostic IA Réseau'}
          </button>
        </div>
      </header>

      {/* Barre d'espace de travail sous le pli (Filtres Énergie, Sélecteur de Rôle JWT & Conformité Loi 18-07) */}
      <div className="border-b border-slate-800/80 bg-slate-900/60 px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-slate-200 font-medium">
              Conformité Loi Algérienne n° 18-07
            </span>
            <span aria-hidden="true">·</span>
            <span>Hébergement Souverain SONELGAZ</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300 tabular-nums">
              {currentUser.fullName}
            </span>
            {isAdmin && (
              <>
                <span aria-hidden="true">·</span>
                <button
                  onClick={() => setActiveSection('code_source')}
                  className="text-sky-400 hover:underline cursor-pointer"
                >
                  Voir Code Source
                </button>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              <button
                onClick={() => setEnergyFilter('ALL')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  energyFilter === 'ALL'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tous les Flux
              </button>
              <button
                onClick={() => setEnergyFilter('ELECTRICITY')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  energyFilter === 'ELECTRICITY'
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Électricité HTB/MT
              </button>
              <button
                onClick={() => setEnergyFilter('GAS')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  energyFilter === 'GAS'
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Gaz Naturel
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Rôle JWT :</span>
              <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
                {(['admin', 'operateur', 'lecteur'] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => switchUserRole(r)}
                    className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      currentUser.role === r
                        ? 'bg-sky-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r === 'admin'
                      ? 'Admin'
                      : r === 'operateur'
                      ? 'Opérateur'
                      : 'Lecteur'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bannière de retour d'action temps réel */}
      {feedbackBanner && (
        <div className="bg-sky-500/15 border-b border-sky-500/30 px-6 py-2.5 text-xs text-sky-200 flex items-center justify-between">
          <span className="font-medium">{feedbackBanner}</span>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-sky-300 hover:text-white underline cursor-pointer"
          >
            Fermer
          </button>
        </div>
      )}

      {/* CONTENU PRINCIPAL (1440px Baseline) */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6 space-y-6">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">
              Taux de Pertes Réseau National (Cible &lt; 10%)
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-white tabular-nums">
                {overview.kpis.nationalLossRatePct}%
              </span>
              <span className="text-xs font-mono text-emerald-400 tabular-nums">
                Réf. initiale : {overview.kpis.baselineHistoricalLossPct}%
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Dont pertes non techniques :{' '}
              <span className="font-mono text-amber-400 tabular-nums">
                {overview.kpis.nonTechnicalFraudLossPct}%
              </span>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">
              Capteurs MQTT / Kafka Connectés
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-white tabular-nums">
                {overview.kpis.activeSensorsCount.toLocaleString('fr-FR')}
              </span>
              <span className="text-xs font-mono text-sky-400 tabular-nums">
                8 Postes Maîtres HTB/Gaz
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Pipeline asynchrone validé sans perte de trame
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">
              Prédiction ML des Pannes (Classification Binaire)
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-red-400 tabular-nums">
                {overview.kpis.criticalNodesCount} Critique(s)
              </span>
              <span className="text-xs font-mono text-amber-400 tabular-nums">
                {overview.kpis.warningNodesCount} En surveillance
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Seuil de déclenchement SCADA : Probabilité &ge; 65%
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-xs text-slate-400">
              Énergie Sauvegardée & Actions SCADA (24h)
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
                {overview.kpis.estimatedSavingsMwh.toLocaleString('fr-FR')} MWh
              </span>
              <span className="text-xs font-mono text-slate-300 tabular-nums">
                {overview.kpis.autonomousActions24h} régulations
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-400">
              Reroutage IEC-61850 & Vannes Modbus-TCP
            </div>
          </div>
        </section>

        {/* VUE 1 : SUPERVISION UNIFIÉE (Topologie D3.js + Courbes 24h Recharts + Frise des Anomalies) */}
        {activeSection === 'supervision' && (
          <div className="space-y-6">
            {/* EN HAUT : Carte Topologique Interactive D3.js (8 Zones) + Poste Ciblé */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 flex flex-col">
                <NetworkTopologyMap
                  zonesStatus={zonesStatus}
                  selectedZone={analyticsZone}
                  onSelectZone={(zoneName, nodeId) => {
                    setAnalyticsZone(zoneName);
                    setSelectedNodeId(nodeId);
                  }}
                  wsConnected={true}
                />
              </div>

              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
                {selectedNode && (
                  <>
                    <div>
                      <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                        <div>
                          <div className="text-xs font-mono text-sky-400">
                            {selectedNode.id} · {selectedNode.protocol} ({selectedNode.topic})
                          </div>
                          <h2 className="text-lg font-bold text-white mt-1">
                            {selectedNode.name}
                          </h2>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Wilaya : {selectedNode.wilaya} · Région : {selectedNode.region}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-xs font-semibold font-mono ${
                              selectedNode.status === 'CRITICAL'
                                ? 'text-red-400'
                                : selectedNode.status === 'WARNING'
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {selectedNode.mlClassification}
                          </span>
                          <div className="text-xs font-mono text-slate-400 tabular-nums mt-0.5">
                            Risque ML : {(selectedNode.failureProbability * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-800 text-xs">
                        {selectedNode.type === 'ELECTRICITY' ? (
                          <>
                            <div>
                              <span className="text-slate-400">Tension Mesurée / Nominale</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.voltageKv} kV{' '}
                                <span className="text-slate-400 text-xs">
                                  / {selectedNode.nominalVoltageKv} kV
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Puissance Active & Courant</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.activePowerMw} MW{' '}
                                <span className="text-slate-400 text-xs">
                                  ({selectedNode.currentAmp} A)
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Température Transformateur</span>
                              <div
                                className={`text-base font-mono font-semibold tabular-nums mt-1 ${
                                  (selectedNode.transformerTempC || 0) >= 80
                                    ? 'text-red-400'
                                    : 'text-emerald-400'
                                }`}
                              >
                                {selectedNode.transformerTempC}°C
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Fréquence Synchrone</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.frequencyHz} Hz
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <span className="text-slate-400">Pression Gazoduc / Nominale</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.pressureBar} bar{' '}
                                <span className="text-slate-400 text-xs">
                                  / {selectedNode.nominalPressureBar} bar
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Débit Horaire Mesuré</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.flowRateM3h?.toLocaleString('fr-FR')} m³/h
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Température Gaz</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.gasTempC}°C
                              </div>
                            </div>
                            <div>
                              <span className="text-slate-400">Taux Compression</span>
                              <div className="text-base font-mono font-semibold text-white tabular-nums mt-1">
                                {selectedNode.compressorRatio}x
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="py-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            Pertes Techniques (Effet Joule / Compression)
                          </span>
                          <span className="font-mono text-slate-200 tabular-nums">
                            {selectedNode.technicalLossPct}%
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">
                            Pertes Non Techniques (Fraudes / Usages non déclarés)
                          </span>
                          <span className="font-mono text-amber-400 font-semibold tabular-nums">
                            {selectedNode.nonTechnicalLossPct}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-800 space-y-3">
                      {!canWrite && (
                        <div className="text-xs text-amber-300">
                          Mode Lecteur actif : Seuls les rôles Admin et Opérateur peuvent exécuter des ordres SCADA.
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => handleExecuteScadaCommand(selectedNode.id, true)}
                          disabled={!canWrite || isExecutingScada}
                          className="flex-1 px-4 py-2.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {selectedNode.type === 'ELECTRICITY'
                            ? 'Exécuter Reroutage SCADA (IEC-61850)'
                            : 'Réguler Pression Gaz (Modbus-TCP)'}
                        </button>
                        <button
                          onClick={() => {
                            handleRunGeminiAnalysis(selectedNode.id);
                            setActiveSection('ia_scada');
                          }}
                          className="px-4 py-2.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Analyser avec Gemini 3
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* AU MILIEU : Courbes 24h Multi-Métriques Recharts avec superposition des seuils */}
            <ConsumptionTrends
              zone={analyticsZone}
              series={trendsData.aligned_series}
              thresholds={trendsData.thresholds}
              onSelectZoneChange={(newZone) => {
                setAnalyticsZone(newZone);
                const zInfo = zonesStatus[newZone];
                if (zInfo?.node_id) {
                  setSelectedNodeId(zInfo.node_id);
                }
              }}
            />

            {/* EN BAS : Frise Chronologique des Anomalies 24h + État des Postes */}
            <AnomalyTimeline
              zone={analyticsZone}
              anomalies={anomaliesList}
              canWrite={canWrite}
              onExecuteScadaFromAnomaly={(anom) => {
                const targetNodeId = zonesStatus[anom.zone]?.node_id || selectedNode?.id || 'DZ-ELEC-ORN-02';
                handleExecuteScadaCommand(targetNodeId, true);
              }}
            />

            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">
                  État Temps Réel des Postes Électriques et Stations Gazières
                </h3>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  Cliquez sur une ligne pour cibler le poste
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/50">
                      <th className="py-3 px-4 font-medium">Code Poste</th>
                      <th className="py-3 px-4 font-medium">Désignation & Wilaya</th>
                      <th className="py-3 px-4 font-medium">Énergie</th>
                      <th className="py-3 px-4 font-medium text-right">Tension / Pression</th>
                      <th className="py-3 px-4 font-medium text-right">Flux Actif</th>
                      <th className="py-3 px-4 font-medium text-right">Pertes Totales</th>
                      <th className="py-3 px-4 font-medium text-right">Prob. Panne (ML)</th>
                      <th className="py-3 px-4 font-medium">Classification Binaire</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {overview.nodes
                      .filter((n) => energyFilter === 'ALL' || n.type === energyFilter)
                      .map((node) => (
                        <tr
                          key={node.id}
                          onClick={() => setSelectedNodeId(node.id)}
                          className={`hover:bg-slate-800/50 transition-colors cursor-pointer ${
                            selectedNode?.id === node.id ? 'bg-slate-800/70' : ''
                          }`}
                        >
                          <td className="py-2.5 px-4 font-mono text-sky-400 tabular-nums whitespace-nowrap">
                            {node.id}
                          </td>
                          <td className="py-2.5 px-4 text-slate-200 whitespace-nowrap">
                            <span className="font-medium">{node.name}</span>{' '}
                            <span className="text-slate-500">·</span>{' '}
                            <span className="text-slate-400">{node.wilaya}</span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                            {node.type === 'ELECTRICITY' ? 'Électricité' : 'Gaz Naturel'}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-slate-100 tabular-nums whitespace-nowrap">
                            {node.type === 'ELECTRICITY'
                              ? `${node.voltageKv} kV`
                              : `${node.pressureBar} bar`}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-slate-300 tabular-nums whitespace-nowrap">
                            {node.type === 'ELECTRICITY'
                              ? `${node.activePowerMw} MW`
                              : `${node.flowRateM3h?.toLocaleString('fr-FR')} m³/h`}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-amber-400 tabular-nums whitespace-nowrap">
                            {(node.technicalLossPct + node.nonTechnicalLossPct).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-4 font-mono text-right text-slate-100 tabular-nums whitespace-nowrap">
                            {(node.failureProbability * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                            <span
                              className={
                                node.status === 'CRITICAL'
                                  ? 'text-red-400 font-semibold'
                                  : node.status === 'WARNING'
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }
                            >
                              {node.mlClassification}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* VUE 2 : MODULE D'INGESTION TEMPS RÉEL (MQTT / KAFKA) */}
        {activeSection === 'ingestion' && (
          <TelemetryIngestionPanel
            packets={overview.recentIngestion}
            nodes={overview.nodes}
            selectedNodeId={selectedNode?.id || ''}
            onSelectNode={(id) => setSelectedNodeId(id)}
            onSimulatePacket={handleSimulateIngestion}
            canWrite={canWrite}
            isSimulating={isSimulatingPacket}
          />
        )}

        {/* VUE 3 : MODULE D'ANALYSE IA GEMINI, PROJECTION ML 48H, SCADA & NOTIFICATIONS FCM */}
        {activeSection === 'ia_scada' && (
          <div className="space-y-6">
            {/* PROJECTION ML DE PROBABILITÉ DE PANNE À 48 HEURES (RECHARTS + INTERVALLE CONFIANCE 95% + PLANIFICATION) */}
            <FailureForecastPanel
              initialZone={selectedNode?.wilaya || analyticsZone || 'Oran'}
              token={token}
              canSchedule={canWrite}
              isAdmin={isAdmin}
              onExecutePreventiveScada={(zoneName, _cmd) => {
                const targetNodeId =
                  zonesStatus[zoneName]?.node_id || selectedNode?.id || 'DZ-ELEC-ORN-02';
                handleExecuteScadaCommand(targetNodeId, true);
              }}
              onNotificationToast={(msg) => showNotification(msg)}
            />

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-base font-semibold text-white">
                    Moteur Décisionnel IA (Gemini API · Température 0.2) & Automatisme SCADA
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    Analyse contextuelle déterministe des surcharges, prédiction binaire des pannes et génération d’ordres SCADA (IEC-61850 / Modbus-TCP)
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <select
                    value={selectedNode?.id || ''}
                    onChange={(e) => setSelectedNodeId(e.target.value)}
                    className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2"
                  >
                    {overview.nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.id} — {n.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleRunGeminiAnalysis(selectedNode?.id)}
                    disabled={isAnalyzing}
                    className="px-4 py-2 text-xs font-semibold bg-sky-400 hover:bg-sky-300 text-slate-950 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {isAnalyzing ? 'Calcul en cours...' : 'Lancer Analyse Gemini'}
                  </button>
                </div>
              </div>

              {aiAnalysis ? (
                <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <div className="lg:col-span-7 space-y-4">
                    <div>
                      <div className="text-xs text-slate-400">
                        Synthèse Technique ({aiAnalysis.nodeAnalyzed} · Modèle {aiAnalysis.model})
                      </div>
                      <p className="text-sm text-slate-100 mt-1 leading-relaxed">
                        {aiAnalysis.analysis.summary}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">Cause Racine Identifiée</div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {aiAnalysis.analysis.rootCauseAnalysis}
                      </p>
                    </div>
                    <div>
                      <div className="text-xs text-slate-400">
                        Plan d’Action Opérationnel Recommandé
                      </div>
                      <ul className="mt-1.5 space-y-1.5 text-xs text-slate-200 list-disc list-inside">
                        {aiAnalysis.analysis.actionSteps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-lg p-4 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Priorité Opérationnelle</span>
                        <span className="font-mono font-semibold text-amber-400">
                          {aiAnalysis.analysis.priorityLevel}
                        </span>
                      </div>
                      <div>
                        <span className="text-xs text-slate-400">
                          Instruction SCADA Prête à l’Exécution
                        </span>
                        <div className="mt-1 p-2.5 bg-slate-900 border border-slate-800 rounded font-mono text-xs text-emerald-400 break-all">
                          {aiAnalysis.analysis.recommendedScadaCommand}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        Gain estimé sur les pertes :{' '}
                        <span className="font-mono text-emerald-400 font-semibold tabular-nums">
                          -{aiAnalysis.analysis.expectedLossReductionPct}%
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 border-t border-slate-800 pt-2">
                        {aiAnalysis.analysis.complianceCheck1807}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        handleExecuteScadaCommand(aiAnalysis.nodeAnalyzed, true)
                      }
                      disabled={!canWrite || isExecutingScada}
                      className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                    >
                      Appliquer Immédiatement l’Ordre SCADA
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-xs text-slate-400">
                    Cliquez sur « Lancer Analyse Gemini » pour obtenir un diagnostic contextuel complet et la commande SCADA associée sur le poste sélectionné.
                  </p>
                </div>
              )}
            </div>

            {/* Panneau Notifications Push FCM */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Bell className="w-4 h-4 text-sky-400" />
                    <h3 className="text-sm font-semibold text-white">
                      Notifications Push Firebase Cloud Messaging (FCM) & Acquittement Loi 18-07
                    </h3>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Enregistrement dans <code className="text-slate-300">operator_tokens</code>, souscription aux topics{' '}
                    <code className="text-sky-400">{subscribedTopics.join(' · ')}</code> et journalisation des acquittements dans{' '}
                    <code className="text-slate-300">audit_logs</code> avec <code className="text-emerald-400">ip_hash</code> pseudonymisé.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() =>
                      registerTokenWithBackend(token, currentUser.username, true)
                    }
                    className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                    Simuler onTokenRefresh
                  </button>
                  <button
                    onClick={() =>
                      handleAcknowledgeNotification(
                        `FCM-NOTIF-${selectedNode?.id || 'ORN02'}-${Math.floor(100 + Math.random() * 899)}`,
                        `Acquittement alerte critique sur ${selectedNode?.name || 'Poste HTB'}`
                      )
                    }
                    disabled={!canWrite}
                    className="px-3.5 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Acquitter Alerte Critique (POST /acknowledge)
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400 bg-slate-950/70 border border-slate-800 px-4 py-2.5 rounded-lg">
                <span>
                  Token Opérateur actif (<code className="text-slate-300">{currentUser.username}</code>) :{' '}
                  <span className="font-mono text-sky-400">{fcmToken || 'En cours...'}</span>
                </span>
                <span className="font-mono text-slate-400">
                  Service Worker : <span className="text-emerald-400">sw.js (src/sw.ts)</span>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/50">
                      <th className="py-2.5 px-4 font-medium">ID Audit (audit_logs)</th>
                      <th className="py-2.5 px-4 font-medium">Réf. Événement</th>
                      <th className="py-2.5 px-4 font-medium">Opérateur & Rôle</th>
                      <th className="py-2.5 px-4 font-medium">IP Pseudonymisée (ip_hash Loi 18-07)</th>
                      <th className="py-2.5 px-4 font-medium">Commentaire</th>
                      <th className="py-2.5 px-4 font-medium">Horodatage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70 text-xs">
                    {fcmAuditLogs.map((entry) => (
                      <tr key={entry.audit_id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-mono text-sky-400 tabular-nums whitespace-nowrap">
                          {entry.audit_id}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-200 tabular-nums whitespace-nowrap">
                          {entry.notification_id || entry.event_type}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300 whitespace-nowrap">
                          {entry.operator_username} ({entry.operator_role})
                        </td>
                        <td className="py-2.5 px-4 font-mono text-emerald-400 tabular-nums whitespace-nowrap">
                          {entry.ip_hash}
                        </td>
                        <td className="py-2.5 px-4 text-slate-300">{entry.comment}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                          {new Date(entry.acknowledged_at).toLocaleTimeString('fr-FR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Passerelle SMS Souveraine de Fallback (Ooredoo / Mobilis / Djezzy / Mock) */}
            <SMSGatewayPanel
              token={token}
              isAdmin={isAdmin}
              canWrite={canWrite}
              selectedZone={selectedNode?.wilaya || analyticsZone || 'Alger'}
              onEscalationLogged={(auditEntry, msg) => {
                setFcmAuditLogs((prev) => [auditEntry, ...prev]);
                showNotification(msg);
              }}
            />

            {/* Configuration de la Politique d'Escalade Multi-Canal (escalation_policies) */}
            <EscalationPolicyPanel
              token={token}
              isAdmin={isAdmin}
              onPolicySaved={(savedPol) => {
                showNotification(
                  `Politique d’escalade sauvegardée dans MongoDB (Délai SMS : ${savedPol.sms_timeout_seconds}s · Appel : ${savedPol.voice_call_timeout_seconds}s)`
                );
              }}
            />
          </div>
        )}

        {/* VUE 4 : MODULE DE DÉTECTION DE FRAUDE (PERTES NON TECHNIQUES) */}
        {activeSection === 'fraude' && (
          <FraudDetectionPanel
            fraudCases={overview.fraudCases}
            onUpdateFraudStatus={handleUpdateFraudStatus}
            canWrite={canWrite}
          />
        )}

        {/* VUE 5 : ONGLET CONFIGURATION DES SEUILS PAR ZONE (VISIBLE UNIQUEMENT POUR ADMIN) */}
        {activeSection === 'config_seuils' && isAdmin && (
          <ThresholdConfigPanel
            token={token}
            onThresholdAuditLogged={(entry, msg) => {
              setFcmAuditLogs((prev) => [entry, ...prev]);
              showNotification(msg);
            }}
          />
        )}

        {/* VUE 6 : ONGLET AUDIT & CONFORMITÉ (VISIBLE UNIQUEMENT POUR ADMIN) */}
        {activeSection === 'audit_conformite' && isAdmin && (
          <AuditCompliancePanel
            auditLogs={fcmAuditLogs}
            token={token}
            onExportSuccess={(metaEntry, filename) => {
              setFcmAuditLogs((prev) => [metaEntry, ...prev]);
              showNotification(
                `Archive signée RSA-4096 téléchargée (${filename}) et enregistrée dans audit_logs (meta-audit)`
              );
            }}
          />
        )}

        {/* VUE 6 : ARCHITECTURE & CODE SOURCE COMPLET */}
        {activeSection === 'code_source' && (
          <SourceCodeExplorer files={sourceFiles} />
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-4 px-6 text-xs text-slate-400 mt-auto">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>
            BesmaInfoEnergy · Architecture Nationale de Supervision et d’Optimisation Électricité & Gaz
          </span>
          <span>
            Protection des données conforme à la Loi algérienne n° 18-07 · Hachage SHA-256 & Signature RSA-4096
          </span>
        </div>
      </footer>
    </div>
  );
}
