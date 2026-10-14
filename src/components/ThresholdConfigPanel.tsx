import React, { useState, useEffect, useCallback } from 'react';
import {
  ThresholdItem,
  ThresholdHistoryItem,
  ThresholdSimulationResult,
  ThresholdSeason,
  ThresholdMetricKey,
} from '../types';
import { AuditLogItem } from './AuditCompliancePanel';
import {
  Sliders,
  Play,
  Download,
  Upload,
  History,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  ShieldCheck,
} from 'lucide-react';

export const ALGERIA_ZONES = [
  'Alger',
  'Oran',
  "Hassi R'Mel",
  'Skikda',
  'Constantine',
  'Arzew',
  'Sétif',
  'Ouargla',
] as const;

export const METRIC_LABELS: Record<
  ThresholdMetricKey,
  { label: string; category: 'ÉLECTRICITÉ' | 'GAZ NATUREL'; defaultSimValue: number }
> = {
  voltage: { label: 'Tension HTB (voltage)', category: 'ÉLECTRICITÉ', defaultSimValue: 184.0 },
  current: { label: 'Courant de ligne (current)', category: 'ÉLECTRICITÉ', defaultSimValue: 1750.0 },
  power: { label: 'Puissance active (power)', category: 'ÉLECTRICITÉ', defaultSimValue: 590.0 },
  frequency: { label: 'Fréquence réseau (frequency)', category: 'ÉLECTRICITÉ', defaultSimValue: 49.65 },
  transformer_temp: {
    label: 'Température transformateur (transformer_temp)',
    category: 'ÉLECTRICITÉ',
    defaultSimValue: 93.5,
  },
  gas_pressure: {
    label: 'Pression gazoduc (gas_pressure)',
    category: 'GAZ NATUREL',
    defaultSimValue: 53.5,
  },
  gas_flow: {
    label: 'Débit horaire gaz (gas_flow)',
    category: 'GAZ NATUREL',
    defaultSimValue: 172000.0,
  },
  compression_ratio: {
    label: 'Ratio de compression (compression_ratio)',
    category: 'GAZ NATUREL',
    defaultSimValue: 1.72,
  },
};

