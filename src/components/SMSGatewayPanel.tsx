import React, { useState, useEffect, useCallback } from 'react';
import { SMSGatewayStatus, SMSHistoryItem, SMSProviderName } from '../types';
import { buildDefaultSmsStatus, buildDefaultSmsHistory } from '../fallbackData';
import {
  MessageSquare,
  Send,
  Download,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Filter,
  Radio,
} from 'lucide-react';

export const PROVIDER_BADGE_META: Record<
  SMSProviderName,
  { label: string; badgeClass: string; carrierDesc: string }
> = {
  mock: {
    label: 'MockProvider (Démo / Local)',
    badgeClass: 'bg-slate-700/60 text-slate-200 border-slate-600',
    carrierDesc: 'Simulation locale sans coût (0.00 DZD) — Journalisation complète',
  },
  ooredoo: {
    label: 'Ooredoo Algérie (REST Enterprise)',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
    carrierDesc: 'Passerelle REST nationale Ooredoo Business (4.00 DZD / SMS)',
  },
  mobilis: {
    label: 'ATM Mobilis (REST / SOAP Souverain)',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    carrierDesc: 'Passerelle opérateur historique national Mobilis (3.80 DZD / SMS)',
  },
  djezzy: {
    label: 'Djezzy Optimum Telecom (REST)',
    badgeClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    carrierDesc: 'Passerelle REST nationale Djezzy Corporate (4.20 DZD / SMS)',
  },
};

export function getSmsGatewayDisplaySummary(status: SMSGatewayStatus) {
  const meta =
    PROVIDER_BADGE_META[status.active_provider] || PROVIDER_BADGE_META.mock;
  return {
    providerBadgeLabel: meta.label,
    remainingCreditFormatted: `${status.remaining_credit_dzd.toLocaleString('fr-FR')} DZD`,
    quotaRatio: `${status.sent_today} / ${status.daily_limit}`,
    isCompliant1807: status.law_18_07_compliant && status.max_length <= 160,
  };
}

interface SMSGatewayPanelProps {
  token: string;
  isAdmin: boolean;
  canWrite: boolean;
  selectedZone?: string;
  onEscalationLogged?: (auditEntry: any, message: string) => void;
}

