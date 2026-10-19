// Registry of live game entities with numeric ids (ids are what go over the network in co-op).
export class EntityRegistry {
  #next = 1;
  #byId = new Map();

  add(entity) {
    entity.id = this.#next++;
    this.#byId.set(entity.id, entity);
    return entity;
  }

  remove(entity) {
    this.#byId.delete(entity.id);
  }

  get(id) {
    return this.#byId.get(id);
  }

  [Symbol.iterator]() {
    return this.#byId.values();
  }
}
