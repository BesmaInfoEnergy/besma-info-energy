import React from 'react';
import { useTheme, ThemePreference } from '../theme/ThemeProvider';
import { Sun, Moon, Monitor } from 'lucide-react';

interface ThemeToggleProps {
  token?: string;
  onThemeChanged?: (pref: ThemePreference) => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  token,
  onThemeChanged,
}) => {
  const { themePreference, setThemePreference } = useTheme();

  const modes: Array<{
    key: ThemePreference;
    label: string;
    title: string;
    icon: React.ReactNode;
  }> = [
    {
      key: 'light',
      label: 'Clair',
      title: 'Mode Clair (Visibilité Jour & Bureau SCADA · Fond #F1F5F9 / Cartes #FFFFFF)',
      icon: <Sun className="w-3.5 h-3.5" />,
    },
    {
      key: 'dark',
      label: 'Sombre',
      title: 'Mode Sombre Pur ISA-101 (Salle de Contrôle 24/7 · Fond #121212 / Cartes #1C1C1E)',
      icon: <Moon className="w-3.5 h-3.5" />,
    },
    {
      key: 'auto',
      label: 'Auto',
      title: 'Mode Automatique (Suit la préférence système OS)',
      icon: <Monitor className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div
      role="group"
      aria-label="Sélecteur de thème d'affichage ISA-101"
      className="inline-flex items-center bg-slate-900 dark:bg-[#1C1C1E] border border-slate-800 dark:border-[#333336] rounded-lg p-0.5"
    >
      {modes.map((m) => {
        const active = themePreference === m.key;
        return (
          <button
            key={m.key}
            type="button"
            title={m.title}
            onClick={() => setThemePreference(m.key, token, onThemeChanged)}
            className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              active
                ? 'bg-sky-400 text-slate-950 font-semibold shadow-xs'
                : 'text-slate-400 dark:text-[#B8B8BE] hover:text-white dark:hover:text-[#E0E0E0]'
            }`}
          >
            {m.icon}
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        );
      })}
    </div>
  );
};
