

function remove(itemId) {
  todoName = window.location.pathname.split('/')[1];
  fetch(`/${todoName}/remove`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: itemId })
  })
  .then((res) => res.json())
  .then((data) => {
    if (data.success) {
        window.location.reload();
    }
  })
}

function update(itemId) {
  const todoName = window.location.pathname.split('/')[1];
  text = document.getElementById(`text ${itemId}`).textContent;
  priority = parseInt(document.getElementById(`priority ${itemId}`).value);
  priority = isNaN(priority) ? 1 : priority;
  date = document.getElementById(`date ${itemId}`).value;
  const item = { id: itemId, text, priority, date }
  fetch(`/${todoName}/update`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(item)
  })
  .then((res) => res.json())
  .then((data) => {
      if (data.success) {
          window.location.reload();
      }
  })
}

function add() {
  const todoName = window.location.pathname.split('/')[1];
  text = document.getElementById('entry').value;
  priority = document.getElementById('priority').value;
  date = document.getElementById('date').value;
  const item = { text, priority, date }
  fetch(`/${todoName}/update`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(item)
  })
  .then((res) => res.json())
  .then((data) => {
      if (data.success) {
          window.location.reload();
      }
  })
}

async function subscribe() {
  const todoName = window.location.pathname.split('/')[1];
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
  await fetch(`/${todoName}/subscribe`, {
    method: 'POST',
    body: JSON.stringify({
      todoName,
      schedule,
      subscription,
    }),
    headers: {
      'Content-Type': 'application/json'
    }
  });
}

async function unsubscribe() {
  todoName = window.location.pathname.split('/')[1];
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await fetch(`/${todoName}/unsubscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  });
  await subscription.unsubscribe();
}
