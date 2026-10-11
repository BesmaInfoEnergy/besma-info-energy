/**
 * Suite de tests unitaires Frontend (Jest / TypeScript) pour la Visualisation 24h,
 * la Carte Topologique D3.js et la Projection ML de Panne à 48h (BesmaInfoEnergy)
 *
 * Tests couverts :
 * 1. test_consumption_trends_renders_with_thresholds
 * 2. test_topology_map_colors_zones_by_status
 * 3. test_failure_forecast_panel_renders_chart
 * 4. test_intervention_scheduler_submits_form
 */

import {
  buildAnalyticsTrendsAndAnomalies,
  buildZonesTopologyStatus,
  buildForecast48hForZone,
} from '../fallbackData';
import {
  filterSeriesByAnomalyFlag,
  TREND_METRIC_CONFIG,
} from '../components/ConsumptionTrends';
import {
  getZoneColorByStatus,
  STATUS_COLORS,
} from '../components/NetworkTopologyMap';
import {
  prepareChartDataFromForecast,
  RISK_BADGE_STYLES,
} from '../components/FailureForecastPanel';
import { validateInterventionSubmission } from '../components/InterventionScheduler';
import {
  getSmsGatewayDisplaySummary,
  PROVIDER_BADGE_META,
} from '../components/SMSGatewayPanel';
import { validateAndSaveEscalationPolicy } from '../components/EscalationPolicyPanel';
import { buildDefaultSmsStatus } from '../fallbackData';
import { SEVERITY_STYLES } from '../components/AnomalyTimeline';
import {
  ISA_101_DARK_PALETTE,
  computeWcagContrastRatio,
  persistThemeChoice,
  loadPersistedThemeChoice,
  getChartThemeTokens,
  ThemePreference,
} from '../theme/ThemeProvider';

export function test_consumption_trends_renders_with_thresholds(): boolean {
  const { trends } = buildAnalyticsTrendsAndAnomalies('Alger');
  if (!trends.thresholds.voltage || !trends.thresholds.transformer_temp) {
    throw new Error('Les seuils warning/critical/emergency doivent être présents.');
  }
  const vThr = trends.thresholds.voltage;
  if (
    typeof vThr.warning_threshold !== 'number' ||
    typeof vThr.critical_threshold !== 'number' ||
    typeof vThr.emergency_threshold !== 'number'
  ) {
    throw new Error('Chaque métrique doit exposer ses 3 seuils numériques.');
  }

  const anomaliesOnly = filterSeriesByAnomalyFlag(trends.aligned_series, true);
  if (anomaliesOnly.length === 0 || anomaliesOnly.some((r) => !r.hasAnomaly)) {
    throw new Error('Le filtre Voir les anomalies doit ne conserver que les points anormaux.');
  }

  if (!TREND_METRIC_CONFIG.voltage || !TREND_METRIC_CONFIG.gas_pressure) {
    throw new Error('Configuration des métriques Recharts incomplète.');
  }
  return true;
}

export function test_topology_map_colors_zones_by_status(): boolean {
  const zones = buildZonesTopologyStatus();
  const zoneNames = Object.keys(zones);
  if (zoneNames.length !== 8) {
    throw new Error(`Attendu 8 zones nationales, obtenu ${zoneNames.length}`);
  }

  if (getZoneColorByStatus('normal') !== STATUS_COLORS.normal.fill) {
    throw new Error('Couleur incorrecte pour le statut normal (vert attendu).');
  }
  if (getZoneColorByStatus('warning') !== '#FFCC00') {
    throw new Error('Couleur incorrecte pour le statut warning (#FFCC00 attendu).');
  }
  if (getZoneColorByStatus('critical') !== '#FF9500') {
    throw new Error('Couleur incorrecte pour le statut critical (#FF9500 attendu).');
  }
  if (getZoneColorByStatus('emergency') !== '#FF3B30') {
    throw new Error('Couleur incorrecte pour le statut emergency (#FF3B30 attendu).');
  }
  return true;
}

export function test_failure_forecast_panel_renders_chart(): boolean {
  const forecast = buildForecast48hForZone('Alger', 48);
  if (forecast.points.length !== 48) {
    throw new Error(`Attendu 48 points horaires projetés, obtenu ${forecast.points.length}`);
  }

  const chartData = prepareChartDataFromForecast(forecast);
  if (chartData.length < 48) {
    throw new Error('Les données préparées pour Recharts doivent contenir au moins 48 points.');
  }

  const samplePoint = chartData[chartData.length - 1];
  if (
    !Array.isArray(samplePoint.confidenceBand) ||
    samplePoint.confidenceBand.length !== 2 ||
    samplePoint.confidenceBand[0] > samplePoint.confidenceBand[1]
  ) {
    throw new Error('La bande de confiance à 95 % doit exposer [lowerPct, upperPct].');
  }

  if (!RISK_BADGE_STYLES[forecast.risk_level]) {
    throw new Error('Niveau de risque invalide.');
  }
  return true;
}

export function test_intervention_scheduler_submits_form(): boolean {
  const validation = validateInterventionSubmission({
    zone: 'Oran',
    scheduled_at: '2026-10-12T08:00:00Z',
    priority: 'high',
    notes: 'Inspection préventive transformateur 400kV Es Senia',
  });

  if (!validation.valid) {
    throw new Error('Le formulaire valide doit être accepté.');
  }
  if (!validation.assignedOperator.includes('Karim Mansouri')) {
    throw new Error('Opérateur assigné incorrect pour la zone Oran.');
  }
  return true;
}

