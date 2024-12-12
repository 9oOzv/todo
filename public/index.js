
function reloadOrError(response) {
  if (response.ok) {
    window.location.reload();
    return
  }
  try {
    response.json().then(data => {
      alert(data.error);
    });
  } catch (e) {
    alert(response.statusText);
  }
}



function remove(itemId) {
  todoName = window.location.pathname.split('/')[1];
  fetch(`/${todoName}/remove`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ id: itemId })
  })
  .then(reloadOrError);
}

function _update({id, text, priority, date}) {
  const todoName = window.location.pathname.split('/')[1];
  text ??= document.getElementById(`text ${id}`).textContent;
  priority ??= parseInt(document.getElementById(`priority ${id}`).value);
  priority = isNaN(priority) ? 1 : priority;
  date ??= document.getElementById(`date ${id}`).value;
  const item = { id, text, priority, date }
  fetch(`/${todoName}/update`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(item)
  })
  .then(reloadOrError);
}

function update(itemId) {
  _update({id: itemId});
}

function resetDays(itemId) {
  _update({id: itemId, date: new Date()});
}

function addDays(itemId, days) {
  let date = new Date(document.getElementById(`date ${itemId}`).value);
  date = isNaN(date) ? new Date() : date;
  date.setDate(date.getDate() + days);
  _update({id: itemId, date});
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
  .then(reloadOrError);
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
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: 'BDXyko3QxCAbZ_IZ1uKYQCL51v3WxK6Z2jgEOvPixdtXSf97XPtm5-IA84SER2j0TSI-a_GqCtQ7sfKvY9mU2fI'  // VAPID public key
  });
  await registration.update();
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
  })
  .then(reloadOrError);
}

async function unsubscribe() {
  todoName = window.location.pathname.split('/')[1];
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  await subscription.unsubscribe();
  await fetch(`/${todoName}/unsubscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  .then(reloadOrError);
}

async function muteFor(seconds) {
  const todoName = window.location.pathname.split('/')[1];
  await fetch(`/${todoName}/mute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ seconds })
  })
  .then(reloadOrError);
}