export function generateDefaultSonelgazThresholds(): ThresholdItem[] {
  const nowIso = new Date().toISOString();
  const templates: Array<{
    metric: ThresholdMetricKey;
    warning_threshold: number;
    critical_threshold: number;
    emergency_threshold: number;
    direction: 'above' | 'below';
    unit: string;
  }> = [
    {
      metric: 'voltage',
      warning_threshold: 209.0,
      critical_threshold: 198.0,
      emergency_threshold: 188.0,
      direction: 'below',
      unit: 'kV',
    },
    {
      metric: 'current',
      warning_threshold: 1450.0,
      critical_threshold: 1700.0,
      emergency_threshold: 1950.0,
      direction: 'above',
      unit: 'A',
    },
    {
      metric: 'power',
      warning_threshold: 480.0,
      critical_threshold: 580.0,
      emergency_threshold: 650.0,
      direction: 'above',
      unit: 'MW',
    },
    {
      metric: 'frequency',
      warning_threshold: 49.85,
      critical_threshold: 49.7,
      emergency_threshold: 49.5,
      direction: 'below',
      unit: 'Hz',
    },
    {
      metric: 'transformer_temp',
      warning_threshold: 75.0,
      critical_threshold: 85.0,
      emergency_threshold: 92.0,
      direction: 'above',
      unit: '°C',
    },
    {
      metric: 'gas_pressure',
      warning_threshold: 64.0,
      critical_threshold: 60.0,
      emergency_threshold: 55.0,
      direction: 'below',
      unit: 'bar',
    },
    {
      metric: 'gas_flow',
      warning_threshold: 140000.0,
      critical_threshold: 165000.0,
      emergency_threshold: 190000.0,
      direction: 'above',
      unit: 'm³/h',
    },
    {
      metric: 'compression_ratio',
      warning_threshold: 1.5,
      critical_threshold: 1.65,
      emergency_threshold: 1.8,
      direction: 'above',
      unit: 'ratio',
    },
  ];

  const items: ThresholdItem[] = [];
  const seasons: ThresholdSeason[] = ['all', 'summer', 'winter'];

  for (const zone of ALGERIA_ZONES) {
    const slug = zone
      .toLowerCase()
      .replace(/'/g, '')
      .replace(/\s+/g, '')
      .replace(/é/g, 'e');

    for (const tpl of templates) {
      let w = tpl.warning_threshold;
      let c = tpl.critical_threshold;
      let e = tpl.emergency_threshold;
      if (zone === 'Oran' && tpl.metric === 'voltage') {
        w = 382.0;
        c = 370.0;
        e = 355.0;
      }

      for (const season of seasons) {
        let sw = w;
        let sc = c;
        let se = e;
        if (season === 'summer' && tpl.metric === 'transformer_temp') {
          sw = 72.0;
          sc = 82.0;
          se = 89.0;
        }
        items.push({
          id: `THR-${slug.toUpperCase()}-${season.toUpperCase()}-${tpl.metric.toUpperCase()}`,
          zone,
          season,
          metric: tpl.metric,
          warning_threshold: sw,
          critical_threshold: sc,
          emergency_threshold: se,
          direction: tpl.direction,
          unit: tpl.unit,
          enabled: true,
          created_at: nowIso,
          updated_at: nowIso,
          updated_by: 'SONELGAZ_DEFAULT',
          version: 1,
        });
      }
    }
  }
  return items;
}

interface ThresholdConfigPanelProps {
  token: string;
  onThresholdAuditLogged: (entry: AuditLogItem, message: string) => void;
}

export const ThresholdConfigPanel: React.FC<ThresholdConfigPanelProps> = ({
  token,
  onThresholdAuditLogged,
}) => {
  const [selectedZone, setSelectedZone] = useState<string>('Alger');
  const [selectedSeason, setSelectedSeason] = useState<ThresholdSeason>('all');
  const [allThresholds, setAllThresholds] = useState<ThresholdItem[]>(() =>
    generateDefaultSonelgazThresholds()
  );
  const [historyList, setHistoryList] = useState<ThresholdHistoryItem[]>([]);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draftValues, setDraftValues] = useState<{
    warning_threshold: number;
    critical_threshold: number;
    emergency_threshold: number;
    direction: 'above' | 'below';
    enabled: boolean;
  } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Simulation d'alerte sans modifier la production
  const [simMetric, setSimMetric] = useState<ThresholdMetricKey>('transformer_temp');
  const [simValue, setSimValue] = useState<number>(93.5);
  const [simResult, setSimResult] = useState<ThresholdSimulationResult | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);

  // Import CSV modal/input
  const [showImportBox, setShowImportBox] = useState<boolean>(false);
  const [csvImportText, setCsvImportText] = useState<string>('');

  const fetchThresholdsFromServer = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/thresholds', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data.thresholds) && data.thresholds.length > 0) {
          setAllThresholds(data.thresholds);
        }
      }
    } catch {
      // Fallback local déjà initialisé
    }
  }, [token]);

  const fetchHistoryFromServer = useCallback(
    async (zoneName: string) => {
      try {
        const res = await fetch(
          `/api/v1/thresholds/history/${encodeURIComponent(zoneName)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          if (Array.isArray(data.history)) {
            setHistoryList(data.history);
          }
        }
      } catch {
        // Conserver l'historique local
      }
    },
    [token]
  );

  useEffect(() => {
    fetchThresholdsFromServer();
  }, [fetchThresholdsFromServer]);

  useEffect(() => {
    fetchHistoryFromServer(selectedZone);
  }, [selectedZone, fetchHistoryFromServer]);

  const filteredThresholds = allThresholds.filter(
    (t) => t.zone === selectedZone && t.season === selectedSeason
  );

  const validateCandidate = (
    w: number,
    c: number,
    e: number,
    direction: 'above' | 'below',
    metric: string
  ): string | null => {
    if (Number.isNaN(w) || Number.isNaN(c) || Number.isNaN(e)) {
      return 'Toutes les valeurs de seuils doivent être numériques.';
    }
    if (direction === 'above') {
      if (!(w < c && c < e)) {
        return `Incohérence des seuils (direction="above") pour ${metric} : il faut impérativement Warning (${w}) < Critical (${c}) < Emergency (${e}).`;
      }
    } else {
      if (!(w > c && c > e)) {
        return `Incohérence des seuils (direction="below") pour ${metric} : il faut impérativement Warning (${w}) > Critical (${c}) > Emergency (${e}).`;
      }
    }
    return null;
  };

  const startEditing = (item: ThresholdItem) => {
    setValidationError(null);
    setEditingRowId(item.id);
    setDraftValues({
      warning_threshold: item.warning_threshold,
      critical_threshold: item.critical_threshold,
      emergency_threshold: item.emergency_threshold,
      direction: item.direction,
      enabled: item.enabled,
    });
  };

  const handleSaveThreshold = async (item: ThresholdItem) => {
    if (!draftValues) return;
    const err = validateCandidate(
      draftValues.warning_threshold,
      draftValues.critical_threshold,
      draftValues.emergency_threshold,
      draftValues.direction,
      item.metric
    );
    if (err) {
      setValidationError(err);
      return;
    }

    setValidationError(null);
    const nowIso = new Date().toISOString();

    try {
      const res = await fetch(`/api/v1/thresholds/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(draftValues),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.threshold) {
          setAllThresholds((prev) =>
            prev.map((t) => (t.id === item.id ? data.threshold : t))
          );
          if (data.history_entry) {
            setHistoryList((prev) => [data.history_entry, ...prev]);
          } else {
            fetchHistoryFromServer(selectedZone);
          }
          if (data.audit_log) {
            onThresholdAuditLogged(
              data.audit_log,
              `Seuil ${item.metric} (${item.zone} · ${item.season}) mis à jour en v${data.threshold.version} et journalisé dans audit_logs`
            );
          }
          setEditingRowId(null);
          setDraftValues(null);
          return;
        }
      } else if (res.status === 400 && ct.includes('application/json')) {
        const errJson = await res.json();
        setValidationError(errJson.error || errJson.detail || 'Plage de seuils invalide.');
        return;
      }
    } catch {
      // Repli local si nécessaire
    }

    // Mise à jour locale de secours avec incrément de version + historique + audit_logs
    const updatedItem: ThresholdItem = {
      ...item,
      ...draftValues,
      version: item.version + 1,
      updated_at: nowIso,
      updated_by: 'admin',
    };

    const histEntry: ThresholdHistoryItem = {
      history_id: `THIST-${1001 + historyList.length}`,
      threshold_id: item.id,
      zone: item.zone,
      season: item.season,
      metric: item.metric,
      version_before: item.version,
      version_after: updatedItem.version,
      updated_by: 'admin',
      updated_at: nowIso,
      before: {
        warning_threshold: item.warning_threshold,
        critical_threshold: item.critical_threshold,
        emergency_threshold: item.emergency_threshold,
        enabled: item.enabled,
      },
      after: {
        warning_threshold: updatedItem.warning_threshold,
        critical_threshold: updatedItem.critical_threshold,
        emergency_threshold: updatedItem.emergency_threshold,
        enabled: updatedItem.enabled,
      },
    };

    const auditEntry: AuditLogItem = {
      audit_id: `AUD-THR-${Math.floor(1000 + Math.random() * 9000)}`,
      event_type: 'THRESHOLD_CONFIG_CHANGED',
      notification_id: item.id,
      operator_username: 'admin',
      operator_role: 'admin',
      ip_hash: 'IPHASH-DZ1807-8f41c09a2b7e1104',
      comment: `Modification seuil ${item.metric} (${item.zone}/${item.season}) v${item.version}->v${updatedItem.version} : W=${updatedItem.warning_threshold} C=${updatedItem.critical_threshold} E=${updatedItem.emergency_threshold} ${item.unit}`,
      acknowledged_at: nowIso,
    };

    setAllThresholds((prev) =>
      prev.map((t) => (t.id === item.id ? updatedItem : t))
    );
    setHistoryList((prev) => [histEntry, ...prev]);
    onThresholdAuditLogged(
      auditEntry,
      `Seuil ${item.metric} (${item.zone}) mis à jour en v${updatedItem.version}`
    );
    setEditingRowId(null);
    setDraftValues(null);
  };

  const handleToggleEnabled = async (item: ThresholdItem) => {
    const newEnabled = !item.enabled;
    try {
      const res = await fetch(`/api/v1/thresholds/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: newEnabled }),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.threshold) {
          setAllThresholds((prev) =>
            prev.map((t) => (t.id === item.id ? data.threshold : t))
          );
          fetchHistoryFromServer(selectedZone);
          if (data.audit_log) {
            onThresholdAuditLogged(
              data.audit_log,
              `Seuil ${item.metric} (${item.zone}) ${newEnabled ? 'activé' : 'désactivé'} (v${data.threshold.version})`
            );
          }
          return;
        }
      }
    } catch {
      // Fallback
    }

    setAllThresholds((prev) =>
      prev.map((t) =>
        t.id === item.id
          ? { ...t, enabled: newEnabled, version: t.version + 1, updated_at: new Date().toISOString() }
          : t
      )
    );
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    const meta = METRIC_LABELS[simMetric];
    const energyType = meta.category === 'ÉLECTRICITÉ' ? 'ELECTRICITY' : 'GAS';

    const metricPayloadKey: Record<ThresholdMetricKey, string> = {
      voltage: 'voltage_kv',
      current: 'current_amp',
      power: 'active_power_mw',
      frequency: 'frequency_hz',
      transformer_temp: 'temperature_c',
      gas_pressure: 'pressure_bar',
      gas_flow: 'flow_rate_m3h',
      compression_ratio: 'compressor_ratio',
    };

    const metricsObj: Record<string, number> = {
      [metricPayloadKey[simMetric]]: simValue,
      [simMetric]: simValue,
    };

    try {
      const res = await fetch('/api/v1/thresholds/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          zone: selectedZone,
          season: selectedSeason,
          energy_type: energyType,
          metrics: metricsObj,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = (await res.json()) as ThresholdSimulationResult;
        setSimResult(data);
        setIsSimulating(false);
        return;
      }
    } catch {
      // Fallback local simulation
    }

    // Calcul local déterministe en cas de repli
    const targetThr =
      filteredThresholds.find((t) => t.metric === simMetric) ||
      allThresholds.find((t) => t.zone === selectedZone && t.metric === simMetric)!;

    let sev: 'normal' | 'warning' | 'critical' | 'emergency' = 'normal';
    if (targetThr && targetThr.enabled) {
      if (targetThr.direction === 'above') {
        if (simValue >= targetThr.emergency_threshold) sev = 'emergency';
        else if (simValue >= targetThr.critical_threshold) sev = 'critical';
        else if (simValue >= targetThr.warning_threshold) sev = 'warning';
      } else {
        if (simValue <= targetThr.emergency_threshold) sev = 'emergency';
        else if (simValue <= targetThr.critical_threshold) sev = 'critical';
        else if (simValue <= targetThr.warning_threshold) sev = 'warning';
      }
    }

    const prob =
      sev === 'emergency'
        ? 0.94
        : sev === 'critical'
        ? 0.81
        : sev === 'warning'
        ? 0.52
        : 0.12;

    setSimResult({
      simulation: true,
      zone: selectedZone,
      season: selectedSeason,
      ml_prediction: {
        sensor_id: `SIM-${selectedZone.slice(0, 3).toUpperCase()}-01`,
        zone: selectedZone,
        season: selectedSeason,
        binary_classification: sev === 'critical' || sev === 'emergency' ? 1 : 0,
        failure_probability: prob,
        severity_level: sev,
        label:
          sev === 'emergency' || sev === 'critical'
            ? 'PANNE_IMMINENTE'
            : sev === 'warning'
            ? 'RISQUE_SURCHARGE'
            : 'PAS_DE_PANNE',
        breached_metrics:
          sev === 'normal'
            ? []
            : [
                {
                  metric: simMetric,
                  measured_value: simValue,
                  severity: sev,
                  threshold_id: targetThr?.id || 'THR-SIM',
                  unit: targetThr?.unit || '',
                },
              ],
      },
      fcm_notification:
        sev === 'normal'
          ? null
          : {
              notification_id: `FCM-SIM-${Math.floor(1000 + Math.random() * 9000)}`,
              severity_level: sev,
              title: `[${sev.toUpperCase()}] Alerte ${selectedZone} (${simMetric})`,
              body: `Valeur simulée ${simValue} ${targetThr?.unit || ''} a franchi le seuil ${sev.toUpperCase()} sur ${selectedZone}.`,
              topics_broadcasted: [
                'alertes-critiques',
                `alertes-zone-DZ1807-${selectedZone.slice(0, 4).toUpperCase()}`,
              ],
              auto_scada_triggered: sev === 'emergency',
            },
      scada_action: {
        triggered: sev === 'emergency',
        action_type:
          sev === 'emergency'
            ? energyType === 'ELECTRICITY'
              ? 'REROUTAGE_FLUX'
              : 'REGULATION_PRESSION'
            : 'AUCUNE_ACTION',
        scada_commands:
          sev === 'emergency'
            ? [
                energyType === 'ELECTRICITY'
                  ? `IEC-61850 MMS: AUTO_ISOLATE_AND_REROUTE ZONE=${selectedZone.toUpperCase()}`
                  : `MODBUS-TCP: EMERGENCY_VALVE_REGULATION ZONE=${selectedZone.toUpperCase()}`,
              ]
            : [],
      },
    });
    setIsSimulating(false);
  };

  const handleExportCsv = () => {
    const header =
      'id,zone,season,metric,warning_threshold,critical_threshold,emergency_threshold,direction,unit,enabled,version\n';
    const rows = filteredThresholds
      .map((t) =>
        [
          t.id,
          t.zone,
          t.season,
          t.metric,
          t.warning_threshold,
          t.critical_threshold,
          t.emergency_threshold,
          t.direction,
          t.unit,
          t.enabled,
          t.version,
        ].join(',')
      )
      .join('\n');
    const blob = new Blob([header + rows + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sonelgaz_thresholds_${selectedZone.toLowerCase()}_${selectedSeason}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCsvSubmit = async () => {
    if (!csvImportText.trim()) return;
    setValidationError(null);
    try {
      const res = await fetch('/api/v1/thresholds/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ csv_content: csvImportText }),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        await fetchThresholdsFromServer();
        setShowImportBox(false);
        setCsvImportText('');
        onThresholdAuditLogged(
          {
            audit_id: `AUD-THR-IMP-${Math.floor(100 + Math.random() * 899)}`,
            event_type: 'THRESHOLD_CSV_IMPORT',
            notification_id: 'sonelgaz_thresholds.csv',
            operator_username: 'admin',
            operator_role: 'admin',
            ip_hash: 'IPHASH-DZ1807-8f41c09a2b7e1104',
            comment: `Import CSV de seuils personnalisés SONELGAZ`,
            acknowledged_at: new Date().toISOString(),
          },
          'Seuils importés depuis le CSV avec succès et rechargés dans le prédicteur ML'
        );
        return;
      } else if (!res.ok && ct.includes('application/json')) {
        const errData = await res.json();
        setValidationError(errData.error || errData.detail || 'Erreur lors de l’import CSV.');
      }
    } catch {
      setValidationError('Format CSV invalide.');
    }
  };

  return (
    <div className="space-y-6">
      {/* En-tête & Filtres Zone / Saison */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-sky-400" />
              <h2 className="text-base font-bold text-white">
                Configuration des Seuils d’Alerte par Zone & Saison (SONELGAZ)
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Personnalisation dynamique des seuils <code className="text-amber-300">warning</code>,{' '}
              <code className="text-orange-400">critical</code> et{' '}
              <code className="text-red-400">emergency</code> pour le prédicteur ML, les notifications push FCM et le déclenchement SCADA autonome. Toutes les modifications sont tracées dans{' '}
              <code className="text-emerald-400">audit_logs</code> et{' '}
              <code className="text-sky-300">threshold_history</code> (Loi 18-07).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Exporter CSV
            </button>
            <button
              onClick={() => setShowImportBox((prev) => !prev)}
              className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Importer CSV
            </button>
            <button
              onClick={() => {
                setAllThresholds(generateDefaultSonelgazThresholds());
                setValidationError(null);
              }}
              className="px-3 py-2 text-xs font-medium bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
              Valeurs SONELGAZ par défaut
            </button>
          </div>
        </div>

        {/* Boîte d'import CSV optionnelle */}
        {showImportBox && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3">
            <label htmlFor="threshold-csv-import-textarea" className="block text-xs font-medium text-slate-200">
              Collez le contenu CSV à importer (colonnes :{' '}
              <code className="text-sky-400">
                zone,season,metric,warning_threshold,critical_threshold,emergency_threshold,direction,unit,enabled
              </code>
              ) :
            </label>
            <textarea
              id="threshold-csv-import-textarea"
              name="csv_import_text"
              aria-label="Contenu CSV de configuration des seuils"
              rows={4}
              value={csvImportText}
              onChange={(e) => setCsvImportText(e.target.value)}
              placeholder={`zone,season,metric,warning_threshold,critical_threshold,emergency_threshold,direction,unit,enabled\nAlger,summer,transformer_temp,70,80,88,above,°C,True`}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs font-mono text-slate-200"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowImportBox(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={handleImportCsvSubmit}
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg cursor-pointer"
              >
                Valider l’Import CSV
              </button>
            </div>
          </div>
        )}

        {/* Sélecteurs de Zone (8 Wilayas/Pôles) et de Saison */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-400">
              Zone du Réseau National (8 Pôles Énergétiques)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ALGERIA_ZONES.map((zone) => (
                <button
                  key={zone}
                  onClick={() => {
                    setSelectedZone(zone);
                    setEditingRowId(null);
                    setValidationError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    selectedZone === zone
                      ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {zone}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-400">
              Profil Saisonnier
            </span>
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {(
                [
                  { id: 'all', label: 'Toutes Saisons (all)' },
                  { id: 'summer', label: 'Été / Canicule (summer)' },
                  { id: 'winter', label: 'Hiver / Pointe Gaz (winter)' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setSelectedSeason(s.id);
                    setEditingRowId(null);
                    setValidationError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    selectedSeason === s.id
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Message d'erreur de validation mathématique */}
        {validationError && (
          <div className="p-3.5 bg-red-950/60 border border-red-500/50 rounded-lg flex items-center gap-2.5 text-xs text-red-200">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Tableau d'édition des 8 métriques */}
        <div className="overflow-x-auto border border-slate-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400 bg-slate-950/70">
                <th className="py-3 px-4 font-medium">Métrique & Énergie</th>
                <th className="py-3 px-4 font-medium">Direction</th>
                <th className="py-3 px-4 font-medium text-right text-amber-300">
                  Seuil Warning (FCM)
                </th>
                <th className="py-3 px-4 font-medium text-right text-orange-400">
                  Seuil Critical (FCM Prioritaire)
                </th>
                <th className="py-3 px-4 font-medium text-right text-red-400">
                  Seuil Emergency (FCM + Auto-SCADA)
                </th>
                <th className="py-3 px-4 font-medium text-center">Unité</th>
                <th className="py-3 px-4 font-medium text-center">Version</th>
                <th className="py-3 px-4 font-medium text-center">Statut</th>
                <th className="py-3 px-4 font-medium text-right">Actions Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-xs">
              {filteredThresholds.map((item) => {
                const isEditing = editingRowId === item.id && draftValues !== null;
                const meta = METRIC_LABELS[item.metric];
                return (
                  <tr key={item.id} className="hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-100">
                        {meta ? meta.label : item.metric}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {meta?.category || 'RÉSEAU'} · ID: {item.id}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono">
                      {isEditing ? (
                        <div>
                          <label htmlFor={`thresh-dir-${item.id}`} className="sr-only">
                            Direction du seuil {item.metric}
                          </label>
                          <select
                            id={`thresh-dir-${item.id}`}
                            name={`threshold_direction_${item.id}`}
                            aria-label={`Direction du seuil ${item.metric}`}
                            value={draftValues.direction}
                            onChange={(e) =>
                              setDraftValues({
                                ...draftValues,
                                direction: e.target.value as 'above' | 'below',
                              })
                            }
                            className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                          >
                            <option value="above">above (&gt; max)</option>
                            <option value="below">below (&lt; min)</option>
                          </select>
                        </div>
                      ) : (
                        <span className="text-slate-300">
                          {item.direction === 'above' ? 'above (≥)' : 'below (≤)'}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-right tabular-nums">
                      {isEditing ? (
                        <div>
                          <label htmlFor={`thresh-warn-${item.id}`} className="sr-only">
                            Seuil Warning {item.metric}
                          </label>
                          <input
                            id={`thresh-warn-${item.id}`}
                            name={`threshold_warning_${item.id}`}
                            aria-label={`Seuil Warning ${item.metric}`}
                            type="number"
                            step="0.05"
                            value={draftValues.warning_threshold}
                            onChange={(e) =>
                              setDraftValues({
                                ...draftValues,
                                warning_threshold: parseFloat(e.target.value),
                              })
                            }
                            className="w-24 bg-slate-950 border border-amber-500/50 rounded px-2 py-1 text-right text-amber-300 font-mono"
                          />
                        </div>
                      ) : (
                        <span className="text-amber-300 font-semibold">
                          {item.warning_threshold}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-right tabular-nums">
                      {isEditing ? (
                        <div>
                          <label htmlFor={`thresh-crit-${item.id}`} className="sr-only">
                            Seuil Critical {item.metric}
                          </label>
                          <input
                            id={`thresh-crit-${item.id}`}
                            name={`threshold_critical_${item.id}`}
                            aria-label={`Seuil Critical ${item.metric}`}
                            type="number"
                            step="0.05"
                            value={draftValues.critical_threshold}
                            onChange={(e) =>
                              setDraftValues({
                                ...draftValues,
                                critical_threshold: parseFloat(e.target.value),
                              })
                            }
                            className="w-24 bg-slate-950 border border-orange-500/50 rounded px-2 py-1 text-right text-orange-400 font-mono"
                          />
                        </div>
                      ) : (
                        <span className="text-orange-400 font-semibold">
                          {item.critical_threshold}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-right tabular-nums">
                      {isEditing ? (
                        <div>
                          <label htmlFor={`thresh-emerg-${item.id}`} className="sr-only">
                            Seuil Emergency {item.metric}
                          </label>
                          <input
                            id={`thresh-emerg-${item.id}`}
                            name={`threshold_emergency_${item.id}`}
                            aria-label={`Seuil Emergency ${item.metric}`}
                            type="number"
                            step="0.05"
                            value={draftValues.emergency_threshold}
                            onChange={(e) =>
                              setDraftValues({
                                ...draftValues,
                                emergency_threshold: parseFloat(e.target.value),
                              })
                            }
                            className="w-24 bg-slate-950 border border-red-500/50 rounded px-2 py-1 text-right text-red-400 font-mono"
                          />
                        </div>
                      ) : (
                        <span className="text-red-400 font-semibold">
                          {item.emergency_threshold}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 font-mono text-center text-slate-300">
                      {item.unit}
                    </td>

                    <td className="py-3 px-4 font-mono text-center text-sky-400 tabular-nums">
                      v{item.version}
                    </td>

                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleToggleEnabled(item)}
                        className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold cursor-pointer ${
                          item.enabled
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                      >
                        {item.enabled ? 'ACTIF' : 'INACTIF'}
                      </button>
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      {isEditing ? (
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleSaveThreshold(item)}
                            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Save className="w-3.5 h-3.5" />
                            Enregistrer
                          </button>
                          <button
                            onClick={() => {
                              setEditingRowId(null);
                              setDraftValues(null);
                              setValidationError(null);
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded cursor-pointer"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(item)}
                          className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded font-medium cursor-pointer"
                        >
                          Modifier
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Grille inférieure : Simulateur de Seuils (POST /api/v1/thresholds/simulate) & Historique des versions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Simulateur de déclenchement FCM + SCADA */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Simulateur de Déclenchement (Sans Modifier la Production)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Teste une mesure sur la zone <strong>{selectedZone}</strong> ({selectedSeason}) via{' '}
              <code className="text-sky-400">POST /api/v1/thresholds/simulate</code>.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label htmlFor="threshold-sim-metric-select" className="block text-slate-400 mb-1">
                Métrique à tester
              </label>
              <select
                id="threshold-sim-metric-select"
                name="sim_metric"
                value={simMetric}
                onChange={(e) => {
                  const m = e.target.value as ThresholdMetricKey;
                  setSimMetric(m);
                  setSimValue(METRIC_LABELS[m].defaultSimValue);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-slate-100"
              >
                {(Object.keys(METRIC_LABELS) as ThresholdMetricKey[]).map((k) => (
                  <option key={k} value={k}>
                    {METRIC_LABELS[k].label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="threshold-sim-value-input" className="block text-slate-400 mb-1">
                Valeur simulée
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="threshold-sim-value-input"
                  name="sim_value"
                  type="number"
                  step="0.1"
                  value={simValue}
                  onChange={(e) => setSimValue(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 font-mono text-white"
                />
                <button
                  onClick={handleRunSimulation}
                  disabled={isSimulating}
                  className="px-4 py-2 bg-sky-400 hover:bg-sky-300 text-slate-950 font-semibold rounded-lg whitespace-nowrap cursor-pointer"
                >
                  {isSimulating ? 'Calcul...' : 'Simuler'}
                </button>
              </div>
            </div>
          </div>

          {simResult && (
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                <span className="text-slate-400">Niveau de sévérité détecté :</span>
                <span
                  className={`font-mono font-bold uppercase px-2.5 py-0.5 rounded ${
                    simResult.ml_prediction.severity_level === 'emergency'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                      : simResult.ml_prediction.severity_level === 'critical'
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                      : simResult.ml_prediction.severity_level === 'warning'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  }`}
                >
                  {simResult.ml_prediction.severity_level} (Prob. ML :{' '}
                  {(simResult.ml_prediction.failure_probability * 100).toFixed(0)}%)
                </span>
              </div>

              <div>
                <div className="text-slate-400">Notification FCM générée :</div>
                {simResult.fcm_notification ? (
                  <div className="mt-1 font-mono text-slate-200 space-y-1">
                    <div className="text-sky-400 font-semibold">
                      {simResult.fcm_notification.title}
                    </div>
                    <div className="text-slate-300">{simResult.fcm_notification.body}</div>
                    <div className="text-[11px] text-slate-400">
                      Topics : {simResult.fcm_notification.topics_broadcasted.join(' · ')}
                    </div>
                  </div>
                ) : (
                  <div className="text-emerald-400 mt-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Aucune alerte FCM déclenchée (plage nominale).
                  </div>
                )}
              </div>

              <div className="border-t border-slate-800 pt-2.5">
                <div className="text-slate-400">Action SCADA Autonome :</div>
                {simResult.scada_action.triggered ? (
                  <div className="mt-1 p-2 bg-red-950/40 border border-red-500/30 rounded font-mono text-red-300">
                    {simResult.scada_action.scada_commands.join(' | ')}
                  </div>
                ) : (
                  <div className="text-slate-400 mt-1">
                    Aucune commande SCADA automatique requise (déclenchée uniquement au niveau{' '}
                    <code className="text-red-400">emergency</code>).
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Historique des versions par zone (GET /api/v1/thresholds/history/{zone}) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <History className="w-4 h-4 text-sky-400" />
                Historique des Versions (<code className="text-sky-300">threshold_history</code>) — {selectedZone}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Traçabilité complète des révisions de seuils conforme à la Loi n° 18-07.
              </p>
            </div>
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>

          {historyList.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              Aucune modification manuelle enregistrée sur la zone{' '}
              <strong className="text-slate-200">{selectedZone}</strong> (valeurs SONELGAZ v1 actives).
              Modifiez un seuil ci-dessus pour créer une révision v2.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {historyList.map((h) => (
                <div
                  key={h.history_id}
                  className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sky-400 font-semibold">
                      {h.metric} ({h.zone} · {h.season}) — v{h.version_before} &rarr; v{h.version_after}
                    </span>
                    <span className="font-mono text-slate-400">
                      {new Date(h.updated_at).toLocaleTimeString('fr-FR')} par {h.updated_by}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] text-slate-300">
                    Avant : W={h.before.warning_threshold} | C={h.before.critical_threshold} | E=
                    {h.before.emergency_threshold} &rarr; Après :{' '}
                    <span className="text-emerald-400">
                      W={h.after.warning_threshold} | C={h.after.critical_threshold} | E=
                      {h.after.emergency_threshold}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
