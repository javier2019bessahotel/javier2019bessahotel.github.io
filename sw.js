// ============================================================
// SERVICE WORKER - Incidencias Hotel
// Versión: 2.0 — Notificaciones nativas sin OneSignal
// ============================================================

const SUPABASE_URL = 'https://tkqxrjhbolauquirmojc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_efS_3aNiJS9MiYcxd6lzSw_a8fxonOm';
const APP_URL = self.location.origin + self.location.pathname.replace('sw.js', '');

// Canal Supabase Realtime por usuario
let realtimeSocket = null;
let currentUserId = null;
let currentUserDept = null;

// ---- Recibir mensaje desde la app principal ----
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

// ---- Conectar a Supabase Realtime ----
function connectRealtime(userId) {
  disconnectRealtime();

  // Supabase Realtime via WebSocket nativo
  const wsUrl = SUPABASE_URL.replace('https://', 'wss://') +
    `/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`;

  realtimeSocket = new WebSocket(wsUrl);

  realtimeSocket.onopen = () => {
    // Unirse al canal de notificaciones
    const joinMsg = {
      topic: 'realtime:public:notificaciones',
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          presence: { key: '' },
          postgres_changes: [
            {
              event: 'INSERT',
              schema: 'public',
              table: 'notificaciones',
              filter: `usuario_id=eq.${userId}`
            }
          ]
        }
      },
      ref: '1'
    };
    realtimeSocket.send(JSON.stringify(joinMsg));
  };

  realtimeSocket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);

      // Heartbeat
      if (msg.event === 'heartbeat') {
        realtimeSocket.send(JSON.stringify({
          topic: 'phoenix',
          event: 'heartbeat',
          payload: {},
          ref: null
        }));
        return;
      }

      // Nueva notificación insertada para este usuario
      if (
        msg.event === 'postgres_changes' &&
        msg.payload?.data?.type === 'INSERT' &&
        msg.payload?.data?.record
      ) {
        const record = msg.payload.data.record;
        if (record.usuario_id === userId) {
          showPushNotification(record);
        }
      }
    } catch (e) {
      // Ignorar mensajes malformados
    }
  };

  realtimeSocket.onerror = () => {
    // Reconectar tras 5 segundos si falla
    setTimeout(() => {
      if (currentUserId) connectRealtime(currentUserId);
    }, 5000);
  };

  realtimeSocket.onclose = () => {
    // Reconectar si se cierra inesperadamente
    setTimeout(() => {
      if (currentUserId) connectRealtime(currentUserId);
    }, 5000);
  };
}

function disconnectRealtime() {
  if (realtimeSocket) {
    realtimeSocket.onclose = null; // evitar reconexión automática
    realtimeSocket.close();
    realtimeSocket = null;
  }
}

// ---- Mostrar notificación nativa ----
function showPushNotification(record) {
  const texto = record.texto || 'Nueva incidencia recibida';
  const incidenciaId = record.incidencia_id;

  return self.registration.showNotification('🏨 Incidencias Hotel', {
    body: texto,
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' rx='40' fill='%233b82f6'/%3E%3Ctext x='96' y='130' font-size='110' text-anchor='middle'%3E%F0%9F%8F%A8%3C/text%3E%3C/svg%3E",
    badge: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' rx='20' fill='%233b82f6'/%3E%3Ctext x='48' y='68' font-size='56' text-anchor='middle'%3E%F0%9F%94%94%3C/text%3E%3C/svg%3E",
    vibrate: [200, 100, 200],
    tag: `incidencia-${incidenciaId}`,
    renotify: true,
    requireInteraction: false,
    data: { incidenciaId, url: APP_URL }
  });
}

// ---- Click en la notificación ---- 
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || APP_URL;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Si la app ya está abierta, enfocarla
      for (const client of clients) {
        if (client.url.includes('incidencias') && 'focus' in client) {
          return client.focus();
        }
      }
      // Si no está abierta, abrirla
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ---- Instalar y activar ----
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
