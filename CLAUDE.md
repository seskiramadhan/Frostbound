# CLAUDE.md — Frostbound

## What this is
A small, Skyrim-inspired open-world action RPG that runs in a **mobile browser**.
Goal: feel like Skyrim in 10-minute sessions on a phone. Keep the magic, cut the bloat.

## Stack (hard rules)
- **Language:** JavaScript (ES modules), no TypeScript, no build step required
- **Rendering:** Three.js (pin exact version, load from cdnjs or a local copy)
- **Art:** low-poly, procedural geometry + flat/vertex colors. **No texture files, no model files.**
- **Audio:** procedural via Web Audio API, no audio files
- **Saving:** localStorage (wrap every read/write in try/catch)
- **Hosting:** static, $0 (GitHub Pages or Vercel)
- **No game engines** (no Phaser, Babylon, Unity export)

## Performance budget (phone first)
- Target 60 fps on a mid-range Android phone, never below 30
- Short draw distance hidden by **fog** (fog is also the art style: snow, mist, mountains)
- Keep draw calls low: merge static geometry, instance trees/rocks
- Pixel ratio capped at 1.5 on mobile
- Test on phone after every phase, not just desktop

## Controls
- **Mobile:** left joystick = move, drag right side = camera, tap = attack,
  hold = block, swipe = dodge, buttons for shout / bow / crouch / interact
- **Desktop:** WASD move, mouse look (pointer lock), LMB attack, RMB block,
  Space dodge, Q shout, C crouch, E interact

## Core mechanics
- **Third-person camera** following the player
- **Combat:** melee (sword), bow, one magic school (fire)
- **Learn by doing:** skills level up by use (One-Handed, Archery, Destruction,
  Sneak, Block). No classes. Maxing a skill unlocks a perk.
- **Shouts (3):** Push, Slow Time, Fire Breath, learned at word walls in dungeons,
  with cooldowns
- **Sneak:** crouch, stealth meter, sneak attacks deal bonus damage, stealing
- **Loot:** chests, enemy drops, simple inventory (weapons, armor, potions, gold)
- **Health / Stamina / Magicka** bars

## World
- One valley, kept small:
  - **Village** (hub: merchant, quest givers, inn)
  - **Forest** (wolves, bandits)
  - **3–4 dungeons** (caves/ruins, each with a word wall or a key item)
  - **Mountain peak** (final dragon)
- A roaming dragon randomly circles the valley
- Day/night cycle (optional, phase 5)

## Quests
- **Main quest (~5 steps):** village → first dungeon → learn shouts →
  first dragon → climb the peak → World-Eater
- **Side quests (5–6):** clear the cave, retrieve the sword, deliver the letter, etc.
- Simple quest log + objective marker

## End game
- **Final boss: World-Eater dragon** on the peak
  - Phase 1: airborne, use Slow Time + bow
  - Phase 2: forced down, melee fight
- Victory: short ending scene, valley becomes sunny, NPCs call you "Dragonborn"
- **Post-game loop:**
  - Random dragon hunts, scaling difficulty
  - Dungeons respawn with better loot
  - Hidden 4th shout in the hardest dungeon
  - New Game+ (keep skills, harder enemies)
- Target length: 3–5 hours main story

## Out of scope (do NOT add)
Voice acting, large map, crafting trees, factions, big NPC cast, multiplayer
(possible later: co-op dragon hunt via PeerJS host relay, like Shadow District).

## Build phases (do in order, playable at every step)
1. **Walking:** movement, third-person camera, terrain chunk, fog, mobile joysticks
2. **Combat:** melee + block + dodge, one enemy (wolf or bandit) with basic AI, health/stamina
3. **First quest:** one dungeon, loot + inventory, skill leveling, save/load
4. **Dragons:** dragon AI + fight, word walls, the 3 shouts
5. **Full game:** village + NPCs, main + side quests, final boss, post-game, audio, polish

Finish and test a phase before starting the next one.

## Code structure (suggested)
```
index.html
src/
  main.js        # boot, game loop
  input.js       # keyboard/mouse + touch joysticks
  world/         # terrain, fog, props, dungeons
  entities/      # player, enemies, dragon, NPCs
  systems/       # combat, skills, shouts, loot, quests, save
  ui/            # HUD, inventory, quest log, menus
  audio.js       # Web Audio procedural sounds
```

## Conventions
- Small focused modules, no giant single file
- Fixed timestep for game logic, render every frame
- All tunable numbers (damage, speeds, cooldowns, XP curves) in one `config.js`
