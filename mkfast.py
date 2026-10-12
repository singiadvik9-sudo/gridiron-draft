import os
t=open('public/index.html').read()
for a,b in [("hold = fl ? 750 : 220, settle = 320","hold = fl ? 5 : 5, settle = 5"),("const dur = kind === 'punt' || kind === 'fg' ? 1200 : (kind === 'pass' || kind === 'int' || kind === 'inc') ? 900 : 760;","const dur = 20;"),("dur + hold + settle + 1800","200"),("S.screen === 'game' ? 700 : 1200","S.screen === 'game' ? 60 : 80"),("DR.cpuPick(sd.d, t)); sdAfter(); }, 650);","DR.cpuPick(sd.d, t)); sdAfter(); }, 15);"),("sdPick(DR.cpuPick(sd.d, sd.me)); }, 450);","sdPick(DR.cpuPick(sd.d, sd.me)); }, 15);"),("if (S.sd === sd) sdPollLoop();\n  }, 1500);","if (S.sd === sd) sdPollLoop();\n  }, 120);")]:
    assert a in t,a
    t=t.replace(a,b)
t=t.replace('ms || 5000','300')
os.makedirs('public_fast',exist_ok=True); open('public_fast/index.html','w').write(t)
