# NEXT.md — where Frostbound stands and what's pending

Read this first in a new session, then `CLAUDE.md` for the rules.
Last updated: 2026-10-19 (round 6 "bandits + enemy levels" on branch `bandits`, build 4; then the Greybeards
and day/night + rocks rounds follow on stacked branches; see the table below).
**Next:** the user merges and tests each PR in order.

## Live now (merged to `master`, deployed to GitHub Pages)
https://seskiramadhan.github.io/Frostbound/

| Step | What | PR |
|---|---|---|
| Phase 1 | Walking: terrain, fog, snow, third-person camera, joystick + mouse look | initial |
| Phase 2 | Combat: sword, block, jump (dodge was removed on request), wolf pack AI, HP/stamina | #1, #2 |
| Phase 3 | Frostfang Den, chests, inventory (Bag), One-Handed/Block skills + perks, quest "The Howling Den", save/load | #3, #4 |
| Phase 4 | Bleakrock Barrow + draugr, word walls, shouts FUS/TIID/YOL, bow + Archery, the dragon, quest "Dragon Rising" | #5 |
| Co-op N1 | Rooms by 5-letter code / `?join=` link, see each other move (PeerJS, vendored) | #6 |
| Co-op N2 | Shared fights: host runs every enemy, guests' hits validated, per-player loot | #7 |
| Docs + fix | NEXT.md, CLAUDE.md refresh; big announcements queue (dragon soul message fix) | #8 |
| Co-op N3 | Dragon hunts: host starts from the Co-op tab after Dragon Rising; tougher each level; gold for everyone | #9 |
| Phase 5a+5b | Frosthollow village, 5 NPCs + dialogue, merchant, inn, Jarl-led main story, 4 side quests, quest log | #10 |
| Music folders | `audio/music/` (public CC0) + git-ignored `audio/music/local/` | #11 |
| Phase 5c+5d | Audio (SFX + music), World-Eater on the summit, ending, post-game, Ice Form, New Game+ | #12 |
| Round 4 | Sneak + stealing, fire magic + Magicka, hold-to-switch shouts, fewer draw calls | #13 |
| Music | CC0 tracks `audio/music/boss.mp3` + `explore.mp3` (converted from the user's WAVs) | #14 |
| Update button | Bag ↻ re-downloads every game file past the cache; "New version available" notice; build 2 | #15 |
| Round 5 | Raids on Frosthollow + the Jarl's requests (build 3) | #17 |
| Round 6 | Bandits (camp, archers, chief, raid wave) + enemy levels (build 4) | round-6 PR (branch `bandits`) |

**Story today (with round 2):** start in Frosthollow → The Jarl's Summons (talk to Jarl Hrolf) →
The Howling Den (den, alpha, treasure, report to Jarl) → Dragon Rising (barrow, FUS word wall, dragon,
soul → YOL, report to Jarl). TIID's word wall is in Frostfang Den. Side quests: Pelts for the Hunter (Ulf),
The Ancestor's Blade (Sven; chest in the barrow crypt), A Letter for the Jarl and Silence the Barrow (Bera).
After the dragon the Jarl offers **The World-Eater**: climb the summit path (east of the barrow),
fight the World-Eater (phase 1 airborne: bow + FUS/TIID; phase 2 below 60% HP it lands for good and
fights harder), then victory: ending card, sunny valley, villagers say "Dragonborn".
**Post-game:** random dragon attacks over the valley, dungeons refill (tougher, better loot) every
`postGame.dungeonRespawn` s, a hidden word wall in Bleakrock Barrow teaches **Ice Form (IIZ)**
(freezes enemies, knocks dragons down), and the Jarl offers **New Game+** (keeps skills, enemies
+50% HP / +30% damage per NG level).

**Round 4 (merged, being playtested):**
- **Sneak:** Sneak button / C crouches (slower, no running). Enemies notice a crouching player
  gradually (`creature.notice` 0..1: closer, in front, moving = faster; behind, still, dim dungeon,
  Sneak skill = slower). Stealth eye above the bars: Hidden / Caution / Detected.
  Sneak attacks on unaware enemies (state wander/return): sword x3, arrow x2, fire x1.5 (perk doubles).
- **Stealing:** 3 village strongboxes (Jarl, Ingrid, Bera). Anyone within 14 m sees a standing thief;
  a crouching thief only if a villager within 6 m is facing you. Caught = 40 gold fine. Boxes refill
  after 15 min. Sneak XP from creeping near unaware enemies, sneak attacks and stealing.
- **Fire magic:** "Spell Tome: Fire" (Ingrid, 80 gold) teaches Firebolt (tap) + Flames (hold).
  Weapon button / B cycles Sword -> Bow -> Fire. Magicka bar (blue) appears once you know fire.
  Destruction skill (perk: half cost). Skills tab now has 5 skills.
- **Shouts:** hold the Shout button (or R) to switch shouts.
- **Perf:** word walls, brazier stands and entrances merged (barrow 129 -> 69 draw calls, den 79 -> 60,
  village 50 -> 42); creatures beyond the fog are skipped when drawing.
- Fixes: New Game+ start text; removed the stale "More of the story awaits" announcement.
- Co-op: protocol v5 (pose flags 4 = crouched, 8 = spell mode). Guests' sneak attacks are multiplied
  on the guest; the host doesn't multiply again. Other players' Flames are drawn; their firebolts are not.

**Updates without clearing the cache:** the Bag has a ↻ button that re-downloads every game
file (following the imports from `src/main.js`, `fetch(..., { cache: 'reload' })`) and reloads,
keeping the save. The start screen shows "New version available" when `version.json` has a
higher build than `src/version.js` `BUILD` (checked on load and every 10 min), and shows
"Build N" at the bottom. **Bump both numbers in every PR.** Build 2 = this feature.
Devices still on build 1 or older need one last manual refresh/cache clear to get the button.

**Round 6 (built, awaiting test): bandits + enemy levels**
- **Enemy levels** (`systems/levels.js`): your level = 1 + (skill levels gained, all skills) / 2, shown in the
  Skills tab and announced on level-up. Every enemy has a design level `lvl`. **Fixed** enemies keep it
  (valley wolves 1, den 1/Alpha 3, barrow draugr 4/Wight 6, story dragon, World-Eater). **Scaling** ones
  (`scales: true`: bandits, raiders, raid guards, hunt/attack dragons, anything in a refilled dungeon)
  fight at your level (+ `lvlOffset`), never below their design level: +10% health, +6% damage per level
  above it. Applied on every respawn (`creature.onRespawn` → `scaleCreature`). NG+ multiplies on top.
  Health bars show "Name · Lv N". The old post-game tier stat bonus is gone (tiers now only mean loot).
- **Bandits** (human version of the draugr body): camp in the western forest at (-72, -32) (trees kept out
  by `props.clearings`): 3 bandits, 2 **archers** (`ranged`: keep their distance, shoot real arrows via
  'creatureShoot' → projectiles; they can hit you on the watchtower) and the **Bandit Chief** (Lv +2).
  Respawn after 5 min, drop gold. Camp chest refills every 10 min.
  Side quest **Bandits in the Woods** (Ulf): find the camp, kill the chief, report → 150 gold + potion.
  Jarl job **Clear out the bandit camp**. Raids now have **4 waves**: wolves → bandits (2 + 2 archers) →
  draugr → draugr + Warlord.
- Co-op: protocol v7 (enemy list carries maxHp + level; 'enemyShot' world event gives guests a harmless
  copy of each bandit arrow to see).

**Round 5 (merged): raids + the Jarl's requests**
- **Raids:** ring the **bell** in the square (after The Howling Den, host/solo only, not while a dragon is up)
  or take the Jarl's "Defend" job. Villagers hide; 2 **guards** (same AI as creatures, `team: 'player'`,
  `hunts: 'beast'`) defend. After an 8 s warning, 3 waves march in along 3 lanes (east, west, south):
  4 wolves → 5 draugr → 3 draugr + the **Draugr Warlord** (boss bar). Raiders (`cfg.raider`) march on
  the village and attack **barricades** (entities, `kind: 'barricade'`, fixed, 160 HP; repair mid-raid
  for 15 gold; rebuilt free when a raid starts). **Watchtower** north of the south gate: climb with Use,
  stand on top (valley `platforms`), and creatures can't reach anyone more than 2.5 m above them.
  Win: 150 + 75/level gold, first win gives the **Warlord's Axe** (27 dmg). Lose (all barricades broken
  or everyone down): Ingrid's shop burns and stays shut for 5 min. Each raid won makes the next tougher
  (+25% HP, +15% dmg per level; NG+ on top). A raid in progress isn't saved.
