"""Rebuilds every team in lib/data.json from the real 2026 rosters and the current Madden NFL 27 ratings.

  python3 build_rosters.py fetch DIR      downloads the inputs into DIR (nflverse roster file, EA ratings pages)
  python3 build_rosters.py build DIR      rewrites PLAYERS, OLU, DFU, KICK, KR, PR, STU, DEPTH and FA in lib/data.json

Each team's pool is its roster plus its injured-reserve list (nflverse status ACT, INA or RES), with injuries ignored. Every player
gets his Madden NFL 27 rating (ea.com ratings database, matched by name, then team and birth date; nicknames by birth date and last
name). A player Madden 27 does not list (signed after EA's latest update) gets his last Madden NFL 26 rating (EA's previous game,
same database); anyone in neither is estimated from his draft slot and experience, as before, and marked est. From the pool the best 53 are kept: first enough players
at every position (MIN), then the highest rated up to each position's cap (MAX). The rest are dropped and join the free agents.
Fullbacks only fill a running back minimum: the game has no fullback spot and Madden rates them on a scale of their own.
The starters, the O-line and defense units, the kicker, punter, coverage unit and returners are then picked from those 53, and the
other players become the backups (DEPTH). TEAMS, SCHED, schemes and appearance colours are kept. Salaries need no edit: they come
from rating and position (salaryOfPos in lib/draft.js)."""
import csv, json, os, re, sys, datetime, hashlib, zlib, unicodedata, urllib.request, collections

def norm(n):   # same as lib.py (which needs the old build inputs to import)
    n = unicodedata.normalize('NFKD', str(n).lower())
    n = re.sub(r'[^a-z ]', '', n.replace('.', ''))
    n = re.sub(r'( jr| sr| ii| iii| iv| v)+$', '', n.strip())
    return n.replace(' ', '')

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'lib', 'data.json')
ROSTER_URL = 'https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_2026.csv'
RATINGS_URL = 'https://www.ea.com/games/madden-nfl/ratings?page=%d'
ROSTERED = ('ACT', 'INA', 'RES')        # active, inactive, injured reserve
NOW = datetime.date(2026, 10, 14)

def slim(i):   # the fields the build uses from one EA ratings entry
    s = i.get('stats') or {}
    g = lambda k: (s.get(k) or {}).get('value') if isinstance(s.get(k), dict) else s.get(k)
    return {'id': i['id'], 'name': (i['firstName'] + ' ' + i['lastName']).strip(), 'team': (i['team'] or {}).get('label'),
            'pos': (i['position'] or {}).get('shortLabel'), 'ovr': i['overallRating'], 'age': i['age'], 'born': (i.get('birthdate') or '')[:10],
            'spd': g('speed'), 'str': g('strength'), 'agi': g('agility'), 'cod': g('changeOfDirection'), 'awr': g('awareness'), 'kr': g('kickReturn'),
            'it': (i.get('iteration') or {}).get('id')}
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

# ---------------------------------------------------------------- building
# the game's position groups; edge rushers are linemen in a 4-3 and outside linebackers in a 3-4
def group(mpos, npos, scheme):
    if mpos in ('LEDG', 'REDG'): return 'DL' if scheme == '43' else 'LB'
    m = {'QB': 'QB', 'HB': 'HB', 'FB': 'HB', 'WR': 'WR', 'TE': 'TE', 'LT': 'OL', 'LG': 'OL', 'C': 'OL', 'RG': 'OL', 'RT': 'OL', 'DT': 'DL',
         'MIKE': 'LB', 'WILL': 'LB', 'SAM': 'LB', 'CB': 'CB', 'FS': 'S', 'SS': 'S', 'K': 'K', 'P': 'P', 'LS': 'LS'}
    if mpos in m: return m[mpos]
    n = {'QB': 'QB', 'RB': 'HB', 'FB': 'HB', 'WR': 'WR', 'TE': 'TE', 'OL': 'OL', 'T': 'OL', 'G': 'OL', 'C': 'OL', 'DL': 'DL', 'DE': 'DL', 'DT': 'DL', 'NT': 'DL',
         'LB': 'LB', 'OLB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'DB': 'CB', 'CB': 'CB', 'S': 'S', 'SS': 'S', 'FS': 'S', 'SAF': 'S', 'K': 'K', 'P': 'P', 'LS': 'LS'}
    return n.get(npos)
# a 53-man roster: at least MIN at every position, at most MAX, the rest of the spots go to the best players left
MIN = {'QB': 2, 'HB': 2, 'WR': 4, 'TE': 2, 'OL': 7, 'DL': 6, 'LB': 5, 'CB': 4, 'S': 3, 'K': 1, 'P': 1}
MAX = {'43': {'QB': 3, 'HB': 4, 'WR': 7, 'TE': 4, 'OL': 10, 'DL': 10, 'LB': 7, 'CB': 7, 'S': 5, 'K': 1, 'P': 1},
       '34': {'QB': 3, 'HB': 4, 'WR': 7, 'TE': 4, 'OL': 10, 'DL': 8, 'LB': 10, 'CB': 7, 'S': 5, 'K': 1, 'P': 1}}
BASE = {'QB': 60, 'HB': 64, 'WR': 64, 'TE': 62, 'OL': 61, 'DL': 64, 'LB': 64, 'CB': 63, 'S': 63, 'K': 66, 'P': 64, 'LS': 62}
SPD = {'QB': 78, 'HB': 88, 'WR': 89, 'TE': 82, 'OL': 64, 'DL': 76, 'LB': 82, 'CB': 90, 'S': 88, 'K': 60, 'P': 60, 'LS': 60}
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
        # a position still short borrows a player who can play it: an edge rusher at linebacker (or on the line in a 3-4), a safety at corner and back
        FLEX = {'LB': ('DL', ('LEDG', 'REDG')), 'DL': ('LB', ('LEDG', 'REDG')), 'CB': ('S', ('FS', 'SS')), 'S': ('CB', ('CB',))}
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
    SLOTS = {'43': [('LDE', 'DL', ['LEDG', 'REDG']), ('LDT', 'DL', ['DT']), ('RDT', 'DL', ['DT']), ('RDE', 'DL', ['REDG', 'LEDG']),
                    ('WLB', 'LB', ['WILL']), ('MLB', 'LB', ['MIKE']), ('SLB', 'LB', ['SAM']), ('LCB', 'CB', ['CB']), ('SS', 'S', ['SS']), ('FS', 'S', ['FS']), ('RCB', 'CB', ['CB'])],
             '34': [('LDE', 'DL', ['DT']), ('NT', 'DL', ['DT']), ('RDE', 'DL', ['DT']), ('WLB', 'LB', ['LEDG', 'REDG']), ('LILB', 'LB', ['MIKE', 'WILL']),
                    ('RILB', 'LB', ['WILL', 'MIKE']), ('SLB', 'LB', ['REDG', 'LEDG']), ('LCB', 'CB', ['CB']), ('SS', 'S', ['SS']), ('FS', 'S', ['FS']), ('RCB', 'CB', ['CB'])]}
    NEED = {'43': {'DL': 4, 'LB': 3}, '34': {'DL': 3, 'LB': 4}}
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
        for slot, g, pref in SLOTS[sch]:
            c = starters[g]
            p = next((p for k in pref for p in c if p['mpos'] == k), None) or c[0]
            c.remove(p)
            df.append([slot, g, p['name'], p['ovr'], p['est'], p['age']])
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

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('fetch', 'build'): sys.exit(__doc__)
    (fetch if sys.argv[1] == 'fetch' else build)(sys.argv[2])
