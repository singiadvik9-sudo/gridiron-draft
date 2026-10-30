"""Rebuilds every team in lib/data.json from the real 2026 rosters and the current Madden NFL 27 ratings.

  python3 build_rosters.py fetch DIR      downloads the inputs into DIR (nflverse roster file, EA ratings pages)
  python3 build_rosters.py build DIR      rewrites PLAYERS, OLU, DFU, KICK, KR, PR, STU, DEPTH and FA in lib/data.json (then runs salaries)
  python3 build_rosters.py salaries DIR   gives every player in lib/data.json his real salary, and writes the salary curve (SAL)
  python3 build_rosters.py returners DIR  gives every running back, receiver and corner a returner rating (and corners a speed)
  python3 build_rosters.py ratings DIR    re-rates every player already in lib/data.json from the current Madden 27 ratings (rosters and contracts stay)
  python3 build_rosters.py attrs DIR      gives every player in lib/data.json his Madden attributes (ATTR) and fits estimates for the rest (ATTR_FIT)

Each team's pool is its roster plus its injured-reserve list (nflverse status ACT, INA or RES), with injuries ignored. Every player
gets his Madden NFL 27 rating (ea.com ratings database, matched by name, then team and birth date; nicknames by birth date and last
name). A player Madden 27 does not list (signed after EA's latest update) gets his last Madden NFL 26 rating (EA's previous game,
same database); anyone in neither is estimated from his draft slot and experience, as before, and marked est. From the pool the best 53 are kept: first enough players
at every position (MIN), then the highest rated up to each position's cap (MAX). The rest are dropped and join the free agents.
Fullbacks only fill a running back minimum: the game has no fullback spot and Madden rates them on a scale of their own.
The starters, the O-line and defense units, the kicker, punter, coverage unit and returners are then picked from those 53, and the
other players become the backups (DEPTH). TEAMS, SCHED, schemes and appearance colours are kept.

Salaries are real: each player's current contract, its average per year (APY, $M) and its last season, from OverTheCap's contract data
(nflverse historical_contracts.parquet, matched by NFL player id through the roster file; fetch turns it into contracts.json, which
needs pyarrow). The few without one, and everyone the game makes up or re-signs later, are paid from SAL: the real market by position
and rating, the median APY of the real players at that position within 3 points of that rating, never falling as the rating rises."""
import csv, json, os, re, sys, datetime, hashlib, zlib, unicodedata, urllib.request, collections

def norm(n):   # same as lib.py (which needs the old build inputs to import)
    n = unicodedata.normalize('NFKD', str(n).lower())
    n = re.sub(r'[^a-z ]', '', n.replace('.', ''))
    n = re.sub(r'( jr| sr| ii| iii| iv| v)+$', '', n.strip())
    return n.replace(' ', '')

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib', 'data.json')
ROSTER_URL = 'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv'
RATINGS_URL = 'https://www.ea.com/games/madden-nfl/ratings?page=%d'
CONTRACTS_URL = 'https://github.com/nflverse/nflverse-data/releases/download/contracts/historical_contracts.parquet'
ROSTERED = ('ACT', 'INA', 'RES')        # active, inactive, injured reserve
NOW = datetime.date(2026, 10, 14)

# the Madden attributes the game keeps (EA's stat names, in the order of ATTR_KEY; the game's abbreviations are in lib/engine.js SUBS)
ATTR_EA = ['speed', 'acceleration', 'agility', 'strength', 'awareness', 'throwPower', 'throwAccuracyShort', 'throwAccuracyMid', 'throwAccuracyDeep',
           'throwOnTheRun', 'throwUnderPressure', 'breakSack', 'carrying', 'bCVision', 'breakTackle', 'trucking', 'jukeMove', 'spinMove', 'stiffArm',
           'catching', 'catchInTraffic', 'spectacularCatch', 'shortRouteRunning', 'mediumRouteRunning', 'deepRouteRunning', 'release', 'jumping',
           'runBlock', 'passBlock', 'passBlockPower', 'passBlockFinesse', 'runBlockPower', 'runBlockFinesse', 'impactBlocking', 'powerMoves',
           'finesseMoves', 'blockShedding', 'tackle', 'pursuit', 'hitPower', 'zoneCoverage', 'manCoverage', 'playRecognition', 'press',
           'kickPower', 'kickAccuracy', 'kickReturn']
ATTR_KEY = ['SPD', 'ACC', 'AGI', 'STR', 'AWR', 'THP', 'SAC', 'MAC', 'DAC', 'TOR', 'TUP', 'BSK', 'CAR', 'BCV', 'BTK', 'TRK', 'JKM', 'SPM', 'SFA',
            'CTH', 'CIT', 'SPC', 'SRR', 'MRR', 'DRR', 'RLS', 'JMP', 'RBK', 'PBK', 'PBP', 'PBF', 'RBP', 'RBF', 'IBL', 'PMV',
            'FMV', 'BSH', 'TAK', 'PUR', 'HIT', 'ZCV', 'MCV', 'PRC', 'PRS', 'KPW', 'KAC', 'RET']
