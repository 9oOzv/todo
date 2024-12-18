const express = require('express');
const expressWs = require('express-ws');
const webpush = require('web-push');
const path = require('path');
const bodyParser = require('body-parser');
const ejs = require('ejs');
const fs = require('fs');
const cron = require('node-cron');
const bunyan = require('bunyan');

logLevel = process.env.DEBUG ? 'debug' : 'info';
log = bunyan.createLogger({name: 'app', level: logLevel});

function uid(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

class Config {
  constructor() {
    this.port ??= process.env.PORT;
    this.port ??= 8080;
    this.dataFile ??= process.env.DATA_FILE;
    this.dataFile ??= path.join(__dirname, 'data.json');
    this.publicVapidKey ??= process.env.PUBLIC_VAPID_KEY;
    this.privateVapidKey ??= process.env.PRIVATE_VAPID_KEY;
    this.externalUrl ??= process.env.EXTERNAL_URL;
    this.externalUrl ??= `http://localhost:${this.port}`;
  }
};


function isString(value) {
  return typeof value === 'string' || value instanceof String;
}

function assertString(value, name = 'value') {
  if (!isString(value)) {
    throw new Error(`${name} must be a string`);
  }
}

function assertInt(value, name = 'value') {
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
}

function assertDate(value, name = 'value') {
  if (
    !(value instanceof Date)
    || isNaN(value)
  ) {
    throw new Error(`${name} must be a valid Date`);
  }
}

function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

class Item {
  constructor({ id, text, priority = 1, date = undefined }, strict=true) {
    date ??= today();
    const data = {id, text, priority, date};
    this.update(data, strict);
  }

  set({id, text, priority, date}) {
    this.id = id;
    this.text = text;
    this.priority = priority;
    this.date = date;
  }

  update({id, text, priority, date}, strict=false) {
    let data = {
      id: id ?? this.id ?? uid(),
      text: text ?? this.text,
      priority: priority ?? this.priority,
      date: new Date(date) ?? this.date,
    };
    if(strict) {
      this.validate(data);
      this.set(data);
    } else {
      data = this.fix(data);
      this.set(data);
    }
  }

  validate({id, text, priority, date}) {
    assertString(id, 'id');
    assertString(text, 'text');
    assertInt(priority, 'priority');
    assertDate(date, 'date');
  }


  fix({id, text, priority, date}) {
    id ??= uid();
    id = this.id.toString();
    text ??= '';
    text = this.text.toString();
    priority = parseInt(priority);
    if(isNaN(priority)) {
      priority = 1;
    }
    date = new Date(date);
    if(isNaN(date)) {
      date = new Date().toISOString().split('T')[0];
    }
    return {id, text, priority, date};
  }
}

class Todo {
  constructor({name, items}, strict=true) {
    // TODO: Handle `strict`
    this.name = name;
    items ??= [];
    this.items = items.map(i => new Item(i, strict));
  }

  update(itemData) {
    const id = itemData.id;
    const item = this.items.find(
      i => i.id === id
    );
    if (!item) {
      this.items.push(
        new Item(itemData)
      )
    } else {
      item.update(itemData);
    }
  }

  remove(itemId) {
    const index = this.items.findIndex(
      i => i.id === itemId
    );
    if (index === -1) {
      return;
    }
    this.items.splice(index, 1);
  }
}


class Notifier {
  constructor(data, config) {
    this.config = config;
    this.data = data;
    this.jobs = [];
  }

  start() {
    log.info('Starting notifier')
    this.update();
  }

  update() {
    log.info(`Stopping ${this.jobs.length} jobs`)
    for(const job of this.jobs) {
      job.stop();
    }
    this.jobs = [];
    const subInfos = this.data.subInfos;
    log.info(`Starting ${subInfos.length} jobs`)
    for (const s of subInfos) {
      const todoName = s.todoName;
      const schedule = s.schedule;
      log.debug({todoName, schedule})
      const f =
        async () =>
        this.sendItemNotification(s)
        .catch(error => log.error(error));
      const job = new cron.schedule(schedule, f);
      job.start();
      this.jobs.push(job);
    }
  }

  isDue(item) {
    const now = new Date();
    return item.date <= now;
  }

  async _sendNotification(s, payload) {
    const todoName = s.todoName;
    log.info(`Sending notification for '${todoName}'`)
    const subscription = s.subscription;
    log.debug({todoName, payload, subscription})
    await webpush
      .sendNotification(subscription, payload)
      .catch(error => log.error(error));
    log.debug({todoName}, 'Notification sent')
  }

  async sendItemNotification(s) {
    const now = new Date();
    if (s.muteUntil > now) {
      log.info(`Notifications for '${s.todoName}' muted until ${s.muteUntil}`)
      return;
    }
    const todoName = s.todoName;
    const todo = this.data.todo(todoName);
    const items = todo.items.filter(i => this.isDue(i));
    if (items.length === 0) {
      return;
    }
    const i = Math.floor(Math.random() * items.length);
    const randomItem = items[i];
    log.debug({todoName, randomItem})
    const payload = JSON.stringify({
      title: `${todoName}`,
      body: randomItem.text,
      url: `${this.config.externalUrl}/${todoName}`
    });
    await this._sendNotification(s, payload);
  }

  async sendMuteNotification(s) {
    const todoName = s.todoName;
    const payload = JSON.stringify({
      title: `${todoName}`,
      body: `Notifications muted until ${s.muteUntil}`,
      url: this.config.externalUrl
    });
    await this._sendNotification(s, payload);
  }

  async sendSubscriptionNotification(s) {
    const todoName = s.todoName;
    const payload = JSON.stringify({
      title: todoName,
      body: `Subscribed to ${todoName}`,
      url: this.config.externalUrl
    });
    await this._sendNotification(s, payload);
  }
}

class SubInfo {
  constructor({todoName, schedule, subscription, muteUntil}, strict=true) {
    //TODO: Handle `strict`
    this.todoName = todoName;
    this.schedule = schedule;
    cron.validate(schedule);
    this.subscription = subscription;
    muteUntil = new Date(muteUntil);
    muteUntil = isNaN(muteUntil) ? undefined : muteUntil;
    this.muteUntil = muteUntil;
  }

  muteFor(seconds) {
    let date = this.muteUntil;
    date ??= new Date();
    const muteUntil = new Date(date.getTime() + seconds * 1000);
    this.muteUntil = isNaN(muteUntil) ? undefined : muteUntil;
  }
}

class Data {
  constructor({todos, subInfos}, strict=true) {
    todos = todos ?? [];
    subInfos = subInfos ?? [];
    this.todos = todos.map(t => new Todo(t, strict));
    this.subInfos = subInfos.map(s => new SubInfo(s, strict));
  }

  todo(todoName) {
    for (const todo of this.todos) {
      if (todo.name === todoName) {
        return todo;
      }
    }
    const todo = new Todo({name: todoName});
    this.todos.push(todo);
    return todo
  }

  subscription(todoName) {
    try {
      return this.subInfos.find(
        s => s.todoName === todoName
      );
    } catch (error) {
      return undefined;
    }
  }

  addSubInfo(subInfo) {
    const todoName = subInfo.todoName;
    log.info(`Adding subscription for '${todoName}'`)
    const index = this.subInfos.findIndex(
      s => s.todoName === todoName
    );
    if (index === -1) {
      this.subInfos.push(subInfo);
    } else {
      this.subInfos[index] = subInfo;
    }
  }

  removeSubInfo(todoName) {
    log.info(`Removing subscription for '${todoName}'`)
    const index = this.subInfos.findIndex(
      s => s.todoName === todoName
    );
    if (index === -1) {
      return;
    }
    this.subInfos.splice(index, 1);
  }
}


class Server {
  constructor(config) {
    this.config = config;
    log.debug({config: this.config})
    this.app = express();
    expressWs(this.app);
    this.data = new Data({});
    webpush.setVapidDetails(
      config.externalUrl,
      config.publicVapidKey,
      config.privateVapidKey
    );
  }

  save() {
    fs.writeFileSync(
      this.config.dataFile,
      JSON.stringify(this.data, null, 2)
    );
  }

  load(strict=true) {
    const data = fs.readFileSync(this.config.dataFile);
    this.data = new Data(JSON.parse(data), strict);
  }

  async get(req, res) {
    const todoName = req.params.code;
    log.info(`Received GET for '${todoName}'`)
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }

  getData(req, res){
    const todoName = req.params.code;
    log.info(`Received GET data for '${todoName}'`)
    res.json(this.clientData(todoName));
  }

  postUpdate(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST update for '${todoName}'`)
    const itemData = req.body;
    log.debug({todoName, itemData})
    this.data.todo(todoName).update(itemData);
    this.updated(todoName);
    res.json({ success: true });
  }

  postRemove(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST remove for '${todoName}'`)
    const {id} = req.body;
    log.debug({todoName, id})
    this.data
      .todo(todoName)
      .remove(id);
    this.updated(todoName);
    res.json({ success: true });
  }

  postSubscribe(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST subscribe for '${todoName}`)
    const subInfo = new SubInfo(req.body);
    this.data
      .addSubInfo(subInfo);
    this.notifier.update();
    this.notifier.sendSubscriptionNotification(subInfo);
    this.updated(todoName);
    res.json({ success: true });
  }

  postUnsubscribe(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST unsubscribe for '${todoName}'`)
    this.data.removeSubInfo(todoName);
    this.notifier.update();
    this.updated(todoName);
    res.json({ success: true });
  }

  removeSocket(todoName, ws) {
    const sockets = this.sockets[todoName];
    if(!sockets) {
      return;
    }
    const index = sockets.indexOf(ws);
    if (index > -1) {
      sockets.splice(index, 1);
    }
  }

  ws(ws, req) {
    const todoName = req.params.code;
    log.info(`Received WS for '${todoName}'`)
    this.sockets[todoName] ??= [];
    this.sockets[todoName].push(ws);
    ws.on('close', () => {
      log.info(`Received WS CLOSE for '${todoName}'`);
      this.removeSocket(todoName, ws);
    });
  }

  postMute(req, res) {
    const todoName = req.params.code;
    const seconds = req.body.seconds;
    log.info(`Received POST mute for '${todoName}' (${seconds} seconds)`)
    const subInfo = this.data.subscription(todoName);
    if(!subInfo) {
      res.json({
        success: false,
        error: 'Subscription not found',
      });
      return;
    }
    subInfo.muteFor(seconds);
    this.notifier.sendMuteNotification(subInfo);
    this.updated(todoName)
    res.json({ success: true });
  }

  clientData(todoName) {
    const todo = this.data.todo(todoName);
    const subInfo = this.data.subscription(todoName);
    return {
      todo,
      subInfo: (
        subInfo
        ? {
          schedule: subInfo.schedule,
          muteUntil: subInfo.muteUntil
        }
        : undefined
      )
    };
  }

  updateClients(todoName) {
    log.info(`Updating clients for '${todoName}'`)
    const sockets = this.sockets[todoName];
    if(!sockets) {
      return;
    }
    const json = JSON.stringify(this.clientData(todoName));
    for (const ws of sockets) {
      log.info(`Sending WS update for '${todoName}'`)
      ws.send(json);
    }
  }

  updated(todoName) {
    this.save();
    this.updateClients(todoName);
  }

  start() {
    this.load();
    this.app.use(bodyParser.json());
    this.app.use(
      '/static',
      express.static(path.join(__dirname, 'public'))
    );
    this.app.use(
      '/service-worker.js',
      express.static(path.join(__dirname, 'service-worker.js'))
    )
    this.app.get('/:code', this.get.bind(this));
    this.app.ws('/:code/ws', this.ws.bind(this));
    this.app.get('/:code/data', this.getData.bind(this));
    this.app.post('/:code/update', this.postUpdate.bind(this));
    this.app.post('/:code/remove', this.postRemove.bind(this));
    this.app.post('/:code/subscribe', this.postSubscribe.bind(this));
    this.app.post('/:code/unsubscribe', this.postUnsubscribe.bind(this));
    this.app.post('/:code/mute', this.postMute.bind(this));
    this.notifier = new Notifier(this.data, this.config);
    this.sockets = {};
    const port = this.config.port;
    this.server = this.app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
    this.notifier.start();
  }
}

const config = new Config();
const server = new Server(config);
server.start();
