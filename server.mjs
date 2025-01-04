import express from 'express';
import expressWs from 'express-ws';
import path from 'path';
import bodyParser from 'body-parser';
import fs from 'fs';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import ServerConfig from './serverconfig.mjs';
import log from './log.mjs';
import Data from './data.mjs';
import SubInfo from './subinfo.mjs';
import Notifier from './notifier.mjs';


const dirname = import.meta.dirname;


class Server {
  constructor(config) {
    this.config = config;
    this.c = config;
    log.debug({config: this.config})
    this.app = express();
    expressWs(this.app);
    this.data = new Data({});
  }

  save() {
    try {
      fs.writeFileSync(
        this.c.dataFile,
        JSON.stringify(this.data, null, 2)
      );
    } catch (error) {
      log.error(error);
    }
  }

  load(strict=true) {
    try {
      const data = fs.readFileSync(this.c.dataFile);
      this.data = new Data(JSON.parse(data), strict);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.data = new Data({}, strict);
        return;
      }
      throw error;
    }
  }

  async get(req, res) {
    const todoName = req.params.code;
    log.info(`Received GET for '${todoName}'`)
    res.sendFile(path.join(dirname, 'public', 'index.html'));
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

  reqLog(req, _, next) {
    log.debug({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
    });
    next();
  }

  start() {
    this.load();
    this.app.use(this.reqLog.bind(this));
    this.app.use(bodyParser.json());
    this.app.use(
      '/static',
      express.static(path.join(dirname, 'public'))
    );
    this.app.use(
      '/service-worker.js',
      express.static(path.join(dirname, 'service-worker.js'))
    );
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
    const port = this.c.port;
    this.server = this.app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
    this.notifier.start();
  }
}


const defaultConfig = new ServerConfig({env: {}});
const dc = defaultConfig;
let y = yargs(hideBin(process.argv))
for (const name of dc.names) {
  y = y.option(
    name,
    {
      describe: `${dc.descriptions[name]} [${dc.envNames[name]}] (${dc.defaultValues[name]})`,
      type: dc.types[name]
    }
  );
}
y = y.command(
  'start',
  'Start the server',
  () => {
    const config = new ServerConfig({options: y.argv});
    const server = new Server(config);
    server.start();
  }
);
y.help()
  .wrap(y.terminalWidth())
  .env()
  .parse();
