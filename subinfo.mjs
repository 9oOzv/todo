import cron from 'node-cron';


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

export default SubInfo;
