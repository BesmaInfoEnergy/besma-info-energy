import React, { useState } from 'react';
import { AnalyticsAnomalyItem, SeverityStatus } from '../types';
import { Clock, ShieldAlert, Zap, Terminal } from 'lucide-react';

export const SEVERITY_STYLES: Record<
  SeverityStatus,
  { badge: string; border: string; dot: string; label: string; hexColor: string }
> = {
  emergency: {
    badge: 'bg-[#FF3B30]/20 text-[#FF3B30] border-[#FF3B30]/50 animate-pulse font-bold',
    border: 'border-[#FF3B30]/60 bg-[#FF3B30]/10',
    dot: 'bg-[#FF3B30] animate-pulse',
    hexColor: '#FF3B30',
    label: 'URGENCE (AUTO-SCADA)',
  },
  critical: {
    badge: 'bg-[#FF9500]/20 text-[#FF9500] border-[#FF9500]/50 font-semibold',
    border: 'border-[#FF9500]/50 bg-[#FF9500]/10',
    dot: 'bg-[#FF9500]',
    hexColor: '#FF9500',
    label: 'CRITICAL (SEUIL FRANCHI)',
  },
  warning: {
    badge: 'bg-[#FFCC00]/20 text-[#FFCC00] border-[#FFCC00]/50',
    border: 'border-[#FFCC00]/40 bg-[#FFCC00]/10',
    dot: 'bg-[#FFCC00]',
    hexColor: '#FFCC00',
    label: 'WARNING (PRÉ-ALERTE / 3σ)',
  },
  normal: {
    badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    border: 'border-slate-800 bg-slate-950',
    dot: 'bg-emerald-500',
    hexColor: '#10B981',
    label: 'NORMAL',
  },
};

interface AnomalyTimelineProps {
  zone: string;
  anomalies: AnalyticsAnomalyItem[];
  onExecuteScadaFromAnomaly?: (anomaly: AnalyticsAnomalyItem) => void;
  canWrite?: boolean;
}

export const AnomalyTimeline: React.FC<AnomalyTimelineProps> = ({
  zone,
  anomalies,
  onExecuteScadaFromAnomaly,
  canWrite = false,
}) => {
  const [selectedAnomalyId, setSelectedAnomalyId] = useState<string | null>(
    anomalies[0]?.id || null
  );

  const selectedAnomaly =
    anomalies.find((a) => a.id === selectedAnomalyId) || anomalies[0] || null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white">
              Frise Chronologique des Anomalies 24h (Dépassements de Seuil &amp; Pics &gt; 3σ) —{' '}
              <span className="text-sky-400">{zone}</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cliquez sur un événement de la frise pour inspecter la valeur mesurée, l’écart-type (Z-Score) et l’ordre SCADA associé.
          </p>
        </div>

        <span className="text-xs font-mono text-slate-300 bg-slate-950 border border-slate-800 px-3 py-1 rounded-lg">
          {anomalies.length} événements détectés sur 24h
        </span>
      </div>

      {anomalies.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          Aucune anomalie détectée sur les dernières 24 heures pour la zone {zone}.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Frise chronologique horizontale / liste séquentielle interactive */}
          <div className="lg:col-span-7 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {anomalies.map((item) => {
              const st = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.warning;
              const isSelected = selectedAnomaly?.id === item.id;
              const timeStr = item.timestamp.slice(11, 16);

              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedAnomalyId(item.id)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? `${st.border} ring-1 ring-sky-400`
                      : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${st.dot}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-bold text-white">
                          {timeStr} UTC
                        </span>
                        <span
                          className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded border ${st.badge}`}
                        >
                          {item.classification}
                        </span>
                        <span className="font-mono text-sky-400">
                          [{item.metric}]
                        </span>
                      </div>
                      <div className="text-xs text-slate-300 truncate mt-1">
                        {item.description}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono text-xs shrink-0">
                    <div className="text-white font-bold">
                      {item.value} {item.unit}
                    </div>
                    <div className="text-[11px] text-slate-400">z={item.z_score}σ</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Panneau de détail de l'anomalie sélectionnée & Action SCADA déclenchée */}
          {selectedAnomaly && (
            <div className="lg:col-span-5 bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3.5 text-xs">
              <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
                <div>
                  <div className="font-mono text-sky-400 text-[11px]">
                    ID Événement : {selectedAnomaly.id}
                  </div>
                  <h3 className="text-sm font-bold text-white mt-0.5">
                    Détail de l’Anomalie &amp; Réponse SCADA ({selectedAnomaly.zone})
                  </h3>
                </div>
                <span
                  className={`px-2.5 py-1 rounded font-mono text-[10px] font-bold uppercase border ${
                    (SEVERITY_STYLES[selectedAnomaly.severity] || SEVERITY_STYLES.warning)
                      .badge
                  }`}
                >
                  {selectedAnomaly.severity}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono">
                <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">
                    Valeur Mesurée
                  </span>
                  <span className="text-sm font-bold text-white">
                    {selectedAnomaly.value} {selectedAnomaly.unit}
                  </span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
                  <span className="text-slate-400 block text-[11px]">
                    Seuil Franchi / Écart-Type
                  </span>
                  <span className="text-sm font-bold text-amber-300">
                    {selectedAnomaly.threshold_crossed !== null
                      ? `${selectedAnomaly.threshold_crossed} ${selectedAnomaly.unit}`
                      : 'Statistique'}{' '}
                    ({selectedAnomaly.z_score}σ)
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-400 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Action SCADA Déclenchée / Recommandée :</span>
                </div>
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-lg font-mono text-emerald-400 break-all">
                  {selectedAnomaly.scada_action_triggered}
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>Horodatage : {selectedAnomaly.timestamp}</span>
                <span>Classification : {selectedAnomaly.classification}</span>
              </div>

              {onExecuteScadaFromAnomaly && (
                <button
                  onClick={() => onExecuteScadaFromAnomaly(selectedAnomaly)}
                  disabled={!canWrite}
                  className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Confirmer / Ré-appliquer l’Ordre SCADA sur {selectedAnomaly.zone}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
