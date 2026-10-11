import React, { useState, useRef } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Brush,
} from 'recharts';
import {
  AnalyticsAlignedRow,
  MetricThresholdSummary,
  SeverityStatus,
} from '../types';
import { useTheme } from '../theme/ThemeProvider';
import { Download, Filter, TrendingUp, AlertTriangle } from 'lucide-react';

export type TrendMetricOption =
  | 'voltage'
  | 'power'
  | 'transformer_temp'
  | 'gas_pressure';

export const TREND_METRIC_CONFIG: Record<
  TrendMetricOption,
  { label: string; unit: string; color: string }
> = {
  voltage: {
    label: 'Tension HTB (voltage)',
    unit: 'kV',
    color: '#38BDF8', // Sky 400
  },
  power: {
    label: 'Puissance Active (power)',
    unit: 'MW',
    color: '#A78BFA', // Violet 400
  },
  transformer_temp: {
    label: 'Température Transfo (transformer_temp)',
    unit: '°C',
    color: '#F43F5E', // Rose 500
  },
  gas_pressure: {
    label: 'Pression Gazoduc (gas_pressure)',
    unit: 'bar',
    color: '#10B981', // Emerald 500
  },
};

export function filterSeriesByAnomalyFlag(
  series: AnalyticsAlignedRow[],
  onlyAnomalies: boolean
): AnalyticsAlignedRow[] {
  if (!onlyAnomalies) return series;
  return series.filter((row) => Boolean(row.hasAnomaly));
}

interface ConsumptionTrendsProps {
  zone: string;
  series: AnalyticsAlignedRow[];
  thresholds: Record<string, MetricThresholdSummary>;
  onSelectZoneChange?: (newZone: string) => void;
  availableZones?: string[];
}

