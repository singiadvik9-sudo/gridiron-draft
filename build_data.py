import json,re
from lib import *
ALIAS={'Cam Bynum':'Camryn Bynum','Joshua Metellus':'Josh Metellus','Cameron Heyward':'Cam Heyward','Chig Okonkwo':'Chigoziem Okonkwo',
 'Olaivavega Ioane':'Vega Ioane','Jaylahn Tuimoloau':'JT Tuimoloau','Josh Uche':'Joshua Uche','Easton Mascarenas-Arnold':'Easton Mascarenas-Arnold'}
EXTRA_TE={'charliekolar':[68,84,68,81,74,67]}
R['TE'].update(EXTRA_TE)
FALL={'DEF':71,'OL':62,'WR':73,'TE':66,'HB':72,'QB':64}
TEAMS={ # abbr: (display, c1, c2)
'ARI':('Cardinals','#97233f','#ffb612'),'ATL':('Falcons','#a71930','#d9d9d9'),'BAL':('Ravens','#241773','#9e7c0c'),'BUF':('Bills','#00338d','#c60c30'),
'CAR':('Panthers','#0085ca','#101820'),'CHI':('Bears','#0b162a','#c83803'),'CIN':('Bengals','#fb4f14','#101010'),'CLE':('Browns','#311d00','#ff3c00'),
'DAL':('Cowboys','#003594','#869397'),'DEN':('Broncos','#fb4f14','#002244'),'DET':('Lions','#0076b6','#b0b7bc'),'GB':('Packers','#203731','#ffb612'),
'HOU':('Texans','#03202f','#a71930'),'IND':('Colts','#002c5f','#a2aaad'),'JAX':('Jaguars','#006778','#d7a22a'),'KC':('Chiefs','#e31837','#ffb81c'),
'LA':('Rams','#003594','#ffa300'),'LAC':('Chargers','#0080c6','#ffc20e'),'LV':('Raiders','#111111','#a5acaf'),'MIA':('Dolphins','#008e97','#fc4c02'),
'MIN':('Vikings','#4f2683','#ffc62f'),'NE':('Patriots','#002244','#c60c30'),'NO':('Saints','#d3bc8d','#101820'),'NYG':('Giants','#0b2265','#a71930'),
'NYJ':('Jets','#125740','#e8e8e8'),'PHI':('Eagles','#004c54','#a5acaf'),'PIT':('Steelers','#ffb612','#101820'),'SEA':('Seahawks','#002244','#69be28'),
'SF':('49ers','#aa0000','#b3995d'),'TB':('Buccaneers','#d50a0a','#34302b'),'TEN':('Titans','#4b92db','#0c2340'),'WAS':('Commanders','#5a1414','#ffb612')}
CITY={'ARI':'Arizona','ATL':'Atlanta','BAL':'Baltimore','BUF':'Buffalo','CAR':'Carolina','CHI':'Chicago','CIN':'Cincinnati','CLE':'Cleveland','DAL':'Dallas','DEN':'Denver','DET':'Detroit','GB':'Green Bay','HOU':'Houston','IND':'Indianapolis','JAX':'Jacksonville','KC':'Kansas City','LA':'Los Angeles','LAC':'Los Angeles','LV':'Las Vegas','MIA':'Miami','MIN':'Minnesota','NE':'New England','NO':'New Orleans','NYG':'New York','NYJ':'New York','PHI':'Philadelphia','PIT':'Pittsburgh','SEA':'Seattle','SF':'San Francisco','TB':'Tampa Bay','TEN':'Tennessee','WAS':'Washington'}
# appearance exceptions: skin 1(light)..5(dark); hair K black, N brown, B blond, R red, G gray, X shaved
APP={}
for n in ["Josh Allen","Joe Burrow","Bo Nix","Jared Goff","Jordan Love","Daniel Jones","Matthew Stafford","Justin Herbert","Kirk Cousins","Drake Maye","Tyler Shough","Sam Darnold","Brock Purdy","Baker Mayfield","Aaron Rodgers",
 "Christian McCaffrey","Trey McBride","Mark Andrews","Dalton Kincaid","Colston Loveland","Mike Gesicki","Harold Fannin Jr.","Jake Ferguson","Sam LaPorta","Tucker Kraft","Dalton Schultz","Tyler Warren","Travis Kelce","Colby Parkinson","Charlie Kolar","Brock Bowers","Greg Dulcich","T.J. Hockenson","Hunter Henry","Dallas Goedert","AJ Barner","George Kittle","Cade Otton","Gunnar Helm","Ladd McConkey","Romeo Doubs","Kendrick Bourne","Cam Skattebo"]: APP[n]=(1,'N')
