import Config from './config.mjs';
import path from 'path';

const dirname = import.meta.dirname;

class ServerConfig extends Config {

  constructor({ options = {}, env = process.env }) {
    super({options, env});
    this.option(
      'port',
      8080,
      'Port number',
      'number'
    );
    this.option(
      'dataFile',
      path.join(dirname, 'data.json'),
      'Data file'
    );
    this.option(
      'publicVapidKey',
      undefined,
      'Public VAPID key'
    );
    this.option(
      'privateVapidKey',
      undefined,
      'Private VAPID key'
    );
    this.option(
      'externalUrl',
      `http://localhost:${this.port}`,
      'External URL. Defaults to `http://localhost:<port>`'
    );
    this.option(
      'push',
      true,
      'Enable push notifications',
      'boolean'
    );
  }
};

export default ServerConfig;
