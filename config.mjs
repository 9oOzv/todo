import log from './log.mjs';

class Config {

  constructor({ options = {}, env = process.env }) {
    this.options = options;
    this.env = env;
    this.descriptions = {};
    this.names = [];
    this.envNames = {};
    this.optionValues = {};
    this.envValues = {};
    this.defaultValues = {};
    this.types = {};
  }

  option(
    name,
    _default,
    description = 'no description',
    type = 'string',
  ) {
    const envName =
      name
      .replace(/\W+/g, '_')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .toUpperCase();
    const optionValue = this.options?.[name];
    const envValue = this.env[envName];
    this.names.push(name);
    this.envNames[name] = envName;
    this.envValues[name] = envValue;
    this.defaultValues[name] = _default;
    this.optionValues[name] = optionValue;
    this[name] =
      optionValue
      ?? envValue
      ?? _default;
    this.descriptions[name] = description;
    this.types[name] = type;
    log.debug({
      name,
      envName,
      optionValue,
      envValue,
      default: _default,
      description,
      type,
      value: this[name],
    });
  }
};

export default Config;
