// Quests as ordered steps. Each step's done(world) is checked every tick, so doing
// things out of order (looting before the kill) can't get a quest stuck.
// Emits 'questStarted', 'questStep' and 'questDone'. Phase 5 adds a quest log on top of this.
import { CONFIG } from '../config.js';

// target(world) returns { level, pos } for the objective marker, or null.
export const QUESTS = {
  howlingDen: {
    name: 'The Howling Den',
    steps: [
      { text: 'Find Frostfang Den', done: w => w.visited.den,
        target: w => ({ level: w.valley, pos: w.entrance.front }) },
      { text: 'Slay the Alpha Wolf', done: w => !w.alpha.alive,
        target: w => ({ level: w.den, pos: w.alpha.pos }) },
      { text: 'Claim the den\'s treasure', done: w => w.chest('den.denTreasure').opened,
        target: w => ({ level: w.den, pos: w.chest('den.denTreasure').pos }) },
    ],
    reward: w => w.inventory.addGold(CONFIG.loot.questReward),
  },
};

export class Quests {
  constructor(events, world) {
    this.events = events;
    this.world = world;
    this.state = {};   // id -> { step, done }
  }

  start(id) {
    if (this.state[id]) return;
    this.state[id] = { step: 0, done: false };
    this.events.emit('questStarted', { id, name: QUESTS[id].name, text: QUESTS[id].steps[0].text });
  }

  update() {
    for (const [id, st] of Object.entries(this.state)) {
      const q = QUESTS[id];
      while (!st.done && q.steps[st.step].done(this.world)) {
        st.step++;
        if (st.step >= q.steps.length) {
          st.done = true;
          q.reward(this.world);
          this.events.emit('questDone', { id, name: q.name });
        } else {
          this.events.emit('questStep', { id, text: q.steps[st.step].text });
        }
      }
    }
  }

  // The first unfinished quest's current objective: { name, text, target } or null.
  active() {
    for (const [id, st] of Object.entries(this.state)) {
      if (st.done) continue;
      const q = QUESTS[id], step = q.steps[st.step];
      return { name: q.name, text: step.text, target: step.target(this.world) };
    }
    return null;
  }

  toJSON() { return this.state; }

  load(data) {
    if (!data) return;
    for (const [id, st] of Object.entries(data)) {
      if (QUESTS[id]) this.state[id] = { step: Math.min(st.step | 0, QUESTS[id].steps.length - 1), done: !!st.done };
    }
  }
}
