import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  Forecast48hResponse,
  ForecastRiskLevel,
  PreventiveInterventionTask,
  ForecastHistoryEntry,
} from '../types';
import { buildForecast48hForZone } from '../fallbackData';
import { InterventionScheduler } from './InterventionScheduler';
import { useTheme } from '../theme/ThemeProvider';
import {
  TrendingUp,
  Download,
  CalendarPlus,
  Bell,
  Zap,
  History,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

export const FORECAST_ZONES = [
  'Alger',
  'Oran',
  "Hassi R'Mel",
  'Skikda',
  'Constantine',
  'Arzew',
  'Sétif',
  'Ouargla',
] as const;

export const RISK_BADGE_STYLES: Record<
  ForecastRiskLevel,
  { badge: string; label: string; color: string }
> = {
  NORMAL: {
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    label: 'NORMAL (< 30%)',
    color: '#10B981',
  },
  INFO: {
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    label: 'INFO (30% - 50%)',
    color: '#38BDF8',
  },
  WARNING: {
    badge: 'bg-[#FFCC00]/20 text-[#FFCC00] border-[#FFCC00]/50',
    label: 'WARNING (50% - 70%)',
    color: '#FFCC00',
  },
  CRITICAL: {
    badge: 'bg-[#FF9500]/20 text-[#FF9500] border-[#FF9500]/50',
    label: 'CRITICAL (70% - 90%)',
    color: '#FF9500',
  },
  EMERGENCY: {
    badge: 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/50 animate-pulse font-bold',
    label: 'EMERGENCY (> 90%)',
    color: '#FF3B30',
  },
};

export function prepareChartDataFromForecast(forecast: Forecast48hResponse) {
  const past = forecast.past_points || [];
  const combined = [...past, ...forecast.points];

  return combined.map((pt) => {
    const label =
      pt.hour_offset === 0
        ? 'Maintenant'
        : pt.hour_offset < 0
        ? `${pt.hour_offset}h`
        : `+${pt.hour_offset}h`;

    return {
      ...pt,
      label,
      probPct: Number((pt.probability * 100).toFixed(1)),
      lowerPct: Number((pt.lower_bound * 100).toFixed(1)),
      upperPct: Number((pt.upper_bound * 100).toFixed(1)),
      confidenceBand: [
        Number((pt.lower_bound * 100).toFixed(1)),
        Number((pt.upper_bound * 100).toFixed(1)),
      ],
    };
  });
}

interface FailureForecastPanelProps {
  initialZone?: string;
  token: string;
  canSchedule: boolean;
  isAdmin: boolean;
  onExecutePreventiveScada?: (zone: string, command: string) => void;
  onNotificationToast?: (msg: string) => void;
}

export const FailureForecastPanel: React.FC<FailureForecastPanelProps> = ({
  initialZone = 'Oran',
  token,
  canSchedule,
  isAdmin,
  onExecutePreventiveScada,
  onNotificationToast,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>(initialZone);
  const [forecast, setForecast] = useState<Forecast48hResponse>(() =>
    buildForecast48hForZone(initialZone, 48)
  );
  const [forecastHistory, setForecastHistory] = useState<ForecastHistoryEntry[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<PreventiveInterventionTask[]>([
    {
      intervention_id: 'INT-ORN-1001',
      collection: 'interventions',
      zone: 'Oran',
      scheduled_at: '2026-10-12T03:00:00Z',
      priority: 'critical',
      notes: 'Inspection préventive jeu de barres 400kV Es Senia avant pic thermique prévu à +14h',
      assigned_operator: 'Ing. Karim Mansouri (Brigade 400kV Es Senia)',
      created_by: 'admin',
      created_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      status: 'SCHEDULED',
      fcm_notification_id: 'FCM-INT-842',
      law_18_07_compliant: true,
    },
  ]);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const { chartTokens } = useTheme();

  const fetchForecastAndHistory = useCallback(
    async (zoneName: string) => {
      try {
        const res = await fetch(
          `/api/v1/forecast/${encodeURIComponent(zoneName.toLowerCase())}?hours=48`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = (await res.json()) as Forecast48hResponse;
          if (Array.isArray(data.points) && data.points.length > 0) {
            setForecast(data);
          }
        } else {
          setForecast(buildForecast48hForZone(zoneName, 48));
        }
      } catch {
        setForecast(buildForecast48hForZone(zoneName, 48));
      }

      if (isAdmin) {
        try {
          const hRes = await fetch(
            `/api/v1/forecast/${encodeURIComponent(zoneName.toLowerCase())}/history`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
          const hCt = hRes.headers.get('content-type') || '';
          if (hRes.ok && hCt.includes('application/json')) {
            const hData = await hRes.json();
            if (Array.isArray(hData.history)) {
              setForecastHistory(hData.history);
              return;
            }
          }
        } catch {
          // Fallback local
        }
      }

      const fallbackFc = buildForecast48hForZone(zoneName, 48);
      setForecastHistory([
        {
          forecast_id: `FCST-${zoneName.slice(0, 3).toUpperCase()}-NOW`,
          zone: zoneName,
          generated_at: fallbackFc.generated_at,
          peak_probability: fallbackFc.peak_probability,
          peak_timestamp: fallbackFc.peak_timestamp,
          risk_level: fallbackFc.risk_level,
          model_accuracy_pct: 95.1,
        },
        {
          forecast_id: `FCST-${zoneName.slice(0, 3).toUpperCase()}-J1`,
          zone: zoneName,
          generated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
          peak_probability: Number(Math.max(0.12, fallbackFc.peak_probability - 0.08).toFixed(2)),
          risk_level: fallbackFc.risk_level,
          model_accuracy_pct: 94.4,
        },
        {
          forecast_id: `FCST-${zoneName.slice(0, 3).toUpperCase()}-J2`,
          zone: zoneName,
          generated_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
          peak_probability: Number(Math.max(0.1, fallbackFc.peak_probability - 0.14).toFixed(2)),
          risk_level: 'WARNING',
          model_accuracy_pct: 93.9,
        },
      ]);
    },
    [token, isAdmin]
  );

  useEffect(() => {
    fetchForecastAndHistory(selectedZone);
  }, [selectedZone, fetchForecastAndHistory]);

  const chartData = prepareChartDataFromForecast(forecast);
  const riskMeta =
    RISK_BADGE_STYLES[forecast.risk_level] || RISK_BADGE_STYLES.WARNING;

  const handleExportPng = () => {
    if (!chartContainerRef.current) return;
    const svgElement = chartContainerRef.current.querySelector('svg');
    if (!svgElement) return;

    setIsExportingPng(true);
    try {
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgElement);
      const svgBlob = new Blob([svgString], {
        type: 'image/svg+xml;charset=utf-8',
      });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = svgElement.clientWidth || 1050;
        canvas.height = svgElement.clientHeight || 400;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `besma_projection_48h_${selectedZone.toLowerCase()}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
        URL.revokeObjectURL(url);
        setIsExportingPng(false);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setIsExportingPng(false);
      };
      img.src = url;
    } catch {
      setIsExportingPng(false);
    }
  };

  const CustomForecastTooltip = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const pt = payload[0].payload;
    const st =
      RISK_BADGE_STYLES[pt.risk_level as ForecastRiskLevel] ||
      RISK_BADGE_STYLES.NORMAL;

    return (
      <div className="bg-slate-950/95 border border-slate-700 rounded-lg p-3 shadow-xl text-xs space-y-1.5">
        <div className="font-mono font-semibold text-white border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
          <span>
            {pt.label} ({pt.timestamp.slice(0, 16).replace('T', ' ')} UTC)
          </span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${st.badge}`}>
            {pt.risk_level}
          </span>
        </div>
        <div className="font-mono flex items-center justify-between gap-4">
          <span className="text-red-400">Probabilité de panne projetée :</span>
          <span className="text-white font-bold">{pt.probPct}%</span>
        </div>
        <div className="font-mono flex items-center justify-between gap-4 text-slate-400">
          <span>Intervalle de confiance 95 % :</span>
          <span>
            [{pt.lowerPct}% – {pt.upperPct}%]
          </span>
        </div>
        <div className="text-[11px] text-slate-300 border-t border-slate-800 pt-1">
          Action : {forecast.recommended_action}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        {/* En-tête & Sélecteur des 8 zones */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-red-400" />
              <h2 className="text-base font-bold text-white">
                Projection ML de Probabilité de Panne à 48 Heures — Zone{' '}
                <span className="text-sky-400">{selectedZone}</span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Modèle prédictif réentraîné toutes les 24h sur 30 jours d’historique (
              <code className="text-slate-300">{forecast.model_path}</code>) · Intervalle de
              confiance à 95 % et déclenchement préventif FCM (&gt; 70%) / SCADA (&gt; 90%).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportPng}
              disabled={isExportingPng}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-sky-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              {isExportingPng ? 'Export PNG...' : 'Exporter PNG'}
            </button>
          </div>
        </div>

        {/* Barre de sélection des 8 zones */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FORECAST_ZONES.map((z) => (
              <button
                key={z}
                onClick={() => setSelectedZone(z)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                  selectedZone.toLowerCase() === z.toLowerCase()
                    ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {z}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
            <span className="flex items-center gap-1 text-sky-300">
              <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> 30% INFO
            </span>
            <span className="flex items-center gap-1 text-yellow-300">
              <span className="w-2.5 h-0.5 bg-yellow-400 inline-block" /> 50% WARNING
            </span>
            <span className="flex items-center gap-1 text-orange-400">
              <span className="w-2.5 h-0.5 bg-orange-500 inline-block" /> 70% CRITICAL (FCM)
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-2.5 h-0.5 bg-red-500 inline-block" /> 90% EMERGENCY (SCADA)
            </span>
          </div>
        </div>

        {/* Grille : Graphique Recharts (8 col) + Panneau latéral de décision & planification (4 col) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div
            ref={chartContainerRef}
            className="lg:col-span-8 h-[380px] bg-slate-950/90 border border-slate-800 rounded-xl p-3"
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 18, right: 24, left: 6, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.gridStroke} />
                <XAxis
                  dataKey="label"
                  stroke={chartTokens.axisStroke}
                  tick={{ fontSize: 11, fill: chartTokens.tickFill }}
                  minTickGap={18}
                />
                <YAxis
                  domain={[0, 100]}
                  stroke={chartTokens.axisStroke}
                  tick={{ fontSize: 11, fill: chartTokens.tickFill }}
                  unit="%"
                />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />

                {/* Bande grise : Intervalle de confiance 95 % */}
                <Area
                  type="monotone"
                  dataKey="confidenceBand"
                  name="Intervalle de confiance 95 %"
                  fill="#64748B"
                  fillOpacity={0.28}
                  stroke="#94A3B8"
                  strokeOpacity={0.35}
                  strokeDasharray="2 2"
                  isAnimationActive={false}
                />

                {/* 4 Lignes horizontales de seuils ISA-101 : 30% (info), 50% (warning #FFCC00), 70% (critical #FF9500), 90% (emergency #FF3B30) */}
                <ReferenceLine
                  y={30}
                  stroke="#38BDF8"
                  strokeDasharray="4 4"
                  strokeWidth={1.4}
                  label={{
                    value: '30% (INFO)',
                    fill: '#38BDF8',
                    fontSize: 10,
                    position: 'insideTopLeft',
                  }}
                />
                <ReferenceLine
                  y={50}
                  stroke="#FFCC00"
                  strokeDasharray="5 4"
                  strokeWidth={1.6}
                  label={{
                    value: '50% (WARNING)',
                    fill: '#FFCC00',
                    fontSize: 10,
                    position: 'insideTopLeft',
                  }}
                />
                <ReferenceLine
                  y={70}
                  stroke="#FF9500"
                  strokeDasharray="6 3"
                  strokeWidth={1.9}
                  label={{
                    value: '70% (CRITICAL · Alerte FCM)',
                    fill: '#FF9500',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />
                <ReferenceLine
                  y={90}
                  stroke="#FF3B30"
                  strokeWidth={2.1}
                  label={{
                    value: '90% (EMERGENCY · SCADA Préventif)',
                    fill: '#FF3B30',
                    fontSize: 10,
                    position: 'insideTopRight',
                  }}
                />

                {/* Ligne verticale "Maintenant" séparant le passé (-6h..0h) du futur (+1h..+48h) */}
                <ReferenceLine
                  x="Maintenant"
                  stroke="#E0E0E0"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  label={{
                    value: 'Maintenant',
                    fill: '#E0E0E0',
                    fontSize: 11,
                    position: 'top',
                  }}
                />

                {/* Ligne principale : Probabilité projetée (courbe rouge ISA-101 #FF3B30) */}
                <Line
                  type="monotone"
                  dataKey="probPct"
                  name="Probabilité de panne projetée (%)"
                  stroke="#FF3B30"
                  strokeWidth={2.6}
                  dot={(props: any) => {
                    const { cx, cy, payload } = props;
                    if (
                      payload.timestamp === forecast.peak_timestamp &&
                      !payload.is_past
                    ) {
                      return (
                        <circle
                          key={`peak-${props.index}`}
                          cx={cx}
                          cy={cy}
                          r={6}
                          fill="#EF4444"
                          stroke="#FFFFFF"
                          strokeWidth={2}
                        />
                      );
                    }
                    return <g key={`dot-${props.index}`} />;
                  }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Panneau latéral : Pic de probabilité, Niveau de risque, Action recommandée & Planification */}
          <div className="lg:col-span-4 bg-slate-950 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-4 text-xs">
            <div className="space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <span className="text-slate-400 font-medium">Niveau de Risque 48h</span>
                <span
                  className={`px-2.5 py-1 rounded font-mono font-bold text-xs border ${riskMeta.badge}`}
                >
                  {forecast.risk_level}
                </span>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3 space-y-1">
                <span className="text-slate-400 block">
                  Pic de Probabilité Projeté (Max 48h)
                </span>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono text-red-400 tabular-nums">
                    {(forecast.peak_probability * 100).toFixed(0)}%
                  </span>
                  <span className="font-mono text-slate-300">
                    {forecast.peak_timestamp.slice(0, 16).replace('T', ' ')} UTC
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-slate-400 font-medium">Action Recommandée :</span>
                <p className="text-slate-200 bg-slate-900 border border-slate-800 rounded-lg p-2.5 leading-relaxed">
                  {forecast.recommended_action}
                </p>
              </div>

              {/* Notification FCM préventive déclenchée automatiquement si peak > 70% */}
              {forecast.fcm_alert_sent && (
                <div className="bg-orange-950/30 border border-orange-500/40 rounded-lg p-2.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-orange-300 font-semibold">
                    <Bell className="w-3.5 h-3.5 shrink-0" />
                    <span>Notification FCM Préventive Envoyée (&gt; 70%)</span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-200">
                    {forecast.fcm_alert_sent.title}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    Topics : {forecast.fcm_alert_sent.topics_broadcasted.join(' · ')}
                  </div>
                </div>
              )}

              {/* Proposition d'ordre SCADA préventif si peak > 90% */}
              {forecast.preventive_scada_order && (
                <div className="bg-red-950/35 border border-red-500/40 rounded-lg p-2.5 space-y-2">
                  <div className="flex items-center gap-1.5 text-red-300 font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Ordre SCADA Préventif Proposé (&gt; 90%)</span>
                  </div>
                  <div className="font-mono text-[11px] text-emerald-400 bg-slate-950 p-2 rounded border border-slate-800 break-all">
                    {forecast.preventive_scada_order}
                  </div>
                  {onExecutePreventiveScada && (
                    <button
                      onClick={() =>
                        onExecutePreventiveScada(
                          selectedZone,
                          forecast.preventive_scada_order!
                        )
                      }
                      disabled={!canSchedule}
                      className="w-full py-1.5 px-3 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-md flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Exécuter l’Ordre SCADA Préventif
                    </button>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canSchedule}
              className="w-full py-2.5 px-4 bg-sky-400 hover:bg-sky-300 disabled:opacity-40 text-slate-950 font-bold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
            >
              <CalendarPlus className="w-4 h-4" />
              Planifier une intervention
            </button>
          </div>
        </div>
      </div>

      {/* Grille inférieure : Interventions Préventives Planifiées & Historique Comparatif des Projections */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Interventions Préventives Planifiées (Collection MongoDB{' '}
            <code className="text-sky-400">interventions</code>)
          </h3>
          <div className="space-y-2.5 max-h-56 overflow-y-auto">
            {scheduledTasks.map((task) => (
              <div
                key={task.intervention_id}
                className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-sky-400">
                    {task.intervention_id} · Zone {task.zone}
                  </span>
                  <span className="uppercase font-mono text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Priorité : {task.priority}
                  </span>
                </div>
                <div className="text-slate-200">{task.notes}</div>
                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                  <span>Assigné : {task.assigned_operator}</span>
                  <span>Échéance : {task.scheduled_at.slice(0, 16).replace('T', ' ')} UTC</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 border-b border-slate-800 pb-3">
            <History className="w-4 h-4 text-sky-400" />
            Historique Comparatif des Projections Passées (
            <code className="text-sky-400">/api/v1/forecast/{selectedZone.toLowerCase()}/history</code>)
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
                  <th className="py-2 px-3">ID Projection</th>
                  <th className="py-2 px-3">Générée le</th>
                  <th className="py-2 px-3 text-right">Pic Projeté</th>
                  <th className="py-2 px-3 text-center">Niveau</th>
                  <th className="py-2 px-3 text-right">Fiabilité Modèle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {forecastHistory.map((h) => (
                  <tr key={h.forecast_id} className="hover:bg-slate-800/40">
                    <td className="py-2 px-3 text-sky-400">{h.forecast_id}</td>
                    <td className="py-2 px-3 text-slate-300">
                      {h.generated_at.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-2 px-3 text-right text-white font-semibold">
                      {(h.peak_probability * 100).toFixed(0)}%
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] border ${
                          (RISK_BADGE_STYLES[h.risk_level] || RISK_BADGE_STYLES.WARNING)
                            .badge
                        }`}
                      >
                        {h.risk_level}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-400">
                      {h.model_accuracy_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Fenêtre modale de planification d'intervention préventive */}
      <InterventionScheduler
        isOpen={isModalOpen}
        zone={selectedZone}
        defaultScheduledAt={forecast.peak_timestamp}
        defaultPriority={
          forecast.peak_probability > 0.9
            ? 'critical'
            : forecast.peak_probability >= 0.7
            ? 'high'
            : 'medium'
        }
        token={token}
        onClose={() => setIsModalOpen(false)}
        onInterventionCreated={(newTask) => {
          setScheduledTasks((prev) => [newTask, ...prev]);
          if (onNotificationToast) {
            onNotificationToast(
              `Intervention ${newTask.intervention_id} planifiée pour ${newTask.assigned_operator} et notification FCM envoyée.`
            );
          }
        }}
      />
    </div>
  );
};
