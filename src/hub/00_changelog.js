/* ---------- change log ----------
   Newest first. Each release has an id (its date, with -2, -3 for more on the same day); someone who has not seen the newest one is
   shown every release since the last one they saw (What's new). Write for players: what changed and where to find it. */
const CHANGELOG = [
  { id: '2026-10-22', title: 'Better controls on the field', items: [
    'QB scrambles work: run past the line and you are a runner. A tackle there is a run, not a sack, and you can no longer throw.',
    'New moves: Q spins away from tacklers with the ball, and on defense Q lands a big hit (surer tackle, more fumbles, but you stumble if you miss). Steering at the ball carrier now guides your defender onto him.',
    'The player you control starts and cuts quicker, and receivers work back toward a scrambling quarterback.',
    'The camera leans downfield and zooms out on pass plays so your receivers stay in view; anyone still off screen gets an edge marker with his throw key.',
    'The 3D camera views are gone; the game is back to the sideline pixel view.'
  ] },
  { id: '2026-10-19-2', title: 'Gentler fatigue', items: [
    'Tired players sit less than before: a back worn down to 30% energy still plays about half his usual snaps (it was about a third). Tired players still play a little below their rating.'
  ] },
  { id: '2026-10-19', title: 'Real salaries, usage, injuries, fatigue and your own starters', items: [
    'Real salaries: every player is paid his real contract. Players without one, and anyone whose contract runs out, are paid the real market rate for his position and rating. Payroll cap $375M; quick-game caps $330M / $360M / $400M; draft-league caps $200M / $230M / $260M.',
    'Returners: no more kick and punt returner positions. Each team names one of its backs, receivers or corners (Roster tab). The quick game is 9 picks and you choose your returner under your lineup.',
    'Usage: every back, receiver and tight end has a usage, his share of snaps, that you set on the Roster tab. Who plays changes snap by snap with the play: fast receivers on deep shots, a third receiver in the slot on passing downs. Stats go to whoever was on the field.',
    'Development follows playing time: young players who play grow faster, veterans who play hold on a little longer.',
    'Injuries: about 1.5 per team per game, most for a week or two. Injured reserve frees a spot on the 53 (at least 4 weeks). CPU teams manage their own. Everyone is healthy again in the offseason.',
    'Set your own starters: on the Roster tab pick who starts at every position (start a rookie to develop him). Players grow with the snaps they play.',
    'Fatigue: players tire as they stay on the field and play a little worse when tired, so backs, receivers and tight ends rotate more as a drive goes on. Rest brings them back.',
    'This change log: the first time you visit after an update you see what is new. Open it any time from What\'s new at the top.'
  ] },
  { id: '2026-10-14', title: 'Real 53-man rosters, smarter drafts and trades', items: [
    'Every team is its real 53-man roster with Madden NFL 27 ratings, players on injured reserve included (Myles Garrett is a Ram).',
    'Free agents cost salary and need cap room to sign.',
    'Quick game: Pick for me and Auto-draft plan the best lineup the salary cap allows.',
    'New draft leagues take whole O-lines and defenses as one pick each; the CPU plans the best roster under the cap.',
    'Trades: shop CPU offers for one position, and put players on the trading block to get bids.',
    'Draft picks: always three years tradeable, valued by the team\'s rating, and no longer worth less for being further away.',
    'Schedules spread division games through the season.',
    'Stats tab: look up any team\'s player stats.',
    '3D views: passes arc over defenders instead of through them.'
  ] },
  { id: '2026-10-13', title: 'Kickoffs, box scores and 3D cameras', items: [
    'Kickoff choice after every score, with onside kicks; more fumbles and pass breakups; defenders contest the ball in the air.',
    'A box score at the end of every game.',
    'The game fits one screen with the play calls always in view, and has a full-screen mode.',
    'Six camera angles, five of them in 3D (press V).',
    'League managers can make a team forfeit an open game.'
  ] },
  { id: '2026-10-12', title: '4th and Pixels', items: [
    'Snake drafts from one shared pool for quick games and tournaments, with an optional salary cap.',
    'Kickers, special teams and playable kick and punt returns.',
    'Play your players live: run the quarterback, the ball carrier or a defender yourself.',
    'A real game clock: 2:00 quarters, NFL stoppage rules, timeouts, spikes and kneels.',
    'Named plays in every call type on offense and defense.',
    'Campaign with real starters and backups.'
  ] }
];
