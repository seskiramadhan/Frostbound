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
  Buttons: Jump, Use (appears near doors/chests/word walls), Shout (cooldown ring;
  hold = switch shout), weapon (Sword/Bow/Fire), Sneak, Bag.
- **Desktop:** WASD move, Shift run, mouse look (pointer lock), LMB attack
  (bow: hold to draw; fire: click = Firebolt, hold = Flames), RMB block, Space jump,
  E interact, Q shout, R switch shout, B sword/bow/fire, C sneak, I or Tab Bag
- No dodge: removed on request (Skyrim has none)

## Core mechanics
- **Third-person camera** following the player
- **Combat:** melee (sword), bow, one magic school (fire)
- **Learn by doing:** skills level up by use (One-Handed, Archery, Destruction,
  Sneak, Block). No classes. Maxing a skill unlocks a perk.
- **Shouts (3 + 1 hidden):** Push, Slow Time, Fire Breath, learned at word walls and from the
  first dragon's soul, with cooldowns; Ice Form is the hidden 4th (post-game)
- **Sneak:** crouch, stealth meter, sneak attacks deal bonus damage, stealing
- **Loot:** chests, enemy drops, simple inventory (weapons, armor, potions, gold)
- **Health / Stamina / Magicka** bars

## World
- One valley, kept small:
  - **Village** (hub: merchant, quest givers, inn)
  - **Forest** (wolves, bandits)
  - **3–4 dungeons** (caves/ruins, each with a word wall or a key item): Frostfang Den,
    Bleakrock Barrow, Ustengrav
  - **High Hrothgar** (the Greybeards, halfway up the peak) and a **bandit camp** in the forest
  - **Mountain peak** (final dragon)
- A roaming dragon randomly circles the valley
- Day/night cycle (12-minute days; raids can come at night)

## Quests
- **Main quest:** village → first dungeon → learn shouts → first dragon → "DOVAHKIIN!" and the
  Greybeards (The Way of the Voice) → climb the peak → World-Eater. Stays close to Skyrim.
- **Side quests (5–6):** pelts, the ancestor's blade, the letter, the barrow, the bandit camp, plus the
  Jarl's repeatable requests and raids (original, not from Skyrim)
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
  shout, toggleBow, crouch, cycleShout}`).
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
5. ✅ **Full game:** village + NPCs, main + side quests, final boss, post-game, audio
   (5a–5d done; later rounds added sneak, magic, raids, bandits, levels, Greybeards, day/night).
   Ongoing: polish and balance from playtesting (see NEXT.md)

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
                       # entrances, word walls), village (Riverholt), summit (boss arena),
                       # monastery (High Hrothgar, the Greybeards),
                       # defenses (barricades, bell, watchtower), camp (bandits), chest, fx
  entities/            # player, creature (wolf/draugr/bandit/guard AI) + wolfModel/draugrModel,
                       # dragon, npc (villagers, Greybeards), remotePlayer (co-op), model (helpers)
  systems/             # events, entities (id registry), physics, combat, inventory,
                       # skills, shouts, projectiles (arrows), magic (fire), stealth
                       # (meter, witnesses), raid (waves, guards), jobs (Jarl's requests),
                       # levels (player level, enemy level scaling),
                       # quests, dialogue, save
  ui/                  # hud, menu (Bag: Items/Shouts/Skills/Quests/Co-op), dialog, coop panel
  version.js, updater.js # build number + update check; one-click update past the cache
  net/                 # transport (interface) + peerTransport, protocol, session,
                       # remoteBody (host side), mirror (guest side)
  audio.js             # Web Audio: procedural SFX + music (audio/music/, local/ override)
```

## Architecture notes
- **Levels:** the valley (`Terrain`) and each `Dungeon` share one interface: `heightAt`,
  `clamp`, `colliders`, optional `blocked`, `lineOfSight`, `ceiling`. Dungeons live far
  outside the valley (own `origin`), all in one scene; doors teleport and swap ambience.
- **Dungeons** are ASCII maps in `world/dungeon.js` (`#` rock, `.` floor, `S` start,
  `X` exit, `t` brazier, `W` word wall, letters for creatures/chests via `spawns`/`chests`).
  Lighting is baked into vertex colours; no real lights except the player's torch.
  A dungeon can have a hidden `secretWall` (`V` in the map) that wakes after victory.
- **Summit** (`world/summit.js`) is an outdoor level (`outdoor: true`, snow, open sky) reached
  from the `summit` path entrance. The World-Eater is a second `Dragon` with a `look` (colour,
  scale) and `boss` options: phase 1 airborne, phase 2 (below `phase2At` health) grounded for good.
- **Main story:** The Jarl's Summons → The Howling Den → Dragon Rising → The Way of the Voice (Greybeards,
  High Hrothgar, Ustengrav, the Horn) → The World-Eater. Story switches live in `flags`.
- **Post-game** (after `flags.victory`): random dragon attacks, dungeons refill with a higher
  `tier` (better chests; their enemies scale with your level), Ice Form secret wall, New Game+
  (`ng` in the save; keeps skills, scales enemies via `CONFIG.postGame`).
- **Creatures** share one AI (`entities/creature.js`); a config section picks the body
  (`body: 'wolf' | 'draugr'`). Bosses have `boss: true` + `saveKey`. `team`/`hunts` make
  guards (team 'player', hunting 'beast'); `raider: true` marches on the village and hits barricades.
- **Raids** (`systems/raid.js`): all raiders, guards and barricades are created at startup (fixed
  entity ids for co-op) and reused; the host runs waves and emits 'raid' events. Barricades are
  entities (`kind: 'barricade'`, `fixed`); dragons only target `kind: 'player'`.
- **Platforms:** `valley.addPlatform` (box or circle with a top height) makes things you can stand on:
  rocks and the watchtower. `heightAt` returns the top; walking into one is blocked like a steep slope.
- **Day/night:** `dayTime` 0..1 in main.js, `applyDayNight` in environment.js (valley only); the co-op
  host's clock is sent in WORLD messages.
- **Enemy levels** (`systems/levels.js`): every creature config has a design level `lvl`; `scales: true`
  (or a refilled dungeon) makes it match the player's level. `scaleCreature` in main.js runs on every
  respawn (`creature.onRespawn`). Archers are creatures with `ranged: true` ('creatureShoot').
- **Jarl's requests** (`systems/jobs.js`): repeatable quest `jarlJob`, restarted per job
  (`quests.restart`), text from the current job.
- **Hits/deaths go through the event bus** (`attack`, `areaAttack`, `damage`, `blocked`,
  `death`, each with `source`: melee/arrow/shout/fire). Skills, HUD, loot and co-op listen.
- **Sneak:** creatures notice a crouching player gradually (`notice`); `unaware` (state
  wander/return) enables sneak attacks, applied in `combat.applyHit`.
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
- **Bump the build number in every PR that changes game files:** `BUILD` in `src/version.js`
  and `"build"` in `version.json` (same number). Players then see "new version available"
  and the Bag's ↻ button fetches it past the browser cache (`src/updater.js`).
- The user merges PRs. Merging into `master` triggers the GitHub Pages deploy
  (https://seskiramadhan.github.io/Frostbound/), so unmerged work is not live.
- Give the user the PR link at the end of every change.
