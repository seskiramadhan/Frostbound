# Frostbound

A small Skyrim-inspired action RPG for the mobile browser. See `CLAUDE.md` for the design.

## Run locally
The game uses ES modules, which browsers block on `file://` ("blocked by CORS policy").
Serve it over http instead:

- **Windows:** double-click `start.bat` (opens http://localhost:8000)
- **Any OS:** `python -m http.server 8000` in this folder, then open http://localhost:8000

## Test on a phone
With the phone on the same Wi-Fi, open `http://<your-PC-IP>:8000`
(`start.bat` prints the IP). If it won't connect, allow Python through Windows Firewall.

## Deploy
Static files only: push to GitHub and enable GitHub Pages (or drop the folder on Vercel).

## Cloud sessions
Claude Code cloud sessions can commit and push to this repo directly (tested 2026-10-19).

## Co-op (preview)
Bag → **Co-op** (or "Play with friends" on the start screen) → **Host a game** gives a
5-letter room code and a share link (`?join=CODE`). Up to 4 players. Right now you
see each other move; shared enemies come next. Works best on Wi-Fi: some mobile
networks block direct phone-to-phone connections.