export const ConsumptionTrends: React.FC<ConsumptionTrendsProps> = ({
  zone,
  series,
  thresholds,
  onSelectZoneChange,
  availableZones = [
    'Alger',
    'Oran',
    "Hassi R'Mel",
    'Skikda',
    'Constantine',
    'Arzew',
    'Sétif',
    'Ouargla',
  ],
}) => {
  const [primaryMetric, setPrimaryMetric] =
    useState<TrendMetricOption>('transformer_temp');
  const [secondaryMetric, setSecondaryMetric] = useState<
    TrendMetricOption | 'NONE'
  >('voltage');
  const [showAnomaliesOnly, setShowAnomaliesOnly] = useState<boolean>(false);
  const [isExportingPng, setIsExportingPng] = useState<boolean>(false);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const { isPureDark, chartTokens } = useTheme();

  const displayedSeries = filterSeriesByAnomalyFlag(series, showAnomaliesOnly);
  const activeThreshold = thresholds[primaryMetric];

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
        canvas.width = svgElement.clientWidth || 1100;
        canvas.height = svgElement.clientHeight || 420;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#0F172A';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const pngUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngUrl;
          a.download = `besma_tendances_24h_${zone.toLowerCase()}_${primaryMetric}.png`;
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

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const rowData: AnalyticsAlignedRow = payload[0].payload;
    const primarySev: SeverityStatus =
      rowData[`${primaryMetric}_severity`] || 'normal';
    const primaryZ: number = rowData[`${primaryMetric}_zscore`] || 0;

    return (
      <div className="bg-slate-950/95 border border-slate-700 rounded-lg p-3 shadow-xl text-xs space-y-1.5">
        <div className="font-mono font-semibold text-white border-b border-slate-800 pb-1 flex items-center justify-between gap-4">
          <span>
            {zone} · {label} UTC
          </span>
          <span
            className={`uppercase px-1.5 py-0.5 rounded text-[10px] font-bold ${
              primarySev === 'emergency'
                ? 'bg-red-500/20 text-red-400'
                : primarySev === 'critical'
                ? 'bg-orange-500/20 text-orange-400'
                : primarySev === 'warning'
                ? 'bg-yellow-500/20 text-yellow-300'
                : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {primarySev}
          </span>
        </div>

        {payload.map((entry: any) => {
          const mKey = entry.dataKey as TrendMetricOption;
          const cfg = TREND_METRIC_CONFIG[mKey];
          const sev = rowData[`${mKey}_severity`] || 'normal';
          const z = rowData[`${mKey}_zscore`] || 0;
          return (
            <div
              key={mKey}
              className="flex items-center justify-between gap-4 font-mono"
            >
              <span style={{ color: entry.color }}>{cfg?.label || mKey} :</span>
              <span className="text-white font-semibold">
                {entry.value} {cfg?.unit || ''}{' '}
                <span className="text-slate-400 text-[11px]">
                  ({sev.toUpperCase()} · z={z}σ)
                </span>
              </span>
            </div>
          );
        })}

        {activeThreshold && (
          <div className="pt-1 border-t border-slate-800 text-[11px] font-mono text-slate-400">
            Seuils {TREND_METRIC_CONFIG[primaryMetric].unit} :{' '}
            <span className="text-yellow-300">
              W={activeThreshold.warning_threshold}
            </span>{' '}
            |{' '}
            <span className="text-orange-400">
              C={activeThreshold.critical_threshold}
            </span>{' '}
            |{' '}
            <span className="text-red-400">
              E={activeThreshold.emergency_threshold}
            </span>
          </div>
        )}
        {primaryZ > 3.0 && (
          <div className="text-[11px] text-amber-300 font-mono">
            Pic statistique détecté (&gt; 3σ : z={primaryZ}σ)
          </div>
        )}
      </div>
    );
  };

  const anomalyPointsCount = series.filter((r) => r.hasAnomaly).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      {/* En-tête et contrôles */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-bold text-white">
              Historique des Tendances 24h & Franchissements de Seuils — Zone{' '}
              <span className="text-sky-400">{zone}</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Agrégation par fenêtres de 5 min (<code className="text-slate-300">$bucket</code>) ·
            Superposition temps réel des seuils{' '}
            <span className="text-yellow-300 font-medium">Warning (jaune)</span>,{' '}
            <span className="text-orange-400 font-medium">Critical (orange)</span> et{' '}
            <span className="text-red-400 font-medium">Emergency (rouge)</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onSelectZoneChange && (
            <select
              value={zone}
              onChange={(e) => onSelectZoneChange(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 font-medium"
              aria-label="Sélectionner la zone pour les courbes 24h"
            >
              {availableZones.map((z) => (
                <option key={z} value={z}>
                  Zone : {z}
                </option>
              ))}
            </select>
          )}

          <button
            onClick={() => setShowAnomaliesOnly((prev) => !prev)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer ${
              showAnomaliesOnly
                ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                : 'bg-slate-950 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Filter className="w-3.5 h-3.5 text-amber-400" />
            {showAnomaliesOnly
              ? `Afficher toutes les mesures (${series.length})`
              : `Voir les anomalies (${anomalyPointsCount})`}
          </button>

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

      {/* Sélecteur de métrique primaire (avec ses 3 seuils) et métrique secondaire de corrélation */}
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-950/70 border border-slate-800 rounded-lg p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400 font-medium">
            Métrique Principale & Seuils :
          </span>
          {(Object.keys(TREND_METRIC_CONFIG) as TrendMetricOption[]).map((m) => (
            <button
              key={m}
              onClick={() => setPrimaryMetric(m)}
              className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
                primaryMetric === m
                  ? 'bg-sky-500/20 border-sky-400 text-white font-semibold'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {TREND_METRIC_CONFIG[m].label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-slate-400">Corrélation (Axe Droit) :</span>
          <select
            value={secondaryMetric}
            onChange={(e) =>
              setSecondaryMetric(e.target.value as TrendMetricOption | 'NONE')
            }
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-slate-200"
          >
            <option value="NONE">Aucune (Courbe unique)</option>
            {(Object.keys(TREND_METRIC_CONFIG) as TrendMetricOption[])
              .filter((m) => m !== primaryMetric)
              .map((m) => (
                <option key={m} value={m}>
                  {TREND_METRIC_CONFIG[m].label}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* Résumé des seuils actifs pour la métrique principale */}
      {activeThreshold && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs px-3 py-2 bg-slate-950/50 border border-slate-800/80 rounded-lg font-mono">
          <span className="text-slate-300">
            Seuils actifs [{zone} · {primaryMetric}] (Direction :{' '}
            <strong>{activeThreshold.direction}</strong>) :
          </span>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5 text-yellow-300">
              <span className="w-3 h-0.5 bg-yellow-400 inline-block" />
              Warning : {activeThreshold.warning_threshold} {activeThreshold.unit}
            </span>
            <span className="flex items-center gap-1.5 text-orange-400">
              <span className="w-3 h-0.5 bg-orange-500 inline-block" />
              Critical : {activeThreshold.critical_threshold} {activeThreshold.unit}
            </span>
            <span className="flex items-center gap-1.5 text-red-400">
              <span className="w-3 h-0.5 bg-red-500 inline-block" />
              Emergency : {activeThreshold.emergency_threshold}{' '}
              {activeThreshold.unit}
            </span>
          </div>
        </div>
      )}

      {/* Graphique Recharts 24h avec ReferenceLine et Brush */}
      <div
        ref={chartContainerRef}
        className="w-full h-[360px] bg-slate-950/80 border border-slate-800 rounded-xl p-3"
      >
        {displayedSeries.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Aucun point anormal trouvé sur cette fenêtre. Désactivez le filtre « Voir les anomalies ».
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={displayedSeries}
              margin={{ top: 15, right: 25, left: 10, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={chartTokens.gridStroke} />
              <XAxis
                dataKey="timeLabel"
                stroke={chartTokens.axisStroke}
                tick={{ fontSize: 11, fill: chartTokens.tickFill }}
                minTickGap={24}
              />
              <YAxis
                yAxisId="left"
                stroke={TREND_METRIC_CONFIG[primaryMetric].color}
                tick={{ fontSize: 11, fill: chartTokens.tickFill }}
                domain={['auto', 'auto']}
                unit={` ${TREND_METRIC_CONFIG[primaryMetric].unit}`}
              />
              {secondaryMetric !== 'NONE' && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke={TREND_METRIC_CONFIG[secondaryMetric].color}
                  tick={{ fontSize: 11, fill: chartTokens.tickFill }}
                  domain={['auto', 'auto']}
                  unit={` ${TREND_METRIC_CONFIG[secondaryMetric].unit}`}
                />
              )}
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '6px' }} />

              {/* Superposition des 3 lignes de seuils ISA-101 (Warning #FFCC00, Critical #FF9500, Emergency #FF3B30) */}
              {activeThreshold && (
                <>
                  <ReferenceLine
                    yAxisId="left"
                    y={activeThreshold.warning_threshold}
                    stroke="#FFCC00"
                    strokeDasharray="6 4"
                    strokeWidth={1.8}
                    label={{
                      value: `Warning (${activeThreshold.warning_threshold} ${activeThreshold.unit})`,
                      fill: '#FFCC00',
                      fontSize: 10,
                      position: 'insideTopLeft',
                    }}
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={activeThreshold.critical_threshold}
                    stroke="#FF9500"
                    strokeDasharray="5 3"
                    strokeWidth={2}
                    label={{
                      value: `Critical (${activeThreshold.critical_threshold} ${activeThreshold.unit})`,
                      fill: '#FF9500',
                      fontSize: 10,
                      position: 'insideTopRight',
                    }}
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={activeThreshold.emergency_threshold}
                    stroke="#FF3B30"
                    strokeWidth={2.2}
                    label={{
                      value: `Emergency (${activeThreshold.emergency_threshold} ${activeThreshold.unit})`,
                      fill: '#FF3B30',
                      fontSize: 10,
                      position: 'insideBottomLeft',
                    }}
                  />
                </>
              )}

              <Line
                yAxisId="left"
                type="monotone"
                dataKey={primaryMetric}
                name={TREND_METRIC_CONFIG[primaryMetric].label}
                stroke={TREND_METRIC_CONFIG[primaryMetric].color}
                strokeWidth={2.4}
                dot={(props: any) => {
                  const { cx, cy, payload } = props;
                  const sev: SeverityStatus =
                    payload[`${primaryMetric}_severity`] || 'normal';
                  if (sev === 'normal') return <g key={`dot-${props.index}`} />;
                  const dotColor =
                    sev === 'emergency'
                      ? '#FF3B30'
                      : sev === 'critical'
                      ? '#FF9500'
                      : '#FFCC00';
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={cx}
                      cy={cy}
                      r={4.5}
                      fill={dotColor}
                      stroke={isPureDark ? '#121212' : '#020617'}
                      strokeWidth={1.5}
                    />
                  );
                }}
                activeDot={{ r: 6 }}
                isAnimationActive={false}
              />

              {secondaryMetric !== 'NONE' && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey={secondaryMetric}
                  name={TREND_METRIC_CONFIG[secondaryMetric].label}
                  stroke={TREND_METRIC_CONFIG[secondaryMetric].color}
                  strokeWidth={1.8}
                  strokeDasharray="4 2"
                  dot={false}
                  isAnimationActive={false}
                />
              )}

              <Brush
                dataKey="timeLabel"
                height={24}
                stroke="#38BDF8"
                fill="#0F172A"
                travellerWidth={10}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
