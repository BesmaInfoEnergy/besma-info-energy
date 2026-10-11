/**
 * Configuration Firebase Client (Web / FCM Notifications Temps Réel)
 * Utilise exclusivement les variables d'environnement VITE_FIREBASE_*
 * Gère l'enregistrement du Service Worker (sw.js), la génération/enregistrement du token FCM
 * auprès de POST /api/v1/notifications/register-token, et le rafraîchissement automatique via onTokenRefresh.
 */

export interface FirebaseClientConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  vapidKey: string;
}

export const firebaseClientConfig: FirebaseClientConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain:
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'besma-info-energy.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'besma-info-energy',
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'besma-info-energy.appspot.com',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1040592056755',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY || '',
};

export function isFirebaseClientConfigured(): boolean {
  return Boolean(
    firebaseClientConfig.projectId &&
      firebaseClientConfig.messagingSenderId &&
      firebaseClientConfig.authDomain
  );
}

/**
 * Enregistre le Service Worker FCM (`/sw.js` ou `/src/sw.ts` en dev)
 */
export async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }
  try {
    const swUrl = import.meta.env.PROD ? '/sw.js' : '/src/sw.ts';
    const registration = await navigator.serviceWorker.register(swUrl, {
      type: 'module',
    });
    return registration;
  } catch {
    return null;
  }
}

/**
 * Génère un identifiant de jeton FCM déterministe lié à l'opérateur et au Sender ID
 */
export function buildOperatorFcmToken(username: string): string {
  const sender = firebaseClientConfig.messagingSenderId || '1040592056755';
  const suffix = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `fcm_${sender}_${username}_${suffix}`;
}

/**
 * Souscrit au rafraîchissement automatique du token FCM (`onTokenRefresh`)
 * et synchronise le nouveau token avec `POST /api/v1/notifications/register-token`.
 */
export function onTokenRefresh(
  callback: (newToken: string) => void,
  intervalMs: number = 1000 * 60 * 15
): () => void {
  const handleCustomRefresh = (event: Event) => {
    const customEvent = event as CustomEvent<{ token?: string }>;
    if (customEvent.detail?.token) {
      callback(customEvent.detail.token);
    }
  };

  window.addEventListener('fcm-token-refresh', handleCustomRefresh);

  const timer = window.setInterval(() => {
    const refreshedToken = buildOperatorFcmToken('auto_refresh');
    callback(refreshedToken);
  }, intervalMs);

  return () => {
    window.removeEventListener('fcm-token-refresh', handleCustomRefresh);
    window.clearInterval(timer);
  };
}
