// Service Worker para Tickets IT (PWA & Notificaciones)
const CACHE_NAME = 'tickets-it-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Enrutamiento en tiempo real con respaldo
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

// Manejo de clicks en notificaciones push del sistema operativo
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/admin');
      }
    })
  );
});
