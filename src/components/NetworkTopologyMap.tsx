import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ZoneTopologyStatus, SeverityStatus } from '../types';
import { useTheme } from '../theme/ThemeProvider';
import { Activity, Radio } from 'lucide-react';

export const STATUS_COLORS: Record<
  SeverityStatus,
  { fill: string; stroke: string; badgeText: string; label: string }
> = {
  normal: {
    fill: '#10B981', // Vert émeraude
    stroke: '#34D399',
    badgeText: 'text-emerald-400',
    label: 'Normal',
  },
  warning: {
    fill: '#FFCC00', // Jaune ISA-101 (#FFCC00)
    stroke: '#FFE066',
    badgeText: 'text-[#FFCC00]',
    label: 'Warning (Pré-alerte)',
  },
  critical: {
    fill: '#FF9500', // Orange ISA-101 (#FF9500)
    stroke: '#FFB340',
    badgeText: 'text-[#FF9500]',
    label: 'Critical (Franchissement)',
  },
  emergency: {
    fill: '#FF3B30', // Rouge ISA-101 (#FF3B30) avec animation pulse
    stroke: '#FF6961',
    badgeText: 'text-[#FF3B30] animate-pulse font-bold',
    label: 'Emergency (Auto-SCADA)',
  },
};

export interface TopologyLink {
  source: string;
  target: string;
  corridor: string;
  kind: 'ELECTRICITY' | 'GAS';
}

export const ALGERIA_TOPOLOGY_LINKS: TopologyLink[] = [
  { source: 'Oran', target: 'Arzew', corridor: 'Boucle Ouest 400kV / GNL', kind: 'ELECTRICITY' },
  { source: 'Arzew', target: 'Alger', corridor: 'Dorsale Nord-Ouest 400kV', kind: 'ELECTRICITY' },
  { source: 'Alger', target: 'Sétif', corridor: 'Artère Centre-Est 220kV', kind: 'ELECTRICITY' },
  { source: 'Sétif', target: 'Constantine', corridor: 'Interconnexion Hauts-Plateaux', kind: 'ELECTRICITY' },
  { source: 'Constantine', target: 'Skikda', corridor: 'Couloir Est HTB / GK1', kind: 'ELECTRICITY' },
  { source: "Hassi R'Mel", target: 'Arzew', corridor: 'Gazoduc GZ1 / GZ2 (Hassi-Arzew)', kind: 'GAS' },
  { source: "Hassi R'Mel", target: 'Alger', corridor: 'Gazoduc GG1 (Hassi-Centre)', kind: 'GAS' },
  { source: "Hassi R'Mel", target: 'Skikda', corridor: 'Gazoduc GK1 / GK2 (Hassi-Skikda)', kind: 'GAS' },
  { source: "Hassi R'Mel", target: 'Ouargla', corridor: 'Interconnexion Pôle Sud 220kV', kind: 'ELECTRICITY' },
  { source: 'Ouargla', target: 'Constantine', corridor: 'Liaison Sud-Est HTB', kind: 'ELECTRICITY' },
];

export function getZoneColorByStatus(status: SeverityStatus): string {
  return STATUS_COLORS[status]?.fill || STATUS_COLORS.normal.fill;
}

interface NetworkTopologyMapProps {
  zonesStatus: Record<string, ZoneTopologyStatus>;
  selectedZone: string;
  onSelectZone: (zoneName: string, nodeId: string) => void;
  wsConnected?: boolean;
}

