# CLAUDE.md — Frostbound

## What this is
A small, Skyrim-inspired open-world action RPG that runs in a **mobile browser**.
Goal: feel like Skyrim in 10-minute sessions on a phone. Keep the magic, cut the bloat.

## Start here
**Read `NEXT.md` first**: current status, what's live, pending items in order, open
questions for the user, and how to test in a cloud session. Update `NEXT.md` at the
end of every piece of work (what's done, what's next).

## Stack (hard rules)
- **Language:** JavaScript (ES modules), no TypeScript, no build step required
- **Rendering:** Three.js (pin exact version, load from cdnjs or a local copy)
- **Art:** low-poly, procedural geometry + flat/vertex colors. **No texture files, no model files.**
- **Audio:** sound effects procedural via Web Audio API (no SFX files). Music: a few
  tracks in `audio/music/` that are **free to publish** (CC0, or CC-BY with credit in
  `audio/music/README.md`). Personal tracks the user may not publish (e.g. game OSTs)
  go only in `audio/music/local/`, which is git-ignored. Never commit copyrighted music.
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
- **Mobile:** left joystick = move (push far = run), drag right side = camera,
  tap right = attack, hold right = block (bow mode: hold = draw, release = shoot).
  Buttons: Jump, Use (appears near doors/chests/word walls), Shout (cooldown ring),
  Bow/Sword, Bag. Crouch button comes with Sneak.
- **Desktop:** WASD move, Shift run, mouse look (pointer lock), LMB attack
  (bow: hold to draw), RMB block, Space jump, E interact, Q shout, B bow/sword,
  I or Tab Bag, C crouch (with Sneak)
- No dodge: removed on request (Skyrim has none)

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
Voice acting, large map, crafting trees, factions, big NPC cast,
competitive PvP, matchmaking, accounts/servers that cost money.

## Co-op (online, optional)
- **"4 now, 10 later":** PeerJS peer-to-peer, max 4 players. The host's browser
  is authoritative. Later a relay server (e.g. Cloudflare Durable Objects) can
  replace PeerJS for 8–10 player dragon hunts.
- **Transport-agnostic:** game code talks to `net/transport.js`, never to PeerJS
  directly, so swapping PeerJS for a relay touches one file.
- **PeerJS:** pinned local copy in `vendor/` (MIT, licence alongside), loaded only
  when someone opens co-op. Signalling uses the free PeerJS cloud server.
- **Joining:** host gets a short room code; share it or a `?join=CODE` link.
- **Authority:** host decides enemies, damage, deaths, loot and quest state.
  Each player controls their own movement; guests send hits, host validates.
- **Network-ready code (from Phase 2 on):** entities have numeric ids in a
  registry; hits/deaths go through the event bus only; input becomes one
  command object per tick (`{move, run, attack, block, draw, jump, interact,
  shout, toggleBow}`).
- **Co-op rules:**
  - Slow Time slows enemies only (never other players)
  - Menus and inventory don't pause the game while in co-op
  - Enemy health/damage scale with player count
  - Loot is per-player (no fighting over drops)
  - Host's save holds world + quest progress; guests keep their own character
    (skills, inventory) in their own localStorage

## Build phases (do in order, playable at every step)
1. ✅ **Walking:** movement, third-person camera, terrain chunk, fog, mobile joysticks
2. ✅ **Combat:** melee + block + jump, one enemy (wolf) with basic AI, health/stamina
3. ✅ **First quest:** one dungeon, loot + inventory, skill leveling, save/load
4. ✅ **Dragons:** dragon AI + fight, word walls, the 3 shouts (+ bow, Archery)
5. ⬜ **Full game:** village + NPCs, main + side quests, final boss, post-game, audio, polish
   (✅ 5a village + 5b quests; ⬜ 5c boss/ending/post-game; ⬜ 5d audio/polish; see NEXT.md)

