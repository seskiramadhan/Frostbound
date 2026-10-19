// The Jarl's requests: one repeatable job at a time (like Skyrim's radiant bounties), shown in the
// quest log as the quest 'jarlJob' ("Jarl's Request"): do the job, then return to the Jarl to be
// paid. Pay grows with every job done. Each player has their own (not offered to co-op guests).
// hooks.begin(type) does the world side of a job (refill a dungeon, call a dragon, start a raid).
import { CONFIG } from '../config.js';

const J = CONFIG.jobs;

export const JOB_TYPES = {
  den: {
    text: 'Clear out Frostfang Den',
    pitch: 'Wolves have moved back into Frostfang Den. Clear them out before they take our flocks again.',
    ok: w => w.quests.isDone('howlingDen'),
  },
  barrow: {
    text: 'Put the dead of Bleakrock Barrow back to rest',
    pitch: 'The dead walk in Bleakrock Barrow again. Go down there and put them back to rest.',
    ok: w => !!w.visited.barrow,
  },
  wolves: {
    text: `Hunt ${J.wolvesToHunt} wolves in the valley`,
    pitch: `The hunters say the valley wolves are getting bold. Thin the pack: ${J.wolvesToHunt} of them should do.`,
    ok: () => true,
  },
  dragon: {
    text: 'Slay the dragon over the valley',
    pitch: 'A dragon has been seen circling the valley. You know how to deal with those, Dragonborn.',
    ok: w => w.quests.isDone('dragonRising') && !w.huntDragon.active,
  },
  bandits: {
    text: 'Clear out the bandit camp',
    pitch: 'Bandits are back in their camp in the western forest, robbing the road. Clear them out.',
    ok: () => true,
  },
  raid: {
    text: 'Defend Riverholt from the raiders',
    pitch: 'My scouts saw raiders gathering in the forest. They will hit us soon. Man the barricades!',
    ok: w => !w.raid.active,
  },
};
export const RETURN_TEXT = 'Return to Jarl Balgrim for your reward';

export class Jobs {
  constructor(world, hooks) {
    this.world = world;
    this.hooks = hooks;
    this.count = 0;        // jobs finished (pay grows)
    this.current = null;   // { type, progress, complete }
    this.last = null;
    this.paid = false;
  }

  // Can the Jarl hand out work right now?
  get open() { return this.world.quests.isDone('howlingDen') && !this.world.raid.active; }
  get active() { return !!this.current; }

  // Pick a job type for the Jarl to offer (not the same as last time if there is a choice).
  offer() {
    const types = Object.keys(JOB_TYPES).filter(t => JOB_TYPES[t].ok(this.world));
    const pick = types.filter(t => t !== this.last);
    const type = (pick.length ? pick : types)[Math.floor(Math.random() * (pick.length || types.length))];
    return type ? { type, pitch: JOB_TYPES[type].pitch } : null;
  }

  accept(type) {
    this.current = { type, progress: 0, complete: false };
    this.last = type;
    this.paid = false;
    this.world.quests.restart('jarlJob');
    this.hooks.begin(type);
  }

  abandon() {
    this.current = null;
    this.world.quests.abandon('jarlJob');
  }

  // Gold the next payout is worth.
  get gold() { return Math.min(J.maxGold, J.baseGold + J.goldPerJob * this.count); }

  // Called by the quest when you report back.
  payout() {
    this.world.inventory.addGold(this.gold);
    this.count++;
    this.current = null;
  }

  // ---- Progress (main.js forwards the events) ----
  onWolfKilled() {
    const c = this.current;
    if (c?.type === 'wolves' && !c.complete && ++c.progress >= J.wolvesToHunt) c.complete = true;
  }
  onDragonSlain() { if (this.current?.type === 'dragon') this.current.complete = true; }
  onRaid(won) {
    const c = this.current;
    if (c?.type !== 'raid' || c.complete) return;
    if (won) c.complete = true;
    else { this.abandon(); this.hooks.failed?.(); }
  }

  #dungeon() { const t = this.current?.type; return t === 'den' || t === 'barrow' ? this.world[t] : null; }

  isComplete() {
    const c = this.current;
    if (!c) return false;
    const d = this.#dungeon();
    if (d && !c.complete) c.complete = !this.world.creaturesIn(d).some(e => e.alive);
    if (c.type === 'bandits' && !c.complete) c.complete = !this.world.campBandits().some(e => e.alive);
    return c.complete;
  }

  text() {
    const c = this.current;
    if (!c) return 'Ask Jarl Balgrim for work';
    const base = JOB_TYPES[c.type].text;
    return c.type === 'wolves' ? `${base} (${c.progress}/${J.wolvesToHunt})` : base;
  }

  // Objective marker: { level, pos } or null.
  target(w) {
    const c = this.current;
    if (!c) return null;
    const d = this.#dungeon();
    if (d) {
      const left = w.creaturesIn(d).find(e => e.alive);
      return { level: d, pos: left ? left.pos : d.exit };
    }
    if (c.type === 'wolves') {
      const wolf = w.valleyWolves().find(e => e.alive);
      return wolf ? { level: w.valley, pos: wolf.pos } : null;
    }
    if (c.type === 'bandits') {
      const b = w.campBandits().find(e => e.alive);
      return { level: w.valley, pos: b ? b.pos : w.camp.center };
    }
    if (c.type === 'dragon') return w.huntDragon.active ? { level: w.valley, pos: w.huntDragon.pos } : null;
    if (c.type === 'raid') return { level: w.valley, pos: w.bellPos };
    return null;
  }

  toJSON() { return { count: this.count, current: this.current, last: this.last, paid: this.paid }; }

  load(data) {
    if (!data) return;
    this.count = Math.max(0, data.count | 0);
    this.last = data.last ?? null;
    this.paid = !!data.paid;
    this.current = data.current && JOB_TYPES[data.current.type] ? { ...data.current } : null;
    // A raid or dragon in progress isn't saved: such a job can't be finished after a reload
    if (this.current && !this.current.complete && (this.current.type === 'raid' || this.current.type === 'dragon')) this.current = null;
    if (!this.current && this.world.quests.isActive('jarlJob')) this.world.quests.abandon('jarlJob');
  }
}
