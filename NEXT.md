# NEXT.md — where Frostbound stands and what's pending

Read this first in a new session, then `CLAUDE.md` for the rules.
Last updated: 2026-10-19 (round 3 on branch `round3` = PR #12; round 4 on branch `round4`, stacked on it).

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
| Phase 5c+5d | Audio (SFX + music), World-Eater on the summit, ending, post-game, Ice Form, New Game+ | #12 (branch `round3`) |
| Round 4 | Sneak + stealing, fire magic + Magicka, hold-to-switch shouts, fewer draw calls | round-4 PR (branch `round4`, stacked on #12) |

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

**Round 4 (built, awaiting test):**
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

## Plan agreed with the user: 3 rounds, user tests after each
1. **Round 1 (done, merged):** announcement fix + co-op N3 dragon hunts.
   User tests: co-op fight + a hunt with a friend, solo dragon difficulty, phone FPS.
2. **Round 2 (done, merged):** Phase 5a village + 5b quests. User tests: talk to the Jarl,
   do a side quest, buy/sell with Ingrid, rest at the inn, check the Quests tab.
3. **Round 3 (built, awaiting test):** audio + music, World-Eater + ending + post-game.
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
- Quick shout switching: want it? (see 2)
- After round 4: what next? Candidates: day/night, standable rocks, co-op N4 relay,
  balance from playtesting (sneak detection speed, fire damage, World-Eater).
