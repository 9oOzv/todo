import bunyan from 'bunyan';

const logLevel = process.env.DEBUG ? 'debug' : 'info';
const log = bunyan.createLogger({name: 'app', level: logLevel});

export default log;

