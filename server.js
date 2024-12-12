const express = require('express');
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


class Item {
  constructor({id, text, priority, date}) {
    id ??= uid();
    this.id = id;
    this.text = text;
    if(typeof priority !== 'number' || isNaN(priority)) {
      priority = 1;
    }
    this.priority = priority;
    date = date ? new Date(date) : new Date();
    this.date = new Date(date.toISOString().split('T')[0]);
  }

  dateString() {
    return this.date.toISOString().split('T')[0];
  }
}

class Todo {
  constructor({name, items}) {
    this.name = name;
    items ??= [];
    this.items = items.map(i => new Item(i));
  }

  update(item) {
    const index = this.items.findIndex(
      i => i.id === item.id
    );
    if (index === -1) {
      this.items.push(item);
    } else {
      this.items[index] = item;
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
  constructor({todoName, schedule, subscription, muteUntil}) {
    this.todoName = todoName;
    this.schedule = schedule;
    cron.validate(schedule);
    this.subscription = subscription;
    muteUntil = new Date(muteUntil);
    muteUntil = isNaN(muteUntil) ? null : muteUntil;
    this.muteUntil = muteUntil;
  }

  muteFor(seconds) {
    let date = this.muteUntil;
    date ??= new Date();
    const muteUntil = new Date(date.getTime() + seconds * 1000);
    this.muteUntil = isNaN(muteUntil) ? null : muteUntil;
  }
}

class Data {
  constructor({todos, subInfos}) {
    todos = todos ?? [];
    subInfos = subInfos ?? [];
    this.todos = todos.map(t => new Todo(t));
    this.subInfos = subInfos.map(s => new SubInfo(s));
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
      return null;
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
    this.data = new Data(this.config.dataFile);
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

  load() {
    try{
      const data = fs.readFileSync(this.config.dataFile);
      this.data = new Data(JSON.parse(data));
    } catch (error) {
      this.data = new Data({});
    }
  }

  async get(req, res) {
    const todoName = req.params.code;
    log.info(`Received GET for '${todoName}'`)
    const todo = this.data.todo(todoName);
    const subInfo = this.data.subscription(todoName);
    const html = await ejs.renderFile(
      path.join(__dirname, 'views', 'index.ejs'),
      {todo, subInfo}
    );
    res.send(html);
  }

  postUpdate(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST update for '${todoName}'`)
    const item = new Item(req.body);
    log.debug({todoName, item})
    this.data.todo(todoName).update(item);
    this.save();
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
    this.save();
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
    this.save();
    res.json({ success: true });
  }

  postUnsubscribe(req, res) {
    const todoName = req.params.code;
    log.info(`Received POST unsubscribe for '${todoName}'`)
    this.data.removeSubInfo(todoName);
    this.notifier.update();
    this.save();
    res.json({ success: true });
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
    this.save();
    res.json({ success: true });
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
    this.app.post('/:code/update', this.postUpdate.bind(this));
    this.app.post('/:code/remove', this.postRemove.bind(this));
    this.app.post('/:code/subscribe', this.postSubscribe.bind(this));
    this.app.post('/:code/unsubscribe', this.postUnsubscribe.bind(this));
    this.app.post('/:code/mute', this.postMute.bind(this));
    this.notifier = new Notifier(this.data, this.config);
    const port = this.config.port;
    this.app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
    this.notifier.start();
  }
}

const config = new Config();
const server = new Server(config);
server.start();