export function test_sms_gateway_panel_renders_status(): boolean {
  const status = buildDefaultSmsStatus();
  const summary = getSmsGatewayDisplaySummary(status);
  if (!summary.providerBadgeLabel || !PROVIDER_BADGE_META[status.active_provider]) {
    throw new Error('Le badge du provider SMS doit être affiché correctement.');
  }
  if (!summary.isCompliant1807) {
    throw new Error('La passerelle SMS doit être conforme à la Loi 18-07 (<= 160 car.).');
  }
  return true;
}

export function test_escalation_policy_panel_saves_config(): boolean {
  const saved = validateAndSaveEscalationPolicy({
    sms_timeout_seconds: 45,
    voice_call_timeout_seconds: 240,
    active_channels: ['FCM', 'SMS'],
    trigger_severities: ['CRITICAL', 'EMERGENCY'],
    daily_sms_limit: 400,
    retry_attempts: 3,
    updated_by: 'admin',
  });
  if (saved.sms_timeout_seconds !== 45 || saved.daily_sms_limit !== 400) {
    throw new Error('La politique d’escalade doit conserver les paramètres configurés.');
  }
  if (!saved.active_channels.includes('SMS')) {
    throw new Error('Le canal SMS doit être actif dans la politique sauvegardée.');
  }
  return true;
}

export function test_theme_toggle_persists_choice(): boolean {
  const memStore: Record<string, string> = {};
  const mockStorage = {
    getItem: (k: string) => memStore[k] ?? null,
    setItem: (k: string, v: string) => {
      memStore[k] = v;
    },
  };

  for (const mode of ['dark', 'light', 'auto'] as ThemePreference[]) {
    persistThemeChoice(mode, mockStorage);
    const loaded = loadPersistedThemeChoice(mockStorage);
    if (loaded !== mode) {
      throw new Error(`Attendu ${mode} dans localStorage, obtenu ${loaded}`);
    }
  }
  return true;
}

export function test_dark_mode_contrast_meets_wcag(): boolean {
  if (ISA_101_DARK_PALETTE.background === '#000000') {
    throw new Error('Interdiction du noir pur (#000000) selon la norme ISA-101 (#121212 requis).');
  }
  if (ISA_101_DARK_PALETTE.background !== '#121212') {
    throw new Error('Le fond sombre pur doit être exactement #121212.');
  }
  if (ISA_101_DARK_PALETTE.textPrimary !== '#E0E0E0') {
    throw new Error('Le texte principal en mode sombre doit être #E0E0E0.');
  }

  const primaryRatio = computeWcagContrastRatio(
    ISA_101_DARK_PALETTE.textPrimary,
    ISA_101_DARK_PALETTE.background
  );
  const secondaryRatio = computeWcagContrastRatio(
    ISA_101_DARK_PALETTE.textSecondary,
    ISA_101_DARK_PALETTE.background
  );

  if (primaryRatio < 4.5 || secondaryRatio < 4.5) {
    throw new Error(
      `Contraste WCAG AA insuffisant (< 4.5:1) : primaire=${primaryRatio}:1, secondaire=${secondaryRatio}:1`
    );
  }
  return true;
}

export function test_critical_alert_is_visible_in_dark_mode(): boolean {
  if (SEVERITY_STYLES.emergency.hexColor !== '#FF3B30') {
    throw new Error('Alerte emergency doit utiliser le rouge #FF3B30.');
  }
  if (!SEVERITY_STYLES.emergency.badge.includes('animate-pulse')) {
    throw new Error('Alerte emergency doit comporter une animation pulse.');
  }
  if (SEVERITY_STYLES.critical.hexColor !== '#FF9500') {
    throw new Error('Alerte critical doit utiliser l’orange #FF9500.');
  }
  if (SEVERITY_STYLES.warning.hexColor !== '#FFCC00') {
    throw new Error('Alerte warning doit utiliser le jaune #FFCC00.');
  }

  // Vérification de visibilité sur fond #121212
  const emergencyRatio = computeWcagContrastRatio('#FF3B30', '#121212');
  const criticalRatio = computeWcagContrastRatio('#FF9500', '#121212');
  const warningRatio = computeWcagContrastRatio('#FFCC00', '#121212');
  if (emergencyRatio < 4.5 || criticalRatio < 4.5 || warningRatio < 4.5) {
    throw new Error('Les couleurs d’alerte doivent être parfaitement visibles sur #121212.');
  }
  return true;
}

export function test_charts_remain_readable_in_dark_mode(): boolean {
  const darkChart = getChartThemeTokens('dark');
  if (darkChart.backgroundColor !== '#121212') {
    throw new Error('Le fond des graphiques en mode sombre doit être #121212.');
  }
  const axisContrast = computeWcagContrastRatio(
    darkChart.axisStroke,
    darkChart.backgroundColor
  );
  if (axisContrast < 4.5) {
    throw new Error(`Les axes D3.js / Recharts doivent avoir un contraste >= 4.5:1 (obtenu ${axisContrast}:1)`);
  }
  if (
    darkChart.emergencyColor !== '#FF3B30' ||
    darkChart.criticalColor !== '#FF9500' ||
    darkChart.warningColor !== '#FFCC00'
  ) {
    throw new Error('Les lignes de seuils des graphiques doivent respecter #FF3B30, #FF9500 et #FFCC00.');
  }
  return true;
}