export const NetworkTopologyMap: React.FC<NetworkTopologyMapProps> = ({
  zonesStatus,
  selectedZone,
  onSelectZone,
  wsConnected = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | SeverityStatus>('ALL');
  const [hoveredZone, setHoveredZone] = useState<ZoneTopologyStatus | null>(null);
  const { isPureDark, chartTokens } = useTheme();

  const zonesArray = Object.values(zonesStatus);

  useEffect(() => {
    if (!svgRef.current || zonesArray.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = 880;
    const height = 430;

    // Projection géographique calibrée sur le réseau interconnecté algérien (Nord + Pôles Sahariens)
    const xScale = d3.scaleLinear().domain([-2.2, 8.8]).range([90, width - 90]);
    const yScale = d3.scaleLinear().domain([30.8, 37.3]).range([height - 55, 55]);

    const defs = svg.append('defs');

    // Filtre de halo lumineux pour les zones en alerte
    const glowFilter = defs
      .append('filter')
      .attr('id', 'd3-zone-glow')
      .attr('x', '-50%')
      .attr('y', '-50%')
      .attr('width', '200%')
      .attr('height', '200%');
    glowFilter
      .append('feGaussianBlur')
      .attr('stdDeviation', '4.5')
      .attr('result', 'coloredBlur');
    const feMerge = glowFilter.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'coloredBlur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // Grille de fond D3 (adaptée en mode sombre pur ISA-101)
    const gridStroke = chartTokens.gridStroke;
    const gridGroup = svg.append('g').attr('class', 'topology-grid');
    for (let x = 80; x < width; x += 80) {
      gridGroup
        .append('line')
        .attr('x1', x)
        .attr('y1', 20)
        .attr('x2', x)
        .attr('y2', height - 20)
        .attr('stroke', gridStroke)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');
    }
    for (let y = 50; y < height; y += 70) {
      gridGroup
        .append('line')
        .attr('x1', 30)
        .attr('y1', y)
        .attr('x2', width - 30)
        .attr('y2', y)
        .attr('stroke', gridStroke)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '3,3');
    }

    // Contour stylisé du territoire national algérien
    const algeriaCoastAndSaharaPolygon: [number, number][] = [
      [-1.8, 35.1],
      [-0.6, 35.75],
      [0.2, 36.1],
      [3.05, 36.82],
      [5.1, 36.85],
      [6.95, 36.95],
      [8.3, 36.9],
      [8.4, 34.2],
      [7.2, 31.2],
      [3.2, 30.9],
      [-1.2, 31.4],
      [-1.8, 35.1],
    ];

    const lineGenerator = d3
      .line<[number, number]>()
      .x((d) => xScale(d[0]))
      .y((d) => yScale(d[1]))
      .curve(d3.curveCatmullRomClosed.alpha(0.4));

    svg
      .append('path')
      .datum(algeriaCoastAndSaharaPolygon)
      .attr('d', lineGenerator)
      .attr('fill', isPureDark ? '#18181B' : '#0F172A')
      .attr('fill-opacity', 0.85)
      .attr('stroke', isPureDark ? '#3F3F46' : '#334155')
      .attr('stroke-width', 1.5);

    // Dictionnaire rapide de coordonnées projetées par zone
    const coordsByZone: Record<string, { x: number; y: number; data: ZoneTopologyStatus }> = {};
    zonesArray.forEach((z) => {
      coordsByZone[z.zone] = {
        x: xScale(z.coordinates.lng),
        y: yScale(z.coordinates.lat),
        data: z,
      };
    });

    // Tracé des interconnexions HTB 400kV/220kV et Gazoducs Nationaux
    const linksGroup = svg.append('g').attr('class', 'topology-links');
    ALGERIA_TOPOLOGY_LINKS.forEach((lnk) => {
      const src = coordsByZone[lnk.source];
      const dst = coordsByZone[lnk.target];
      if (!src || !dst) return;

      const isHighlighted =
        selectedZone === lnk.source || selectedZone === lnk.target;

      linksGroup
        .append('line')
        .attr('x1', src.x)
        .attr('y1', src.y)
        .attr('x2', dst.x)
        .attr('y2', dst.y)
        .attr('stroke', lnk.kind === 'ELECTRICITY' ? '#38BDF8' : '#F59E0B')
        .attr('stroke-opacity', isHighlighted ? 0.9 : 0.42)
        .attr('stroke-width', isHighlighted ? 2.8 : 1.8)
        .attr('stroke-dasharray', lnk.kind === 'GAS' ? '7,4' : 'none');
    });

    // Tracé des 8 nœuds de zones avec animation pulsante sur les zones en alerte
    const nodesGroup = svg.append('g').attr('class', 'topology-nodes');

    zonesArray.forEach((zoneObj) => {
      const pt = coordsByZone[zoneObj.zone];
      if (!pt) return;

      const isVisibleByFilter =
        statusFilter === 'ALL' || zoneObj.status === statusFilter;
      const isSelected = zoneObj.zone === selectedZone;
      const colorInfo = STATUS_COLORS[zoneObj.status] || STATUS_COLORS.normal;
      const isAlerting =
        zoneObj.status === 'warning' ||
        zoneObj.status === 'critical' ||
        zoneObj.status === 'emergency';

      const g = nodesGroup
        .append('g')
        .attr('transform', `translate(${pt.x}, ${pt.y})`)
        .attr('opacity', isVisibleByFilter ? 1 : 0.22)
        .style('cursor', 'pointer')
        .on('click', () => {
          onSelectZone(zoneObj.zone, zoneObj.node_id);
        })
        .on('mouseenter', () => {
          setHoveredZone(zoneObj);
        })
        .on('mouseleave', () => {
          setHoveredZone(null);
        });

      // Anneau pulsant D3 pour les zones en alerte (warning / critical / emergency)
      if (isAlerting) {
        const pulseCircle = g
          .append('circle')
          .attr('r', 14)
          .attr('fill', 'none')
          .attr('stroke', colorInfo.fill)
          .attr('stroke-width', 2.2)
          .attr('opacity', 0.85);

        function repeatPulse() {
          pulseCircle
            .attr('r', 12)
            .attr('opacity', 0.9)
            .transition()
            .duration(zoneObj.status === 'emergency' ? 950 : 1450)
            .ease(d3.easeCubicOut)
            .attr('r', zoneObj.status === 'emergency' ? 32 : 25)
            .attr('opacity', 0)
            .on('end', repeatPulse);
        }
        repeatPulse();
      }

      // Anneau de sélection extérieur
      if (isSelected) {
        g.append('circle')
          .attr('r', 19)
          .attr('fill', 'none')
          .attr('stroke', '#F8FAFC')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '4,2');
      }

      // Cercle principal coloré selon le statut (vert/jaune/orange/rouge)
      g.append('circle')
        .attr('class', 'zone-status-circle')
        .attr('data-zone', zoneObj.zone)
        .attr('data-status', zoneObj.status)
        .attr('r', isSelected ? 12.5 : 10)
        .attr('fill', colorInfo.fill)
        .attr('stroke', '#020617')
        .attr('stroke-width', 2.5)
        .attr('filter', isAlerting ? 'url(#d3-zone-glow)' : null);

      // Étiquette du nom de la zone
      const labelOffsetY =
        zoneObj.zone === 'Arzew'
          ? -18
          : zoneObj.zone === 'Alger'
          ? -16
          : zoneObj.zone === 'Skikda'
          ? -16
          : 24;

      g.append('text')
        .attr('y', labelOffsetY)
        .attr('text-anchor', 'middle')
        .attr('fill', isSelected ? '#FFFFFF' : '#E2E8F0')
        .attr('font-size', isSelected ? '12px' : '11px')
        .attr('font-weight', isSelected ? '700' : '600')
        .attr('font-family', 'Plus Jakarta Sans, sans-serif')
        .text(zoneObj.zone);

      // Sous-étiquette télémétrique concise
      g.append('text')
        .attr('y', labelOffsetY + 13)
        .attr('text-anchor', 'middle')
        .attr('fill', colorInfo.stroke)
        .attr('font-size', '10px')
        .attr('font-family', 'JetBrains Mono, monospace')
        .text(
          zoneObj.energy_type === 'GAS'
            ? `${zoneObj.gas_pressure_bar} bar`
            : `${zoneObj.voltage_kv} kV · ${zoneObj.transformer_temp_c}°C`
        );
    });
  }, [zonesArray, selectedZone, statusFilter, onSelectZone]);

  const activeZoneDetail =
    hoveredZone || zonesStatus[selectedZone] || zonesArray[0];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-between space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-bold text-white">
              Carte Topologique Interactive D3.js — 8 Zones Nationales (SONELGAZ)
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Cliquez sur une zone pour cibler ses courbes 24h et ses anomalies · Flux temps réel{' '}
            <code className="text-sky-400">/ws/analytics/{selectedZone}</code>
          </p>
        </div>

        {/* Légende interactive filtrante (Vert / Jaune / Orange / Rouge) */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-800 border-slate-600 text-white font-semibold'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
            }`}
          >
            Toutes (8)
          </button>
          {(['normal', 'warning', 'critical', 'emergency'] as SeverityStatus[]).map(
            (st) => {
              const count = zonesArray.filter((z) => z.status === st).length;
              const cfg = STATUS_COLORS[st];
              return (
                <button
                  key={st}
                  onClick={() =>
                    setStatusFilter((prev) => (prev === st ? 'ALL' : st))
                  }
                  className={`px-2.5 py-1 rounded-md border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    statusFilter === st
                      ? 'bg-slate-800 border-slate-500 text-white font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                    style={{ backgroundColor: cfg.fill }}
                  />
                  <span className="capitalize">{st}</span>
                  <span className="font-mono text-slate-400">({count})</span>
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Canevas SVG D3.js */}
      <div className="relative bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden">
        <svg
          ref={svgRef}
          viewBox="0 0 880 430"
          className="w-full h-[340px] sm:h-[380px] select-none"
          aria-label="Carte topologique D3.js des 8 zones énergétiques algériennes"
        />

        {/* Indicateur WebSocket Temps Réel */}
        <div className="absolute top-3 left-3 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-2 text-slate-300">
          <Radio
            className={`w-3.5 h-3.5 ${
              wsConnected ? 'text-emerald-400 animate-pulse' : 'text-amber-400'
            }`}
          />
          <span className="font-mono">
            WS /ws/analytics/{selectedZone} · 1 pt / 5s
          </span>
        </div>

        {/* Légende des corridors de transport */}
        <div className="absolute bottom-3 left-3 bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5 text-[11px] flex flex-wrap items-center gap-4 text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-sky-400 inline-block" />
            Ligne HTB 400kV / 220kV
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 border-b-2 border-dashed border-amber-400 inline-block" />
            Gazoduc National (GZ / GK / GG)
          </span>
        </div>
      </div>

      {/* Bandeau synthétique de la zone active / survolée */}
      {activeZoneDetail && (
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 grid grid-cols-1 md:grid-cols-12 gap-4 items-center text-xs">
          <div className="md:col-span-4 flex items-center gap-3">
            <span
              className="w-3.5 h-3.5 rounded-full shrink-0"
              style={{
                backgroundColor: getZoneColorByStatus(activeZoneDetail.status),
              }}
            />
            <div>
              <div className="font-bold text-white text-sm">
                Zone {activeZoneDetail.zone}{' '}
                <span className="font-mono text-xs text-sky-400">
                  ({activeZoneDetail.node_id})
                </span>
              </div>
              <div className="text-slate-400">
                Statut :{' '}
                <span
                  className={`font-mono font-semibold uppercase ${
                    STATUS_COLORS[activeZoneDetail.status].badgeText
                  }`}
                >
                  {activeZoneDetail.status}
                </span>{' '}
                · Prob. Panne :{' '}
                <span className="font-mono text-slate-200">
                  {(activeZoneDetail.failure_probability * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          <div className="md:col-span-4 font-mono text-slate-300 space-y-0.5">
            <div>
              Tension : <strong className="text-white">{activeZoneDetail.voltage_kv} kV</strong> ·
              Puissance : <strong className="text-white">{activeZoneDetail.power_mw} MW</strong>
            </div>
            <div>
              Temp. Transfo :{' '}
              <strong className="text-amber-300">{activeZoneDetail.transformer_temp_c}°C</strong> ·
              Pression Gaz :{' '}
              <strong className="text-emerald-300">{activeZoneDetail.gas_pressure_bar} bar</strong>
            </div>
          </div>

          <div className="md:col-span-4 text-slate-300 space-y-0.5 border-t md:border-t-0 md:border-l border-slate-800 pt-2 md:pt-0 md:pl-3">
            <div className="text-slate-400 truncate" title={activeZoneDetail.last_alert}>
              Alerte : <span className="text-slate-200">{activeZoneDetail.last_alert}</span>
            </div>
            <div className="font-mono text-[11px] text-emerald-400 truncate" title={activeZoneDetail.last_scada_action}>
              SCADA : {activeZoneDetail.last_scada_action}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
