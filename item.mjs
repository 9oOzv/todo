import {
  assertString,
  assertInt,
  assertDate,
  today,
  uid,
} from './utils.mjs';

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

export default Item;
