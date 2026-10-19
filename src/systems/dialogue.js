// What each villager says, depending on quest progress. talk() returns
// { text, options: [{ label, run }] }; run() changes state and returns true to keep the
// conversation open (it is redrawn), or false to close it.
// ctx: { quests, inventory, flags, player, trade(), rest(), done(msg), newGamePlus(), ng,
//        jobs, jobOffer, isGuest, shopClosed }
import { CONFIG } from '../config.js';
import { RETURN_TEXT } from './jobs.js';

const V = CONFIG.village;
const bye = { label: 'Goodbye', run: () => false };

// The Jarl's requests: offer / accept / report / give up (systems/jobs.js).
function jarlJobs(c, o) {
  const { quests: q, jobs } = c;
  if (c.isGuest || !jobs.open) return;
  if (q.stepText('jarlJob') === RETURN_TEXT) {
    o.push({ label: 'The job is done.', run: () => {
      const gold = jobs.gold;
      jobs.paid = true;
      c.done(`Good work. Here, ${gold} gold, as promised. Come back if you want more work.`); return true;
    } });
  } else if (q.isActive('jarlJob')) {
    o.push({ label: 'I want to give up the job.', run: () => { jobs.abandon(); c.done('Hm. Someone else will have to do it, then.'); return true; } });
  } else {
    o.push({ label: 'Any work for me?', run: () => {
      c.jobOffer = jobs.offer();
      if (!c.jobOffer) c.done('Nothing right now. Come back later.');
      return true;
    } });
  }
}

function jarl(c) {
  const { quests: q, flags, inventory: inv } = c;
  if (c.jobOffer) {                       // the Jarl just described a job
    const offer = c.jobOffer;
    return {
      text: `${offer.pitch} I'll pay ${c.jobs.gold} gold.`,
      options: [
        { label: 'I\'ll do it.', run: () => { c.jobOffer = null; c.jobs.accept(offer.type); c.done('Good. Come back when it\'s done.'); return true; } },
        { label: 'Not now.', run: () => { c.jobOffer = null; return true; } },
      ],
    };
  }
  const o = [];
  let text;
  if (q.isActive('arrival')) {
    text = 'So you\'re the one who walked out of the snow. Good, I need a sword arm. Wolves from Frostfang Den '
      + 'have been tearing into our flocks. Clear out that den and Frosthollow will owe you.';
    o.push({ label: 'I\'ll deal with the wolves.', run: () => { flags.metJarl = true; q.start('howlingDen'); return false; } });
  } else if (q.stepText('howlingDen') === 'Report to Jarl Hrolf') {
    text = 'The howling has stopped. You have my thanks, and the hold\'s gold. But I fear worse things wake. '
      + 'Old Bleakrock Barrow, north toward the peak, groans at night, and a shadow was seen over the ridge. Wings.';
    o.push({ label: 'I\'ll look into the barrow.', run: () => { flags.reportedDen = true; return false; } });
  } else if (q.stepText('dragonRising') === 'Report to Jarl Hrolf') {
    text = 'A dragon, slain by your hand, and its soul taken into you! The old tales name such a one Dragonborn. '
      + 'Then the tales of the World-Eater on the peak may be true as well. Rest, and be ready.';
    o.push({ label: 'I will be ready.', run: () => { flags.reportedDragon = true; return false; } });
  } else if (q.isActive('howlingDen')) {
    text = 'Frostfang Den lies east of the village. Bring back proof the wolves are gone.';
  } else if (q.isActive('dragonRising')) {
    text = q.stepText('dragonRising') === 'Slay the dragon'
      ? 'The dragon circles the valley. Use the bow when it flies, and the Voice to bring it down.'
      : 'Bleakrock Barrow lies north, under the peak. The dead guard it. Find whatever the old Nords left there.';
  } else if (flags.victory) {
    text = c.confirmNg
      ? 'Begin anew? You will keep your skill, but the world forgets your deeds, and its beasts grow fiercer.'
      : 'Hail, Dragonborn! The skies over Frosthollow are clear for the first time in an age. Songs will be sung of you.';
    if (c.confirmNg) {
      o.push({ label: 'Yes, start New Game+', run: () => { c.newGamePlus(); return false; } });
      o.push({ label: 'Not yet', run: () => { c.confirmNg = false; return true; } });
    } else {
      o.push({ label: `I wish to begin anew (New Game+${c.ng ? ` ${c.ng + 1}` : ''})`, run: () => { c.confirmNg = true; return true; } });
    }
  } else if (q.isActive('wayOfTheVoice')) {
    text = 'You heard it too, that voice from the mountain: "Dovahkiin." The Greybeards of High Hrothgar have summoned you. '
      + 'Their path climbs the mountain west of Bleakrock Barrow. Go. Few are ever called.';
  } else if (q.isActive('worldEater')) {
    text = 'The path up the peak starts east of the old barrow. The World-Eater waits at the summit. Strike true, Dragonborn.';
  } else if (q.isDone('wayOfTheVoice')) {     // fallback: the Greybeards normally send you on
    text = 'Dragonborn. The World-Eater stirs on the peak, and the sky darkens by the day.';
    o.push({ label: 'I\'m ready to face the World-Eater.', run: () => {
      q.start('worldEater');
      c.done('Then go. The path starts at the foot of the peak, east of the barrow. Frosthollow stands with you.'); return true;
    } });
  } else {
    text = 'Welcome to Frosthollow. Keep your blade sharp; these are hard days.';
  }
  jarlJobs(c, o);
  if (q.isActive('jarlLetter') && inv.count('jarlLetter')) {
    o.push({ label: 'Bera sent you this letter.', run: () => {
      inv.remove('jarlLetter'); flags.letterDelivered = true;
      c.done('Hmm, Bera wants guards on the north road. Fair. Tell her it is done.'); return true;
    } });
  }
  o.push(bye);
  return { text, options: o };
}

