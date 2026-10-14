import React from 'react';
import { GridNode, IngestionPacket } from '../types';
import { Radio, RefreshCw, AlertOctagon, CheckCircle } from 'lucide-react';

interface TelemetryIngestionPanelProps {
  packets: IngestionPacket[];
  nodes: GridNode[];
  selectedNodeId: string;
  onSelectNode: (id: string) => void;
  onSimulatePacket: (nodeId: string, mode: 'OVERLOAD' | 'NORMALIZE') => void;
  canWrite: boolean;
  isSimulating: boolean;
}

export const TelemetryIngestionPanel: React.FC<TelemetryIngestionPanelProps> = ({
  packets,
  nodes,
  selectedNodeId,
  onSelectNode,
  onSimulatePacket,
  canWrite,
  isSimulating,
}) => {
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) || nodes[0];

  return (
    <div className="space-y-6">
      {/* Barre d'outils de simulation d'ingestion MQTT / Kafka */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Pipeline d’Ingestion Temps Réel (MQTT v5.0 & Apache Kafka)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Validation de schéma Pydantic, hachage cryptographique SHA-256 à la source (Loi algérienne n° 18-07) et classification ML en continu
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="ingestion-node-select" className="sr-only">
            Sélectionner le nœud capteur pour ingestion
          </label>
          <select
            id="ingestion-node-select"
            name="ingestion_node_id"
            aria-label="Sélectionner le nœud capteur pour ingestion"
            value={selectedNode?.id || ''}
            onChange={(e) => onSelectNode(e.target.value)}
            className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-sky-500"
          >
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.id} — {node.wilaya} ({node.type === 'ELECTRICITY' ? 'Élec' : 'Gaz'})
              </option>
            ))}
          </select>

          <button
            onClick={() => selectedNode && onSimulatePacket(selectedNode.id, 'OVERLOAD')}
            disabled={!canWrite || isSimulating}
            className="px-3.5 py-2 text-xs font-medium bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            Injecter Surcharge / Chute Pression
          </button>

          <button
            onClick={() => selectedNode && onSimulatePacket(selectedNode.id, 'NORMALIZE')}
            disabled={!canWrite || isSimulating}
            className="px-3.5 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-3.5 h-3.5" />
            Injecter Trame Nominale
          </button>
        </div>
      </div>

      {/* Tableau haute densité des trames ingérées */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Flux Télémétrique Entrant (Dernières trames MQTT / Kafka validées)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono tabular-nums">
            Rafraîchissement continu : 5s · Anonymisation : DZ1807-SHA256
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/50">
                <th className="py-3 px-4 font-medium">ID Trame</th>
                <th className="py-3 px-4 font-medium">Horodatage</th>
                <th className="py-3 px-4 font-medium">Protocole & Topic</th>
                <th className="py-3 px-4 font-medium">Poste / Wilaya</th>
                <th className="py-3 px-4 font-medium text-right">Mesure Principale</th>
                <th className="py-3 px-4 font-medium text-right">Charge / Débit</th>
                <th className="py-3 px-4 font-medium text-right">Temp.</th>
                <th className="py-3 px-4 font-medium text-right">Pertes</th>
                <th className="py-3 px-4 font-medium">Hash Compteur (Loi 18-07)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {packets.map((pkt) => (
                <tr
                  key={pkt.packetId}
                  onClick={() => onSelectNode(pkt.nodeId)}
                  className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <td className="py-2.5 px-4 font-mono text-sky-400 tabular-nums whitespace-nowrap">
                    {pkt.packetId}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                    {new Date(pkt.timestamp).toLocaleTimeString('fr-FR')}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                    {pkt.protocol} · <span className="text-slate-400">{pkt.topic}</span>
                  </td>
                  <td className="py-2.5 px-4 text-slate-200 whitespace-nowrap">
                    {pkt.nodeName} <span className="text-slate-500">·</span> {pkt.wilaya}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right text-slate-100 tabular-nums whitespace-nowrap">
                    {pkt.energyType === 'ELECTRICITY'
                      ? `${pkt.metrics.voltageKv} kV`
                      : `${pkt.metrics.pressureBar} bar`}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right text-slate-300 tabular-nums whitespace-nowrap">
                    {pkt.energyType === 'ELECTRICITY'
                      ? `${pkt.metrics.powerMw} MW (${pkt.metrics.currentAmp} A)`
                      : `${pkt.metrics.flowRateM3h?.toLocaleString('fr-FR')} m³/h`}
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right text-slate-300 tabular-nums whitespace-nowrap">
                    {pkt.metrics.temperatureC}°C
                  </td>
                  <td className="py-2.5 px-4 font-mono text-right tabular-nums whitespace-nowrap">
                    <span
                      className={
                        pkt.lossRatePct >= 15
                          ? 'text-red-400 font-semibold'
                          : pkt.lossRatePct >= 10
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }
                    >
                      {pkt.lossRatePct}%
                    </span>
                  </td>
                  <td className="py-2.5 px-4 font-mono text-slate-400 tabular-nums whitespace-nowrap">
                    {pkt.anonymizedMeterHash}
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
