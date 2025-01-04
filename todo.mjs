import Item from './item.mjs';

class Todo {
  constructor({name, items}, strict=true) {
    // TODO: Handle `strict`
    this.name = name;
    items ??= [];
    this.items = items.map(i => new Item(i, strict));
  }

  update(itemData) {
    const id = itemData.id;
    const item = this.items.find(
      i => i.id === id
    );
    if (!item) {
      this.items.push(
        new Item(itemData)
      )
    } else {
      item.update(itemData);
    }
  }

  remove(itemId) {
    const index = this.items.findIndex(
      i => i.id === itemId
    );
    if (index === -1) {
      return;
    }
    this.items.splice(index, 1);
  }
}

export default Todo;
