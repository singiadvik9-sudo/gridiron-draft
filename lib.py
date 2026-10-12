import json,unicodedata,re
def norm(n):
    n=unicodedata.normalize('NFKD',str(n).lower())
    n=re.sub(r'[^a-z ]','',n.replace('.',''))
    n=re.sub(r'( jr| sr| ii| iii| iv| v)+$','',n.strip())
    return n.replace(' ','')
def load(f):
    d={}
    for l in open('raw/'+f+'.txt'):
        p=l.strip().split('|')
        if len(p)<2: continue
        k=norm(p[0]); v=[int(x) for x in p[1:]]
        if k not in d or v[0]>d[k][0]: d[k]=v
    return d
S=json.load(open('starters.json'))
R={k:load(k) for k in ['QB','HB','WR','TE','OL','DEF']}
