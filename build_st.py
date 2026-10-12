"""Adds special teams to lib/data.json: K (kickers), PR, KR (returners) and STU (punter + long snapper + coverage unit).
Ratings: Madden NFL 27 (ea.com ratings pages): K/P/LS overall; returners from SPD/AGI/COD/AWR; coverage men from their defensive overall."""
import json,csv,sys,re,os
OUT=os.path.abspath('lib/data.json')
os.chdir('/home/claude/nfl'); sys.path.insert(0,'/home/claude/nfl')
from lib import norm,R
D=json.load(open(OUT))
NICK={t['nick']:t['abbr'] for t in D['TEAMS']}; NICK.update({'49ers':'SF'})
def ab(s): return NICK[s.split()[-1]] if s.split()[-1] in NICK else NICK[s.split()[-1]]
K="""Brandon Aubrey|DAL|87
Chris Boswell|PIT|86
Jason Myers|SEA|84
Nick Folk|ATL|84
Cameron Dicker|LAC|82
Evan McPherson|CIN|82
Will Reichard|MIN|82
Chase McLaughlin|TB|81
Harrison Butker|KC|81
Ka'imi Fairbairn|HOU|81
Cam Little|JAX|80
Jake Elliott|PHI|79
Tyler Loop|BAL|79
Cairo Santos|CHI|78
Spencer Shrader|IND|78
Wil Lutz|DEN|78
Andre Szmyt|CLE|77
Daniel Carlson|NO|77
Eddy Pineiro|SF|77
Trey Smack|GB|77
Harrison Mevis|LA|76
Jake Bates|DET|76
Jason Sanders|NYJ|76
Ryan Fitzgerald|CAR|76
Chad Ryland|ARI|75
Joey Slye|TEN|75
Matt Gay|LV|75
Andy Borregales|NE|74
Tyler Bass|BUF|74
Drew Stevens|WAS|73
Dominic Zvada|NYG|72
Riley Patterson|MIA|72"""
P="""Michael Dickson|SEA|85
Rigoberto Sanchez|IND|83
AJ Cole|LV|81
Corey Bojorquez|CLE|80
Ethan Evans|LA|80
JK Scott|LAC|80
Braden Mann|PHI|79
Bryan Anger|DAL|79
Jack Fox|DET|79
Jeremy Crawshaw|DEN|79
Bryce Baringer|NE|78
Jake Bailey|ATL|78
Tommy Townsend|TEN|78
Bradley Pinion|MIA|77
Tress Way|WAS|77
Corliss Waitman|SF|76
Jordan Stout|NYG|76
Logan Cooke|JAX|76
Mitch Wishnowsky|NE|76
Riley Dixon|TB|76
Matt Araiza|KC|75
Ryan Rehkow|CIN|75
Ryan Wright|NO|75
Tory Taylor|CHI|75
Blake Gillikin|ARI|74
Daniel Whelan|GB|74
Kai Kroeger|HOU|74
Sam Martin|CAR|74
Austin McNamara|NYJ|73
Brett Thorson|MIN|73
Ryan Eckley|BAL|73
Tommy Doman Jr|BUF|73
Cameron Johnston|PIT|72"""
LS="""Josh Harris|LAC|81
Andrew DePaola|MIN|80
Zach Wood|NO|79
Hogan Hatten|DET|78
Trent Sieg|DAL|78
Luke Rhodes|IND|77
James Winchester|KC|75
JJ Jansen|CAR|74
Tyler Ott|WAS|73
Ross Matiscik|JAX|72
Thomas Hennessy|NYJ|72
Reid Ferguson|BUF|71
Casey Kreiter|ARI|70
Nick Moore|BAL|70
Jon Weeks|SF|69
Mitchell Fraboni|DEN|68
Morgan Cox|TEN|66
Austin Brinkman|HOU|65
Ben Mann|NYG|65
Julian Ashby|NE|65
Rocco Underwood|PHI|65
Liam McCullough|ATL|64
Cal Adomitis|NO|63
William Wagner|CIN|63
Alex Ward|LV|62
Chris Stoll|SEA|62
Christian Kuntz|PIT|62
Matt Orzech|GB|61
Evan Deckers|TB|60
Joe Cardona|LA|60
Scott Daly|CHI|59
Rex Sunahara|CLE|58
Tucker Addington|MIA|56"""
# returners: ovr|spd|str|agi|cod|awr  (EA Madden 27)
RET={
'Ameer Abdullah':(73,88,68,85,86,80),'Brian Robinson Jr.':(79,87,81,79,76,77),'Deebo Samuel':(79,91,80,87,87,84),'KC Concepcion':(75,91,70,91,91,63),
'KaVontae Turpin':(76,97,48,91,88,80),'Kalif Raymond':(76,91,53,86,83,81),'Marcus Jones':(82,92,60,90,88,80),'Marvin Mims Jr.':(77,92,55,88,88,76),
'Parker Washington':(83,89,66,87,87,94),'Rashid Shaheed':(78,95,61,90,91,67),'Will Shipley':(74,91,68,87,89,76),
'Anthony Gould':(69,94,47,86,89,58),'Barion Brown':(70,92,56,87,85,69),'Charlie Jones':(70,90,56,88,89,62),'Chimere Dike':(74,94,65,88,86,77),
'David Moore':(71,87,74,81,75,78),'Derius Davis':(70,94,63,82,83,60),'Devin Duvernay':(74,93,68,85,83,73),'Dohnte Meyers':(68,88,59,84,87,70),
'Dyami Brown':(73,92,63,87,83,68),'Greg Dortch':(73,90,43,86,88,77),'Isaiah Williams':(67,87,59,91,92,64),'Jacob Cowing':(71,93,52,83,85,52),
'Jaylin Noel':(73,93,66,89,86,68),'Kaden Wetjen':(68,90,58,85,81,74),'Kameron Johnson':(64,90,63,82,83,66),'Kyle Williams':(73,94,66,87,85,70),
'LaJohntay Wester':(70,90,62,88,92,63),'Luke McCaffrey':(72,90,55,92,90,62),'Malachi Corley':(69,88,66,85,86,61),'Malik Benson':(69,93,58,80,79,70),
'Malik Washington':(73,90,59,88,86,74),'Myles Price':(66,92,53,81,82,67),'Nikko Remigio':(67,87,63,79,83,61),'Skyy Moore':(72,88,69,86,89,68),
'Tom Kennedy':(68,86,64,88,85,70),'Zachariah Branch':(73,95,64,93,88,51),'Britain Covey':(65,88,41,91,90,62),'Alex Bachman':(64,87,61,88,82,57),
'Rasheen Ali':(69,92,74,86,85,69),'Dylan Laube':(68,88,67,88,90,62),'Tyler Badie':(69,89,74,83,81,71),'Kene Nwangwu':(67,92,68,87,82,65)}
EST={'Marcus Jones'}
def rows(s): return [l.split('|') for l in s.strip().split('\n')]
def retr(v): return max(55,min(97,round(62+(0.55*v[1]+0.25*v[3]+0.20*v[4]-80)*2.2)))
dep=[x for x in csv.DictReader(open('/home/claude/nfl/depth_charts_2026.csv'))]
mx=max(x['dt'] for x in dep); dep=[x for x in dep if x['dt']==mx]
by={}
for x in dep: by.setdefault(x['team'],[]).append(x)
SK=[1,2,3,4,4,5,5,3,1,4,5]; HR=['K','N','K','X','K','B','K','N','X','K','R']
def look(n):
    import zlib
    h=zlib.crc32(n.encode()); return SK[h%11],HR[(h>>5)%11]