Co-op phases slot in between:
- ✅ **N1:** transport + lobby (room code / `?join=`), see each other move
- ✅ **N2:** host runs enemies and validates hits; shared fights, per-player loot
- ✅ **N3:** co-op dragon hunts (host starts them; tougher each level)
- ⬜ **N4 (later):** relay server for 8–10 players

Finish and test a phase before starting the next one.

## Code structure
```
index.html             # page, HUD/menu markup + CSS, import map (three r170 from cdnjs)
vendor/                # PeerJS 1.5.5 (MIT), loaded only when co-op opens
src/
  main.js              # boot, wiring, fixed-step tick, render loop, save/load, quest triggers
  config.js            # ALL tunable numbers
  input.js             # keyboard/mouse + touch -> one command object per tick
  camera.js            # third-person orbit camera (pulls in at walls, shake)
  world/               # terrain, props, environment (fog/light/snow), dungeon (ASCII maps,
                       # entrances, word walls), village (Frosthollow), chest, fx (particles)
  entities/            # player, creature (wolf/draugr AI) + wolfModel/draugrModel,
                       # dragon, npc (villagers), remotePlayer (co-op), model (helpers)
  systems/             # events, entities (id registry), physics, combat, inventory,
                       # skills, shouts, projectiles (arrows), quests, dialogue, save
  ui/                  # hud, menu (Bag: Items/Shouts/Skills/Quests/Co-op), dialog, coop panel
  net/                 # transport (interface) + peerTransport, protocol, session,
                       # remoteBody (host side), mirror (guest side)
  audio.js             # (Phase 5d) Web Audio procedural sounds
```

## Architecture notes
- **Levels:** the valley (`Terrain`) and each `Dungeon` share one interface: `heightAt`,
  `clamp`, `colliders`, optional `blocked`, `lineOfSight`, `ceiling`. Dungeons live far
  outside the valley (own `origin`), all in one scene; doors teleport and swap ambience.
- **Dungeons** are ASCII maps in `world/dungeon.js` (`#` rock, `.` floor, `S` start,
  `X` exit, `t` brazier, `W` word wall, letters for creatures/chests via `spawns`/`chests`).
  Lighting is baked into vertex colours; no real lights except the player's torch.
- **Creatures** share one AI (`entities/creature.js`); a config section picks the body
  (`body: 'wolf' | 'draugr'`). Bosses have `boss: true` + `saveKey`.
- **Hits/deaths go through the event bus** (`attack`, `areaAttack`, `damage`, `blocked`,
  `death`, each with `source`: melee/arrow/shout). Skills, HUD, loot and co-op listen.
- **Quests** are ordered steps with `done(world)` checked every tick (no stuck quests).
  Only ever **append** steps to an existing quest (step indices are saved). Story switches
  set in conversations live in `flags` (saved). NPC lines are in `systems/dialogue.js`.
- **Colliders** are circles `{x, z, r}` or axis-aligned boxes `{x, z, hw, hd}` (buildings).
- **Saves** are versioned (`frostbound.save.v1`); keep old saves loading when adding data.
- **Co-op:** host authoritative; guests mirror enemies and forward hits/shouts
  (`combat.forwardHit`, `shouts.forward`); host applies guests' damage via `RemoteBody`.
  Bump `protocol.js` `VERSION` when messages change.

## Conventions
- Small focused modules, no giant single file
- Fixed timestep for game logic, render every frame
- All tunable numbers (damage, speeds, cooldowns, XP curves) in one `config.js`

## Testing
- Test every change in headless Chromium with phone emulation before pushing (see
  NEXT.md "How to test"); real-phone testing is the user's job after each PR.
- Never claim untested things work; say what wasn't tested in the PR and reply.

## Git workflow
- **Always open a pull request into `master`** after pushing work to a branch.
  Don't ask first: the user wants a PR every time. If a PR from that branch
  is already open, push to it instead of opening a second one.
- The user merges PRs. Merging into `master` triggers the GitHub Pages deploy
  (https://seskiramadhan.github.io/Frostbound/), so unmerged work is not live.
- Give the user the PR link at the end of every change.
