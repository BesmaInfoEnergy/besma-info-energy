import React, { useState, useEffect } from 'react';
import { EscalationPolicyConfig } from '../types';
import { buildDefaultEscalationPolicy } from '../fallbackData';
import { Sliders, Save, Clock, PhoneCall, MessageSquare, Bell, ShieldCheck } from 'lucide-react';

export function validateAndSaveEscalationPolicy(
  policy: Partial<EscalationPolicyConfig>
): EscalationPolicyConfig {
  const base = buildDefaultEscalationPolicy();
  const smsTimeout = Math.max(5, Number(policy.sms_timeout_seconds ?? base.sms_timeout_seconds));
  const voiceTimeout = Math.max(
    30,
    Number(policy.voice_call_timeout_seconds ?? base.voice_call_timeout_seconds)
  );
  const channels =
    Array.isArray(policy.active_channels) && policy.active_channels.length > 0
      ? policy.active_channels
      : base.active_channels;
  const severities =
    Array.isArray(policy.trigger_severities) && policy.trigger_severities.length > 0
      ? policy.trigger_severities
      : base.trigger_severities;

  return {
    ...base,
    sms_timeout_seconds: smsTimeout,
    voice_call_timeout_seconds: voiceTimeout,
    active_channels: channels,
    trigger_severities: severities,
    daily_sms_limit: Number(policy.daily_sms_limit ?? base.daily_sms_limit),
    retry_attempts: Number(policy.retry_attempts ?? base.retry_attempts),
    updated_at: new Date().toISOString(),
    updated_by: policy.updated_by || 'admin',
  };
}

interface EscalationPolicyPanelProps {
  token: string;
  isAdmin: boolean;
  onPolicySaved?: (policy: EscalationPolicyConfig) => void;
}