for n,v in {"Trevor Lawrence":(1,'B'),"Jordan Love":(1,'N'),"Aaron Rodgers":(1,'G'),"Brock Purdy":(1,'N'),"Travis Kelce":(1,'N'),"Mike Gesicki":(1,'B'),"Jared Goff":(1,'N'),"Tucker Kraft":(1,'B'),
 "Patrick Mahomes":(3,'K'),"Puka Nacua":(3,'K'),"Amon-Ra St. Brown":(3,'K'),"Jordan Addison":(3,'K'),"Rome Odunze":(3,'K'),"KC Concepcion":(3,'K'),"Ashton Jeanty":(3,'K'),"Chris Olave":(3,'K'),
 "Devaughn Vele":(3,'K'),"Roman Wilson":(3,'K'),"Emeka Egbuka":(3,'K'),"Rashee Rice":(3,'K'),"Cam Skattebo":(2,'K'),"Dylan Sampson":(3,'K'),
 "Lamar Jackson":(5,'K'),"Deshaun Watson":(5,'K'),"Mark Andrews":(2,'N'),"Josh Allen":(1,'N')}.items(): APP[n]=v
DEFAULT=(4,'K')
SKIN=['#f3cba6','#e0a97c','#c58a55','#94603a','#5f3b25']
HAIR={'K':'#18120e','N':'#5a3a22','B':'#d9b45a','R':'#a8441e','G':'#b9b9b9'}
def app(n): return APP.get(n,DEFAULT)
alias=lambda n: ALIAS.get(str(n),str(n))
def look(pos,nm):
    k=norm(alias(nm))
    return R[pos].get(k)
PL=[]; 
def addp(team,pos,nm):
    r=look(pos,nm)
    if pos=='QB': ovr,spd,st,ag,aw=(r[0],r[1],r[2],r[3],r[5]) if r else (64,80,60,76,60)
    elif r: ovr,spd,st,ag,aw=r[0],r[1],r[2],r[3],r[5]
    else: ovr,spd,st,ag,aw=FALL[pos],88,66,84,72
    s,h=app(nm)
    PL.append(dict(id=len(PL),name=str(nm),team=team,pos=pos,ovr=ovr,spd=spd,str=st,agi=ag,awr=aw,skin=s,hair=h,est=0 if r else 1))
TL=sorted(S.keys())
for t in TL:
    o=S[t]['off']
    addp(t,'QB',o['QB']); addp(t,'HB',o['HB']); addp(t,'WR',o['WR'][0]); addp(t,'WR',o['WR'][1]); addp(t,'TE',o['TE'])
# units
OLU=[];DFU=[]
GRP={'LDE':'DL','RDE':'DL','LDT':'DL','RDT':'DL','NT':'DL','WLB':'LB','MLB':'LB','SLB':'LB','LILB':'LB','RILB':'LB','LCB':'CB','RCB':'CB','SS':'S','FS':'S'}
for t in TL:
    v=S[t]; ol=[]
    for n in v['off']['OL']:
        r=look('OL',n); ol.append([str(n),r[0] if r else FALL['OL'],0 if r else 1])
    OLU.append(dict(team=t,players=ol))
    df=[]
    for pos,n in v['def']:
        r=look('DEF',n); nm=str(n)
        if nm=='nan': nm='Reserve'; r=None
        df.append([pos,GRP[pos],nm,r[0] if r else FALL['DEF'],0 if r else 1])
    DFU.append(dict(team=t,scheme='43' if v['grp']=='Base 4-3 D' else '34',players=df))
TM=[dict(abbr=t,nick=TEAMS[t][0],city=CITY[t],c1=TEAMS[t][1],c2=TEAMS[t][2]) for t in TL]
out=dict(TEAMS=TM,PLAYERS=PL,OLU=OLU,DFU=DFU,SKIN=SKIN,HAIR=HAIR)
json.dump(out,open('data.json','w'))
est=[p['name'] for p in PL if p['est']]; print(len(PL),'players; estimated:',est)
print('OL est',sum(x[2] for u in OLU for x in u['players']),'DEF est',sum(x[4] for u in DFU for x in u['players']))
for u,d,t in list(zip(OLU,DFU,TM))[:32]:
    print(t['abbr'],round(sum(x[1] for x in u['players'])/5,1),d['scheme'],round(sum(x[3] for x in d['players'])/11,1))
