let url = '';

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title ?? 'Title';
  const body = data.body ?? '';
  url = data.url ?? '';
  const options = {
    body: body,
    icon: '/icon.png',
    badge: '/badge.png',
    data: {
      url: url
    },
    actions: [
      {
        action: 'mute1',
        title: 'Mute for 1 hour'
      },
      {
        action: 'open',
        title: 'Open'
      }
    ],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

async function muteFor(seconds) {
  return await fetch(
    `${url}/mute`,
    {
      method: 'POST',
      body: JSON.stringify({ seconds }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

self.addEventListener('notificationclick', event => {
  const action = event.action;
  switch (action) {
    case 'mute1':
      muteFor(60 * 60);
      break;
    case 'mute8':
      muteFor(8 * 60 * 60);
      break;
    case 'mute24':
      muteFor(24 * 60 * 60);
      break;
    case 'open':
      clients.openWindow(`${url}`)
        .then((wc) => wc.focus());
      break;
  }
});
