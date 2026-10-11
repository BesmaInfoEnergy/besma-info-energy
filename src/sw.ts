/**
 * Service Worker FCM (Firebase Cloud Messaging) — BesmaInfoEnergy
 * Gère la réception des alertes critiques en arrière-plan (topics: alertes-critiques, alertes-zone-<hash>)
 * et le clic d'acquittement opérateur SCADA.
 */

/// <reference lib="webworker" />

const swSelf = self as unknown as ServiceWorkerGlobalScope;

swSelf.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(swSelf.skipWaiting());
});

swSelf.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(swSelf.clients.claim());
});

swSelf.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: any = {};
  try {
    payload = event.data.json();
  } catch {
    payload = {
      notification: {
        title: '[SCADA CRITIQUE] Alerte Réseau BesmaInfoEnergy',
        body: event.data.text(),
      },
      data: {},
    };
  }

  const title =
    payload.notification?.title || '[SCADA CRITIQUE] Alerte Réseau National';
  const options: NotificationOptions = {
    body:
      payload.notification?.body ||
      'Anomalie détectée sur le réseau Électricité/Gaz. Acquittement requis.',
    tag: payload.data?.notification_id || 'besma-fcm-critical',
    data: payload.data || {},
    requireInteraction: true,
  };

  event.waitUntil(swSelf.registration.showNotification(title, options));
});

swSelf.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const notifData = event.notification.data || {};

  event.waitUntil(
    swSelf.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          client.postMessage({
            type: 'FCM_NOTIFICATION_CLICKED',
            notification_id: notifData.notification_id,
            data: notifData,
          });
          if ('focus' in client) {
            return client.focus();
          }
        }
        if (swSelf.clients.openWindow) {
          return swSelf.clients.openWindow('/');
        }
        return undefined;
      })
  );
});
