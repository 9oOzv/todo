let url = '';

self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  const title = data.title ?? 'Default title';
  url = data.url ?? '';
  console.log(url);
  const options = {
    body: data.title,
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
  const response = await fetch(
    `${url}/mute`,
    {
      method: 'POST',
      body: JSON.stringify({ seconds }),
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
  if (response.ok) {
    const hours = seconds / 60 / 60;
    await self.registration.showNotification(`Mute for ${hours} hours`);
    return true;
  } else {
    await self.registration.showNotification('Mute failed');
    return false;
  }
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