function merchant(c) {
  if (c.shopClosed) {
    return { text: 'The raiders burned my stall and took half my stock. Come back once I\'ve rebuilt.', options: [bye] };
  }
  return {
    text: 'Furs, steel, potions, even a spell tome if you have the head for magic. I buy what you can carry and sell what you can afford.',
    options: [{ label: 'Let me trade.', run: () => { c.trade(); return true; } }, bye],
  };
}

function innkeeper(c) {
  const { quests: q, flags, inventory: inv } = c;
  const o = [];
  o.push({ label: `Rent a room (${V.roomPrice} gold)`, run: () => c.rest() });
  if (!q.has('jarlLetter')) {
    o.push({ label: 'Need anything done?', run: () => {
      q.start('jarlLetter'); inv.add('jarlLetter');
      c.done('Take this letter to the Jarl, would you? My legs aren\'t what they were.'); return true;
    } });
  }
  if (!q.has('silenceBarrow') && (q.isDone('jarlLetter') || q.has('dragonRising'))) {
    o.push({ label: 'Any other trouble?', run: () => {
      q.start('silenceBarrow');
      c.done('Something walks in Bleakrock Barrow. A wight, the old folk say. Put it back in the ground and drinks are on me.'); return true;
    } });
  }
  if (q.stepText('wayOfTheVoice') === 'Meet your mysterious friend at the Sleeping Bear') {
    o.push({ label: 'I\'m looking for whoever left this note.', run: () => {
      flags.hornGot = true; inv.remove('strangeNote'); inv.add('hornOfJurgen');
      c.done('Shh, not so loud. I left that note. I had to know the Dragonborn was real, and that you weren\'t a trap. '
        + 'Here\'s your horn; the Greybeards will want it. One day I\'ll tell you who I really am.'); return true;
    } });
  }
  if (q.stepText('silenceBarrow') === 'Tell Bera the barrow is quiet') {
    o.push({ label: 'The barrow is quiet now.', run: () => { flags.barrowReported = true; c.done('Then the dead sleep again. Here, you earned this.'); return true; } });
  }
  o.push(bye);
  return { text: 'Welcome to the Sleeping Bear. Warm beds, warm mead.', options: o };
}

function hunter(c) {
  const { quests: q, flags, inventory: inv } = c;
  const o = [];
  let text = 'The wolves are bold this winter. Good pelts on them, though.';
  if (!q.has('banditCamp')) {
    o.push({ label: 'Anything else troubling you?', run: () => {
      q.start('banditCamp');
      c.done('Bandits. They\'ve made camp in the western forest and they rob anyone on the road. Their chief is a brute. Break them, and I\'ll make it worth your while.'); return true;
    } });
  } else if (q.stepText('banditCamp') === 'Tell Ulf the camp is broken') {
    o.push({ label: 'The bandit chief is dead.', run: () => {
      flags.banditsReported = true;
      c.done('Ha! The road\'s safe again, for a while. Here, you earned this.'); return true;
    } });
  }
  if (!q.has('hunterPelts')) {
    o.push({ label: 'Need help with the wolves?', run: () => {
      q.start('hunterPelts');
      c.done(`Bring me ${V.peltsWanted} wolf pelts and I\'ll pay better than Ingrid does.`); return true;
    } });
  } else if (q.isActive('hunterPelts')) {
    const have = inv.count('wolfPelt');
    text = `${V.peltsWanted} pelts, that's the deal. You've got ${have}.`;
    if (have >= V.peltsWanted) {
      o.push({ label: `Here are ${V.peltsWanted} wolf pelts.`, run: () => {
        inv.remove('wolfPelt', V.peltsWanted); flags.peltsGiven = true;
        c.done('Fine pelts! Here\'s your coin.'); return true;
      } });
    }
  }
  o.push(bye);
  return { text, options: o };
}

