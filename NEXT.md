# NEXT.md — where Frostbound stands and what's pending

Read this first in a new session, then `CLAUDE.md` for the rules.
Last updated: 2026-10-19. **Live: build 7**; build 8 (Skyrim-ish village names) is in a PR.
**Next:** the user playtests (PC + iPad + phone, solo and co-op) and sends notes; fix those in one PR.
Open question: rename the Greybeards too (e.g. Arnveir, Borvi, Einhart), or keep their real Skyrim names?

## Live now
https://seskiramadhan.github.io/Frostbound/ (merging into `master` deploys; players tap ↻ in the Bag)

| Step | What | PR |
|---|---|---|
| Phases 1–4 | Walking, combat (no dodge, by request), Frostfang Den, Bleakrock Barrow, word walls, shouts, bow, the first dragon, save/load | #1–#5 |
| Co-op N1–N3 | PeerJS rooms (code / `?join=`), shared fights (host-run enemies), co-op dragon hunts | #6, #7, #9 |
| Phase 5a–5d | Riverholt village + NPCs, quests + quest log, audio + music, World-Eater, ending, post-game, Ice Form, New Game+ | #10–#12 |
| Round 4 | Sneak + stealing, fire magic + Magicka, hold-to-switch shouts, fewer draw calls | #13 |
| Music + updates | CC0 music tracks; Bag ↻ one-click update + "New version available" | #14, #15 |
| Round 5 | Raids on Riverholt + the Jarl's requests | #17 |
| Round 6 | Bandits (camp, archers, chief, raid wave) + enemy levels | #18 |
| Round 7 | Main story: the Greybeards, The Way of the Voice, Ustengrav | #19 |
| Round 8 | Day/night (night raids) + rocks you can stand on | #20 |
| Camera | Look up freely (sky, dragons overhead): the camera keeps its angle when the ground pushes it up (build 7) | #22 |
| Names | Village names that sound like Skyrim but aren't real: Riverholt, Jarl Balgrim, Lukas, Delphina (the inn's "mysterious friend"), Faendir the Hunter, Alvar, the Snoring Giant (build 8) | names PR |

## The game today (build 8)

**Main story (close to Skyrim):** The Jarl's Summons (Jarl Balgrim) → The Howling Den (Frostfang Den, Alpha
Wolf; TIID word wall) → Dragon Rising (Bleakrock Barrow, FUS word wall, the first dragon, its soul gives
YOL) → **"DOVAHKIIN!"** → The Way of the Voice (High Hrothgar, Master Arngeir; shout for the Greybeards;
Ustengrav: the horn's pedestal is empty, a note sends you to Delphina at the Snoring Giant; bring the Horn of
Jurgen Windcaller back → blessing: shouts recharge 25% faster) → The World-Eater (summit; phase 1 airborne,
phase 2 grounded below 60% HP) → ending card, sunny valley, "Dragonborn".

**Side quests:** Pelts for the Hunter (Faendir), The Ancestor's Blade (Alvar), A Letter for the Jarl and Silence
the Barrow (Delphina), Bandits in the Woods (Faendir), plus the Jarl's repeatable requests.

**Systems**
- **Skills** (learn by doing, perk at max): One-Handed, Archery, Block, Destruction, Sneak.
  **Your level** = 1 + (skill levels gained) / 2 (Skills tab).
- **Enemy levels** (`systems/levels.js`): fixed enemies keep their design level (valley wolves 1, den 1 /
  Alpha 3, barrow draugr 4 / Wight 6, Ustengrav, story dragon, World-Eater). Scaling ones match your level:
  bandits, raiders, raid guards, hunt/attack dragons, refilled dungeons (+10% HP, +6% damage per level).
  Health bars show "Lv". NG+ stacks on top.
- **Shouts:** FUS (Push), TIID (Slow Time), YOL (Fire Breath), hidden IIZ (Ice Form, after victory).
  Hold the Shout button / R to switch.
- **Sneak:** crouch (button / C), gradual noticing, stealth eye, sneak attacks (x3 sword, x2 arrow,
  x1.5 fire), easier at night and in dungeons. **Stealing** from 3 village strongboxes (fine if seen).
- **Fire magic:** Spell Tome from Lukas (80 gold): Firebolt (tap) / Flames (hold), Magicka bar.
- **Raids** (bell in the square, the Jarl's "Defend" job, or 50% chance at nightfall near the village):
  4 waves (wolves → bandits → draugr → draugr + Draugr Warlord), 3 barricades (repair for 15 gold),
  2 guards, a watchtower. Win: gold + the Warlord's Axe the first time. Lose: Lukas's shop closed 5 min.
- **Jarl's requests:** one random job at a time (clear a dungeon / the bandit camp, hunt wolves, slay a
  dragon, defend the village), paid on return, pay grows.
