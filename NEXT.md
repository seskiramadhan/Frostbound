# NEXT.md — where Frostbound stands and what's pending

Read this first in a new session, then `CLAUDE.md` for the rules.
Last updated: 2026-10-19 (after PR #7, co-op N2).

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

**Story today:** start in the valley → The Howling Den (den, alpha, treasure) → Dragon Rising
(barrow, FUS word wall, dragon arrives in the valley, soul → YOL). TIID's word wall is in Frostfang Den.
After the dragon there is no more story yet (Phase 5).

## Pending, in suggested order

### 1. Playtest feedback still needed from the user
- [ ] Dragon fight difficulty on a real phone (tests ran with HP topped up)
- [ ] Alpha Wolf / Draugr Wight difficulty
- [ ] Real-phone frame rate (target 60, never below 30), especially the dragon fight and fire particles
- [ ] Co-op on two real phones: N1 worked on the user's devices (room MCXWP, 2/4). N2 (shared fights) not yet tried for real.
- [ ] Co-op on **mobile data** (4G/5G) — untested. Some carriers block WebRTC; would need a TURN relay (free tiers exist, e.g. Metered/OpenRelay) added to `CONFIG.net.iceServers`.

### 2. Small UX fixes already discussed (not done)
- [ ] **Announcements collide:** "Dragon soul absorbed" is instantly replaced by "Quest completed: Dragon Rising". Queue `hud.announce()` so messages show one after another; then add a closing "More of the story awaits" line when the last available quest is done.
- [ ] **Quick shout switching:** offered "hold the shout button 0.5 s to cycle shouts" (phone) and an **R** key (desktop). User asked how to switch; not yet confirmed they want it — today it's Bag → Shouts tab.
- [ ] Standable rocks (rocks are only circle colliders, no top) + maybe a slightly higher jump. User said "okay for now".

### 3. Co-op N3 — co-op dragon hunt (CLAUDE.md: after Phase 4)
Builds on N2. Ideas: host can summon a dragon hunt from the Co-op tab once anyone has killed the first
dragon; dragon HP already scales with player count; reward everyone. Also consider the co-op gaps below.

### 4. Phase 5 — full game (suggested split, one PR each)
- **5a Village hub** in the flat valley centre (`terrain.flatRadius`): merchant (sell pelts, buy potions/gear — gold has no use yet), inn, a few NPCs, a Jarl/elder who gives the main quest.
- **5b Main + side quests:** main story village → first dungeon → shouts → first dragon → peak → World-Eater; 5–6 side quests; quest log in the Bag (today the HUD only shows the first unfinished quest).
- **5c Final boss + ending + post-game:** World-Eater on the peak (`terrain.peak`), phase 1 airborne (Slow Time + bow), phase 2 grounded melee; sunny ending, NPCs say "Dragonborn"; random scaling dragon hunts, dungeon respawns with better loot, hidden 4th shout, New Game+.
- **5d Audio + polish:** procedural Web Audio (`src/audio.js`): sword, wolves, dragon roar, shouts, wind, footsteps. Optional day/night.

### 5. Not in the game yet (from CLAUDE.md core mechanics)
- Crouch / Sneak skill / stealth meter / sneak attacks / stealing
- Magic: Destruction (fire) skill + Magicka bar
- Merchant (5a), quest log (5b), 4th shout + New Game+ (5c), audio (5d)

## Co-op: known gaps (fine for now, revisit in N3 / Phase 5)
- Quests are **not shared**: each player keeps their own quest progress (kills by anyone still count where a quest checks world state, e.g. the alpha being dead).
- Chests and word walls are per player (local), not host-decided.
- Only the host's quest summons the dragon.
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

## Open questions for the user
- Quick shout switching: want it? (see 2)
- After playtesting: N3 co-op dragon hunts next, or Phase 5a village?
