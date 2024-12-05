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


const config = {
  port: 8080,
  dataFile: path.join(__dirname, 'data.json'),
  publicVapidKey: '<public key>',
  privateVapidKey: '<private key',
}

class Notifier {
  constructor(data) {
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
    const subscriptions = this.data.subscriptions();
    log.info(`Starting ${subscriptions.length} jobs`)
    for (const s of subscriptions) {
      const code = s.code;
      const schedule = s.schedule;
      log.debug({code, schedule})
      const job = new cron.schedule(
        schedule,
        () => this.send_notification(s),
      );
      job.start();
      this.jobs.push(job);
    }
  }

  send_notification(s) {
    const code = s.code;
    log.info(`Sending notifications for '${code}'`)
    subscription = s.subscription;
    const items = this.data.items(code);
    if (items.length === 0) {
      return;
    }
    const random_item = items[Math.floor(Math.random() * items.length)];
    const payload = JSON.stringify({
      title: `${random_item}`,
    });
    webpush
      .sendNotification(subscription, payload)
      .catch(error => console.error(error));
  }
}

class Data {
  constructor(file) {
    this.file = file;
    this.init();
    this.load();
    this.fix();
  }

  init() {
    this.data = {
      lists: [],
      subscriptions: []
    };
  }

  fix() {
    for (const s of this.data.subscriptions) {
      if (!s.schedule) {
        s.schedule = '0 9 * * *';
      }
    }
    this.save();
  }

  load() {
    log.info(`Loading from ${this.file}`)
    try {
      this.data = require(this.file);
    } catch (error) {
      this.init();
    }
  }

  save() {
    log.info(`Saving to ${this.file}`)
    fs.writeFileSync(
      this.file,
      JSON.stringify(this.data)
    );
  }

  items(code) {
    for (const list of this.data.lists) {
      if (list.code === code) {
        return list.items;
      }
    }
    const list = {
      code: code,
      items: []
    }
    this.data.lists.push(list);
    this.save();
    return list.items;
  }

  subscription(code) {
    try {
      return this.data.subscriptions.find(
        s => s.code === code
      );
    } catch (error) {
      return null;
    }
  }

  subscriptions() {
    return this.data.subscriptions;
  }

  add(code, item) {
    const items = this.items(code);
    items.push(item);
    this.save();
  }

  remove(code, item) {
    const items = this.items(code);
    const index = items.indexOf(item);
    if (index === -1) {
      return;
    }
    items.splice(index, 1);
    this.save();
  }

  add_subscription(code, subscription, schedule = '0 9 * * *') {
    log.info(`Adding subscription for '${code}'`)
    cron.validate(schedule);
    const subscriptions = this.subscriptions();
    const index = subscriptions.findIndex(
      s => s.code === code
    );
    if (index === -1) {
      subscriptions.push({ code, schedule, subscription });
    } else {
      subscriptions[index] = { code, schedule, subscription };
    }
    this.save();
  }

  remove_subscription(code) {
    log.info(`Removing subscription for '${code}'`)
    const subscriptions = this.subscriptions();
    const index = subscriptions.findIndex(
      s => s.code === code
    );
    if (index === -1) {
      return;
    }
    subscriptions.splice(index, 1);
    this.save();
  }
}


class Server {
  constructor(config) {
    this.config = config;
    this.app = express();
    this.data = new Data(this.config.dataFile);
    this.notifier = new Notifier(this.data);
  }

  async get(req, res) {
    const code = req.params.code;
    log.info(`Received GET for '${code}'`)
    const schedule = this.data.subscription(code)?.schedule ?? '';
    const data = {
      items: this.data.items(code),
      code: code,
      schedule: schedule,
    }
    const html = await ejs.renderFile(
      path.join(__dirname, 'views', 'index.ejs'),
      data
    );
    res.send(html);
  }

  post_add(req, res) {
    const code = req.params.code;
    log.info(`Received POST add for '${code}'`)
    const item = req.body.item;
    this.data.add(code, item);
    res.json({ success: true });
  }

  post_remove(req, res) {
    const code = req.params.code;
    log.info(`Received POST remove for '${code}'`)
    const item = req.body.item;
    this.data.remove(code, item);
    res.json({ success: true });
  }

  post_subscribe(req, res) {
    const code = req.params.code;
    log.info(`Received POST subscribe for '${code}`)
    const { schedule, subscription } = req.body;
    const payload = JSON.stringify({
      title: `Subscribed to ${code}`
    });
    this.data.add_subscription(
      code,
      subscription,
      schedule
    );
    webpush
      .sendNotification(subscription, payload)
      .catch(error => console.error(error));
    this.notifier.update();
    res.json({ success: true });
  }

  post_unsubscribe(req, res) {
    const code = req.params.code;
    log.info(`Received POST unsubscribe for '${code}'`)
    this.data.remove_subscription(code);
    this.notifier.update();
    res.json({ success: true });
  }

  start() {
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
    this.app.post('/:code/add', this.post_add.bind(this));
    this.app.post('/:code/remove', this.post_remove.bind(this));
    this.app.post('/:code/subscribe', this.post_subscribe.bind(this));
    this.app.post('/:code/unsubscribe', this.post_unsubscribe.bind(this));
    this.notifier = new Notifier(this.data);
    const port = this.config.port;
    this.app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
    this.notifier.start();
  }
}

webpush.setVapidDetails(
  'https://localhost:8080',
  config.publicVapidKey,
  config.privateVapidKey
);

const server = new Server(config);
server.start();
