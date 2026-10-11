import React from 'react';
import { FraudAnomalyCase } from '../types';
import { ShieldAlert, CheckCircle2, Send } from 'lucide-react';

interface FraudDetectionPanelProps {
  fraudCases: FraudAnomalyCase[];
  onUpdateFraudStatus: (fraudId: string, newStatus: 'INSPECTION_DISPATCHED' | 'RESOLVED_CONFIRMED') => void;
  canWrite: boolean;
}

export const FraudDetectionPanel: React.FC<FraudDetectionPanelProps> = ({
  fraudCases,
  onUpdateFraudStatus,
  canWrite,
}) => {
  const totalEstimatedMonthlyLossDzd = fraudCases.reduce(
    (acc, item) => acc + item.estimatedMonthlyLossDzd,
    0
  );

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Détection Comportementale des Pertes Non Techniques & Fraudes
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Identification par apprentissage automatique des écarts entre puissance/débit souscrit et charge physique mesurée sur départ. Identifiants pseudonymisés conformément à la Loi n° 18-07.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400">Impact Financier Mensuel Identifié</div>
          <div className="text-lg font-bold font-mono text-amber-400 tabular-nums">
            {totalEstimatedMonthlyLossDzd.toLocaleString('fr-FR')} DZD / mois
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/50">
                <th className="py-3 px-4 font-medium">Référence Dossier</th>
                <th className="py-3 px-4 font-medium">Wilaya & Commune</th>
                <th className="py-3 px-4 font-medium">Abonné (Hash Loi 18-07)</th>
                <th className="py-3 px-4 font-medium text-right">Déclaré vs Mesuré</th>
                <th className="py-3 px-4 font-medium text-right">Écart Non Facturé</th>
                <th className="py-3 px-4 font-medium text-right">Score IA</th>
                <th className="py-3 px-4 font-medium">Signature Comportementale</th>
                <th className="py-3 px-4 font-medium">État & Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {fraudCases.map((item) => (
                <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-200 tabular-nums whitespace-nowrap">
                    {item.id}
                  </td>
                  <td className="py-3 px-4 text-slate-200 whitespace-nowrap">
                    <div className="font-medium">{item.wilaya}</div>
                    <div className="text-slate-400">
                      {item.commune} · {item.sectorType}
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-sky-400 tabular-nums whitespace-nowrap">
                    {item.anonymizedSubscriberId}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-slate-200 tabular-nums whitespace-nowrap">
                    {item.declaredLoadKwOrM3} → {item.measuredLoadKwOrM3}{' '}
                    {item.energyType === 'ELECTRICITY' ? 'kW' : 'm³/h'}
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-red-400 font-semibold tabular-nums whitespace-nowrap">
                    +{item.unaccountedDeltaPct}%
                  </td>
                  <td className="py-3 px-4 font-mono text-right text-amber-400 tabular-nums whitespace-nowrap">
                    {(item.anomalyConfidenceScore * 100).toFixed(0)}%
                  </td>
                  <td className="py-3 px-4 text-slate-300 max-w-xs">
                    {item.behavioralPattern}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {item.status === 'DETECTED' && (
                        <>
                          <span className="text-red-400 flex items-center gap-1 font-medium">
                            <ShieldAlert className="w-3.5 h-3.5" />
                            Anomalie Active
                          </span>
                          {canWrite && (
                            <button
                              onClick={() => onUpdateFraudStatus(item.id, 'INSPECTION_DISPATCHED')}
                              className="ml-2 px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              Dépêcher Brigade
                            </button>
                          )}
                        </>
                      )}

                      {item.status === 'INSPECTION_DISPATCHED' && (
                        <>
                          <span className="text-amber-400 font-medium">
                            Inspection en cours
                          </span>
                          {canWrite && (
                            <button
                              onClick={() => onUpdateFraudStatus(item.id, 'RESOLVED_CONFIRMED')}
                              className="ml-2 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Clôturer & Isoler
                            </button>
                          )}
                        </>
                      )}

                      {item.status === 'RESOLVED_CONFIRMED' && (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Régularisé
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