function sven(c) {
  const { quests: q, flags, inventory: inv } = c;
  const o = [];
  let text = 'Eh? Speak up, I\'m not as young as I was.';
  if (!q.has('ancestorBlade')) {
    text = 'My grandfather was buried in Bleakrock Barrow with his sword. The dead have no use for a blade, but I would hold it once more.';
    o.push({ label: 'I\'ll find it for you.', run: () => { q.start('ancestorBlade'); c.done('Bless you. It lies in a chest deep in the barrow.'); return true; } });
  } else if (q.isActive('ancestorBlade') && inv.count('ancestorBlade')) {
    o.push({ label: 'I found your grandfather\'s blade.', run: () => {
      inv.remove('ancestorBlade'); flags.bladeGiven = true;
      c.done('Grandfather\'s blade... I never thought I\'d see it again. Take these, and my thanks.'); return true;
    } });
  } else if (q.isActive('ancestorBlade')) {
    text = 'The blade is in Bleakrock Barrow, north of here. Mind the dead.';
  }
  o.push(bye);
  return { text, options: o };
}

// Master Arngeir speaks for the Greybeards; the other masters stay silent.
function arngeir(c) {
  const { quests: q, flags, inventory: inv } = c;
  const step = q.stepText('wayOfTheVoice'), o = [];
  let text;
  if (step === 'Speak with Master Arngeir') {
    text = 'So. A Dragonborn appears, at the very hour the dragons return. We are the Greybeards. Few are called to High Hrothgar.';
    o.push({ label: 'You summoned me.', run: () => {
      flags.metGreybeards = true;
      c.done('Then let us see whether you truly have the gift. Show us your Voice: shout, here in the courtyard.'); return true;
    } });
  } else if (step === 'Show the Greybeards your Voice') {
    text = 'Use your Thu\'um. Shout, here in the courtyard, and let us hear the dragon in your voice.';
  } else if (step === 'Retrieve the Horn of Jurgen Windcaller from Ustengrav') {
    text = 'Your last trial: bring us the Horn of Jurgen Windcaller from his tomb, Ustengrav, east of the valley.';
  } else if (step === 'Meet your mysterious friend at the Sleeping Bear') {
    text = 'The horn was taken before you? Then follow the trail, Dovahkiin. The horn will find its way here.';
  } else if (step === 'Bring the Horn to the Greybeards') {
    text = 'You have returned.';
    if (inv.count('hornOfJurgen')) {
      o.push({ label: 'Here is the Horn.', run: () => {
        inv.remove('hornOfJurgen'); flags.hornDelivered = true;
        c.done('You have passed every trial. Accept our blessing: your Voice will recover faster. Now go. The World-Eater '
          + 'has come to the summit of this very mountain, and only a Dragonborn can end it.'); return true;
      } });
    }
  } else if (flags.victory) {
    text = 'Dovahkiin. The World-Eater is gone, and the sky is yours. Walk in peace.';
  } else if (q.isDone('wayOfTheVoice')) {
    text = 'The World-Eater waits at the summit. The path begins east of Bleakrock Barrow.';
  } else {
    text = 'Few climb this far. Speak softly here; our voices can shake mountains.';
  }
  o.push(bye);
  return { text, options: o };
}

const greybeard = () => ({ text: '(The master says nothing. A Greybeard\'s voice can shake the mountain, so they rarely speak.)', options: [bye] });

const TALK = { jarl, merchant, innkeeper, hunter, sven, arngeir, borri: greybeard, einarth: greybeard };
const NO_HAIL = ['jarl', 'arngeir', 'borri', 'einarth'];   // don't shout "Dragonborn!" at you

export function talk(npcId, ctx) {
  const d = TALK[npcId]?.(ctx) ?? { text: '...', options: [bye] };
  if (ctx.flags.victory && !NO_HAIL.includes(npcId)) d.text = `Dragonborn! ${d.text}`;   // the whole village knows
  return d;
}