export const EscalationPolicyPanel: React.FC<EscalationPolicyPanelProps> = ({
  token,
  isAdmin,
  onPolicySaved,
}) => {
  const [policy, setPolicy] = useState<EscalationPolicyConfig>(() =>
    buildDefaultEscalationPolicy()
  );
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/v1/escalation/policy', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const ct = res.headers.get('content-type') || '';
        if (res.ok && ct.includes('application/json')) {
          const data = await res.json();
          if (active && data.policy) {
            setPolicy(data.policy);
          }
        }
      } catch {
        // Fallback local
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const toggleChannel = (ch: 'FCM' | 'SMS' | 'VOICE_CALL') => {
    if (!isAdmin) return;
    setPolicy((prev) => {
      const exists = prev.active_channels.includes(ch);
      const next = exists
        ? prev.active_channels.filter((c) => c !== ch)
        : [...prev.active_channels, ch];
      return { ...prev, active_channels: next.length > 0 ? next : ['FCM'] };
    });
  };

  const toggleSeverity = (sev: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY') => {
    if (!isAdmin) return;
    setPolicy((prev) => {
      const exists = prev.trigger_severities.includes(sev);
      const next = exists
        ? prev.trigger_severities.filter((s) => s !== sev)
        : [...prev.trigger_severities, sev];
      return {
        ...prev,
        trigger_severities: next.length > 0 ? next : ['EMERGENCY'],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setIsSaving(true);
    const validated = validateAndSaveEscalationPolicy(policy);

    try {
      const res = await fetch('/api/v1/escalation/policy', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(validated),
      });
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data.policy) {
          setPolicy(data.policy);
          if (onPolicySaved) onPolicySaved(data.policy);
          setIsSaving(false);
          return;
        }
      }
    } catch {
      // Fallback local
    }

    setPolicy(validated);
    if (onPolicySaved) onPolicySaved(validated);
    setIsSaving(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h3 className="text-sm font-semibold text-white">
              Politique d’Escalade Automatique Multi-Canal (Collection MongoDB{' '}
              <code className="text-sky-400">escalation_policies</code>)
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Paramétrage du délai d’acquittement FCM avant basculement SMS souverain (Ooredoo / Mobilis / Djezzy) et appel vocal d’astreinte.
          </p>
        </div>

        <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded">
          <ShieldCheck className="w-3.5 h-3.5" />
          Chiffrement Téléphones AES-256 · Sans PII
        </span>
      </div>

      <form onSubmit={handleSave} className="space-y-5 text-xs">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              Délai avant Escalade SMS (sec)
            </label>
            <input
              type="number"
              min={5}
              max={600}
              disabled={!isAdmin}
              value={policy.sms_timeout_seconds}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  sms_timeout_seconds: Number(e.target.value),
                }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 font-mono text-white disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-500 block">
              Par défaut : 60 secondes sans acquittement FCM
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-red-400" />
              Délai avant Appel Vocal (sec)
            </label>
            <input
              type="number"
              min={60}
              max={1800}
              disabled={!isAdmin}
              value={policy.voice_call_timeout_seconds}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  voice_call_timeout_seconds: Number(e.target.value),
                }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 font-mono text-white disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-500 block">
              Par défaut : 300s (5 minutes) vers ingénieur d’astreinte
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
              Quota Quotidien (SMS_DAILY_LIMIT)
            </label>
            <input
              type="number"
              min={10}
              max={10000}
              disabled={!isAdmin}
              value={policy.daily_sms_limit}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  daily_sms_limit: Number(e.target.value),
                }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 font-mono text-white disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-500 block">
              Protection anti-boucle (500 SMS/jour par défaut)
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-1.5">
            <label className="text-slate-300 font-medium flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-emerald-400" />
              Tentatives (SMS_RETRY_ATTEMPTS)
            </label>
            <input
              type="number"
              min={1}
              max={5}
              disabled={!isAdmin}
              value={policy.retry_attempts}
              onChange={(e) =>
                setPolicy((prev) => ({
                  ...prev,
                  retry_attempts: Number(e.target.value),
                }))
              }
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 font-mono text-white disabled:opacity-50"
            />
            <span className="text-[11px] text-slate-500 block">
              Nombre de réessais automatiques par passerelle
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Canaux actifs */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2">
            <span className="text-slate-300 font-medium block">
              Canaux de Notification Actifs
            </span>
            <div className="flex flex-wrap gap-2">
              {(['FCM', 'SMS', 'VOICE_CALL'] as const).map((ch) => {
                const active = policy.active_channels.includes(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => toggleChannel(ch)}
                    className={`px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/20 border-sky-400 text-sky-300 font-semibold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {ch === 'FCM'
                      ? '1. Push FCM (Temps réel)'
                      : ch === 'SMS'
                      ? '2. Fallback SMS (Ooredoo/Mobilis/Djezzy)'
                      : '3. Appel Téléphonique (5 min)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paliers de sévérité déclenchant l'escalade */}
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3.5 space-y-2">
            <span className="text-slate-300 font-medium block">
              Paliers de Sévérité Déclenchant l’Escalade SMS
            </span>
            <div className="flex flex-wrap gap-2">
              {(['INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'] as const).map((sev) => {
                const active = policy.trigger_severities.includes(sev);
                return (
                  <button
                    key={sev}
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => toggleSeverity(sev)}
                    className={`px-3 py-1.5 rounded-lg border font-mono text-xs transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-semibold'
                        : 'bg-slate-900 border-slate-800 text-slate-500'
                    }`}
                  >
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800">
          <span className="text-[11px] text-slate-400 font-mono">
            Dernière mise à jour : {policy.updated_at.slice(0, 16).replace('T', ' ')} UTC par{' '}
            <code className="text-sky-400">{policy.updated_by}</code>
          </span>

          {isAdmin && (
            <button
              type="submit"
              disabled={isSaving}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving
                ? 'Sauvegarde MongoDB...'
                : 'Sauvegarder la Politique (escalation_policies)'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
