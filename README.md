# Gridiron Draft

A pixel-football game with real NFL starters (Madden-style ratings). Static page + a few serverless functions, built for Vercel.

## Modes
- **Quick game**: draft 7 slots (QB, HB, 2 WR, TE, whole O-line, whole defense) and play a friend with a 5-letter room code (each on their own device), or play the CPU. Guests welcome.
- **Campaign**: GM of a real NFL team on the real 2026 schedule. You make roster moves and play your own games; the CPU sims everyone else. Season ends with playoffs, then ageing/development, an auto-generated rookie draft (random names and ratings), preseason roster cuts, and the next season. Trade with CPU teams (they judge value, age and need), sign free agents, release players. Saves: 5 slots on your account, or 3 on this device for guests.
- **Leagues** (accounts only): the manager creates a league and shares the code. In the lobby the manager toggles divisions on/off (and how many), CPU teams on/off, NFL-team entry vs. a snake draft of every player, trades on/off (plus deadline), games per team, playoff size, draft order and who sits in which division. Humans can play each other live or the manager can sim the week. Each finished season is written to every manager's account (record, rank, champion flag, personal stat lines) until they delete it on the Account page.
- **Tournaments** (accounts only): single elimination, best-of per round (early / semis / final), drafted teams or real NFL teams, CPU entrants, custom seeding (drag-free: up/down arrows, join order, random, by rating), manager overrides. Byes go to top seeds when the field isn't a power of two.

## Deploy
1. Push this folder to GitHub, import it in Vercel. Framework: **Other**, no build command, output directory `public` (already in `vercel.json`; `public/index.html` is committed pre-built).
2. Add **Upstash Redis** from the Vercel Marketplace (it sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `_TOKEN`). Without it the functions use per-instance memory, which only works for local testing.
3. Redeploy.

Accounts are name + password (scrypt) with a 30-day session token. Nothing else is stored about people.

## How results stay honest
Games are deterministic: every client and the server replay `seed + squads + picks`. CPU opponents are deterministic too, so a human-vs-CPU result is verified server-side from the human's picks alone; human-vs-human results are replayed from the picks stored in the room. A reported result that doesn't replay to a finished game is rejected. (Tournament *drafts* run in the browser from a fixed per-player seed, so a determined cheater could edit their own roster; fine for friends.)

## Costs / limits
Leagues and tournaments poll a tiny version key every 5 s while open. Free-tier Upstash (10k commands/day) is enough for casual groups; raise `ms` in `poll()` (`src/hub/01_core.js`) if you hit it. League documents are stored gzipped (~100-300 KB).

## Develop
```
python3 build.py          # inlines lib/ + src/ into public/index.html
node dev-server.js 3000       # serves public/ and mounts every api/*.js (in-memory store)
node test_league.js && node test_custom.js && node test_api.js
```
- `lib/engine.js` shared game engine; `lib/league.js` season/draft/trade/bracket logic (browser + server); `lib/data.json` real players (built by `build_data.py` from nflverse depth charts, rosters and schedule + EA Madden ratings; players without a published rating inherit comparable players' ratings).
- Skin/hair per player are approximate; sprites only vary in those two (plus team colors).
- Unofficial fan project, no logos.
