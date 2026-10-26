/* ---------- change log ----------
   Newest first. Each release has an id (its date, with -2, -3 for more on the same day); someone who has not seen the newest one is
   shown every release since the last one they saw (What's new). Write for players: what changed and where to find it. */
const CHANGELOG = [
  { id: '2026-10-26-2', title: 'Defense feels better to play', items: [
    'No more surprise switches: the defender you play stays yours when the ball is thrown, and after a catch you only switch if yours is out of the play. E picks the defender who can get to the ball first.',
    'Tackles connect: your defender is a step quicker and wraps up ball carriers he reaches.',
    'Know your job: the receiver you cover is marked YOUR MAN, your zone is shaded on the field, or you are told to RUSH.',
    'Play the ball: get to the ring and press Space as the pass comes down for a better shot at knocking it away or picking it off.'
  ] },
  { id: '2026-10-26', title: 'Two-point conversions, team colours, fewer fumbles', items: [
    'Two-point conversions: switch After a TD to Go for 2 on the call screen (or press V). The CPU goes for two when the chart says so.',
    'Every team plays in its own colours: NFL teams in theirs, and every other team gets a colour of its own.',
    'Fewer fumbles: about 1.5 a game now, closer to the real NFL.',
    'Passes go over the line instead of through it: linemen only bat down low throws.'
  ] },
  { id: '2026-10-24', title: 'Better campaign draft classes, with sleepers', items: [
    'Every draft class now has a few future superstars (potential 93-99) and a couple of dozen future stars, and rookies start like rookies.',
    'Potential is scouted, not known: the draft board shows the scouts\' estimate (pot ~88). Some players who look like stars are busts, and some late-round players are sleepers who can become stars.',
    'After a player\'s first season his real potential shows, tagged Sleeper or Bust when the scouts were way off, and the league news calls out the best sleepers.'
  ] },
  { id: '2026-10-23-5', title: 'Catches with style, and confidence', items: [
    'Catch animations: receivers leap for contested balls, lay out for diving grabs and tap their toes on the sideline, and the catch is named on screen.',
    'Confidence: a catch over two or more defenders boosts that receiver by +5 (+7 over three) for his next 5 snaps. Look for the sparks around him.',
    'No more standing in the pocket forever: if the quarterback holds the ball, defenders with nobody left to cover come after him.'
  ] },
  { id: '2026-10-23-4', title: 'Updated ratings', items: [
    'Every player\'s rating is updated to Madden NFL 27\'s latest (Week 6): 240 changed, for example C.J. Stroud 77 to 81 and Trevon Diggs 83 to 74. New quick games, campaigns and leagues use them; saved ones keep their own players.'
  ] },
  { id: '2026-10-23-3', title: 'Play calling on the field, Coach\'s picks, clearer turnovers, more trick plays', items: [
    'Play calling happens on the field now, Madden style, instead of in a side panel. It steps aside while each play is shown.',
    'Coach\'s picks: every call screen suggests three plays (on offense a run and a pass) with the reason, based on what the other team has been calling. Press G to call the starred one.',
    'Interceptions and fumbles are much clearer: the action stops with a turnover banner saying whose ball it is and who made the play, the log marks it, and a pick you play by hand gets a call-out and a moment of slow motion.',
    'Trick plays work on the field now: the flea flicker really hands off and pitches back, and on the hook and lateral E pitches it to the trailer. New: Halfback Pass and WR Reverse. All of them pay off more against the wrong defense.'
  ] },
  { id: '2026-10-23-2', title: 'New keys: arrows move, left hand does the rest', items: [
    'Arrow keys move your player. Everything else is on the left side of the keyboard: A S D F throw to the receiver with that letter (Shift + the letter lobs it), Space jukes, dives, swims or throws it away, Q spins, big hits or bull rushes, E switches player or calls a fair catch.',
    'WASD no longer moves, and J K L ; no longer throw. Number keys 1-4 still throw.'
  ] },
  { id: '2026-10-23', title: 'Ends and tackles, and a better defense', items: [
    'Defensive linemen are now ends (DE) and tackles (DT). Edge rushers like T.J. Watt and Myles Garrett are ends, and no team plays an end at linebacker any more. Old saves are updated automatically.',
    'No more free sacks: a blitzer who comes late gets picked up by a lineman or the back, and quarterbacks throw hot when someone comes free.',
    'Pass-rush moves: when a blocker has you, Q bull rushes and Space swims past him. Watch the meter under your player: swim when it is green, or the moment he touches you.',
    'A ring shows where a thrown ball will come down, so you can go make a play on it.'
  ] },
  { id: '2026-10-22-2', title: 'Faster and more fun', items: [
    'Quicker games: plays animate faster, kickoffs kick deep on their own (unless you trail in the 4th), and Hurry-up (R) runs your last call again with no huddle.',
    'Trick plays: Flea Flicker, Hook and Lateral, and a Fake Punt on 4th down. They hit big against the wrong defense, but the defense gets wise to every trick you run.',
    'On fire: a player with two big plays in a row catches fire and plays better for a few snaps, until the defense stops him. You see his flames on the field.',
    'Lob or bullet: hold Shift while throwing (or tap Lob first) to float the ball over the defense.',
    'Celebrations: touchdowns, picks, fumbles and big hits shake the field, and touchdowns throw confetti.'
  ] },
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
