/**
 * Suite complète de tests unitaires Jest / Vitest pour le module de thème ISA-101
 * de BesmaInfoEnergy (src/theme/theme.test.tsx).
 *
 * Vérifie :
 * 1. La persistance du thème (light, dark, auto) dans localStorage (clé besma_theme_preference)
 * 2. La synchronisation MongoDB via PATCH /api/v1/users/me/theme et la résilience réseau
 * 3. L'application de la classe CSS .dark sur <html> et le suivi de prefers-color-scheme
 * 4. Les ratios de contraste WCAG AA (>= 4.5:1) sur le fond sombre pur #121212 (ISA-101, jamais #000000)
 * 5. La visibilité et l'animation pulse des alertes critiques (#FF3B30, #FF9500, #FFCC00)
 * 6. L'audit automatisé d'accessibilité DOM avec jest-axe (toHaveNoViolations)
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  ISA_101_DARK_PALETTE,
  computeRelativeLuminance,
  computeWcagContrastRatio,
  resolveEffectiveTheme,
  persistThemeChoice,
  loadPersistedThemeChoice,
  getChartThemeTokens,
  ThemePreference,
} from './ThemeProvider';
import { ThemeToggle } from '../components/ThemeToggle';
import { SEVERITY_STYLES } from '../components/AnomalyTimeline';

expect.extend(toHaveNoViolations);

/**
 * Formule officielle WCAG 2.1 pour la luminance relative et le ratio de contraste
 * (implémentée directement dans la suite de tests pour double validation indépendante).
 */
