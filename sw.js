// ============================================================
// SERVICE WORKER - Incidencias Hotel v3.0
// Web Push nativo con VAPID — funciona en Android background
// ============================================================

const APP_URL = self.location.origin + '/incidencias.html';

// ---- Instalar y activar inmediatamente ----
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// ---- Recibir Push del servidor (Android/iOS background) ----
self.addEventListener('push', (event) => {
  let data = { title: '🏨 Incidencias Hotel', body: 'Nueva incidencia recibida', incidenciaId: null };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='40' fill='%233b82f6'/%3E%3Ctext x='96' y='130' font-size='110' text-anchor='middle'%3E%F0%9F%8F%A8%3C/text%3E%3C/svg%3E",
      badge: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='20' fill='%233b82f6'/%3E%3Ctext x='48' y='68' font-size='56' text-anchor='middle'%3E%F0%9F%94%94%3C/text%3E%3C/svg%3E",
      vibrate: [200, 100, 200],
      tag: "incidencia-nueva",
      renotify: true,
      requireInteraction: false,
      data: { incidenciaId: data.incidenciaId, url: APP_URL }
    })
  );
});

// ---- Click en notificación ----
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || APP_URL;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes('incidencias') && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
