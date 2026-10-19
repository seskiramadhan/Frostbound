// Inventory: item counts by id, gold, and what's equipped (weapon, armor, bow). Item stats live in CONFIG.items.
// Emits 'inventory' (anything changed) and 'itemAdded' { id, count } / 'goldAdded' { amount }.
import { CONFIG } from '../config.js';

export const ITEMS = CONFIG.items;

export class Inventory {
  constructor(events) {
    this.events = events;
    this.reset();
  }

  reset() {
    const S = CONFIG.startInventory;
    this.items = { ...S.items };
    this.gold = S.gold;
    this.equipped = { weapon: S.weapon, armor: S.armor, bow: null };
  }

  count(id) { return this.items[id] ?? 0; }

  add(id, count = 1, quiet = false) {
    if (!ITEMS[id]) return;
    this.items[id] = this.count(id) + count;
    if (ITEMS[id].type === 'bow' && !this.equipped.bow) this.equipped.bow = id;   // first bow: ready to use
    if (!quiet) this.events.emit('itemAdded', { id, count });
    this.events.emit('inventory');
  }

  // Pay from your gold. Returns false (and spends nothing) if you can't afford it.
  spend(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    this.events.emit('inventory');
    return true;
  }

  addGold(amount, quiet = false) {
    this.gold += amount;
    if (!quiet) this.events.emit('goldAdded', { amount });
    this.events.emit('inventory');
  }

  remove(id, count = 1) {
    const n = this.count(id) - count;
    if (n > 0) this.items[id] = n; else delete this.items[id];
    this.events.emit('inventory');
  }

  equip(id) {
    const def = ITEMS[id];
    if (!def || !this.count(id) || !['weapon', 'armor', 'bow'].includes(def.type)) return;
    this.equipped[def.type] = id;
    this.events.emit('inventory');
  }

  // Equip gear, drink a potion or read a spell tome. Returns true if something happened.
  // Emits 'readTome' { id, spell } for tomes (main teaches the spell).
  use(id, player) {
    const def = ITEMS[id];
    if (!def || !this.count(id)) return false;
    if (def.type === 'potion') {
      if (!player.alive) return false;
      player.heal(def.heal);
      this.remove(id);
      this.events.emit('potionUsed', { id });
      return true;
    }
    if (def.type === 'tome') {
      this.remove(id);
      this.events.emit('readTome', { id, spell: def.spell });
      return true;
    }
    if (['weapon', 'armor', 'bow'].includes(def.type)) { this.equip(id); return true; }
    return false;
  }

  // Grouped list for the UI: [{ type, entries: [{ id, def, count, equipped }] }]
  grouped() {
    const order = ['weapon', 'bow', 'armor', 'potion', 'tome', 'misc', 'quest'];
    return order.map(type => ({
      type,
      entries: Object.keys(this.items).filter(id => ITEMS[id]?.type === type).map(id => ({
        id, def: ITEMS[id], count: this.items[id], equipped: this.equipped[type] === id,
      })),
    })).filter(g => g.entries.length);
  }

  toJSON() { return { items: this.items, gold: this.gold, equipped: this.equipped }; }

  load(data) {
    if (!data) return;
    this.items = { ...data.items };
    this.gold = data.gold ?? 0;
    this.equipped = { ...this.equipped, ...data.equipped };
    for (const k of Object.keys(this.items)) if (!ITEMS[k]) delete this.items[k];
    this.events.emit('inventory');
  }
}
