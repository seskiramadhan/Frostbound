// Inventory + skills menu. Opening it pauses the game (single player).
import { CONFIG } from '../config.js';
import { SKILL_IDS } from '../systems/skills.js';

const $ = id => document.getElementById(id);
const TYPE_NAMES = { weapon: 'Weapons', armor: 'Apparel', potion: 'Potions', misc: 'Misc' };

function stat(def) {
  if (def.type === 'weapon') return `Damage ${def.damage}`;
  if (def.type === 'armor') return `Armor ${def.armor}`;
  if (def.type === 'potion') return `Restores ${def.heal} health`;
  return `Value ${def.value}`;
}

export class Menu {
  constructor(inventory, skills, player) {
    this.inventory = inventory;
    this.skills = skills;
    this.player = player;
    this.el = $('menu');
    this.list = $('menu-list');
    this.goldEl = $('menu-gold');
    this.tab = 'items';
    this.open = false;

    $('menu-close').addEventListener('click', () => this.onClose?.());
    for (const b of document.querySelectorAll('#menu .tab')) {
      b.addEventListener('click', () => { this.tab = b.dataset.tab; this.render(); });
    }
  }

  show(open) {
    this.open = open;
    this.el.style.display = open ? 'flex' : 'none';
    if (open) this.render();
  }

  render() {
    for (const b of document.querySelectorAll('#menu .tab')) b.classList.toggle('on', b.dataset.tab === this.tab);
    this.goldEl.textContent = `${this.inventory.gold} gold`;
    this.list.innerHTML = '';
    if (this.tab === 'items') this.#renderItems(); else this.#renderSkills();
  }

  #row(cls) {
    const r = document.createElement('div');
    r.className = cls;
    this.list.appendChild(r);
    return r;
  }

  #renderItems() {
    const inv = this.inventory;
    for (const g of inv.grouped()) {
      this.#row('m-head').textContent = TYPE_NAMES[g.type];
      for (const e of g.entries) {
        const r = this.#row('m-item' + (e.equipped ? ' equipped' : ''));
        const name = document.createElement('span');
        name.textContent = e.def.name + (e.count > 1 ? ` (${e.count})` : '');
        const info = document.createElement('span');
        info.className = 'm-stat';
        info.textContent = e.equipped ? `${stat(e.def)} · Equipped` : stat(e.def);
        r.append(name, info);
        if (e.def.type !== 'misc' && !e.equipped) {
          r.classList.add('usable');
          r.addEventListener('click', () => { inv.use(e.id, this.player); this.render(); });
        }
      }
    }
    this.#row('m-hint').textContent = 'Tap an item to equip or drink it.';
  }

  #renderSkills() {
    const K = CONFIG.skills;
    for (const id of SKILL_IDS) {
      const r = this.#row('m-skill');
      const top = document.createElement('div');
      top.className = 'm-skill-top';
      const name = document.createElement('span'); name.textContent = K[id].name;
      const lvl = document.createElement('span'); lvl.textContent = this.skills.maxed(id) ? 'MAX' : `Level ${this.skills.level(id)} / ${K.maxLevel}`;
      top.append(name, lvl);
      const bar = document.createElement('div'); bar.className = 'bar';
      const fill = document.createElement('i'); fill.style.transform = `scaleX(${this.skills.progress(id)})`;
      bar.appendChild(fill);
      const perk = document.createElement('div');
      perk.className = 'm-stat' + (this.skills.maxed(id) ? ' perk-on' : '');
      perk.textContent = `Perk at max: ${K[id].perk.name} (${K[id].perk.desc})`;
      r.append(top, bar, perk);
    }
    this.#row('m-hint').textContent = 'Skills grow by use: land sword hits for One-Handed, block bites for Block.';
  }
}
