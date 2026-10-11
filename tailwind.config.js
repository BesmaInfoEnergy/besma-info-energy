/**
 * Configuration Tailwind CSS (BesmaInfoEnergy)
 * Active le mode sombre par classe (`darkMode: 'class'`) conformément à la norme ISA-101 :
 * - Fond sombre pur : #121212 (jamais #000000)
 * - Texte principal : #E0E0E0 (contraste WCAG AA >= 12.6:1)
 * - Alertes : Emergency #FF3B30 (pulse), Critical #FF9500, Warning #FFCC00
 */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        isa: {
          bg: '#121212',
          surface: '#1A1A1A',
          card: '#222222',
          border: '#333333',
          text: '#E0E0E0',
          muted: '#B0B0B0',
          emergency: '#FF3B30',
          critical: '#FF9500',
          warning: '#FFCC00',
        },
      },
    },
  },
  plugins: [],
};
