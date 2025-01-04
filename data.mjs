import log from './log.mjs';
import Todo from './todo.mjs';
import SubInfo from './subinfo.mjs';


class Data {
  constructor({todos, subInfos}, strict=true) {
    todos = todos ?? [];
    subInfos = subInfos ?? [];
    this.todos = todos.map(t => new Todo(t, strict));
    this.subInfos = subInfos.map(s => new SubInfo(s, strict));
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
      return undefined;
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

export default Data;
