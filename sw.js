// ============================================================
// SERVICE WORKER - Incidencias Hotel v2.0
// WebSocket Supabase Realtime + VAPID push
// ============================================================

const SUPABASE_URL = 'https://tkqxrjhbolauquirmojc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_efS_3aNiJS9MiYcxd6lzSw_a8fxonOm';
const APP_URL = self.location.origin + '/incidencias.html';

let realtimeSocket = null;
let currentUserId = null;
let currentUserDept = null;

// ---- Instalar y activar ----
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });

// ---- Recibir mensajes desde la app ----
self.addEventListener('message', (event) => {
  const { type, userId, departamento } = event.data || {};
  if (type === 'INIT_NOTIF' && userId) {
    currentUserId = userId;
    currentUserDept = departamento;
    connectRealtime(userId);
  }
  if (type === 'LOGOUT') {
    disconnectRealtime();
    currentUserId = null;
    currentUserDept = null;
  }
});

// ---- VAPID Push (Android background) ----
self.addEventListener('push', (event) => {
  let data = { title: '🏨 Incidencias Hotel', body: 'Nueva incidencia recibida', incidenciaId: null };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch(e) {}
  event.waitUntil(showNotif(data.title, data.body, data.incidenciaId));
});

// ---- WebSocket Supabase Realtime (iPhone) ----
function connectRealtime(userId) {
  disconnectRealtime();

  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
    `/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;

  realtimeSocket = new WebSocket(wsUrl);

  realtimeSocket.onopen = () => {
    realtimeSocket.send(JSON.stringify({
      topic: 'realtime:public:notificaciones',
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [{
            event: 'INSERT',
            schema: 'public',
            table: 'notificaciones',
            filter: `usuario_id=eq.${userId}`
          }]
        }
      },
      ref: '1'
    }));
  };

  realtimeSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.event === 'heartbeat') {
        realtimeSocket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: null }));
        return;
      }
      if (msg.event === 'postgres_changes' && msg.payload?.data?.type === 'INSERT') {
        const record = msg.payload.data.record;
        if (record.usuario_id === userId) {
          showNotif('🏨 Incidencias Hotel', record.texto || 'Nueva incidencia', record.incidencia_id);
        }
      }
    } catch(e) {}
  };

  realtimeSocket.onerror = () => {
    setTimeout(() => { if (currentUserId) connectRealtime(currentUserId); }, 5000);
  };

  realtimeSocket.onclose = () => {
    setTimeout(() => { if (currentUserId) connectRealtime(currentUserId); }, 5000);
  };
}

function disconnectRealtime() {
  if (realtimeSocket) {
    realtimeSocket.onclose = null;
    realtimeSocket.close();
    realtimeSocket = null;
  }
}

function showNotif(title, body, incidenciaId) {
  return self.registration.showNotification(title, {
    body,
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='40' fill='%233b82f6'/%3E%3Ctext x='96' y='130' font-size='110' text-anchor='middle'%3E%F0%9F%8F%A8%3C/text%3E%3C/svg%3E",
    badge: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='20' fill='%233b82f6'/%3E%3Ctext x='48' y='68' font-size='56' text-anchor='middle'%3E%F0%9F%94%94%3C/text%3E%3C/svg%3E",
    vibrate: [200, 100, 200],
    tag: `incidencia-${incidenciaId || Date.now()}`,
    renotify: true,
    requireInteraction: false,
    data: { incidenciaId, url: APP_URL }
  });
}

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
