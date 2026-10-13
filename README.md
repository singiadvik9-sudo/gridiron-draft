# Gridiron Draft

A pixel-football game with real NFL starters (Madden-style ratings). Static page + a few serverless functions, built for Vercel.

## Modes
- **Quick game**: snake-draft 11 slots (QB, HB, 2 WR, TE, whole O-line, whole defense, kicker, punt returner, kick returner, and the rest of special teams: punter, long snapper and four coverage men) from one shared pool, so every player lands on exactly one team, then play a friend with a 5-letter room code (each on their own device) or the CPU. The CPU drafts by value over replacement weighted by how much each slot moves team rating, and budgets under a cap. Optional salary cap (Tight $295M / Standard $325M / Loose $360M): each player's salary comes from rating and position (QB highest, then WR/DE, CB/DT/OL, LB, TE/S, HB), and an O-line or defense package costs the sum of its 5 or 11 players (`lib/draft.js`).
- **Campaign**: GM of a real NFL team on the real 2026 schedule. You make roster moves and play your own games; the CPU sims everyone else. Season ends with playoffs, then ageing/development, an auto-generated rookie draft (random names and ratings), preseason roster cuts, and the next season. Trade with CPU teams (they judge value, age and need), sign free agents, release players. Saves: 5 slots on your account, or 3 on this device for guests.
- **Leagues** (accounts only): the manager creates a league and shares the code. In the lobby the manager toggles divisions on/off (and how many), CPU teams on/off, NFL-team entry vs. a snake draft of every player, trades on/off (plus deadline), games per team, playoff size, draft order and who sits in which division. Humans can play each other live or the manager can sim the week. Each finished season is written to every manager's account (record, rank, champion flag, personal stat lines) until they delete it on the Account page.
- **Tournaments** (accounts only): single elimination, best-of per round (early / semis / final), snake-drafted teams (optional salary cap, up to 16 teams, CPU entrants auto-pick, manager can auto-pick for anyone who stalls) or real NFL teams, CPU entrants, custom seeding (drag-free: up/down arrows, join order, random, by rating), manager overrides. Byes go to top seeds when the field isn't a power of two.

## Playing it yourself (live control)
**Game clock.** Four 2:00 quarters (overtime is one 2:00 period, first score wins, 2 timeouts), played with NFL stoppage rules: the clock stops on incomplete passes, out-of-bounds plays, scores, and changes of possession, and runs otherwise. There is no delay of game. Instead, the clock that runs between the end of a play and the next snap is capped at **5 seconds** (the play itself takes its own few seconds on top, so a typical running play costs about 8-9 s of clock). Each team has 3 timeouts per half; tick the **Timeout** switch (key `T`) before the snap to use one, which also gives back the clock that was running down. Offenses also get **Spike** (stops the clock, costs a down) and **Kneel** (runs the clock, loses a yard or so). A quarter always ends on a snap, never between them. The CPU kneels, spikes, hurries up and calls timeouts at sensible moments (`E.cpuTO`). Spike and kneel, like kicks, are automatic and not live-playable. Covered by `test_clock.js`.

On every call screen there is a **Control your players** switch (key `C`, remembered between plays). Off: you only call plays and the stat engine decides the snap, as before. On: both sides' players run on the field in real time (`lib/live.js`, 22 players at 20 ticks a second). The offense plays the quarterback (WASD or arrows to move, `1-4` throw to the numbered receiver, `Space` throws it away), then whoever has the ball (`Space` jukes). The defense plays one defender (`Space` dives, `E` switches to the one nearest the ball). Everyone you don't control moves on his own, following the play call. Touch screens get an on-screen pad. "Let the computer play it" hands your player back mid-snap. Kicks and punts stay automatic. Either player can have it on or off on any play, vs. a friend or the CPU, in quick games, leagues and tournaments.

How it stays in sync (and honest): the snap is a pure function of `seed + play number + squads + calls + each controller's input trace`. Each player streams inputs through the room (`op: 'live'` in `api/room.js`); an input takes effect ~0.5 s later on every screen (input delay, which raises itself if the connection is slow) and a screen only advances once it has both players' inputs (lockstep). The traces are stored with the game, so the server replays the exact same snap when it verifies a league or tournament result. If a player vanishes mid-snap, the other can hand their player to the computer after 5 s. Reloading mid-snap rebuilds it from the room.

Note: a live snap costs roughly 10 Redis commands per second per controlling player while it runs (about 100-200 commands for a snap), so a game played entirely live uses a few thousand.

## Deploy
1. Push this folder to GitHub, import it in Vercel. Framework: **Other**, no build command, output directory `public` (already in `vercel.json`; `public/index.html` is committed pre-built).
2. Add **Upstash Redis** from the Vercel Marketplace (it sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`, or `UPSTASH_REDIS_REST_URL` / `_TOKEN`). Without it the functions use per-instance memory, which only works for local testing.
3. Redeploy.

**Cloudflare instead of Upstash:** create a D1 database (Cloudflare dashboard → Storage & Databases → D1), then add three Vercel environment variables: `CF_ACCOUNT_ID`, `CF_D1_DATABASE_ID`, and `CF_API_TOKEN` (an API token with *D1: Edit*). The table is created automatically. If these are set, they're used instead of Upstash. Note Cloudflare's REST API allows about 1,200 requests per 5 minutes per token, which caps how many people can have a league or tournament page open at once (each polls every 5 s); Upstash has no such cap.

Accounts are name + password (scrypt) with a 30-day session token. Nothing else is stored about people.

## How results stay honest
Games are deterministic: every client and the server replay `seed + squads + picks`. CPU opponents are deterministic too, so a human-vs-CPU result is verified server-side from the human's picks alone; human-vs-human results are replayed from the picks stored in the room. A reported result that doesn't replay to a finished game is rejected. Quick-game and tournament drafts are validated on the server (turn order, one owner per player, slot limits, cap).

## Costs / limits
Leagues and tournaments poll a tiny version key every 5 s while open. Free-tier Upstash (10k commands/day) is enough for casual groups; raise `ms` in `poll()` (`src/hub/01_core.js`) if you hit it. League documents are stored gzipped (~100-300 KB).

## Develop
```
python3 build.py          # inlines lib/ + src/ into public/index.html
node dev-server.js 3000       # serves public/ and mounts every api/*.js (in-memory store)
node test_league.js && node test_custom.js && node test_api.js && node test_live.js && node test_clock.js
python3 mkfast.py && node dev-server.js 5055 public_fast   # then: python3 ui_live.py (human vs human, live), ui_live_cpu.py
```
- `lib/live.js` the on-field simulation (`src/live_client.js` is its renderer, input and lockstep layer); `lib/engine.js` shared game engine; `lib/league.js` season/draft/trade/bracket logic (browser + server); `lib/draft.js` snake-draft board, salary model and CPU drafter; `lib/data.json` real players (built by `build_data.py` from nflverse depth charts, rosters and schedule + EA Madden ratings; players without a published rating inherit comparable players' ratings).
- Skin/hair per player are approximate; sprites only vary in those two (plus team colors).
- Unofficial fan project, no logos.
