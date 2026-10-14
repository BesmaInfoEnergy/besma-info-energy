import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ThemeProvider } from './theme/ThemeProvider';
import './index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[BesmaInfoEnergy] Erreur React non interceptee:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#0F172A',
          color: '#F8FAFC',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{
            maxWidth: '600px',
            background: '#1E293B',
            border: '1px solid #EF4444',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 10px 25px rgba(0,0,0,0.5)'
          }}>
            <h2 style={{ color: '#EF4444', marginTop: 0, fontSize: '20px' }}>
              ⚠ Erreur d'initialisation du tableau de bord
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '14px' }}>
              Une exception a été interceptée lors du rendu du tableau de bord :
            </p>
            <pre style={{
              background: '#0F172A',
              padding: '12px',
              borderRadius: '6px',
              fontSize: '12px',
              color: '#FCA5A5',
              overflowX: 'auto',
              border: '1px solid #334155'
            }}>
              {this.state.error?.message || 'Erreur inconnue'}
            </pre>
            <button
              onClick={() => {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload();
              }}
              style={{
                marginTop: '16px',
                padding: '10px 18px',
                background: '#10B981',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              🔄 Réinitialiser le cache et recharger
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootElem = document.getElementById('root');
if (!rootElem) {
  throw new Error('[BesmaInfoEnergy] #root introuvable dans index.html');
}

createRoot(rootElem).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);