# which of them each of the game's positions shows and plays with (keep in step with SUBS in lib/engine.js)
ATTR_POS = {'QB': ['SPD', 'AGI', 'AWR', 'THP', 'SAC', 'MAC', 'DAC', 'TOR', 'TUP', 'BSK'],
            'HB': ['SPD', 'ACC', 'AGI', 'STR', 'AWR', 'CAR', 'BCV', 'BTK', 'TRK', 'JKM', 'SPM', 'SFA', 'CTH'],
            'WR': ['SPD', 'ACC', 'AGI', 'AWR', 'CTH', 'CIT', 'SPC', 'SRR', 'MRR', 'DRR', 'RLS', 'JMP', 'BTK'],
            'TE': ['SPD', 'STR', 'AWR', 'CTH', 'CIT', 'SPC', 'SRR', 'MRR', 'RBK', 'PBK', 'BTK'],
            'OL': ['STR', 'AGI', 'AWR', 'PBK', 'PBP', 'PBF', 'RBK', 'RBP', 'RBF', 'IBL'],
            'DE': ['SPD', 'ACC', 'STR', 'AWR', 'PMV', 'FMV', 'BSH', 'TAK', 'PUR', 'HIT', 'PRC'], 'DT': ['SPD', 'ACC', 'STR', 'AWR', 'PMV', 'FMV', 'BSH', 'TAK', 'PUR', 'HIT', 'PRC'],
            'LB': ['SPD', 'ACC', 'STR', 'AWR', 'TAK', 'HIT', 'PUR', 'BSH', 'ZCV', 'MCV', 'PRC'],
            'CB': ['SPD', 'ACC', 'AGI', 'AWR', 'MCV', 'ZCV', 'PRS', 'PRC', 'JMP', 'CTH', 'TAK'],
            'S': ['SPD', 'ACC', 'AWR', 'ZCV', 'MCV', 'HIT', 'TAK', 'PUR', 'PRC', 'JMP', 'CTH'], 'K': ['KPW', 'KAC', 'AWR'], 'P': ['KPW', 'KAC', 'AWR']}
def slim(i):   # the fields the build uses from one EA ratings entry
    s = i.get('stats') or {}
    g = lambda k: (s.get(k) or {}).get('value') if isinstance(s.get(k), dict) else s.get(k)
    return {'id': i['id'], 'name': (i['firstName'] + ' ' + i['lastName']).strip(), 'team': (i['team'] or {}).get('label'),
            'pos': (i['position'] or {}).get('shortLabel'), 'ovr': i['overallRating'], 'age': i['age'], 'born': (i.get('birthdate') or '')[:10],
            'spd': g('speed'), 'str': g('strength'), 'agi': g('agility'), 'cod': g('changeOfDirection'), 'awr': g('awareness'), 'kr': g('kickReturn'),
            'it': (i.get('iteration') or {}).get('id'), 'at': [g(k) for k in ATTR_EA]}
def fetch(d):
    os.makedirs(d, exist_ok=True)
    urllib.request.urlretrieve(ROSTER_URL, os.path.join(d, 'roster_2026.csv'))
    out, page = [], 1
    while True:
        req = urllib.request.Request(RATINGS_URL % page, headers={'User-Agent': 'Mozilla/5.0'})
        h = urllib.request.urlopen(req).read().decode()
        m = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', h, re.S)
        rd = json.loads(m.group(1))['props']['pageProps']['ratingDetails']
        out += [slim(i) for i in rd['items']]
        if len(out) >= rd['totalItems'] or not rd['items']: break
        page += 1
    json.dump(out, open(os.path.join(d, 'madden27.json'), 'w'), separators=(',', ':'))
    # Madden 26 (last season) for players Madden 27 does not list: the same feed without an iteration still serves it
    old, off = [], 0
    while True:
        req = urllib.request.Request('https://drop-api.ea.com/rating/madden-nfl?locale=en&limit=100&offset=%d' % off, headers={'User-Agent': 'Mozilla/5.0'})
        items = json.loads(urllib.request.urlopen(req).read().decode())['items']
        if not items: break
        old += [slim(i) for i in items]; off += 100
    json.dump(old, open(os.path.join(d, 'madden26.json'), 'w'), separators=(',', ':'))
    print('roster file,', len(out), 'Madden 27 ratings (' + out[0]['it'] + ') and', len(old), 'Madden 26 ratings saved in', d)
    # real contracts: the latest active one per player
    urllib.request.urlretrieve(CONTRACTS_URL, os.path.join(d, 'historical_contracts.parquet'))
    import pyarrow.parquet as pq   # pip install pyarrow
    best = {}
    for r in pq.read_table(os.path.join(d, 'historical_contracts.parquet'), columns=['player', 'is_active', 'year_signed', 'years', 'apy', 'gsis_id']).to_pylist():
        if r['is_active'] and r['gsis_id'] and (r['gsis_id'] not in best or (r['year_signed'] or 0) > (best[r['gsis_id']]['year_signed'] or 0)): best[r['gsis_id']] = r
    json.dump({k: [round(r['apy'], 3), r['year_signed'], r['years'], r['player']] for k, r in best.items()}, open(os.path.join(d, 'contracts.json'), 'w'), separators=(',', ':'))
    print(len(best), 'contracts saved')