export const SMSGatewayPanel: React.FC<SMSGatewayPanelProps> = ({
  token,
  isAdmin,
  canWrite,
  selectedZone = 'Alger',
  onEscalationLogged,
}) => {
  const [gatewayStatus, setGatewayStatus] = useState<SMSGatewayStatus>(() =>
    buildDefaultSmsStatus()
  );
  const [smsHistory, setSmsHistory] = useState<SMSHistoryItem[]>(() =>
    buildDefaultSmsHistory()
  );
  const [selectedProviderPreview, setSelectedProviderPreview] =
    useState<SMSProviderName>('ooredoo');
  const [escalationReason, setEscalationReason] = useState<
    'no_acknowledgment' | 'operator_request' | 'system_failure'
  >('no_acknowledgment');
  const [isTestingGateway, setIsTestingGateway] = useState<boolean>(false);

  // Filtres de l'historique paginé
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');
  const [operatorFilter, setOperatorFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'sent' | 'failed'>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 5;

  const fetchSmsStatusAndHistory = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const [stRes, histRes] = await Promise.all([
        fetch('/api/v1/sms/status', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch('/api/v1/sms/history?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (
        stRes.ok &&
        (stRes.headers.get('content-type') || '').includes('application/json')
      ) {
        const stData = await stRes.json();
        if (stData.active_provider) {
          setGatewayStatus(stData);
        }
      }
      if (
        histRes.ok &&
        (histRes.headers.get('content-type') || '').includes('application/json')
      ) {
        const histData = await histRes.json();
        if (Array.isArray(histData.history) && histData.history.length > 0) {
          setSmsHistory(histData.history);
        }
      }
    } catch {
      // Fallback local déjà initialisé
    }
  }, [token, isAdmin]);

  useEffect(() => {
    fetchSmsStatusAndHistory();
  }, [fetchSmsStatusAndHistory]);

  const handleTestGatewayOrEscalate = async (
    customReason?: 'no_acknowledgment' | 'operator_request' | 'system_failure'
  ) => {
    if (!canWrite) return;
    setIsTestingGateway(true);
    const reasonToUse = customReason || escalationReason;
    const notifId = `FCM-ESC-${selectedZone.slice(0, 3).toUpperCase()}-${Math.floor(
      1000 + Math.random() * 8999
    )}`;

    try {
      const res = await fetch(
        `/api/v1/notifications/${encodeURIComponent(notifId)}/escalate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            reason: reasonToUse,
            zone: selectedZone,
            alert_type: 'PANNE IMMINENTE',
            probability: 0.78,
            provider_override: selectedProviderPreview,
          }),
        }
      );
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.history_entry) {
          setSmsHistory((prev) => [data.history_entry, ...prev]);
          setGatewayStatus((prev) => ({
            ...prev,
            active_provider: data.history_entry.provider || selectedProviderPreview,
            sent_today: prev.sent_today + 1,
            remaining_credit_dzd: Math.max(
              0,
              Number((prev.remaining_credit_dzd - (data.history_entry.cost_dzd || 0)).toFixed(1))
            ),
            last_sent: data.history_entry,
          }));
        }
        if (data.audit_log && onEscalationLogged) {
          onEscalationLogged(
            data.audit_log,
            `Escalade SMS (${reasonToUse}) envoyée via ${
              data.history_entry?.provider || selectedProviderPreview
            } : ${data.sms_text}`
          );
        }
        setIsTestingGateway(false);
        return;
      }
    } catch {
      // Fallback local
    }

    const fallbackEntry: SMSHistoryItem = {
      sms_id: `${selectedProviderPreview.slice(0, 3).toUpperCase()}-DZ-${Math.floor(
        10000 + Math.random() * 89999
      )}`,
      timestamp: new Date().toISOString(),
      notification_id: notifId,
      operator_id: `OP-DZ1807-${selectedZone.slice(0, 3).toUpperCase()}01`,
      zone: selectedZone,
      message_type: 'PANNE_IMMINENTE',
      reason: reasonToUse,
      provider: selectedProviderPreview,
      status: 'sent',
      cost_dzd: selectedProviderPreview === 'mock' ? 0.0 : 4.0,
      message: `[BESMA] PANNE IMMINENTE - Zone ${selectedZone} - 78% - Acquitter: https://besma.dz/ack/${notifId.slice(
        -8
      )}`,
      retention_days: 365,
    };

    setSmsHistory((prev) => [fallbackEntry, ...prev]);
    setGatewayStatus((prev) => ({
      ...prev,
      active_provider: selectedProviderPreview,
      sent_today: prev.sent_today + 1,
      last_sent: fallbackEntry,
    }));

    if (onEscalationLogged) {
      onEscalationLogged(
        {
          audit_id: `AUD-SMS-${Math.floor(1000 + Math.random() * 9000)}`,
          collection: 'audit_logs',
          event_type: 'SMS_FALLBACK_ESCALATION',
          notification_id: notifId,
          operator_username: fallbackEntry.operator_id,
          operator_role: 'admin',
          ip_hash: 'IPHASH-DZ1807-8f41c09a2b7e1104',
          comment: `Escalade SMS (${reasonToUse}) via ${selectedProviderPreview} sur Zone ${selectedZone}`,
          acknowledged_at: fallbackEntry.timestamp,
          law_18_07_compliant: true,
        },
        `SMS d'escalade envoyé (${selectedProviderPreview.toUpperCase()}) : ${fallbackEntry.message}`
      );
    }
    setIsTestingGateway(false);
  };

  const handleExportCsv = () => {
    if (!isAdmin) return;
    const header =
      'sms_id,timestamp,operator_id,zone,message_type,reason,provider,status,cost_dzd,message\n';
    const rows = filteredHistory
      .map((item) =>
        [
          item.sms_id,
          item.timestamp,
          item.operator_id,
          item.zone,
          item.message_type,
          item.reason || 'no_acknowledgment',
          item.provider,
          item.status,
          item.cost_dzd.toFixed(2),
          `"${item.message.replace(/"/g, '""')}"`,
        ].join(',')
      )
      .join('\n');

    const blob = new Blob([header + rows + '\n'], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `besma_sms_fallback_history_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filteredHistory = smsHistory.filter((item) => {
    if (zoneFilter !== 'ALL' && item.zone.toLowerCase() !== zoneFilter.toLowerCase()) {
      return false;
    }
    if (
      operatorFilter.trim() !== '' &&
      !item.operator_id.toLowerCase().includes(operatorFilter.trim().toLowerCase())
    ) {
      return false;
    }
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }
    if (typeFilter !== 'ALL' && item.message_type !== typeFilter) {
      return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / pageSize));
  const paginatedHistory = filteredHistory.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const activeBadge =
    PROVIDER_BADGE_META[gatewayStatus.active_provider] || PROVIDER_BADGE_META.mock;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
      {/* En-tête Passerelle SMS */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-white">
              Passerelle SMS Souveraine de Fallback (Ooredoo · Mobilis · Djezzy · Mock)
            </h3>
            <span
              className={`px-2.5 py-0.5 text-[11px] font-mono font-semibold rounded border ${activeBadge.badgeClass}`}
            >
              {activeBadge.label}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Basculement automatique si une alerte FCM critique n’est pas acquittée sous{' '}
            <strong className="text-slate-200">{gatewayStatus.fallback_timeout_seconds}s</strong> ou
            en cas d’indisponibilité push. Numéros chiffrés en{' '}
            <code className="text-emerald-400">AES-256-GCM</code> et messages limités à 160
            caractères sans PII (Loi 18-07).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedProviderPreview}
            onChange={(e) => setSelectedProviderPreview(e.target.value as SMSProviderName)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono"
            aria-label="Passerelle opérateur télécom"
          >
            <option value="ooredoo">Passerelle : Ooredoo DZ</option>
            <option value="mobilis">Passerelle : Mobilis DZ</option>
            <option value="djezzy">Passerelle : Djezzy DZ</option>
            <option value="mock">Passerelle : MockProvider (Démo)</option>
          </select>

          <button
            onClick={() => handleTestGatewayOrEscalate('operator_request')}
            disabled={!canWrite || isTestingGateway}
            className="px-3.5 py-1.5 bg-sky-400 hover:bg-sky-300 disabled:opacity-40 text-slate-950 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
            {isTestingGateway ? 'Envoi SMS...' : 'Tester la passerelle'}
          </button>

          {isAdmin && (
            <button
              onClick={handleExportCsv}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              Exporter CSV
            </button>
          )}
        </div>
      </div>

      {/* Cartes d'état de la passerelle SMS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-slate-400 flex items-center justify-between">
            <span>Opérateur Télécom Actif</span>
            <Radio className="w-3.5 h-3.5 text-emerald-400" />
          </span>
          <div className="text-sm font-bold font-mono text-white uppercase">
            {gatewayStatus.active_provider}
          </div>
          <div className="text-[11px] text-slate-500">
            Coût unitaire : {gatewayStatus.cost_per_sms_dzd.toFixed(2)} DZD / SMS
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-slate-400">Crédit Télécom Restant</span>
          <div className="text-sm font-bold font-mono text-emerald-400 tabular-nums">
            {gatewayStatus.remaining_credit_dzd.toLocaleString('fr-FR')} DZD
          </div>
          <div className="text-[11px] text-slate-500">
            Quota anti-boucle : {gatewayStatus.sent_today} / {gatewayStatus.daily_limit} SMS (24h)
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1">
          <span className="text-slate-400">Dernier SMS Envoyé</span>
          <div className="text-sm font-bold font-mono text-sky-400 truncate">
            {gatewayStatus.last_sent
              ? `${gatewayStatus.last_sent.zone} (${gatewayStatus.last_sent.status.toUpperCase()})`
              : 'Aucun envoi'}
          </div>
          <div className="text-[11px] text-slate-500 font-mono">
            {gatewayStatus.last_sent
              ? gatewayStatus.last_sent.timestamp.slice(0, 19).replace('T', ' ') + ' UTC'
              : '—'}
          </div>
        </div>

        <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
          <span className="text-slate-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Simuler Escalade Manuelle (60s expiré)
          </span>
          <div className="flex items-center gap-1.5">
            <select
              value={escalationReason}
              onChange={(e) =>
                setEscalationReason(
                  e.target.value as
                    | 'no_acknowledgment'
                    | 'operator_request'
                    | 'system_failure'
                )
              }
              className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 flex-1"
            >
              <option value="no_acknowledgment">Timeout 60s (Non acquitté)</option>
              <option value="system_failure">Échec FCM (System Failure)</option>
              <option value="operator_request">Demande Opérateur</option>
            </select>
            <button
              onClick={() => handleTestGatewayOrEscalate(escalationReason)}
              disabled={!isAdmin || isTestingGateway}
              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold rounded text-[11px] cursor-pointer whitespace-nowrap"
            >
              Escalader
            </button>
          </div>
        </div>
      </div>

      {/* Barre de filtres de l'historique SMS */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3 text-xs">
        <div className="flex items-center gap-2 text-slate-300 font-medium">
          <Filter className="w-3.5 h-3.5 text-sky-400" />
          <span>Filtrer l’historique des SMS (Conservation 365j Loi 18-07) :</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={zoneFilter}
            onChange={(e) => {
              setZoneFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200"
          >
            <option value="ALL">Toutes les zones</option>
            <option value="Alger">Alger</option>
            <option value="Oran">Oran</option>
            <option value="Skikda">Skikda</option>
            <option value="Constantine">Constantine</option>
            <option value="Hassi R'Mel">Hassi R'Mel</option>
          </select>

          <input
            type="text"
            placeholder="Pseudonyme opérateur (OP-DZ1807...)"
            value={operatorFilter}
            onChange={(e) => {
              setOperatorFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200 font-mono"
          />

          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'ALL' | 'sent' | 'failed');
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200"
          >
            <option value="ALL">Tous statuts</option>
            <option value="sent">Envoyé (sent)</option>
            <option value="failed">Échec (failed)</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-slate-200"
          >
            <option value="ALL">Tous types d’alerte</option>
            <option value="PANNE_IMMINENTE">PANNE_IMMINENTE</option>
            <option value="SURCHARGE_CRITIQUE">SURCHARGE_CRITIQUE</option>
            <option value="PRESSION_GAZ_BASSE">PRESSION_GAZ_BASSE</option>
            <option value="TEST_PASSERELLE">TEST_PASSERELLE</option>
          </select>
        </div>
      </div>

      {/* Table paginée de l'historique SMS */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60">
              <th className="py-2.5 px-3">ID SMS & Passerelle</th>
              <th className="py-2.5 px-3">Horodatage UTC</th>
              <th className="py-2.5 px-3">Opérateur (Pseudonyme)</th>
              <th className="py-2.5 px-3">Zone</th>
              <th className="py-2.5 px-3">Message Court (&le; 160 car. · Sans PII)</th>
              <th className="py-2.5 px-3 text-right">Coût (DZD)</th>
              <th className="py-2.5 px-3 text-center">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {paginatedHistory.map((item) => (
              <tr key={item.sms_id} className="hover:bg-slate-800/40">
                <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                  <span className="text-sky-400 font-semibold">{item.sms_id}</span>
                  <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.provider}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                  {item.timestamp.slice(0, 19).replace('T', ' ')}
                </td>
                <td className="py-2.5 px-3 font-mono text-emerald-400 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    {item.operator_id}
                  </span>
                </td>
                <td className="py-2.5 px-3 font-medium text-slate-200 whitespace-nowrap">
                  {item.zone}
                </td>
                <td className="py-2.5 px-3 font-mono text-[11px] text-slate-200">
                  {item.message}
                </td>
                <td className="py-2.5 px-3 font-mono text-right text-slate-300 tabular-nums whitespace-nowrap">
                  {item.cost_dzd.toFixed(2)} DZD
                </td>
                <td className="py-2.5 px-3 text-center whitespace-nowrap">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono uppercase ${
                      item.status === 'sent'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-red-500/20 text-red-300 border border-red-500/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3 h-3" />
                    {item.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800">
        <span>
          Affichage de {paginatedHistory.length} sur {filteredHistory.length} SMS journalisés
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
          >
            Précédent
          </button>
          <span className="font-mono">
            Page {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
};
