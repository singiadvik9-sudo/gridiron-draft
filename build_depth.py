"""Adds real backups and a free-agent pool to lib/data.json (DEPTH, FA).
Reads the 2026 rosters (/home/claude/nfl/roster_2026.csv) and the Madden rating lists in /home/claude/nfl/raw. Players who are not in the
rating lists get an estimated overall from their draft slot and experience. Re-runnable: it replaces DEPTH and FA."""
import csv, json, os, sys, hashlib, datetime
SRC = '/home/claude/nfl'
sys.path.insert(0, SRC); os.chdir(SRC)
from lib import norm, R
OUT = '/home/claude/gridiron-draft/lib/data.json'
D = json.load(open(OUT))
GRP = {'QB': 'QB', 'RB': 'HB', 'FB': 'HB', 'WR': 'WR', 'TE': 'TE', 'T': 'OL', 'G': 'OL', 'C': 'OL', 'DE': 'DL', 'DT': 'DL', 'NT': 'DL', 'OLB': 'LB', 'ILB': 'LB', 'MLB': 'LB', 'LB': 'LB', 'CB': 'CB', 'FS': 'S', 'SS': 'S', 'S': 'S', 'DB': 'CB'}
RK = {'QB': 'QB', 'HB': 'HB', 'WR': 'WR', 'TE': 'TE', 'OL': 'OL', 'DL': 'DEF', 'LB': 'DEF', 'CB': 'DEF', 'S': 'DEF'}
BASE = {'QB': 60, 'HB': 64, 'WR': 64, 'TE': 62, 'OL': 61, 'DL': 64, 'LB': 64, 'CB': 63, 'S': 63}
KEEP = {'QB': 2, 'HB': 2, 'WR': 4, 'TE': 2, 'OL': 3, 'DL': 4, 'LB': 3, 'CB': 3, 'S': 2}   # backups kept per team
NOW = datetime.date(2026, 10, 12)
TEAMS = [t['abbr'] for t in D['TEAMS']]
start = set()
for p in D['PLAYERS']: start.add(norm(p['name']))
for u in D['OLU']:
    for q in u['players']: start.add(norm(q[0]))
for u in D['DFU']:
    for q in u['players']: start.add(norm(q[2]))
for k in D['KICK']: start.add(norm(k['name']))
for k in D['KR'] + D['PR']: start.add(norm(k['name']))
for u in D['STU']:
    for q in u['players']: start.add(norm(q[1]))
def jit(name, span):   # a stable pseudo-random offset from the name
    return int(hashlib.md5(name.encode()).hexdigest()[:6], 16) % (2 * span + 1) - span
def est(r, g):
    o = BASE[g]
    try: dn = int(r['draft_number'] or 0)
    except ValueError: dn = 0
    o += 6 if 0 < dn <= 32 else 4 if 0 < dn <= 64 else 2 if 0 < dn <= 128 else 0 if dn else -3
    try: ye = int(r['years_exp'] or 0)
    except ValueError: ye = 0
    o += -1 if ye == 0 else 1 if ye >= 4 else 0
    if r['status'] in ('DEV', 'CUT'): o -= 3
    return max(45, min(72, o + jit(r['full_name'], 3)))
def age(r):
    try:
        b = datetime.date.fromisoformat(r['birth_date'])
        return max(21, (NOW - b).days // 365)
    except Exception:
        return 25
rows = list(csv.DictReader(open('roster_2026.csv')))
ROSTERED = ('ACT', 'DEV', 'INA', 'RES')   # inactive and injured-reserve players are still on the team
active = {norm(r['full_name']) for r in rows if r['status'] in ROSTERED}
def mk(r, g):
    n = norm(r['full_name']); rr = R[RK[g]].get(n)
    ovr = rr[0] if rr else est(r, g)
    row = [g, r['full_name'], ovr, age(r)]
    if rr and g in ('QB', 'HB', 'WR', 'TE') and len(rr) > 1: row.append(rr[1])   # speed
    return row
by = {t: {} for t in TEAMS}; fa = []; seen = set()
for r in rows:
    g = GRP.get(r['depth_chart_position']) or GRP.get(r['position'])
    if not g: continue
    n = norm(r['full_name'])
    if n in start or (n, r['team']) in seen: continue
    if r['status'] in ROSTERED and r['team'] in by:
        seen.add((n, r['team'])); by[r['team']].setdefault(g, []).append(mk(r, g))
    elif r['status'] == 'CUT' and n not in active:
        seen.add((n, r['team'])); fa.append(mk(r, g))
DEPTH = []
for t in TEAMS:
    pl = []
    for g, k in KEEP.items():
        lst = sorted(by[t].get(g, []), key=lambda x: (-x[2], x[1]))[:k]
        pl += lst
    DEPTH.append({'team': t, 'players': pl})
dup = set(); FA = []
for x in sorted(fa, key=lambda x: (-x[2], x[1])):
    if x[1] in dup: continue
    dup.add(x[1]); FA.append(x)
FA = FA[:90]
D['DEPTH'] = DEPTH; D['FA'] = FA
json.dump(D, open(OUT, 'w'), separators=(',', ':'))
print('teams', len(DEPTH), 'backups', sum(len(d['players']) for d in DEPTH), 'min per team', min(len(d['players']) for d in DEPTH), 'fa', len(FA))
print(DEPTH[0]['players'][:12]); print(FA[:5])