# ---------------------------------------------------------------- building
# the game's position groups: edge rushers are defensive ends (a 3-4 stands them up at LEDGE / REDGE), interior linemen tackles
def group(mpos, npos, scheme):
    if mpos in ('LEDG', 'REDG'): return 'DE'
    m = {'QB': 'QB', 'HB': 'HB', 'FB': 'HB', 'WR': 'WR', 'TE': 'TE', 'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL', 'DT': 'DT',
         'MIKE': 'LB', 'WILL': 'LB', 'SAM': 'LB', 'CB': 'CB', 'FS': 'S', 'SS': 'S', 'K': 'K', 'P': 'P', 'LS': 'LS'}
    if mpos in m: return m[mpos]
    n = {'QB': 'QB', 'RB': 'HB', 'FB': 'HB', 'WR': 'WR', 'TE': 'TE', 'OL': 'OL', 'T': 'OL', 'G': 'OL', 'C': 'OL', 'DL': 'DT', 'DE': 'DE', 'DT': 'DT', 'NT': 'DT',
         'LB': 'LB', 'OLB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'DB': 'CB', 'CB': 'CB', 'S': 'S', 'SS': 'S', 'FS': 'S', 'SAF': 'S', 'K': 'K', 'P': 'P', 'LS': 'LS'}
    return n.get(npos)
# a 53-man roster: at least MIN at every position, at most MAX, the rest of the spots go to the best players left
MIN = {'QB': 2, 'HB': 2, 'WR': 4, 'TE': 2, 'OL': 7, 'DE': 3, 'DT': 3, 'LB': 3, 'CB': 4, 'S': 3, 'K': 1, 'P': 1}
MAX = {'43': {'QB': 3, 'HB': 4, 'WR': 7, 'TE': 4, 'OL': 10, 'DE': 6, 'DT': 6, 'LB': 7, 'CB': 7, 'S': 5, 'K': 1, 'P': 1},
       '34': {'QB': 3, 'HB': 4, 'WR': 7, 'TE': 4, 'OL': 10, 'DE': 6, 'DT': 7, 'LB': 6, 'CB': 7, 'S': 5, 'K': 1, 'P': 1}}
BASE = {'QB': 60, 'HB': 64, 'WR': 64, 'TE': 62, 'OL': 61, 'DE': 64, 'DT': 64, 'LB': 64, 'CB': 63, 'S': 63, 'K': 66, 'P': 64, 'LS': 62}
SPD = {'QB': 78, 'HB': 88, 'WR': 89, 'TE': 82, 'OL': 64, 'DE': 80, 'DT': 72, 'LB': 82, 'CB': 90, 'S': 88, 'K': 60, 'P': 60, 'LS': 60}
SK = [1, 2, 3, 4, 4, 5, 5, 3, 1, 4, 5]; HR = ['K', 'N', 'K', 'X', 'K', 'B', 'K', 'N', 'X', 'K', 'R']

def jit(name, span): return int(hashlib.md5(name.encode()).hexdigest()[:6], 16) % (2 * span + 1) - span
def est(r, g):   # no Madden rating: draft slot and experience
    o = BASE[g]
    try: dn = int(r['draft_number'] or 0)
    except ValueError: dn = 0
    o += 6 if 0 < dn <= 32 else 4 if 0 < dn <= 64 else 2 if 0 < dn <= 128 else 0 if dn else -3
    try: ye = int(r['years_exp'] or 0)
    except ValueError: ye = 0
    o += -1 if ye == 0 else 1 if ye >= 4 else 0
    return max(45, min(72, o + jit(r['full_name'], 3)))
def age(born, fallback=25):
    try: return max(21, (NOW - datetime.date.fromisoformat(born[:10])).days // 365)
    except Exception: return fallback
def retr(spd, agi, cod): return max(55, min(97, round(62 + (0.55 * spd + 0.25 * agi + 0.20 * cod - 80) * 2.2)))   # returner rating, as build_st.py

def build(d):
    D = json.load(open(OUT))
    rows = list(csv.DictReader(open(os.path.join(d, 'roster_2026.csv'))))
    M = json.load(open(os.path.join(d, 'madden27.json')))
    M26 = json.load(open(os.path.join(d, 'madden26.json'))) if os.path.exists(os.path.join(d, 'madden26.json')) else []
    TEAMS = [t['abbr'] for t in D['TEAMS']]
    label = {t['city'] + ' ' + t['nick']: t['abbr'] for t in D['TEAMS']}
    label.update({'NY Giants': 'NYG', 'NY Jets': 'NYJ', 'Los Angeles Rams': 'LA', 'Los Angeles Chargers': 'LAC', 'Las Vegas Raiders': 'LV'})
    scheme = {u['team']: u['scheme'] for u in D['DFU']}
    # appearance already in the data (starters, kickers, returners) is kept; anyone new gets a stable one from his name
    look0 = {}
    for p in D['PLAYERS'] + D['KICK'] + D['KR'] + D['PR']: look0[p['name']] = (p['skin'], p['hair'])
    def look(n):
        if n in look0: return look0[n]
        h = zlib.crc32(n.encode()); return SK[h % 11], HR[(h >> 5) % 11]
    # Madden ratings by normalized name (a name can belong to more than one player: team, then birth date decide)
    byname, byborn = collections.defaultdict(list), collections.defaultdict(list)
    last = lambda n: norm(re.sub(r'\s+(jr\.?|sr\.?|ii|iii|iv|v)$', '', n.strip(), flags=re.I).split(' ')[-1])
    for m in M: byname[norm(m['name'])].append(m); byborn[m['born']].append(m)
    old_name, fell_back = collections.defaultdict(list), []
    for m in M26: old_name[norm(m['name'])].append(m)
    def rating(r):
        cands = byname.get(norm(r['full_name'])) or byname.get(norm((r.get('football_name') or '') + ' ' + r['last_name'])) or []
        if not cands and r['birth_date']:   # nicknames (Cam / Cameron, Mike / Michael): same birth date, and the same last name or team
            b = byborn.get(r['birth_date'][:10], [])
            cands = [m for m in b if last(m['name']) == norm(r['last_name'])] or [m for m in b if label.get(m['team']) == r['team'] and group(m['pos'], r['position'], '43') == group(None, r['position'], '43')]
        if len(cands) > 1:
            same = [m for m in cands if m['born'] and m['born'] == (r['birth_date'] or '')[:10]] or [m for m in cands if label.get(m['team']) == r['team']]
            cands = same or cands
        if cands: return cands[0]
        old = old_name.get(norm(r['full_name']), [])
        if len(old) > 1: old = [m for m in old if m['born'] and m['born'] == (r['birth_date'] or '')[:10]]   # same name: the birth date decides
        if old: fell_back.append(r['full_name'] + ' ' + str(old[0]['ovr'])); return dict(old[0], pos=None)
        return None
    # every rostered player (and, for free agency, the cut ones), with a rating
    pool = collections.defaultdict(list); cut = []; matched = 0; total = 0
    for r in rows:
        st = r['status']
        if st not in ROSTERED and st != 'CUT': continue
        team = r['team'] if r['team'] in TEAMS else None
        m = rating(r)
        g = group(m and m['pos'], r['position'], scheme.get(team, '43'))
        if not g: continue
        if st in ROSTERED: total += 1; matched += 1 if m else 0
        if st in ROSTERED and not m and os.environ.get('BR_DEBUG'): print('  unrated:', r['full_name'], r['team'], r['position'], r['birth_date'], 'pick', r['draft_number'], 'exp', r['years_exp'])
        p = {'name': r['full_name'], 'g': g, 'mpos': m and m['pos'], 'ovr': m['ovr'] if m else est(r, g), 'est': 0 if m else 1,
             'age': age(m['born'] if m and m['born'] else r['birth_date'], m['age'] if m else 25),
             'spd': (m and m['spd']) or SPD[g] + jit(r['full_name'], 4), 'str': (m and m['str']) or 65, 'agi': (m and m['agi']) or 75,
             'cod': (m and m['cod']) or 75, 'awr': (m and m['awr']) or 60, 'kr': (m and m['kr']) or 0, 'ir': st == 'RES'}
        if st in ROSTERED and team: pool[team].append(p)
        elif st == 'CUT': cut.append(p)
    # a team with nobody at kicker or punter (cut and not replaced yet) keeps the one Madden lists for it
    for t in TEAMS:
        for g in ('K', 'P'):
            if any(p['g'] == g for p in pool[t]): continue
            ms = sorted([m for m in M if label.get(m['team']) == t and m['pos'] == g], key=lambda m: -m['ovr'])
            if not ms: print('WARNING', t, 'has no', g); continue
            m = ms[0]; print('note:', t, 'has no', g, 'on its roster; using', m['name'], '(Madden lists him there)')
            pool[t].append({'name': m['name'], 'g': g, 'mpos': g, 'ovr': m['ovr'], 'est': 0, 'age': age(m['born'], m['age']), 'spd': m['spd'] or 60,
                            'str': m['str'] or 60, 'agi': m['agi'] or 60, 'cod': m['cod'] or 60, 'awr': m['awr'] or 60, 'kr': 0, 'ir': False})
            cut[:] = [c for c in cut if c['name'] != m['name']]
    # the best 53 per team
    rosters, dropped = {}, []
    for t in TEAMS:
        mx = MAX[scheme[t]]
        # fullbacks: the game has no such spot and Madden rates them on its own scale, so they only fill a running back minimum
        ps = sorted([p for p in pool[t] if p['g'] in mx], key=lambda p: (p['mpos'] == 'FB', -p['ovr'], p['name']))
        keep, cnt, kid = [], collections.Counter(), set()
        for g, n in MIN.items():
            for p in [p for p in ps if p['g'] == g][:n]: keep.append(p); kid.add(id(p)); cnt[g] += 1
        # a position still short borrows a player who can play it: an end at linebacker or tackle, a tackle at end, a safety at corner and back
        FLEX = {'LB': ('DE', ('LEDG', 'REDG', None)), 'DT': ('DE', ('LEDG', 'REDG', None)), 'DE': ('DT', ('DT', None)), 'CB': ('S', ('FS', 'SS')), 'S': ('CB', ('CB',))}
        for g, (src, mp) in FLEX.items():
            while cnt[g] < MIN[g]:
                c = [p for p in ps if p['g'] == src and p['mpos'] in mp and (id(p) not in kid or cnt[src] > MIN[src])]
                if not c: break
                p = c[0]
                if id(p) in kid: cnt[src] -= 1
                else: keep.append(p); kid.add(id(p))
                p['g'] = g; cnt[g] += 1; print('note:', t, 'is short at', g + ';', p['name'], '(' + p['mpos'] + ') plays there')
        for p in ps:
            if len(keep) >= 53: break
            if id(p) in kid or cnt[p['g']] >= mx[p['g']] or p['mpos'] == 'FB': continue
            keep.append(p); kid.add(id(p)); cnt[p['g']] += 1
        rosters[t] = keep
        dropped += [p for p in ps if id(p) not in kid]
        if len(keep) != 53: print('WARNING', t, 'has only', len(keep))
    # starters and units from each 53
    PLAYERS, OLU, DFU, KICK, KR, PR, STU, DEPTH = [], [], [], [], [], [], [], []
    # (slot, position group, the slot's job on the field: 'DL' linemen, 'LB' linebackers and the 3-4's stand-up edge rushers, Madden positions that fit it best)
    SLOTS = {'43': [('LDE', 'DE', 'DL', ['LEDG', 'REDG']), ('LDT', 'DT', 'DL', ['DT']), ('RDT', 'DT', 'DL', ['DT']), ('RDE', 'DE', 'DL', ['REDG', 'LEDG']),
                    ('WLB', 'LB', 'LB', ['WILL']), ('MLB', 'LB', 'LB', ['MIKE']), ('SLB', 'LB', 'LB', ['SAM']), ('LCB', 'CB', 'CB', ['CB']), ('SS', 'S', 'S', ['SS']), ('FS', 'S', 'S', ['FS']), ('RCB', 'CB', 'CB', ['CB'])],
             '34': [('LDT', 'DT', 'DL', ['DT']), ('NT', 'DT', 'DL', ['DT']), ('RDT', 'DT', 'DL', ['DT']), ('LEDGE', 'DE', 'LB', ['LEDG', 'REDG']), ('LILB', 'LB', 'LB', ['MIKE', 'WILL']),
                    ('RILB', 'LB', 'LB', ['WILL', 'MIKE']), ('REDGE', 'DE', 'LB', ['REDG', 'LEDG']), ('LCB', 'CB', 'CB', ['CB']), ('SS', 'S', 'S', ['SS']), ('FS', 'S', 'S', ['FS']), ('RCB', 'CB', 'CB', ['CB'])]}
    NEED = {'43': {'DE': 2, 'DT': 2, 'LB': 3}, '34': {'DT': 3, 'DE': 2, 'LB': 2}}
    OL_ORDER = ['LT', 'LG', 'C', 'RG', 'RT']
    for i, t in enumerate(TEAMS):
        ro, sch = rosters[t], scheme[t]
        by = collections.defaultdict(list)
        for p in sorted(ro, key=lambda p: (p['mpos'] == 'FB', -p['ovr'], p['name'])): by[p['g']].append(p)
        used = set()
        def take(g, n):
            out = [p for p in by[g] if id(p) not in used][:n]
            for p in out: used.add(id(p))
            return out
        for g, n in (('QB', 1), ('HB', 1), ('WR', 2), ('TE', 1)):
            for p in take(g, n):
                s, h = look(p['name'])
                PLAYERS.append(dict(id=len(PLAYERS), age=p['age'], name=p['name'], team=t, pos=g, ovr=p['ovr'], spd=p['spd'], str=p['str'], agi=p['agi'], awr=p['awr'], skin=s, hair=h, est=p['est']))
        ol = sorted(take('OL', 5), key=lambda p: OL_ORDER.index(p['mpos']) if p['mpos'] in OL_ORDER else 9)
        OLU.append(dict(team=t, players=[[p['name'], p['ovr'], p['est'], p['age']] for p in ol]))
        # defense: the best at each group, each slot filled by the player whose Madden position fits it best
        df = []
        starters = {g: take(g, n) for g, n in list(NEED[sch].items()) + [('CB', 2), ('S', 2)]}
        for slot, g, role, pref in SLOTS[sch]:
            c = starters[g]
            p = next((p for k in pref for p in c if p['mpos'] == k), None) or c[0]
            c.remove(p)
            df.append([slot, role, p['name'], p['ovr'], p['est'], p['age']])
        DFU.append(dict(team=t, scheme=sch, players=df))
        k = take('K', 1)[0]; s, h = look(k['name'])
        KICK.append(dict(id=i, name=k['name'], team=t, ovr=k['ovr'], skin=s, hair=h))
        pu = take('P', 1)[0]
        ls = sorted([p for p in pool[t] if p['g'] == 'LS'], key=lambda p: -p['ovr'])
        ls = ls[0] if ls else {'name': 'Long Snapper', 'ovr': 62, 'est': 1}
        # coverage unit: the four best backups at linebacker, corner and safety; returner: the best kick returner among backs, receivers and DBs
        cov = sorted([p for p in ro if p['g'] in ('LB', 'CB', 'S') and id(p) not in used], key=lambda p: (-p['ovr'], p['name']))[:4]
        STU.append(dict(id=i, team=t, ovr=round(0.35 * pu['ovr'] + 0.15 * ls['ovr'] + 0.50 * sum(c['ovr'] for c in cov) / 4),
                        players=[['P', pu['name'], pu['ovr'], pu['est']], ['LS', ls['name'], ls['ovr'], ls['est']]] + [['CV', c['name'], c['ovr'], c['est']] for c in cov]))
        ret = sorted([p for p in ro if p['g'] in ('HB', 'WR', 'CB', 'S')], key=lambda p: (-p['kr'], -p['spd'], p['name']))[0]
        s, h = look(ret['name'])
        for lst in (KR, PR):
            lst.append(dict(id=i, name=ret['name'], team=t, ovr=retr(ret['spd'], ret['agi'], ret['cod']), spd=ret['spd'], agi=ret['agi'], str=ret['str'], awr=ret['awr'], skin=s, hair=h, est=ret['est']))
        DEPTH.append(dict(team=t, players=[[p['g'], p['name'], p['ovr'], p['age']] + ([p['spd']] if p['g'] in ('QB', 'HB', 'WR', 'TE') else [])
                                           for p in sorted(ro, key=lambda p: (list(MIN).index(p['g']), -p['ovr'])) if id(p) not in used and p['g'] not in ('K', 'P')]))
    # free agents: the players dropped to get to 53, and the real cuts, best first
    on = {p['name'] for t in TEAMS for p in rosters[t]}
    fa, seen = [], set()
    for p in sorted(dropped + cut, key=lambda p: (-p['ovr'], p['name'])):
        if p['name'] in on or p['name'] in seen or p['g'] not in MIN or p['mpos'] == 'FB': continue
        seen.add(p['name']); fa.append([p['g'], p['name'], p['ovr'], p['age']] + ([p['spd']] if p['g'] in ('QB', 'HB', 'WR', 'TE') else []))
    D.update(PLAYERS=PLAYERS, OLU=OLU, DFU=DFU, KICK=KICK, KR=KR, PR=PR, STU=STU, DEPTH=DEPTH, FA=fa[:90])
    json.dump(D, open(OUT, 'w'), separators=(',', ':'))
    ir = sum(1 for t in TEAMS for p in rosters[t] if p['ir'])
    print('rated', matched, 'of', total, 'rostered players;', ir, 'players from injured reserve made a 53;', len(dropped), 'dropped to free agency')
    print(len(fell_back), 'players not in Madden 27 use their Madden 26 rating:', ', '.join(sorted(fell_back)))
    print('per team', sorted({len(rosters[t]) for t in TEAMS}), 'backups', sorted({len(x['players']) for x in DEPTH}), 'free agents', len(D['FA']))

# ---------------------------------------------------------------- salaries
SAL_POS = ('QB', 'HB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K', 'P')
LEAGUE_MIN = 0.9   # about the 2026 league minimum salary, $M
def salaries(d):
    D = json.load(open(OUT))
    C = json.load(open(os.path.join(d, 'contracts.json')))
    rows = list(csv.DictReader(open(os.path.join(d, 'roster_2026.csv'))))
    byteam, byname = {}, collections.defaultdict(list)
    for r in rows:
        if r['gsis_id'] in C: byteam[(norm(r['full_name']), r['team'])] = r['gsis_id']; byname[norm(r['full_name'])].append(r['gsis_id'])
    def contract(name, team):   # (apy, last season) or None
        g = byteam.get((norm(name), team)) if team else None
        if not g:
            ids = list(dict.fromkeys(byname.get(norm(name), [])))
            g = ids[0] if len(ids) == 1 else None
        if not g: return None
        apy, ys, yrs, _ = C[g]
        return round(max(LEAGUE_MIN, apy), 2), (ys or 2026) + max(1, yrs or 1) - 1   # a mid-season deal shows only its prorated part
    # every player in the data as (group, rating, contract, where to write [salary, last contract season]); the curve is fitted first
    people = []
    def add(g, o, name, team, put): people.append([{'DE': 'DL', 'DT': 'DL'}.get(g, g), o, contract(name, team), put])   # ends and tackles share the linemen's curve
    def at(q, i):   # writes [salary, end] into list q at index i (padding with None)
        def put(v): q[:] = q[:i] + [None] * max(0, i - len(q)) + v + q[i + 2:]
        return put
    def key(d):
        return lambda v: d.update(sal=v[0], cx=v[1])
    for p in D['PLAYERS']: add(p['pos'], p['ovr'], p['name'], p['team'], key(p))
    for u in D['OLU']:
        for q in u['players']: add('OL', q[1], q[0], u['team'], at(q, 4))          # [name, ovr, est, age, salary, end]
    for u in D['DFU']:
        for q in u['players']: add('DL' if 'EDGE' in q[0] else q[1], q[3], q[2], u['team'], at(q, 6))   # [slot, job, name, ovr, est, age, salary, end] (3-4 edges are paid as linemen)
    for k in D['KICK']: add('K', k['ovr'], k['name'], k['team'], key(k))
    for u in D['STU']: q = u['players'][0]; add('P', q[2], q[1], u['team'], at(q, 4))   # the punter: [P, name, ovr, est, salary, end]
    for lst, team in [(u['players'], u['team']) for u in D['DEPTH']] + [(D['FA'], None)]:
        for q in lst: add(q[0], q[2], q[1], team, at(q, 5))                        # [pos, name, ovr, age, spd or None, salary, end]
    for lst in (D['KR'], D['PR']):
        for k in lst: add('WR', k['ovr'], k['name'], k['team'], key(k))
    # the curve: for each position and rating 40..99, the median APY of the real players there within 3 points, never falling as ratings rise
    SAL = {}
    for g in SAL_POS:
        pts = [(o, c[0]) for gg, o, c, _ in people if gg == g and c]
        row = []
        for o in range(40, 100):
            near = sorted(v for oo, v in pts if abs(oo - o) <= 3)
            row.append(near[len(near) // 2] if len(near) >= 3 else None)
        last = LEAGUE_MIN
        for i, v in enumerate(row):
            last = max(last, v if v is not None else last); row[i] = round(last, 2)
        SAL[g] = row
    curve = lambda g, o: SAL.get(g, SAL['S'])[min(99, max(40, o)) - 40]
    real = 0
    for g, o, c, put in people:
        if c: real += 1; put([c[0], c[1]])
        else: put([curve(g, o), 2027])   # no contract: a market deal through next season
    D['SAL'] = SAL
    json.dump(D, open(OUT, 'w'), separators=(',', ':'))
    print('salaries:', real, 'real contracts of', len(people), 'players; the rest priced from the curve. Top of the curve:', {g: SAL[g][-1] for g in SAL_POS})

# ---------------------------------------------------------------- returners
# There is no returner position: a team designates one of its backs, receivers or corners (lib/league.js, lib/draft.js). Each gets rt,
# the returner rating from his Madden speed, agility and change of direction (retr, as before), and corners also get a speed.
def returners(d):
    D = json.load(open(OUT))
    M = json.load(open(os.path.join(d, 'madden27.json')))
    label = {t['city'] + ' ' + t['nick']: t['abbr'] for t in D['TEAMS']}
    label.update({'NY Giants': 'NYG', 'NY Jets': 'NYJ', 'Los Angeles Rams': 'LA', 'Los Angeles Chargers': 'LAC', 'Las Vegas Raiders': 'LV'})
    byname = collections.defaultdict(list)
    for m in M: byname[norm(m['name'])].append(m)
    def look(name, team, spd):
        c = byname.get(norm(name), [])
        c = [m for m in c if label.get(m['team']) == team] or (c if len(c) == 1 else [])
        if c and c[0]['spd']: m = c[0]; return retr(m['spd'], m['agi'] or m['spd'] - 3, m['cod'] or m['spd'] - 3), m['spd']
        s0 = spd or 88   # not in Madden 27: from his speed
        return retr(s0, s0 - 3, s0 - 3), s0
    n = 0
    for p in D['PLAYERS']:
        if p['pos'] in ('HB', 'WR'): p['rt'] = look(p['name'], p['team'], p['spd'])[0]; n += 1
    for u in D['DFU']:
        for q in u['players']:
            if q[1] == 'CB':
                rt, sp = look(q[2], u['team'], None)
                while len(q) < 10: q.append(None)
                q[8], q[9] = rt, sp; n += 1                         # [slot, group, name, ovr, est, age, salary, end, rt, spd]
    for lst, team in [(u['players'], u['team']) for u in D['DEPTH']] + [(D['FA'], None)]:
        for q in lst:
            if q[0] not in ('HB', 'WR', 'CB'): continue
            rt, sp = look(q[1], team, q[4])
            while len(q) < 8: q.append(None)
            if q[4] is None: q[4] = sp
            q[7] = rt; n += 1                                      # [pos, name, ovr, age, spd, salary, end, rt]
    json.dump(D, open(OUT, 'w'), separators=(',', ':'))
    print('returner ratings for', n, 'backs, receivers and corners')

# ---------------------------------------------------------------- ratings
# re-rates everyone already in lib/data.json from the current Madden 27 ratings (fetch saves them), without touching rosters or contracts:
# overall everywhere, and speed, strength, agility and awareness where the data keeps them; the special-teams units and returners follow
FAMILY = {'QB': 'QB', 'HB': 'HB', 'WR': 'WR', 'TE': 'TE', 'OL': 'OL', 'DE': 'D', 'DT': 'D', 'LB': 'D', 'CB': 'D', 'S': 'D', 'K': 'K', 'P': 'P', 'LS': 'LS', 'DL': 'D'}
def ratings(d):
    D = json.load(open(OUT))
    M = json.load(open(os.path.join(d, 'madden27.json')))
    label = {t['city'] + ' ' + t['nick']: t['abbr'] for t in D['TEAMS']}
    label.update({'NY Giants': 'NYG', 'NY Jets': 'NYJ', 'Los Angeles Rams': 'LA', 'Los Angeles Chargers': 'LAC', 'Las Vegas Raiders': 'LV'})
    byname, byborn = collections.defaultdict(list), collections.defaultdict(list)
    for m in M: byname[norm(m['name'])].append(m); byborn[m['born']].append(m)
    born = {}   # nicknames (Cam / Cameron): the roster file's birth date and the last name, as the build matches them
    rf = os.path.join(d, 'roster_2026.csv')
    if os.path.exists(rf):
        for r in csv.DictReader(open(rf)): born.setdefault(norm(r['full_name']), ((r['birth_date'] or '')[:10], norm(r['last_name'])))
    last = lambda n: norm(re.sub(r'\s+(jr\.?|sr\.?|ii|iii|iv|v)$', '', n.strip(), flags=re.I).split(' ')[-1])
    fam = lambda m: FAMILY.get(group(m['pos'], None, '43') or '', None)
    def find(name, team, g):   # the same name at the same position family, on his team if there is more than one
        c = [m for m in byname.get(norm(name), []) if fam(m) == FAMILY.get(g)]
        if not c and norm(name) in born:
            b, ln = born[norm(name)]
            c = [m for m in byborn.get(b, []) if b and last(m['name']) == ln and fam(m) == FAMILY.get(g)]
        if len(c) > 1: c = [m for m in c if label.get(m['team']) == team] or []
        return c[0] if len(c) == 1 else None
    moves, seen = [], [0, 0]
    def rate(name, team, g, old):
        seen[0] += 1
        m = find(name, team, g)
        if not m: return None
        seen[1] += 1
        if m['ovr'] != old: moves.append((m['ovr'] - old, name, team, g, old, m['ovr']))
        return m
    for p in D['PLAYERS']:
        m = rate(p['name'], p['team'], p['pos'], p['ovr'])
        if m: p.update(ovr=m['ovr'], est=0, **{k: m[k] for k in ('spd', 'str', 'agi', 'awr') if m.get(k)})
    for u in D['OLU']:
        for q in u['players']:
            m = rate(q[0], u['team'], 'OL', q[1])
            if m: q[1], q[2] = m['ovr'], 0                               # [name, ovr, est, age, salary, end]
        u.pop('ovr', None)
    for u in D['DFU']:
        for q in u['players']:
            m = rate(q[2], u['team'], 'CB' if q[1] == 'CB' else 'S' if q[1] == 'S' else 'LB', q[3])
            if m: q[3], q[4] = m['ovr'], 0                               # [slot, job, name, ovr, est, age, ...]
    for k in D['KICK']:
        m = rate(k['name'], k['team'], 'K', k['ovr'])
        if m: k['ovr'] = m['ovr']
    for u in D['STU']:
        for q in u['players']:
            g = {'P': 'P', 'LS': 'LS'}.get(q[0], 'CB')
            m = find(q[1], u['team'], g) if g != 'CB' else (find(q[1], u['team'], 'CB') or find(q[1], u['team'], 'LB'))
            seen[0] += 1
            if m: seen[1] += 1; q[2], q[3] = m['ovr'], 0
        cv = [q[2] for q in u['players'] if q[0] == 'CV']
        u['ovr'] = round(0.35 * u['players'][0][2] + 0.15 * u['players'][1][2] + 0.50 * sum(cv) / max(1, len(cv)))
    for lst in (D['KR'], D['PR']):
        for k in lst:
            m = find(k['name'], k['team'], 'WR') or find(k['name'], k['team'], 'HB') or find(k['name'], k['team'], 'CB')
            if m and m['spd']: k.update(ovr=retr(m['spd'], m['agi'] or m['spd'] - 3, m['cod'] or m['spd'] - 3), spd=m['spd'], agi=m['agi'] or k['agi'], str=m['str'] or k['str'], awr=m['awr'] or k['awr'], est=0)
    for lst, team in [(u['players'], u['team']) for u in D['DEPTH']] + [(D['FA'], None)]:
        for q in lst:
            m = rate(q[1], team, q[0], q[2])
            if m:
                q[2] = m['ovr']                                         # [pos, name, ovr, age, spd, salary, end, rt]
                if q[4] is not None and m['spd']: q[4] = m['spd']
    json.dump(D, open(OUT, 'w'), separators=(',', ':'))
    moves.sort()
    print('re-rated', seen[1], 'of', seen[0], 'players from', M[0]['it'] + ';', len(moves), 'ratings changed')
    for x in moves[:8] + moves[-8:]: print('  %+d  %s (%s %s) %d -> %d' % x)
    returners(d)

# every player's Madden attributes, by name and position: ATTR['joshallen:QB'] = [his Madden overall, two digits per attribute of his
# position (ATTR_POS order)]. The game shifts them by however far his overall has moved since. ATTR_FIT[pos][k] = [a, b, sd]: attribute k is
# about a + b * overall at that position (a least-squares fit over every Madden player there), for players Madden does not list.
def gpos(p):
    return {'LDE': 'DE', 'RDE': 'DE', 'LEDGE': 'DE', 'REDGE': 'DE', 'LDT': 'DT', 'RDT': 'DT', 'NT': 'DT'}.get(p) or ('LB' if p.endswith('LB') else 'CB' if p.endswith('CB') else 'S' if p in ('SS', 'FS') else p)
def attrs(d):
    M = json.load(open(os.path.join(d, 'madden27.json'))) + json.load(open(os.path.join(d, 'madden26.json')))
    by, byName, byNick = {}, {}, {}
    nick = lambda n: (lambda w: (w[-1], w[0][:3]) if len(w) > 1 else None)(re.sub(r'( jr| sr| ii| iii| iv| v)+$', '', unicodedata.normalize('NFKD', n.lower()).replace('.', '').strip()).split())
    for m in M:
        if not m.get('at') or any(v is None for v in m['at']): continue
        g = group(m['pos'], None, '43')
        if g: by.setdefault(norm(m['name']) + ':' + g, m)   # Madden 27 first, then 26
        byName.setdefault(norm(m['name']), []).append(m)   # (Madden 26 entries carry no position)
        k = nick(m['name']); 
        if k: byNick.setdefault(k, []).append(m)
    # by name alone when only one player has it (Olu / Olumuyiwa, Chig / Chigoziem: last name and the first three letters)
    def loose(n):
        for L in (byName.get(norm(n)), byNick.get(nick(n))):
            if L and len({x['name'] for x in L}) == 1 and len({x['born'] for x in L if x['born']}) <= 1: return L[0]
        return None
    D = json.load(open(OUT))
    names = []
    for p in D['PLAYERS']: names.append((p['name'], p['pos']))
    for u in D['OLU']: names += [(q[0], 'OL') for q in u['players']]
    for u in D['DFU']: names += [(q[2], gpos(q[0])) for q in u['players']]
    for k in D['KICK']: names.append((k['name'], 'K'))
    for u in D['STU']: names.append((u['players'][0][1], 'P'))
    for u in D.get('DEPTH', []): names += [(q[1], q[0]) for q in u['players']]
    names += [(q[1], q[0]) for q in D.get('FA', [])]
    A, hit, miss = {}, 0, []
    for n, pos in names:
        pos = gpos(pos); ks = ATTR_POS.get(pos)
        if not ks: continue
        key = norm(n) + ':' + pos; m = by.get(key)
        if not m and pos in ('DE', 'DT', 'LB'):   # (Madden can list a player at a neighbouring spot)
            m = next((by.get(norm(n) + ':' + q) for q in ('DE', 'DT', 'LB') if by.get(norm(n) + ':' + q)), None)
        if not m: m = loose(n)
        if not m: miss.append(key); continue
        hit += 1; A[key] = [m['ovr'], ''.join('%02d' % min(99, max(0, m['at'][ATTR_KEY.index(k)])) for k in ks)]
    F = {}
    for pos, ks in ATTR_POS.items():
        rows = [m for k, m in by.items() if k.endswith(':' + pos) and m['ovr'] >= 50]
        if len(rows) < 8: continue
        xs = [m['ovr'] for m in rows]; mx = sum(xs) / len(xs); vx = sum((x - mx) ** 2 for x in xs) or 1
        F[pos] = {}
        for k in ks:
            ys = [m['at'][ATTR_KEY.index(k)] for m in rows]; my = sum(ys) / len(ys)
            b = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / vx; a = my - b * mx
            sd = (sum((y - a - b * x) ** 2 for x, y in zip(xs, ys)) / len(ys)) ** 0.5
            F[pos][k] = [round(a, 2), round(b, 3), round(sd, 1)]
    D['ATTR'] = A; D['ATTR_FIT'] = F
    json.dump(D, open(OUT, 'w'), separators=(',', ':'))
    print('attributes for', hit, 'of', len(names), 'players;', len(miss), 'estimated, e.g.', miss[:6])

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('fetch', 'build', 'salaries', 'returners', 'ratings', 'attrs'): sys.exit(__doc__)
    {'fetch': fetch, 'build': build, 'salaries': salaries, 'returners': returners, 'ratings': ratings, 'attrs': attrs}[sys.argv[1]](sys.argv[2])
    if sys.argv[1] == 'build':
        if os.path.exists(os.path.join(sys.argv[2], 'contracts.json')): salaries(sys.argv[2])
        returners(sys.argv[2])
