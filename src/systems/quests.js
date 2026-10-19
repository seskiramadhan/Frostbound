// Quests as ordered steps. Each step's done(world) is checked every tick, so doing
// things out of order (looting before the kill) can't get a quest stuck.
// Emits 'questStarted', 'questStep' and 'questDone'.
// Save compatibility: only ever APPEND steps to an existing quest (step indices are saved).
import { CONFIG } from '../config.js';
import { RETURN_TEXT } from './jobs.js';

const V = CONFIG.village;
let W = null;   // the world, for the Jarl's request (its text changes with the job)
const jarl = w => ({ level: w.valley, pos: w.npc('jarl') });
const greybeard = w => ({ level: w.monastery, pos: w.npc('arngeir') });

// target(world) returns { level, pos } for the objective marker, or null.
export const QUESTS = {
  arrival: {
    name: 'The Jarl\'s Summons', main: true,
    steps: [
      { text: 'Speak with Jarl Balgrim in Riverholt', done: w => w.flags.metJarl, target: jarl },
    ],
    reward: () => {},
  },
  howlingDen: {
    name: 'The Howling Den', main: true,
    steps: [
      { text: 'Find Frostfang Den', done: w => w.visited.den,
        target: w => ({ level: w.valley, pos: w.entrances.den.front }) },
      { text: 'Slay the Alpha Wolf', done: w => !w.alpha.alive,
        target: w => ({ level: w.den, pos: w.alpha.pos }) },
      { text: 'Claim the den\'s treasure', done: w => w.chest('den.denTreasure').opened,
        target: w => ({ level: w.den, pos: w.chest('den.denTreasure').pos }) },
      { text: 'Report to Jarl Balgrim', done: w => w.flags.reportedDen, target: jarl },
    ],
    reward: w => w.inventory.addGold(CONFIG.loot.questReward),
  },
  dragonRising: {
    name: 'Dragon Rising', main: true,
    steps: [
      { text: 'Explore Bleakrock Barrow', done: w => w.visited.barrow,
        target: w => ({ level: w.valley, pos: w.entrances.barrow.front }) },
      { text: 'Learn the Word of Power', done: w => w.shouts.known.has('push'),
        target: w => ({ level: w.barrow, pos: w.barrow.wordWall.pos }) },
      { text: 'Slay the dragon', done: w => w.dragon.state === 'dead',
        target: w => (w.dragon.active ? { level: w.valley, pos: w.dragon.pos } : null) },
      { text: 'Report to Jarl Balgrim', done: w => w.flags.reportedDragon, target: jarl },
    ],
    reward: w => w.inventory.addGold(CONFIG.loot.dragonReward),
  },
  // Between Dragon Rising and the World-Eater: the Greybeards (starts after reporting the dragon)
  wayOfTheVoice: {
    name: 'The Way of the Voice', main: true,
    steps: [
      { text: 'Climb to High Hrothgar', done: w => !!w.visited.monastery,
        target: w => ({ level: w.valley, pos: w.entrances.monastery.front }) },
      { text: 'Speak with Master Arnveir', done: w => !!w.flags.metGreybeards, target: greybeard },
      { text: 'Show the Greybeards your Voice', done: w => !!w.flags.voiceTested,
        target: w => ({ level: w.monastery, pos: w.monastery.center }) },
      { text: 'Retrieve the Horn of Jurgen Windcaller from Ustengrav', done: w => !!w.flags.hornNote,
        target: w => ({ level: w.ustengrav, pos: w.ustengrav.markers.horn }) },
      { text: 'Meet your mysterious friend at the Snoring Giant', done: w => !!w.flags.hornGot,
        target: w => ({ level: w.valley, pos: w.npc('innkeeper') }) },
      { text: 'Bring the Horn to the Greybeards', done: w => !!w.flags.hornDelivered, target: greybeard },
    ],
    reward: w => w.blessVoice(),
  },
  worldEater: {
    name: 'The World-Eater', main: true,
    steps: [
      { text: 'Climb to the summit of the peak', done: w => w.visited.summit,
        target: w => ({ level: w.valley, pos: w.entrances.summit.front }) },
      { text: 'Defeat the World-Eater', done: w => w.worldEater.state === 'dead',
        target: w => (w.worldEater.active ? { level: w.summit, pos: w.worldEater.pos } : { level: w.summit, pos: w.summitCentre }) },
    ],
    reward: w => w.inventory.addGold(CONFIG.worldEater.reward),
  },

  // The Jarl's repeatable requests (systems/jobs.js picks the job; restarted for each new one)
  jarlJob: {
    name: 'Jarl\'s Request',
    steps: [
      { get text() { return W?.jobs.text() ?? 'Do the Jarl\'s job'; }, done: w => w.jobs.isComplete(), target: w => w.jobs.target(w) },
      { text: RETURN_TEXT, done: w => w.jobs.paid, target: jarl },
    ],
    reward: w => w.jobs.payout(),
  },

  // Side quests, given by villagers
  hunterPelts: {
    name: 'Pelts for the Hunter',
    steps: [
      { text: `Collect ${V.peltsWanted} wolf pelts`, done: w => w.inventory.count('wolfPelt') >= V.peltsWanted || w.flags.peltsGiven,
        target: () => null },
      { text: 'Bring the pelts to Faendir the Hunter', done: w => w.flags.peltsGiven,
        target: w => ({ level: w.valley, pos: w.npc('hunter') }) },
    ],
    reward: w => w.inventory.addGold(V.rewards.pelts),
  },
  ancestorBlade: {
    name: 'The Ancestor\'s Blade',
    steps: [
      { text: 'Find the Ancestor\'s Blade in Bleakrock Barrow', done: w => w.inventory.count('ancestorBlade') > 0 || w.flags.bladeGiven,
        target: w => ({ level: w.barrow, pos: w.chest('barrow.barrowCrypt').pos }) },
      { text: 'Return the blade to Alvar', done: w => w.flags.bladeGiven,
        target: w => ({ level: w.valley, pos: w.npc('sven') }) },
    ],
    reward: w => { w.inventory.addGold(V.rewards.blade); w.inventory.add('healPotion', 2); },
  },
  banditCamp: {
    name: 'Bandits in the Woods',
    steps: [
      { text: 'Find the bandit camp in the western forest', done: w => !!w.visited.camp,
        target: w => ({ level: w.valley, pos: w.camp.center }) },
      { text: 'Defeat the Bandit Chief', done: w => !!w.flags.chiefSlain,
        target: w => ({ level: w.valley, pos: w.banditChief.alive ? w.banditChief.pos : w.camp.center }) },
      { text: 'Tell Faendir the camp is broken', done: w => !!w.flags.banditsReported,
        target: w => ({ level: w.valley, pos: w.npc('hunter') }) },
    ],
    reward: w => { w.inventory.addGold(V.rewards.bandits); w.inventory.add('healPotion', 1); },
  },
  jarlLetter: {
    name: 'A Letter for the Jarl',
    steps: [
      { text: 'Deliver Delphina\'s letter to Jarl Balgrim', done: w => w.flags.letterDelivered, target: jarl },
    ],
    reward: w => w.inventory.addGold(V.rewards.letter),
  },
  silenceBarrow: {
    name: 'Silence the Barrow',
    steps: [
      { text: 'Slay the Draugr Wight in Bleakrock Barrow', done: w => !w.wight.alive,
        target: w => ({ level: w.barrow, pos: w.wight.pos }) },
      { text: 'Tell Delphina the barrow is quiet', done: w => w.flags.barrowReported,
        target: w => ({ level: w.valley, pos: w.npc('innkeeper') }) },
    ],
    reward: w => w.inventory.addGold(V.rewards.barrow),
  },
};

