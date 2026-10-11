import React from 'react';
import { GridNode } from '../types';
import { Zap, Flame, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';

interface NationalGridMapProps {
  nodes: GridNode[];
  selectedNodeId: string;
  onSelectNode: (nodeId: string) => void;
  energyFilter: 'ALL' | 'ELECTRICITY' | 'GAS';
}

export const NationalGridMap: React.FC<NationalGridMapProps> = ({
  nodes,
  selectedNodeId,
  onSelectNode,
  energyFilter,
}) => {
  const filteredNodes = nodes.filter(
    (n) => energyFilter === 'ALL' || n.type === energyFilter
  );

  // Liaisons de transport haute tension (400kV/220kV) et gazoducs principaux (GK1/GP1Z)
  const transmissionLinks = [
    { from: 'DZ-ELEC-ORN-02', to: 'DZ-ELEC-ALG-01', type: 'ELECTRICITY', label: 'Interconnexion Ouest-Centre 400kV' },
    { from: 'DZ-ELEC-ALG-01', to: 'DZ-ELEC-STF-01', type: 'ELECTRICITY', label: 'Dorsale Nord 220kV' },
    { from: 'DZ-ELEC-STF-01', to: 'DZ-ELEC-CST-01', type: 'ELECTRICITY', label: 'Artère Est 220kV' },
    { from: 'DZ-ELEC-STF-01', to: 'DZ-ELEC-OUR-01', type: 'ELECTRICITY', label: 'Liaison Nord-Sud HTB' },
    { from: 'DZ-GAS-HRM-01', to: 'DZ-GAS-ARZ-02', type: 'GAS', label: 'Gazoduc GZ1 Hassi R’Mel -> Arzew' },
    { from: 'DZ-GAS-HRM-01', to: 'DZ-GAS-SKD-01', type: 'GAS', label: 'Gazoduc GK1 Hassi R’Mel -> Skikda' },
  ];

  const getNodeById = (id: string) => nodes.find((n) => n.id === id);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Synoptique Topologique National (Électricité HTB & Gazoducs)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cliquez sur un poste ou terminal gazier pour inspecter la télémétrie et déclencher une régulation SCADA
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-300">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Nominal
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Surveillance
          </span>
          <span className="text-slate-600">·</span>
          <span className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            Critique
          </span>
        </div>
      </div>

      {/* Canevas SVG du Réseau Algérien */}
      <div className="relative w-full h-[360px] bg-slate-950 border border-slate-800/80 rounded-lg overflow-hidden">
        <svg
          viewBox="0 0 100 75"
          className="w-full h-full preserve-3d"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <pattern id="scadaGrid" width="5" height="5" patternUnits="userSpaceOnUse">
              <path
                d="M 5 0 L 0 0 0 5"
                fill="none"
                stroke="rgba(148, 163, 184, 0.06)"
                strokeWidth="0.2"
              />
            </pattern>
          </defs>

          {/* Grille de fond d'ingénierie SCADA */}
          <rect width="100" height="75" fill="url(#scadaGrid)" />

          {/* Contour stylisé du territoire national algérien (Nord littoral -> Hauts Plateaux -> Grand Sud) */}
          <path
            d="M 14,22 L 32,16 L 48,13 L 66,13 L 79,14 L 83,28 L 76,45 L 72,66 L 44,70 L 18,58 L 12,38 Z"
            fill="rgba(30, 41, 59, 0.45)"
            stroke="rgba(71, 85, 105, 0.5)"
            strokeWidth="0.4"
          />

          {/* Zones géographiques indicatives */}
          <text x="16" y="10" fill="rgba(148, 163, 184, 0.4)" fontSize="2.3" fontFamily="JetBrains Mono">
            MER MÉDITERRANÉE
          </text>
          <text x="20" y="64" fill="rgba(148, 163, 184, 0.35)" fontSize="2.2" fontFamily="JetBrains Mono">
            GRAND SUD / PÔLE ÉNERGÉTIQUE SAHARIEN
          </text>

          {/* Artères de transport (Électricité & Gaz) */}
          {transmissionLinks.map((link, idx) => {
            if (energyFilter !== 'ALL' && link.type !== energyFilter) return null;
            const source = getNodeById(link.from);
            const target = getNodeById(link.to);
            if (!source || !target) return null;

            const isElec = link.type === 'ELECTRICITY';
            const hasAlert = source.status === 'CRITICAL' || target.status === 'CRITICAL';

            return (
              <g key={idx}>
                <line
                  x1={source.coordinates.x}
                  y1={source.coordinates.y}
                  x2={target.coordinates.x}
                  y2={target.coordinates.y}
                  stroke={
                    hasAlert
                      ? '#EF4444'
                      : isElec
                      ? '#38BDF8'
                      : '#F59E0B'
                  }
                  strokeWidth={hasAlert ? '0.75' : '0.5'}
                  strokeDasharray={isElec ? 'none' : '1.5, 1'}
                  opacity="0.75"
                />
              </g>
            );
          })}

          {/* Noeuds Capteurs / Postes HTB / Stations de Compression */}
          {filteredNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const strokeColor =
              node.status === 'CRITICAL'
                ? '#EF4444'
                : node.status === 'WARNING'
                ? '#F59E0B'
                : '#10B981';

            return (
              <g
                key={node.id}
                onClick={() => onSelectNode(node.id)}
                className="cursor-pointer"
              >
                {isSelected && (
                  <circle
                    cx={node.coordinates.x}
                    cy={node.coordinates.y}
                    r="4.2"
                    fill="none"
                    stroke="#38BDF8"
                    strokeWidth="0.45"
                    strokeDasharray="1,0.8"
                  />
                )}

                <circle
                  cx={node.coordinates.x}
                  cy={node.coordinates.y}
                  r={isSelected ? '2.5' : '2.0'}
                  fill="#0F172A"
                  stroke={strokeColor}
                  strokeWidth="0.8"
                />

                <text
                  x={node.coordinates.x}
                  y={node.coordinates.y - 3.4}
                  textAnchor="middle"
                  fill={isSelected ? '#F8FAFC' : '#CBD5E1'}
                  fontSize="2.2"
                  fontWeight={isSelected ? '700' : '500'}
                >
                  {node.wilaya}
                </text>

                <text
                  x={node.coordinates.x}
                  y={node.coordinates.y + 4.8}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="1.8"
                  fontFamily="JetBrains Mono"
                >
                  {node.type === 'ELECTRICITY'
                    ? `${node.voltageKv}kV · ${(node.failureProbability * 100).toFixed(0)}%`
                    : `${node.pressureBar}bar · ${(node.failureProbability * 100).toFixed(0)}%`}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Légende technique en bas à droite de la carte */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-md text-xs text-slate-300">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-sky-400" />
              Ligne continue : Transport Électrique HTB (220/400kV)
            </span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              Pointillés : Gazoducs Nationaux (70 bar)
            </span>
          </div>
          <span className="font-mono text-slate-400 tabular-nums">
            {filteredNodes.length} postes actifs affichés
          </span>
        </div>
      </div>
    </div>
  );
};