for T in D['TEAMS']: pass
def clean(n): return n.replace('Doman Jr.','Doman Jr')
Kd={a:(n,int(o)) for n,a,o in rows(K)}
Pd={}
for n,a,o in rows(P):
    d=by[a]; chosen=[x['player_name'] for x in d if x['pos_abb']=='P' and x['pos_rank']=='1']
    if a in Pd and (not chosen or norm(chosen[0])!=norm(n)): continue
    Pd[a]=(n,int(o))
Ld={a:(n,int(o)) for n,a,o in rows(LS)}
KICK=[];KR=[];PR=[];STU=[]
for i,T in enumerate(D['TEAMS']):
    a=T['abbr']; d=by[a]
    nm,o=Kd[a]; s,h=look(nm); KICK.append(dict(id=i,name=nm,team=a,ovr=o,skin=s,hair=h))
    for lst,pos in ((KR,'KR'),(PR,'PR')):
        n=[x['player_name'] for x in d if x['pos_abb']==pos and x['pos_rank']=='1'][0]
        v=RET[n]; s,h=look(n)
        base=[p for p in D['PLAYERS'] if p['name']==n]
        if base: s,h=base[0]['skin'],base[0]['hair']
        lst.append(dict(id=i,name=n,team=a,ovr=retr(v),spd=v[1],agi=v[3],str=v[2],awr=v[5],skin=s,hair=h,est=1 if n in EST else 0))
    # coverage unit: best backups at CB/S/LB (depth rank 2-3)
    cov=[]
    for x in d:
        if x['pos_abb'] in ('LCB','RCB','SS','FS','WLB','SLB','MLB','NB','LILB','RILB') and x['pos_rank'] in ('2','3'):
            r=R['DEF'].get(norm(x['player_name']))
            cov.append((x['player_name'],r[0] if r else 64,0 if r else 1))
    seen=set();c2=[]
    for c in sorted(cov,key=lambda c:-c[1]):
        if c[0] in seen: continue
        seen.add(c[0]); c2.append(c)
    c2=c2[:4]
    while len(c2)<4: c2.append(('Reserve',64,1))
    pn,po=Pd[a]; ln,lo=Ld[a]
    pl=[['P',pn,po,0],['LS',ln,lo,0]]+[['CV',n,o2,e] for n,o2,e in c2]
    ovr=round(0.35*po+0.15*lo+0.50*sum(c[1] for c in c2)/4)
    STU.append(dict(id=i,team=a,ovr=ovr,players=pl))
D['KICK']=KICK;D['KR']=KR;D['PR']=PR;D['STU']=STU
json.dump(D,open(OUT,'w'),separators=(',',':'))
print('K',min(k['ovr'] for k in KICK),max(k['ovr'] for k in KICK),'ST',min(s['ovr'] for s in STU),max(s['ovr'] for s in STU),'KR',min(k['ovr'] for k in KR),max(k['ovr'] for k in KR),'PR',min(k['ovr'] for k in PR),max(k['ovr'] for k in PR))
print(STU[0]); print(sum(1 for k in KR+PR if k['est']))
