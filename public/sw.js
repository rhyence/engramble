self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Engramble', body: event.data?.text() || 'Time for today\'s study games.' };
  }

  const title = payload.title || 'Engramble';
  const options = {
    body: payload.body || 'Time for today\'s study games.',
    tag: payload.tag || 'engramble-reminder',
    icon: '/icon-192-final.png',
    badge: '/icon-192-final.png',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = allClients.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.focus();
      existing.navigate(url);
      return;
    }
    await self.clients.openWindow(url);
  })());
});
