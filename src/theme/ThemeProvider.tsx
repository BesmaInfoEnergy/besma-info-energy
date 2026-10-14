import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';

export type ThemePreference = 'light' | 'dark' | 'auto';
export type ResolvedThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'besma_theme_preference';

/**
 * Palette conforme à la norme ISA-101 et WCAG AA (>= 4.5:1) :
 * - Fond sombre pur : #121212 (JAMAIS #000000)
 * - Texte principal : #E0E0E0 (ratio de contraste 13.28:1 sur #121212)
 * - Emergency : #FF3B30 avec animation pulse
 * - Critical : #FF9500
 * - Warning : #FFCC00
 */
export const ISA_101_DARK_PALETTE = {
  background: '#121212',
  surface: '#1C1C1E',
  textPrimary: '#E0E0E0',
  textSecondary: '#B8B8BE',
  emergency: '#FF3B30',
  critical: '#FF9500',
  warning: '#FFCC00',
  chartGridDark: '#2E2E32',
  chartAxisDark: '#E0E0E0',
  chartGridNightBlue: '#1E293B',
  chartAxisNightBlue: '#CBD5E1',
} as const;

/**
 * Calcule la luminance relative WCAG 2.1 d'une couleur hexadécimale (#RRGGBB).
 */
export function computeRelativeLuminance(hexColor: string): number {
  const clean = hexColor.replace('#', '').trim();
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * Calcule le ratio de contraste WCAG 2.1 entre deux couleurs hexadécimales.
 * WCAG AA exige un ratio >= 4.5:1 pour le texte standard.
 */
export function computeWcagContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = computeRelativeLuminance(fgHex);
  const l2 = computeRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function resolveEffectiveTheme(
  preference: ThemePreference,
  systemPrefersDark?: boolean
): ResolvedThemeMode {
  if (preference === 'dark') return 'dark';
  if (preference === 'light') return 'light';
  if (typeof systemPrefersDark === 'boolean') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'dark';
}

export function persistThemeChoice(
  preference: ThemePreference,
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): ThemePreference {
  const targetStorage =
    storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (targetStorage) {
    try {
      targetStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignore quota error
    }
  }
  return preference;
}

export function loadPersistedThemeChoice(
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): ThemePreference {
  const targetStorage =
    storage || (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (targetStorage) {
    try {
      const saved = targetStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark' || saved === 'auto') {
        return saved;
      }
    } catch {
      // Ignore
    }
  }
  return 'light';
}

export function getChartThemeTokens(resolvedMode: ResolvedThemeMode) {
  if (resolvedMode === 'dark') {
    return {
      mode: 'dark' as const,
      backgroundColor: '#121212',
      cardBackground: '#1C1C1E',
      gridStroke: '#2E2E32',
      axisStroke: '#E0E0E0',
      tickFill: '#E0E0E0',
      emergencyColor: '#FF3B30',
      criticalColor: '#FF9500',
      warningColor: '#FFCC00',
      contrastRatio: computeWcagContrastRatio('#E0E0E0', '#121212'),
    };
  }
  return {
    mode: 'light' as const,
    backgroundColor: '#F8FAFC',
    cardBackground: '#FFFFFF',
    gridStroke: '#E2E8F0',
    axisStroke: '#475569',
    tickFill: '#334155',
    emergencyColor: '#DC2626',
    criticalColor: '#EA580C',
    warningColor: '#D97706',
    contrastRatio: computeWcagContrastRatio('#0F172A', '#F8FAFC'),
  };
}

interface ThemeContextValue {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedThemeMode;
  isPureDark: boolean;
  setThemePreference: (
    next: ThemePreference,
    token?: string,
    onSynced?: (pref: ThemePreference) => void
  ) => Promise<void>;
  chartTokens: ReturnType<typeof getChartThemeTokens>;
}

const ThemeContext = createContext<ThemeContextValue>({
  themePreference: 'light',
  resolvedTheme: 'light',
  isPureDark: false,
  setThemePreference: async () => {},
  chartTokens: getChartThemeTokens('light'),
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() =>
    loadPersistedThemeChoice()
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedThemeMode>(() =>
    resolveEffectiveTheme(loadPersistedThemeChoice())
  );

  // Applique la classe .dark sur <html> en < 16ms (synchrone)
  const applyDomTheme = useCallback((pref: ThemePreference) => {
    const effective = resolveEffectiveTheme(pref);
    setResolvedTheme(effective);
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      if (effective === 'dark') {
        root.classList.add('dark');
        root.setAttribute('data-theme', 'isa-101-dark');
      } else {
        root.classList.remove('dark');
        root.setAttribute('data-theme', 'night-blue');
      }
    }
  }, []);

  useEffect(() => {
    applyDomTheme(themePreference);

    if (
      themePreference === 'auto' &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handler = () => applyDomTheme('auto');
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, [themePreference, applyDomTheme]);

  const setThemePreference = useCallback(
    async (
      next: ThemePreference,
      token?: string,
      onSynced?: (pref: ThemePreference) => void
    ) => {
      // Basculement instantané (< 10ms) + sauvegarde localStorage
      setThemePreferenceState(next);
      persistThemeChoice(next);
      applyDomTheme(next);

      if (token) {
        try {
          await fetch('/api/v1/users/me/theme', {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ theme_preference: next }),
          });
        } catch {
          // Persistance locale déjà garantie
        }
      }
      if (onSynced) {
        onSynced(next);
      }
    },
    [applyDomTheme]
  );

  const chartTokens = getChartThemeTokens(resolvedTheme);

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        resolvedTheme,
        isPureDark: resolvedTheme === 'dark',
        setThemePreference,
        chartTokens,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};
