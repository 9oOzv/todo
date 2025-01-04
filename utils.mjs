

function uid(){
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}


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

export {
  assertString,
  assertInt,
  assertDate,
  today,
  uid
}