- **Jarl's requests:** "Any work for me?" (after The Howling Den; not for co-op guests). One random job at
  a time: clear Frostfang Den or Bleakrock Barrow (refills it), hunt 3 valley wolves, slay a dragon
  (after Dragon Rising), defend the village (starts a raid). Then "The job is done." to be paid:
  60 gold + 25 per job done (max 400). Quest `jarlJob` ("Jarl's Request") is restarted for each job;
  its step text comes from `systems/jobs.js`. Losing a raid job fails it.
- Co-op: protocol v6 (raid units in the world list, 'raid' world event). Guests follow the host's raid,
  get the win reward if they're in the valley, can't ring the bell or repair barricades.

## Roadmap agreed with the user (2026-10-19)

**Strategy:** build the replayable extras now (**Jarl's requests + raids**, one round), and grow the
**main story** in smaller updates along the way. The main story stays **close to Skyrim**; the extras
(Jarl's requests, raids) may be original. Every release: merge → players tap **↻** in the Bag.
Every PR: bump the build number, keep old saves loading, and put a short "What's new" in the PR.

| # | Idea | What's in it | Size | Status |
|---|---|---|---|---|
| **1** | **Raids on Frosthollow** (original, Minecraft-like): ✅ round 5 | **Player starts it**: ring the village bell, or take the Jarl's "Defend the village" job. Villagers hide in the longhouse. 3 waves from the forest edge: wolves → draugr → **Draugr Warlord** (boss). Fixed barricades on the village edges, repaired with gold; a watchtower for bow/fire; 2 village guards fight with you; a wave bar on screen. Win = big gold + a rare item. Lose (gentle) = a house burns and Ingrid's shop closes for a while, nothing permanent. Harder each time. Host runs it in co-op. | Medium | ✅ Built (round 5) |
| **2** | **Jarl's requests** (bounty board, Skyrim-style radiant jobs): ✅ round 5 | Talk to the Jarl → "Any work?" → one random job at a time: clear a dungeon (refills it), hunt the wolf pack, slay a dragon over the valley, defend the village (starts a raid). Gold grows with each finished job. Shown in the quest log like other quests. | Small–medium | ✅ Built (round 5) |
| **3** | **More Skyrim main story** (Greybeards) | A **new main quest** between Dragon Rising and The World-Eater (added as a new quest, not new steps, so saves stay valid): (a) after the first dragon, **"DOVAHKIIN!"** thunders from the mountain; (b) **"The Way of the Voice"**: climb to a High Hrothgar-style monastery halfway up the peak, where old masters test your shouts and teach a word; (c) **"The Horn"**: fetch an ancient horn from a barrow; (d) then the summit path opens. Optional: a **Dragonstone** in Bleakrock Barrow showing dragon burial sites. | Medium | **Next**, in small updates |

**Dropped by the user:** "The Raiders' Nest" fort siege. (Bandits came back in round 6.)
**Maybe later:** blacksmith + dragon bone gear, legendary dragon, buying a house, legendary skills,
day/night, standable rocks, a Fire button / tutorial, a second region, co-op N4 relay.
**Naming note:** some names are taken straight from Skyrim (shout words, "Unrelenting Force", "Dragonborn",
"World-Eater"; "Bleakrock Barrow" is close to "Bleak Falls Barrow"). That's fine for a personal fan game.
Rename them if the user ever wants to share it widely.

## Earlier plan: 3 rounds, user tests after each (done)
1. **Round 1 (done, merged):** announcement fix + co-op N3 dragon hunts.
   User tests: co-op fight + a hunt with a friend, solo dragon difficulty, phone FPS.
2. **Round 2 (done, merged):** Phase 5a village + 5b quests. User tests: talk to the Jarl,
   do a side quest, buy/sell with Ingrid, rest at the inn, check the Quests tab.
3. **Round 3 (done, merged):** audio + music, World-Eater + ending + post-game.
   User tests: sound/music (Bag → sound button cycles On / FX only / Off), Jarl → summit →
   World-Eater both phases, ending, Ice Form wall, a dungeon refill, a dragon attack, New Game+.

## Pending, in suggested order

### 1. Playtest feedback still needed from the user
- [ ] Dragon fight difficulty on a real phone (tests ran with HP topped up)
- [ ] Alpha Wolf / Draugr Wight difficulty
- [ ] Real-phone frame rate (target 60, never below 30), especially the dragon fight and fire particles
- [ ] Co-op on two real phones: N1 worked on the user's devices (room MCXWP, 2/4). N2 (shared fights) not yet tried for real.
- [ ] Co-op on **mobile data** (4G/5G) — untested. Some carriers block WebRTC; would need a TURN relay (free tiers exist, e.g. Metered/OpenRelay) added to `CONFIG.net.iceServers`.

### 2. Small UX fixes already discussed
- [x] **Quick shout switching:** hold Shout (phone) / R (desktop). Round 4.
- [ ] Standable rocks (rocks are only circle colliders, no top) + maybe a slightly higher jump. User said "okay for now".

### 3. Co-op N3 — done (round 1)
Host-only "Start a dragon hunt" in Co-op tab, unlocked after the host finishes Dragon Rising. A second
Dragon instance (`huntDragon`) is reused each hunt; level = host's `hunts` + 1 (saved per player);
HP +30%/level, damage +15%/level, names from `CONFIG.hunt.names`; everyone present gets
`goldPerLevel × level`. Solo random dragon hunts are still Phase 5c post-game.

### 4. Phase 5 — full game (suggested split, one PR each)
- ✅ (round 2) **5a Village hub** in the flat valley centre (`terrain.flatRadius`): merchant (sell pelts, buy potions/gear — gold has no use yet), inn, a few NPCs, a Jarl/elder who gives the main quest.
- ✅ (round 2) **5b Main + side quests:** main story village → first dungeon → shouts → first dragon → peak → World-Eater; 5–6 side quests; quest log in the Bag (today the HUD only shows the first unfinished quest).
- ✅ (round 3) **5c Final boss + ending + post-game:** World-Eater on the peak (`terrain.peak`), phase 1 airborne (Slow Time + bow), phase 2 grounded melee; sunny ending, NPCs say "Dragonborn"; random scaling dragon hunts, dungeon respawns with better loot, hidden 4th shout, New Game+.
- ✅ (round 3, audio part) **5d Audio + polish:** procedural Web Audio (`src/audio.js`): sword, wolves, dragon roar, shouts, wind, footsteps. Optional day/night.

### 5. Not in the game yet (from CLAUDE.md core mechanics)
- Day/night cycle (optional)
- Village is single-player per device in co-op: NPCs, quests and trades are local to each player

## Co-op: known gaps (fine for now, revisit in N3 / Phase 5)
- Quests are **not shared**: each player keeps their own quest progress (kills by anyone still count where a quest checks world state, e.g. the alpha being dead).
- Chests and word walls are per player (local), not host-decided.
- Only the host's quest summons the story dragon; only the host starts hunts.
- A hunt in progress is not saved (reload = hunt gone).
- The world pauses if the **host** backgrounds the app (phones stop rendering hidden tabs).
- A guest leaving a room reloads the page to restore their own world (by design).
- Guests see dragon soul particles approximately (mirrored), not the exact host effect.

## How to test in a cloud session (sandbox notes)
- Serve: `python3 -m http.server 8123` in the repo root.
- cdnjs, jsdelivr and the PeerJS server are **blocked** from the sandbox. For headless tests download
  three.js the same version (`npm pack three@0.170.0`) into the scratchpad and route
  `https://cdnjs.cloudflare.com/**` to `package/build/three.module.min.js` with Playwright.
- Playwright + Chromium are preinstalled (`/opt/node22/lib/node_modules/playwright`); use
  `devices['Pixel 7']` for phone emulation and `--use-angle=swiftshader`. FPS numbers there are meaningless.
- Debug handle: `window.frostbound` (player, creatures, dragon, quests, shouts, inventory, session, `go(level, pos, facing)` to teleport properly, `tpCam`, `save()`).
- Co-op tests: route `**/src/net/transport.js` to a BroadcastChannel transport with the same interface
  (two pages in one browser context talk to each other). Real PeerJS can only be tested on devices.
- Lint: `eslint` is installed globally; use a flat config with browser globals (window, document,
  localStorage, navigator, performance, requestAnimationFrame, setTimeout, location, …).

## Music
- CC0 tracks are in: "Boss Battle Music" (SubspaceAudio) -> `audio/music/boss.mp3`,
  "Medieval: Exploration" (RandomMind) -> `audio/music/explore.mp3` (converted from the user's
  WAVs to 128 kbps MP3 with ffmpeg; 2 MB + 3.8 MB). Keep music as mp3/ogg, never WAV.
- User's Skyrim tracks (Dragonborn = boss, Far Horizons = explore) are personal only:
  `audio/music/local/` (git-ignored). Code should prefer local/ files when present.
- Built: explore music everywhere, boss music while a dragon / the World-Eater is active, crossfade.
  `audio.js` tries `audio/music/local/` first, then `audio/music/`; mp3 then ogg. No file = SFX only.
- **Never commit copyrighted music.** Only the CC0 files go in `audio/music/`.

## Open questions for the user
- Playtest notes from rounds 3–4 (World-Eater difficulty, sneak speed, fire balance, iPad FPS, buttons).
- Round 5 feedback: raid difficulty, barricade HP, guard strength, rewards, job variety.
- Go-ahead for the main story update (roadmap #3: "DOVAHKIIN!", The Way of the Voice, the Horn).