- **Bandit camp** (western forest): 3 bandits, 2 archers, the Bandit Chief; respawns after 5 min; chest.
- **Day/night:** 12-minute days in the valley, moonlit nights with the player's lantern; sleeping at
  the inn skips to morning. **Rocks** are standable (jump onto low ones).
- **Post-game:** random dragon attacks, dungeons refill (better loot; enemies scale), Ice Form wall,
  New Game+ from the Jarl.
- **Co-op** (protocol v9): host runs enemies, raids, hunts and the clock; guests mirror them.

**Saves:** `frostbound.save.v1` in each browser (per device). Every round keeps old saves loading.
Not saved: a raid, hunt or dragon in progress. Clearing the browser's site data (e.g. Safari "Clear
History and Website Data") deletes the save: tell players to use ↻ to update instead.

## Pending

### 1. Playtest notes from the user (most important)
- [ ] Real iPad / phone frame rate (target 60, never below 30): bandit camp, raids, dragon fights
- [ ] Difficulty: World-Eater, raids (barricade HP, guards), bandit archers, enemy levels at high level
- [ ] Sneak detection speed, fire magic balance, how dark night feels
- [ ] Touch controls: jumping onto rocks, Sneak / weapon / Shout buttons
- [ ] Co-op on two real devices for raids and hunts; on mobile data (4G/5G) WebRTC may need a TURN
  relay in `CONFIG.net.iceServers`

### 2. Known small issues
- [ ] Start screen: the "Build N" label sits on top of the health bar on short desktop windows
- [ ] GitHub Pages run #19 got stuck "queued" (merges seconds apart); GitHub won't cancel it. Harmless
  unless it ever deploys build 5 over build 6: then re-run the latest pages deployment.

### 3. Ideas for later (agreed with the user, not scheduled)
Blacksmith + dragon bone gear, a legendary dragon, buying a house, legendary skills, a Fire button /
tutorial, a Dragonstone in Bleakrock Barrow, a second region, co-op N4 relay (8–10 players).
Dropped: "The Raiders' Nest" fort siege.
**Naming:** some names come straight from Skyrim (shout words, Dragonborn, World-Eater, Greybeards,
High Hrothgar, Ustengrav, the Horn of Jurgen Windcaller; "Bleakrock Barrow" ≈ "Bleak Falls Barrow").
Village names are Skyrim sound-alikes on purpose (the user wants "similar, not real"). Fine for a personal
fan game; rename the rest if the user ever wants to share it widely.

## Co-op: known gaps
- Quests, chests, word walls, the Jarl's requests and stealing are per player (local), not shared.
- Only the host can ring the raid bell, start hunts or summon story dragons.
- A raid or hunt in progress isn't saved; the world pauses if the host backgrounds the app.
- Guests see others' Flames and bandit arrows, but not other players' firebolts.
- A guest leaving a room reloads the page to restore their own world (by design).

## How to test in a cloud session (sandbox notes)
- Serve: `python3 -m http.server 8123` in the repo root.
- cdnjs, jsdelivr, github.io, opengameart and the PeerJS server are **blocked** from the sandbox. For
  headless tests put three.js 0.170.0 (`npm pack three@0.170.0`) in the scratchpad and route
  `https://cdnjs.cloudflare.com/**` to `package/build/three.module.min.js` with Playwright.
- Playwright + Chromium are preinstalled (`/opt/node22/lib/node_modules/playwright`); use
  `devices['Pixel 7']` and `--use-angle=swiftshader`. FPS numbers there are meaningless, and slow frames
  make timing-based test steps flaky (wait for state, not for time).
- Debug handle `window.frostbound`: player, creatures, quests, shouts, inventory, skills, raid, jobs,
  camp, monastery, ustengrav, combat, `go(level, pos, facing)`, `dayTime`, `startRaid()`, `save()`, ...
- Co-op tests: route `**/src/net/transport.js` to a BroadcastChannel transport with the same interface
  (two pages in one browser context). Real PeerJS only works on devices.
- Lint: global `eslint` with a flat config of browser globals (window, document, localStorage, fetch,
  URL, setInterval, ...). `ffmpeg` is installed (used to convert music).

## Music
- Public CC0 tracks: "Boss Battle Music" (SubspaceAudio) → `audio/music/boss.mp3`, "Medieval:
  Exploration" (RandomMind) → `audio/music/explore.mp3` (128 kbps; never commit WAV).
- The user's personal Skyrim tracks live only in git-ignored `audio/music/local/` and play only when
  running locally with `start.bat`. **Never commit copyrighted music.**
