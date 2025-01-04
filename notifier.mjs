import cron from 'node-cron';
import webpush from 'web-push';
import log from './log.mjs';


class Notifier {
  constructor(data, config) {
    this.config = config;
    this.c = config;
    this.data = data;
    this.jobs = [];
  }

  start() {
    log.info('Starting notifier')
    this.maybeSetupWebpush();
    this.update();
  }

  maybeSetupWebpush() {
    if (!this.c.push) {
      log.debug('Push notifications disabled')
      return;
    }
    webpush.setVapidDetails(
      this.c.externalUrl,
      this.c.publicVapidKey,
      this.c.privateVapidKey
    );
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

  async _maybeWebpush(subscription, payload) {
    if (!this.c.push) {
      log.debug({subscription, payload}, 'Push notifications disabled');
      return;
    }
    await webpush
      .sendNotification(subscription, payload)
      .catch(error => log.error(error));
  }


  async _sendNotification(s, payload) {
    const todoName = s.todoName;
    log.info(`Sending notifications for '${todoName}'`);
    const subscription = s.subscription;
    log.debug({todoName, payload, subscription});
    await this._maybeWebpush(subscription, payload);
    log.debug({todoName}, 'Notifications complete');
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
      url: `${this.c.externalUrl}/${todoName}`
    });
    if(this.c.push) {
      await this._sendNotification(s, payload);
    } else {
      log.debug({todoName, payload}, 'Push notifications disabled')
    }
  }

  async sendMuteNotification(s) {
    const todoName = s.todoName;
    const payload = JSON.stringify({
      title: `${todoName}`,
      body: `Notifications muted until ${s.muteUntil}`,
      url: this.c.externalUrl
    });
    await this._sendNotification(s, payload);
  }

  async sendSubscriptionNotification(s) {
    const todoName = s.todoName;
    const payload = JSON.stringify({
      title: todoName,
      body: `Subscribed to ${todoName}`,
      url: this.c.externalUrl
    });
    await this._sendNotification(s, payload);
  }
}


export default Notifier;