export class Quests {
  constructor(events, world) {
    this.events = events;
    this.world = world;
    W = world;
    this.state = {};      // id -> { step, done }
    this.tracked = null;  // quest shown on the HUD (null = first active main quest)
  }

  start(id) {
    if (this.state[id]) return;
    this.state[id] = { step: 0, done: false };
    if (!QUESTS[id].main) this.tracked = id;   // a newly taken side quest gets tracked
    this.events.emit('questStarted', { id, name: QUESTS[id].name, text: QUESTS[id].steps[0].text });
  }

  update() {
    for (const [id, st] of Object.entries(this.state)) {
      const q = QUESTS[id];
      while (!st.done && q.steps[st.step].done(this.world)) {
        st.step++;
        if (st.step >= q.steps.length) {
          st.done = true;
          if (this.tracked === id) this.tracked = null;
          q.reward(this.world);
          this.events.emit('questDone', { id, name: q.name });
        } else {
          this.events.emit('questStep', { id, text: q.steps[st.step].text });
        }
      }
    }
  }

  // Start a repeatable quest again from its first step.
  restart(id) {
    this.abandon(id);
    this.start(id);
  }

  // Drop a quest (failed or given up).
  abandon(id) {
    delete this.state[id];
    if (this.tracked === id) this.tracked = null;
  }

  has(id) { return !!this.state[id]; }
  isDone(id) { return !!this.state[id]?.done; }
  isActive(id) { return !!this.state[id] && !this.state[id].done; }
  step(id) { return this.state[id]?.step ?? -1; }

  // Text of the current step of an active quest, or null.
  stepText(id) {
    const st = this.state[id];
    return st && !st.done ? QUESTS[id].steps[st.step].text : null;
  }

  track(id) { if (this.isActive(id)) this.tracked = id; }

  // For the quest log: [{ id, name, main, done, text, tracked }], active first.
  list() {
    const cur = this.#current();
    return Object.entries(this.state).map(([id, st]) => ({
      id, name: QUESTS[id].name, main: !!QUESTS[id].main, done: st.done,
      text: st.done ? 'Completed' : QUESTS[id].steps[st.step].text, tracked: id === cur,
    })).sort((a, b) => (a.done - b.done) || (b.main - a.main));
  }

  #current() {
    if (this.tracked && this.isActive(this.tracked)) return this.tracked;
    const active = Object.keys(this.state).filter(id => this.isActive(id));
    return active.find(id => QUESTS[id].main) ?? active[0] ?? null;
  }

  // The tracked (or first main) unfinished quest's objective: { name, text, target } or null.
  active() {
    const id = this.#current();
    if (!id) return null;
    const q = QUESTS[id], step = q.steps[this.state[id].step];
    return { name: q.name, text: step.text, target: step.target(this.world) };
  }

  toJSON() { return { ...this.state, _tracked: this.tracked }; }

  load(data) {
    if (!data) return;
    for (const [id, st] of Object.entries(data)) {
      if (QUESTS[id]) this.state[id] = { step: Math.min(st.step | 0, QUESTS[id].steps.length - 1), done: !!st.done };
    }
    if (typeof data._tracked === 'string' && QUESTS[data._tracked]) this.tracked = data._tracked;
  }
}
