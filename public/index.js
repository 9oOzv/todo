
class SubInfo {
  constructor({schedule, muteUntil}) {
    this.schedule = schedule;
    this.muteUntil = muteUntil ? new Date(muteUntil) : undefined;
  }
}


class Data {
  constructor({todo = {}, subInfo}) {
    this.todo = new Todo(todo);
    this.subInfo = subInfo ? new SubInfo(subInfo) : undefined;
  }
}

class Todo {
  constructor({name = 'todo', items = []}) {
    this.name = name;
    this.items = [];
    for(const item of items) {
      this.items.push(new Item(item));
    }
  }

  getItem(id) {
    return this.items.find(i => i.id == id);
  }
}


class Item {
  constructor({id, text, priority, date}) {
    this.id = id;
    this.text = text;
    this.priority = priority;
    this.date = new Date(date);
  }

  update() {
    const titleElement = document.getElementById(`title ${this.id}`);
    const priorityElement = document.getElementById(`priority ${this.id}`);
    const dateElement = document.getElementById(`date ${this.id}`);
    titleElement.textContent = this.text;
    priorityElement.value = this.priority;
    dateElement.value = this.date.toISOString().split('T')[0];
  }

  create() {
    const titleElement = h1(`title ${this.id}`, 'label big f8', this.text);
    const priorityElement = input(`priority ${this.id}`, 'input f1', 'text', this.priority);
    const dateElement = input(`date ${this.id}`, 'input f1', 'date', this.date.toISOString().split('T')[0]);
    const element = div(`item ${this.id}`, '', '',
      [
        div('', 'row', '',
          [
            titleElement,
          ]
        ),
        div('', 'row', '',
          [
            div('', 'cell', '',
              [
                priorityElement,
                dateElement
              ]
            ),
            div('', 'cell', '',
              [
                button('', 'f1 button misc', 'now', () => resetDays(this.id)),
                button('', 'f1 button misc', '+1d', () => addDays(this.id, 1)),
                button('', 'f1 button misc', '+2d', () => addDays(this.id, 2)),
                button('', 'f1 button misc', '+7d', () => addDays(this.id, 7))
              ]
            ),
            div('', 'cell', '',
              [
                button('', 'f1 button tertiary icon', '󱩼', () => update(this.id)),
                button('', 'f1 button warn icon', '󰩹', () => remove(this.id))
              ]
            )
          ]
        )
      ]
    );
    document.getElementById('items').appendChild(element);
  }

  delete() {
    const element = document.getElementById(`item ${this.id}`);
    element.remove();
  }
}


var todoName = window.location.pathname.split('/')[1];
var data = new Data({});
var newData = undefined;
var doc = new Document();
var socket = undefined;


async function getData() {
  const res = await fetch(`/${todoName}/data`);
  newData = new Data(await res.json());
}

function h1(id, className, text) {
  const h1 = document.createElement('h1');
  h1.className = className;
  h1.id = id;
  h1.textContent = text;
  return h1;
}


function button(id, className, text, onclick) {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = text;
  button.onclick = onclick;
  return button;
}

function div(id, className, text, children) {
  const div = document.createElement('div');
  div.className = className;
  div.id = id;
  div.textContent = text;
  if (children) {
    children.forEach(c => div.appendChild(c));
  }
  return div;
}

function input(id, className, type, value) {
  const input = document.createElement('input');
  input.type = type;
  input.className = className;
  input.id = id;
  input.value = value;
  return input;
}

function updateItems() {
  const a = data;
  const b = newData;
  for(const item of a.todo.items) {
    if(!b.todo.getItem(item.id)) {
      item.delete();
    }
  }
  for(const item of b.todo.items) {
    if(!a.todo.getItem(item.id)) {
      item.create();
    } else {
      item.update();
    }
  }
}

function muteUntilText(subInfo) {
  console.log(subInfo);
  const now = new Date();
  return (
    subInfo
    ? (
      subInfo.muteUntil && subInfo.muteUntil > now
      ? `Muted until ${subInfo.muteUntil.toLocaleString()}`
      : 'Subscribed'
    )
    : 'Not subscribed'
  )
}

function updateSubInfo() {
  const subInfo = newData.subInfo;
  document.getElementById('schedule').value = subInfo?.schedule ?? '';
  document.getElementById('div-muted-until').textContent = muteUntilText(subInfo);
}

function updateSchedule() {
  const schedule = data.subInfo.schedu;
  if (schedule) {
    document.getElementById('schedule').value = schedule;
  }
}

function updateData() {
  if (!newData) {
    return;
  }
  updateItems();
  updateSubInfo();
  data = newData;
  newData = undefined;
}

function initSocket() {
  const url = `wss://${window.location.host}/${todoName}/ws`;
  console.log(url);
  socket = new WebSocket(url);
  socket.onmessage = async function(event) {
    newData = new Data(JSON.parse(event.data));
    updateData();
  }
}

async function onLoad() {
  await getData();
  updateData();
  initSocket();
}

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
}

async function _update({id, text, priority, date}) {
  const itemData = { id, text, priority, date }
  await fetch(`/${todoName}/update`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(itemData)
  })
}

async function update(itemId) {
  const id = itemId;
  const priority = document.getElementById(`priority ${itemId}`).value || undefined;
  const date = document.getElementById(`date ${itemId}`).value || undefined;
  await _update({id, priority, date});
}

function resetDays(itemId) {
  const id = itemId;
  date = new Date();
  _update({id, date});
}

function addDays(itemId, days) {
  const id = itemId;
  let date = new Date(document.getElementById(`date ${itemId}`).value);
  date = isNaN(date) ? new Date() : date;
  date.setDate(date.getDate() + days);
  _update({id, date});
}

async function add() {
  const entryElement = document.getElementById('entry');
  const priorityElement = document.getElementById('priority');
  const dateElement = document.getElementById('date');
  const text = entryElement.value || undefined;
  let priority = priorityElement.value || undefined;
  priority = priority ? parseInt(priority) : undefined;
  const date = dateElement.value || undefined;
  const item = { text, priority, date };
  await _update(item);
  entryElement.value = '';
  priorityElement.value = '';
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
}

async function unsubscribe() {
  todoName = window.location.pathname.split('/')[1];
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return;
  }
  await subscription.unsubscribe();
  await fetch(`/${todoName}/unsubscribe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
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
}

document.addEventListener('DOMContentLoaded', function() {
  onLoad();
});
