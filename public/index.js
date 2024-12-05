

function remove(item) {
  code = window.location.pathname.split('/')[1];
  fetch(`/${code}/remove`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({ item })
  })
  .then((res) => res.json())
  .then((data) => {
      if (data.success) {
          window.location.reload();
      }
  })
}

function add(item) {
  const code = window.location.pathname.split('/')[1];
  fetch(`/${code}/add`, {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({ item })
  })
  .then((res) => res.json())
  .then((data) => {
      if (data.success) {
          window.location.reload();
      }
  })
}

async function subscribe() {
  const code = window.location.pathname.split('/')[1];
  let schedule = document.getElementById('schedule').value;
  if(!schedule) {
    schedule = document.getElementById('schedule').placeholder;
  }
  if (!('serviceWorker' in navigator && 'PushManager' in window)) {
    console.log('Push messaging is not supported');
    return;
  }
  navigator.serviceWorker.register('/service-worker.js')
  console.log('foo')
  const registration = await navigator.serviceWorker.ready;
  console.log('bar')
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'BDXyko3QxCAbZ_IZ1uKYQCL51v3WxK6Z2jgEOvPixdtXSf97XPtm5-IA84SER2j0TSI-a_GqCtQ7sfKvY9mU2fI'  // VAPID public key
  });
  console.log('User is subscribed:', subscription);
  await fetch(`/${code}/subscribe`, {
    method: 'POST',
    body: JSON.stringify({
      schedule,
      subscription,
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function unsubscribe() {
  code = window.location.pathname.split('/')[1];
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await fetch(`/${code}/unsubscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  await subscription.unsubscribe();
}