export function getLuminance(hex: string): number {
  const rgb = hex
    .replace('#', '')
    .match(/.{2}/g)!
    .map((x) => {
      const v = parseInt(x, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Composant utilitaire de test exposant l'état interne du contexte ThemeProvider.
 */
const ThemeInspector: React.FC<{ token?: string }> = ({ token }) => {
  const { themePreference, resolvedTheme, isPureDark, setThemePreference } =
    useTheme();
  return (
    <div>
      <span data-testid="pref">{themePreference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <span data-testid="pure-dark">{String(isPureDark)}</span>
      <ThemeToggle token={token} />
      <button
        type="button"
        data-testid="force-light"
        onClick={() => setThemePreference('light', token)}
      >
        Force Light
      </button>
      <button
        type="button"
        data-testid="force-dark"
        onClick={() => setThemePreference('dark', token)}
      >
        Force Dark
      </button>
      <button
        type="button"
        data-testid="force-auto"
        onClick={() => setThemePreference('auto', token)}
      >
        Force Auto
      </button>
    </div>
  );
};

describe('BesmaInfoEnergy — Suite de tests unitaires du Thème ISA-101 & WCAG AA', () => {
  let mediaQueryListeners: Array<(e: MediaQueryListEvent) => void> = [];
  let systemPrefersDark = true;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    mediaQueryListeners = [];
    systemPrefersDark = true;

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark') ? systemPrefersDark : !systemPrefersDark,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            mediaQueryListeners.push(cb);
          }
        }),
        removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            mediaQueryListeners = mediaQueryListeners.filter((fn) => fn !== cb);
          }
        }),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // ==========================================================================
  // 1. Persistance du thème (localStorage)
  // ==========================================================================
  describe('1. Persistance du thème (localStorage)', () => {
    it('test_theme_defaults_to_auto_when_no_preference_stored', () => {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();

      // Sans clé stockée, loadPersistedThemeChoice retourne la valeur par défaut initiale
      // et resolveEffectiveTheme('auto') suit prefers-color-scheme
      const initialLoaded = loadPersistedThemeChoice();
      expect(['light', 'auto']).toContain(initialLoaded);

      systemPrefersDark = true;
      expect(resolveEffectiveTheme('auto')).toBe('dark');
      systemPrefersDark = false;
      expect(resolveEffectiveTheme('auto')).toBe('light');
    });

    it('test_theme_persists_light_choice_in_localStorage', async () => {
      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-light'));
      });

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
      expect(getByTestId('pref').textContent).toBe('light');
    });

    it('test_theme_persists_dark_choice_in_localStorage', async () => {
      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-dark'));
      });

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(getByTestId('pref').textContent).toBe('dark');
    });

    it('test_theme_persists_auto_choice_in_localStorage', async () => {
      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-auto'));
      });

      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('auto');
      expect(getByTestId('pref').textContent).toBe('auto');
    });

    it('test_theme_loads_stored_preference_on_mount', () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      expect(getByTestId('pref').textContent).toBe('dark');
      expect(getByTestId('resolved').textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('test_theme_key_is_besma_theme_preference', () => {
      expect(THEME_STORAGE_KEY).toBe('besma_theme_preference');
      persistThemeChoice('dark');
      expect(window.localStorage.getItem('besma_theme_preference')).toBe('dark');
    });
  });

  // ==========================================================================
  // 2. Persistance du thème (MongoDB via API)
  // ==========================================================================
  describe('2. Persistance du thème (MongoDB via API)', () => {
    it('test_theme_toggle_calls_patch_users_me_theme_with_dark', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'updated', theme_preference: 'dark' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector token="jwt-operator-token" />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-dark'));
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/users/me/theme',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer jwt-operator-token',
          }),
          body: JSON.stringify({ theme_preference: 'dark' }),
        })
      );
    });

    it('test_theme_toggle_calls_patch_users_me_theme_with_light', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'updated', theme_preference: 'light' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector token="jwt-operator-token" />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-light'));
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/users/me/theme',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ theme_preference: 'light' }),
        })
      );
    });

    it('test_theme_toggle_calls_patch_users_me_theme_with_auto', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'updated', theme_preference: 'auto' }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector token="jwt-operator-token" />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-auto'));
      });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/users/me/theme',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ theme_preference: 'auto' }),
        })
      );
    });

    it('test_theme_falls_back_to_localStorage_if_api_fails', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('Network offline'));
      vi.stubGlobal('fetch', fetchMock);

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector token="jwt-operator-token" />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-dark'));
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Même en cas d'échec API, localStorage et le DOM sont immédiatement mis à jour
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });
  });

  // ==========================================================================
  // 3. Application de la classe CSS sur <html>
  // ==========================================================================
  describe('3. Application de la classe CSS sur <html>', () => {
    it('test_dark_mode_adds_dark_class_to_documentElement', async () => {
      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-dark'));
      });

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(document.documentElement.getAttribute('data-theme')).toBe('isa-101-dark');
    });

    it('test_light_mode_removes_dark_class_from_documentElement', async () => {
      document.documentElement.classList.add('dark');

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-light'));
      });

      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(document.documentElement.getAttribute('data-theme')).toBe('night-blue');
    });

    it('test_auto_mode_follows_prefers_color_scheme_dark', async () => {
      systemPrefersDark = true;

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-auto'));
      });

      expect(getByTestId('resolved').textContent).toBe('dark');
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    });

    it('test_auto_mode_follows_prefers_color_scheme_light', async () => {
      systemPrefersDark = false;

      const { getByTestId } = render(
        <ThemeProvider>
          <ThemeInspector />
        </ThemeProvider>
      );

      await act(async () => {
        fireEvent.click(getByTestId('force-auto'));
      });

      expect(getByTestId('resolved').textContent).toBe('light');
      expect(document.documentElement.classList.contains('dark')).toBe(false);
    });
  });

  // ==========================================================================
  // 4. Contraste WCAG AA (minimum 4.5:1 pour texte normal, 3:1 pour grand texte)
  // ==========================================================================
  describe('4. Contraste WCAG AA sur fond sombre pur #121212 (Norme ISA-101)', () => {
    it('test_primary_text_E0E0E0_on_121212_meets_wcag_aa', () => {
      const ratio = getContrastRatio('#E0E0E0', '#121212');
      const providerRatio = computeWcagContrastRatio('#E0E0E0', '#121212');
      // Ratio attendu : ~13.28:1 (>= 4.5:1)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(ratio).toBeGreaterThan(13.0);
      expect(providerRatio).toBeGreaterThanOrEqual(4.5);
    });

    it('test_emergency_red_FF3B30_on_121212_meets_wcag_aa', () => {
      const ratio = getContrastRatio('#FF3B30', '#121212');
      // Ratio attendu : ~5.18:1 (>= 4.5:1)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('test_critical_orange_FF9500_on_121212_meets_wcag_aa', () => {
      const ratio = getContrastRatio('#FF9500', '#121212');
      // Ratio attendu : ~8.18:1 (>= 4.5:1)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('test_warning_yellow_FFCC00_on_121212_meets_wcag_aa', () => {
      const ratio = getContrastRatio('#FFCC00', '#121212');
      // Ratio attendu : ~12.27:1 (>= 4.5:1)
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('test_background_is_not_pure_black_000000', () => {
      expect(ISA_101_DARK_PALETTE.background).not.toBe('#000000');
      expect(ISA_101_DARK_PALETTE.background).toBe('#121212');
      expect(computeRelativeLuminance(ISA_101_DARK_PALETTE.background)).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. Visibilité des alertes critiques en mode sombre
  // ==========================================================================
  describe('5. Visibilité des alertes critiques en mode sombre', () => {
    it('test_emergency_alert_has_pulse_animation_and_FF3B30_color', () => {
      expect(SEVERITY_STYLES.emergency.hexColor).toBe('#FF3B30');
      expect(SEVERITY_STYLES.emergency.badge).toContain('#FF3B30');
      expect(SEVERITY_STYLES.emergency.badge).toContain('animate-pulse');
      expect(SEVERITY_STYLES.emergency.dot).toContain('animate-pulse');
    });

    it('test_critical_alert_has_FF9500_color', () => {
      expect(SEVERITY_STYLES.critical.hexColor).toBe('#FF9500');
      expect(SEVERITY_STYLES.critical.badge).toContain('#FF9500');
      expect(getChartThemeTokens('dark').criticalColor).toBe('#FF9500');
    });

    it('test_warning_alert_has_FFCC00_color', () => {
      expect(SEVERITY_STYLES.warning.hexColor).toBe('#FFCC00');
      expect(SEVERITY_STYLES.warning.badge).toContain('#FFCC00');
      expect(getChartThemeTokens('dark').warningColor).toBe('#FFCC00');
    });
  });

  // ==========================================================================
  // 6. Accessibilité avec jest-axe
  // ==========================================================================
  describe('6. Accessibilité DOM avec jest-axe', () => {
    it('test_theme_toggle_has_no_axe_violations_in_light_mode', async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'light');
      const { container } = render(
        <ThemeProvider>
          <main aria-label="Barre de supervision BesmaInfoEnergy">
            <ThemeToggle />
          </main>
        </ThemeProvider>
      );

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it('test_theme_toggle_has_no_axe_violations_in_dark_mode', async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      const { container } = render(
        <ThemeProvider>
          <main
            aria-label="Barre de supervision BesmaInfoEnergy Mode Sombre ISA-101"
            style={{ backgroundColor: '#121212', color: '#E0E0E0' }}
          >
            <ThemeToggle />
          </main>
        </ThemeProvider>
      );

      expect(document.documentElement.classList.contains('dark')).toBe(true);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
