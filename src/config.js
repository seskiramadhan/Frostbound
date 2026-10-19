// All tunable numbers live here.

export const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export const CONFIG = {
  render: {
    maxPixelRatioMobile: 1.5,
    maxPixelRatioDesktop: 2,
    fov: 60,
    near: 0.1,
    far: 160,
  },

  loop: {
    tickRate: 60,          // fixed logic steps per second
    maxFrameTime: 0.25,    // clamp after tab switch / hitch
  },

  fog: {
    color: 0xc8d4de,
    near: 25,
    far: 140,
  },

  light: {
    skyColor: 0xdfe9f3,
    groundColor: 0x55606a,
    hemiIntensity: 1.6,
    sunColor: 0xfff1dc,
    sunIntensity: 1.6,
    sunDir: [0.5, 0.8, 0.3],
  },

  terrain: {
    seed: 7331,
    size: 480,             // world units, square, centred on origin
    segments: 120,         // cells per side
    hillHeight: 7,         // rolling noise amplitude in the valley
    hillScale: 0.018,
    rimStart: 0.42,        // normalised radius where the valley wall begins
    rimHeight: 70,
    peak: { x: 0, z: -175, height: 95, radius: 75 },
    flatRadius: 22,        // flattened area at the centre (future village)
    snowLine: 22,
    rockSlope: 0.75,       // normal.y below this = rock
    colors: {
      grass: 0x5d7a4a,
      grassDark: 0x4a6640,
      dirt: 0x7a6a52,
      rock: 0x6e7177,
      snow: 0xf2f5f8,
    },
  },

  props: {
    seed: 4242,
    trees: 420,
    rocks: 160,
    treeMaxHeight: 30,     // no trees above this terrain height
    treeMaxSlope: 0.8,     // min normal.y for a tree
    clearRadius: 26,       // keep the centre clear
    clearings: [[-72, -32, 13]],  // other open spots: [x, z, radius] (bandit camp)
    treeCollideRadius: 0.6,
    rockCollideScale: 0.8,
  },

  snow: {
    count: 900,
    area: 40,              // box around the player
    height: 25,
    fallSpeed: 2.2,
    drift: 0.8,
    size: 0.12,
  },

  player: {
    walkSpeed: 4.5,
    runSpeed: 7.5,
    accel: 12,             // velocity smoothing (higher = snappier)
    turnSpeed: 12,         // facing smoothing
    radius: 0.4,
    maxClimb: 1.1,         // max rise per unit moved (slope limit)
    worldMargin: 12,       // keep away from terrain edge
    airControl: 0.25,      // accel multiplier while airborne
    spawn: [0, 0],
  },

  stats: {
    maxHealth: 100,
    maxStamina: 100,
    maxMagicka: 100,
    magickaRegen: 7,       // per second
    magickaRegenDelay: 1.2,
    staminaRegen: 28,      // per second
    staminaRegenDelay: 0.8,// seconds after spending before regen starts
    blockRegenMul: 0.4,    // regen multiplier while blocking
    healthRegen: 1,        // per second, out of combat
    healthRegenDelay: 6,   // seconds since last hit
    respawnDelay: 2.5,
  },

  combat: {
    attack: {
      windup: 0.16,        // seconds before the blade connects
      recover: 0.3,        // seconds after the strike
      damage: 14,
      reach: 2.3,          // + target radius
      arc: 1.1,            // half-angle in radians
      staminaCost: 5,      // attacks still work at 0 stamina
      lunge: 3,            // forward impulse on strike
      turnSpeed: 20,
      buffer: 0.25,        // early presses are remembered this long
    },
    block: {
      reduction: 0.85,     // fraction of damage stopped
      arc: 1.4,            // half-angle in front that can be blocked
      staminaPerHit: 18,   // not enough stamina = guard break
      moveMul: 0.4,
      faceRange: 6,        // while blocking, turn toward the nearest enemy this close
    },
    jump: {
      velocity: 6.2,
      gravity: 20,
      staminaCost: 6,
    },
    stagger: { player: 0.3, guardBreak: 0.6, enemy: 0.35, knockback: 3 },
    autoAim: { range: 4, arc: 1.0, closeRange: 3 },  // snap attacks toward an enemy ahead, else any one this close
    flashTime: 0.12,
    shake: { hit: 0.5, block: 0.25, decay: 5 },
  },

  wolf: {
    name: 'Wolf',
    packSize: 3,
    packDistance: 60,      // pack home distance from the player spawn
    packSpread: 5,
    maxHealth: 40,
    radius: 0.5,
    walkSpeed: 1.8,
    runSpeed: 7,
    accel: 8,
    turnSpeed: 8,
    maxClimb: 1.4,
    detectRadius: 18,
    loseRadius: 32,
    leashRadius: 45,       // from home; beyond this it gives up and goes back
    wanderRadius: 9,
    wanderPause: [2, 5],   // seconds between wander moves [min, max]
    attackRange: 2.0,
    circleRange: 3.2,      // wolves waiting their turn hover at this distance
    attackersAtOnce: 1,    // pack members that may bite at the same time
    healRate: 4,           // hp per second while not hunting
    windup: [0.5, 0.8],
    lungeSpeed: 6,
    biteAt: 0.1,           // seconds into the bite when it connects
    biteTime: 0.3,
    biteDamage: 8,
    biteReach: 1.5,        // + target radius
    biteArc: 0.8,
    recover: [1.0, 1.8],
    corpseTime: 8,         // seconds the body stays
    respawnTime: 30,
    scale: 1,
    fur: 0x8c9096,
    body: 'wolf',          // model module: wolf | draugr
    lvl: 1,                // design level (shown on health bars); see `levels`
  },

  // Overrides on top of `wolf` for the den's pack leader
  alphaWolf: {
    name: 'Alpha Wolf',
    lvl: 3,
    boss: true,
    saveKey: 'alpha',
    maxHealth: 110,
    radius: 0.7,
    scale: 1.35,
    fur: 0x4d4f55,
    runSpeed: 6.5,
    biteDamage: 15,
    biteReach: 1.9,
    windup: [0.6, 0.9],
    recover: [1.1, 1.7],
    detectRadius: 14,
  },

  // Overrides on top of `wolf` (same AI, different body)
  draugr: {
    name: 'Draugr',
    lvl: 4,
    body: 'draugr',
    fur: 0x7d8783,         // skin
    maxHealth: 55,
    radius: 0.45,
    walkSpeed: 1.3,
    runSpeed: 4.2,
    turnSpeed: 7,
    detectRadius: 13,
    loseRadius: 26,
    attackRange: 2.2,
    circleRange: 3.4,
    attackersAtOnce: 2,
    windup: [0.7, 1.0],
    lungeSpeed: 3,
    biteAt: 0.12,
    biteTime: 0.4,
    biteDamage: 12,
    biteReach: 1.9,
    biteArc: 0.9,
    recover: [0.9, 1.5],
    healRate: 0,
    corpseTime: 12,
  },
  draugrWight: {
    name: 'Draugr Wight',
    lvl: 6,
    boss: true,
    saveKey: 'wight',
    body: 'draugr',
    fur: 0x5d6866,
    scale: 1.18,
    maxHealth: 130,
    radius: 0.55,
    walkSpeed: 1.3,
    runSpeed: 4,
    turnSpeed: 6,
    detectRadius: 12,
    attackRange: 2.4,
    circleRange: 3.4,
    windup: [0.8, 1.1],
    lungeSpeed: 3,
    biteAt: 0.12,
    biteTime: 0.45,
    biteDamage: 20,
    biteReach: 2.2,
    biteArc: 1.0,
    recover: [1.0, 1.6],
    healRate: 0,
    corpseTime: 12,
  },

  // Bandits: humans with swords or bows. A camp in the forest, and a raid wave. They scale with you.
  bandit: {
    name: 'Bandit', body: 'draugr', fur: 0xc99a74, rag: 0x5a4632, metal: 0x6a6258, eye: 0x1a1410, hunch: 0.05,
    lvl: 3, scales: true,
    maxHealth: 50, radius: 0.45, walkSpeed: 1.6, runSpeed: 5.2, turnSpeed: 8,
    detectRadius: 16, loseRadius: 28, leashRadius: 32, wanderRadius: 6, packSpread: 6,
    attackRange: 2.1, circleRange: 3.2, attackersAtOnce: 2,
    windup: [0.5, 0.8], lungeSpeed: 4, biteAt: 0.1, biteTime: 0.35, biteDamage: 11, biteReach: 1.8, biteArc: 0.9,
    recover: [0.8, 1.4], healRate: 3, corpseTime: 10, respawnTime: 300,
    goldDrop: [4, 12],      // gold looted from the body
  },
  banditArcher: {           // overrides on top of `bandit`: keeps its distance and shoots arrows
    name: 'Bandit Archer', rag: 0x3e4a32, ranged: true, maxHealth: 38,
    shootRange: 20, keepAway: 7, windup: [0.9, 1.2], biteDamage: 9, biteAt: 0.05, biteTime: 0.3, recover: [1.2, 1.8],
  },
  banditChief: {            // overrides on top of `bandit`
    name: 'Bandit Chief', lvl: 6, lvlOffset: 2, scale: 1.2, metal: 0x8a6a3a, rag: 0x6a2a24,
    maxHealth: 140, biteDamage: 18, biteReach: 2.1, attackRange: 2.4, windup: [0.7, 1.0],
    goldDrop: [40, 70],
  },
  camp: {
    name: 'Bandit Camp',
    at: [-72, -32],         // in the western forest
    bandits: 3, archers: 2, // plus the chief
    chestRefill: 600,       // seconds before the camp chest has loot again
  },

  // Enemy levels. Your level comes from your skills. "Fixed" enemies keep their design level
  // (`lvl`); "scaling" ones (`scales: true`, plus anything in a refilled dungeon) match your level
  // (+ `lvlOffset`), never below their design level. Stats grow per level above the design level.
  levels: {
    skillUpsPerLevel: 2,    // player level = 1 + (skill levels gained, all skills) / this
    hpPerLevel: 0.1,        // +10% health per level above the design level
    dmgPerLevel: 0.06,      // +6% damage per level
    max: 40,
  },

  dungeon: {
    cell: 3,               // metres per map tile
    wallHeight: 5,
    roughness: 0.55,       // how far wall vertices are pushed around
    wallPad: 0.25,         // extra collision padding against rough walls
    entrances: {           // where each dungeon's door sits in the valley (distance from spawn)
      den: { distance: 85, angle0: 2.2, style: 'cave' },
      barrow: { distance: 100, angle0: 4.7, style: 'ruin' },
      summit: { at: [50, -106], style: 'path' },   // foot of the peak
      monastery: { at: [-48, -108], style: 'path' }, // the Greybeards' path up the mountain
      ustengrav: { distance: 95, angle0: 0.95, style: 'ruin' },
    },
    inside: { wanderRadius: 2, leashRadius: 30 },  // creature overrides inside dungeons
    ambient: 0.32,         // baked light where no brazier reaches
    braziers: { range: 13, intensity: 1.1 },
    fog: { color: 0x0b0907, near: 5, far: 30 },
    light: { hemiSky: 0x6a5a48, hemiGround: 0x1a1410, hemiIntensity: 1.3 },
    torch: { color: 0xffb066, intensity: 18, distance: 16, height: 2.6 }, // light that follows the player
  },

  interact: {
    radius: 2.6,
    fadeTime: 0.35,        // seconds for fade to black on doors
  },

  // Item stats. type: weapon | armor | potion | misc
  items: {
    ironSword:   { name: 'Iron Sword', type: 'weapon', damage: 14, value: 25, color: 0xc9d0d8, length: 0.9 },
    steelSword:  { name: 'Steel Sword', type: 'weapon', damage: 21, value: 70, color: 0xeef4fa, length: 1.05 },
    clothes:     { name: 'Fur Clothes', type: 'armor', armor: 0, value: 5, color: 0x6b4c34 },
    hideArmor:   { name: 'Hide Armor', type: 'armor', armor: 20, value: 40, color: 0x8a6440 },  // armor = % damage taken off
    huntingBow:  { name: 'Hunting Bow', type: 'bow', damage: 16, value: 50 },          // arrows are unlimited
    minorPotion: { name: 'Potion of Minor Healing', type: 'potion', heal: 35, value: 15 },
    healPotion:  { name: 'Potion of Healing', type: 'potion', heal: 70, value: 35 },
    ironArmor:   { name: 'Iron Armor', type: 'armor', armor: 30, value: 120, color: 0x7d838c },
    longbow:     { name: 'Hunter\'s Longbow', type: 'bow', damage: 24, value: 110 },
    fireTome:    { name: 'Spell Tome: Fire', type: 'tome', spell: 'fire', value: 40 },
    warlordAxe:  { name: 'Warlord\'s Axe', type: 'weapon', damage: 27, value: 180, color: 0x9a8a70, length: 1.0 },
    ancestorBlade: { name: 'Ancestor\'s Blade', type: 'quest', value: 0 },
    jarlLetter:  { name: 'Sealed Letter', type: 'quest', value: 0 },
    hornOfJurgen: { name: 'Horn of Jurgen Windcaller', type: 'quest', value: 0 },
    strangeNote: { name: 'Strange Note', type: 'quest', value: 0 },
    wolfPelt:    { name: 'Wolf Pelt', type: 'misc', value: 8 },
    alphaPelt:   { name: 'Alpha Wolf Pelt', type: 'misc', value: 40 },
  },

  startInventory: { items: { ironSword: 1, clothes: 1, minorPotion: 1 }, gold: 0, weapon: 'ironSword', armor: 'clothes' },

  loot: {
    denHall:     { items: { hideArmor: 1, minorPotion: 1 }, gold: 15 },
    denTreasure: { items: { steelSword: 1, minorPotion: 2 }, gold: 60 },
    barrowHall:  { items: { huntingBow: 1, minorPotion: 2 }, gold: 30 },
    barrowCrypt: { items: { ancestorBlade: 1 }, gold: 20 },
    banditChest: { items: { healPotion: 1, minorPotion: 1 }, gold: 90 },
    ustengravHall: { items: { healPotion: 2 }, gold: 80 },
    // Village strongboxes (stealing)
    jarlCoffer:  { items: { healPotion: 1 }, gold: 70 },
    ingridBox:   { items: { minorPotion: 2 }, gold: 45 },
    beraChest:   { items: { minorPotion: 1 }, gold: 30 },
    wolfDrop: 'wolfPelt',
    alphaDrop: 'alphaPelt',
    questReward: 50,       // gold for finishing the first quest
    dragonReward: 200,
  },

  skills: {
    maxLevel: 10,
    xpBase: 4,             // xp from level L to L+1 = xpBase * xpGrowth^(L-1)
    xpGrowth: 1.35,
    oneHanded: { name: 'One-Handed', xpPerHit: 1, damagePerLevel: 0.06,
      perk: { name: 'Armsman', desc: 'Sword damage +25%', damageMul: 1.25 } },
    block: { name: 'Block', xpPerBlock: 1.5, reductionPerLevel: 0.01,
      perk: { name: 'Shield Wall', desc: 'Blocking costs half stamina', staminaMul: 0.5 } },
    archery: { name: 'Archery', xpPerHit: 1.2, damagePerLevel: 0.06,
      perk: { name: 'Overdraw', desc: 'Bow damage +25%', damageMul: 1.25 } },
    sneak: { name: 'Sneak', xpPerSecond: 0.25, xpPerSneakAttack: 2, xpPerSteal: 3, noticePerLevel: 0.05,
      perk: { name: 'Assassin\'s Strike', desc: 'Sneak attacks deal double damage', attackMul: 2 } },
    destruction: { name: 'Destruction', xpPerHit: 0.5, damagePerLevel: 0.06,
      perk: { name: 'Destruction Adept', desc: 'Fire spells cost half magicka', costMul: 0.5 } },
  },

  // Crouch + stealth. Enemies notice a sneaking player gradually instead of at once.
  sneak: {
    speedMul: 0.55,        // walk speed while crouched (no running)
    radiusMul: 0.55,       // detect radius x this while crouched
    noticeRate: 0.5,       // awareness per second at the edge of the radius (faster when closer)
    movingMul: 1.5,        // moving while crouched is noisier...
    stillMul: 0.5,         // ...than keeping still
    behindMul: 0.25,       // much harder to notice you from behind
    darkMul: 0.75,         // dungeons are dim
    forget: 0.35,          // awareness lost per second when out of range
    touchRadius: 1.6,      // this close they always notice
    attackMul: { melee: 3, arrow: 2, fire: 1.5 },
  },

  // Stealing from village strongboxes
  steal: {
    seeRadius: 14,         // a standing thief is seen this far
    seeRadiusCrouched: 6,  // a sneaking thief only this close, and only if the villager faces you
    viewArc: 1.2,          // half-angle a villager can see (radians)
    fine: 40,
    refill: 900,           // seconds before a strongbox has something in it again
    boxes: [               // [lootKey, owner npc id, x, z, facing]
      ['jarlCoffer', 'jarl', -6, -13.2, 0],
      ['ingridBox', 'merchant', 9.2, -8.9, 0],
      ['beraChest', 'innkeeper', -9, -9.4, 0],
    ],
  },

  // Destruction magic (fire): tap = Firebolt, hold = Flames
  magic: {
    firebolt: { cost: 22, damage: 24, speed: 26, radius: 1.6, life: 2.5 },
    flames: { costPerSec: 16, damagePerSec: 22, range: 6, arc: 0.5, every: 0.2 },
    castTime: 0.35,        // firebolt cast animation
  },

  // Shouts: learned at word walls (and from dragon souls). Cooldowns in seconds.
  shouts: {
    push: { name: 'Unrelenting Force', word: 'FUS', desc: 'Throws enemies back. Knocks a flying dragon out of the sky.',
      cooldown: 12, range: 10, arc: 0.7, damage: 6, force: 14, stagger: 1.4 },
    slowTime: { name: 'Slow Time', word: 'TIID', desc: 'Enemies move at a crawl for a while.',
      cooldown: 30, duration: 7, scale: 0.3 },
    fireBreath: { name: 'Fire Breath', word: 'YOL', desc: 'A cone of fire in front of you.',
      cooldown: 20, range: 9, arc: 0.55, damage: 35 },
    iceForm: { name: 'Ice Form', word: 'IIZ', desc: 'Freezes enemies in front of you solid for a while.',
      cooldown: 35, range: 11, arc: 0.6, damage: 10, freeze: 6 },
  },

  bow: {
    minDraw: 0.12,         // seconds; a tap still fires a weak arrow
    fullDraw: 0.9,         // seconds to full power
    minPower: 0.35,        // fraction of damage at minimum draw
    speed: 60,             // m/s at full draw
    gravity: 6,
    life: 3,               // seconds before an arrow vanishes
    aimRange: 70,          // auto-aim reach (also finds flying dragons)
    aimArc: 0.45,          // half-angle around the camera direction
    moveMul: 0.45,         // move speed while drawing
    hitPad: 0.3,           // extra hit radius around targets
  },

  dragon: {
    name: 'Dragon',
    maxHealth: 650,
    radius: 2.6,           // body hit radius on the ground
    airRadius: 3.4,        // hit radius in the air (arrows)
    spawnDistance: 130,
    arriveDelay: 5,        // seconds after the quest step starts (in the valley)
    flySpeed: 17,
    circleRadius: 30,
    altitude: 20,
    circleTime: [5, 8],    // seconds circling before a fire pass
    passesBeforeLanding: 2,
    strafeAltitude: 8,
    strafeSpeed: 22,
    airFire: { damage: 7, radius: 3.5, every: 0.2, ahead: 7 },
    landTime: 2.2,
    takeoffTime: 1.8,
    groundTime: [14, 20],  // seconds on the ground before flying again
    takeoffAfterDamage: 0.22, // fraction of max hp lost on the ground triggers take-off
    walkSpeed: 3.2,
    turnSpeed: 1.6,
    attackGap: [1.0, 2.0],
    bite: { windup: 0.8, time: 0.5, damage: 26, reach: 4.2, arc: 0.6 },
    tail: { windup: 0.6, time: 0.6, damage: 18, reach: 6.5 },
    fire: { windup: 0.9, time: 1.6, damage: 6, every: 0.25, range: 12, arc: 0.45 },
    crashStagger: 4,       // seconds stunned after Unrelenting Force knocks it down
    deathTime: 2.5,
    soulTime: 3.5,
  },

  // Frosthollow, the village in the flat valley centre (around the player spawn)
  village: {
    name: 'Frosthollow',
    roomPrice: 10,         // inn: rest to full health
    sellRate: 1,           // merchant pays value x sellRate
    stock: [               // merchant: [item, price]
      ['minorPotion', 30], ['healPotion', 70], ['steelSword', 160], ['hideArmor', 90],
      ['ironArmor', 260], ['huntingBow', 110], ['longbow', 240], ['fireTome', 80],
    ],
    rewards: { pelts: 60, blade: 120, letter: 40, barrow: 100, report: 75, bandits: 150 },
    peltsWanted: 3,
  },

  // The summit of the peak: World-Eater arena (its own level, like a dungeon but outdoors)
  summit: {
    name: 'Summit of the Peak',
    origin: [0, 0, 1400],  // far from the valley and the dungeons
    radius: 36,
    fog: { color: 0x59626d, near: 18, far: 115 },
    light: { hemiSky: 0x9aa6b4, hemiGround: 0x2a2e34, hemiIntensity: 1.2, sun: 0.5 },
  },

  // High Hrothgar: the Greybeards' monastery halfway up the peak (its own outdoor level)
  monastery: {
    name: 'High Hrothgar',
    origin: [0, 0, 1700],
    radius: 24,
    voiceBlessing: 0.75,   // after The Way of the Voice: shout cooldowns x this
  },

  // The final boss: a Dragon with these overrides
  worldEater: {
    name: 'World-Eater',
    maxHealth: 1800,
    dmgMul: 1.5,
    scale: 1.45,
    colors: { scale: 0x2a2228, belly: 0x5a4a52, wing: 0x3a1e2a, horn: 0xc9b89a },
    phase2At: 0.6,         // health fraction where it is forced down for good
    enrageGap: 0.6,        // phase 2: attack gaps multiplied by this
    arriveDelay: 3,
    reward: 1000,
  },

  // After the World-Eater falls: sunny valley + post-game
  victory: {
    fog: { color: 0xd6e6f2, near: 40, far: 180 },
    light: { skyColor: 0xf2f8ff, hemiIntensity: 1.9, sunIntensity: 2.1 },
  },
  postGame: {
    dragonEvery: [360, 600], // seconds between random dragon attacks in the valley
    dungeonRespawn: 600,     // seconds before a cleared dungeon refills (on entry)
    tierLoot: { items: { healPotion: 2 }, goldPerTier: 80 },
    ngHp: 0.5,               // New Game+: +50% enemy health per NG level
    ngDmg: 0.3,
  },

  // Raids on Frosthollow: started by the player (village bell, or the Jarl's "Defend" job).
  // Raiders march in along lanes, break barricades, fight guards and players. 3 waves.
  raid: {
    center: [0, 2],          // where raiders head for
    lanes: [                 // spawn point at the forest edge -> barricade on the village edge
      { spawn: [64, 4], barricade: [21, 4] },
      { spawn: [-64, 4], barricade: [-21, 4] },
      { spawn: [0, 62], barricade: [0, 22] },
    ],
    waves: [{ wolf: 4 }, { bandit: 2, banditArcher: 2 }, { draugr: 5 }, { draugr: 3, warlord: 1 }],
    warning: 8,              // seconds after ringing the bell before wave 1
    wavePause: 6,            // seconds between waves
    barricadeHp: 160,
    repairCost: 15,          // gold to fix one barricade
    reward: { gold: 150, goldPerLevel: 75, firstWinItem: 'warlordAxe' },
    shopClosed: 300,         // seconds Ingrid's shop stays shut after a lost raid
    guards: [[15, 6], [-15, 6]],
    bell: [-4.5, 3.5],
    tower: { x: 4, z: 17, height: 5, size: 3.2 },
    // Creature overrides (on top of wolf / draugr) for raiders and guards
    raider: { raider: true, scales: true, leashRadius: 999, detectRadius: 20, loseRadius: 30, wanderRadius: 5, healRate: 0, corpseTime: 6, marchSpeed: 3.2 },
    warlord: { name: 'Draugr Warlord', body: 'draugr', boss: true, lvl: 6, lvlOffset: 2, fur: 0x5d6866, metal: 0x2e2a26, eye: 0xff7a3a, scale: 1.4,
      maxHealth: 260, radius: 0.6, biteDamage: 24, biteReach: 2.4, attackRange: 2.6, windup: [0.8, 1.1] },
    guard: { name: 'Village Guard', body: 'draugr', team: 'player', hunts: 'beast', lvl: 2, scales: true, fur: 0xd9b08c, rag: 0x5a2a28, metal: 0x8a9098,
      eye: 0x2a2018, hunch: 0, maxHealth: 120, biteDamage: 10, detectRadius: 16, loseRadius: 22, leashRadius: 20,
      wanderRadius: 2, healRate: 2, walkSpeed: 1.6, runSpeed: 4.6, attackersAtOnce: 2, corpseTime: 99 },
  },

  // The Jarl's requests: one repeatable job at a time, paid on return
  jobs: {
    baseGold: 60,
    goldPerJob: 25,          // each finished job pays more...
    maxGold: 400,            // ...up to this
    wolvesToHunt: 3,
  },

  // Co-op dragon hunts (N3): each hunt level makes the next dragon tougher.
  hunt: {
    lvl: 5,                // dragons in hunts/attacks: design level (they scale with you from there)
    goldPerLevel: 120,     // reward for everyone present
    names: ['Elder Dragon', 'Frost Dragon', 'Blood Dragon', 'Ancient Dragon', 'Revered Dragon', 'Legendary Dragon'],
  },

  fx: {
    maxParticles: 500,
  },

  // Online co-op (N1: see each other). PeerJS is loaded only when co-op is opened.
  net: {
    peerjsUrl: 'vendor/peerjs-1.5.5.min.js',
    roomPrefix: 'frostbound-v1-',  // PeerJS id of a host = prefix + room code
    codeLength: 5,
    maxPlayers: 4,
    sendRate: 15,          // pose updates per second
    interpDelay: 0.12,     // remote players are drawn this far in the past, for smoothness
    joinTimeout: 15,       // seconds
    enemyHealthPerPlayer: 0.5, // each extra player makes enemies take 50% more hits
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  },

  audio: {
    master: 0.9,
    music: 0.45,
    sfx: 0.8,
    wind: 0.05,
    crossfade: 2.5,        // seconds between explore and boss music
    range: 45,             // metres; sounds further away are silent
  },

  save: {
    key: 'frostbound.save.v1',
    autosaveInterval: 30,  // seconds
  },

  camera: {
    distance: 6,
    height: 1.6,           // look-at height above player feet
    minPitch: -0.35,
    maxPitch: 1.1,
    startPitch: 0.3,
    follow: 10,            // position smoothing
    groundClearance: 0.6,
    minDistance: 1.2,      // closest it gets when a wall is in the way
    ceilingClearance: 0.5,
  },

  input: {
    mouseSensitivity: 0.0025,
    touchLookSensitivity: 0.006,
    joystickRadius: 55,    // px
    joystickDeadzone: 0.12,
    runThreshold: 0.85,    // joystick push beyond this = run
    // Right-side touch gestures: tap = attack, hold = block, drag = camera
    tapSlop: 14,           // px a tap/hold may wander
    holdTime: 0.3,         // seconds still before it counts as block
    shoutHold: 0.45,       // hold the Shout button this long to switch shouts instead
  },
};
