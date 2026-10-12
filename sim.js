const E=require('./lib/engine.js');
function rndTeam(){ return E.mkTeam('T',E.autoDraft()); }
let N=3000, tot=0, ties=0, otg=0, plays=0, yardsRun=0, runs=0, pass=0, comp=0, sacks=0, ints=0, tds=0, fgs=0, fgAtt=0, punts=0, downs=0, fum=0, passYds=0, maxLen=0, scoresA=[], det=true;
let dist={};
for(let g=0; g<N; g++){
  const seed=Math.floor(Math.random()*2**31);
  const teams={a:rndTeam(),b:rndTeam()};
  const R=E.replay(seed,teams,{},['a','b']); const st=R.state;
  if(g<3){ const R2=E.replay(seed,teams,{},['a','b']); if(JSON.stringify(R2.log)!==JSON.stringify(R.log)) det=false; }
  maxLen=Math.max(maxLen,R.log.length);
  if(st.ot) otg++; if(st.winner===null) ties++;
  tot+=st.score.a+st.score.b; scoresA.push(st.score.a, st.score.b);
  for(const e of R.log){ plays++;
    if(e.ev==='td') tds++; if(e.ev==='fg'||e.ev==='fgmiss') fgAtt++; if(e.ev==='fg') fgs++; if(e.ev==='punt') punts++; if(e.ev==='downs') downs++; if(e.ev==='fumble') fum++;
    if(e.offPick.startsWith('RUN')){ runs++; yardsRun+=e.yards; }
    if(e.offPick.startsWith('PASS')||e.offPick==='SCREEN'){ pass++; if(e.ev==='pass'||(e.ev==='td'&&e.anim==='pass')||(e.ev==='downs'&&e.anim==='pass')){comp++; passYds+=e.yards;} if(e.ev==='sack') sacks++; if(e.ev==='int') ints++; }
    dist[e.ev]=(dist[e.ev]||0)+1;
  }
  if(g===0){ console.log(R.log.slice(0,12).map(e=>`${e.n} ${e.off} ${e.offPick}/${e.defPick} :: ${e.text}  (${e.after.poss}${e.after.ballOn} ${e.after.down}&${e.after.toGo})`).join('\n')); }
}
scoresA.sort((a,b)=>a-b);
console.log({games:N, avgTotalPts:(tot/N).toFixed(1), medianTeamPts:scoresA[scoresA.length>>1], p10:scoresA[Math.floor(scoresA.length*.1)], p90:scoresA[Math.floor(scoresA.length*.9)], ties:(ties/N*100).toFixed(1)+'%', ot:(otg/N*100).toFixed(1)+'%', playsPerGame:(plays/N).toFixed(1), maxLogLen:maxLen, det});
console.log({ypRun:(yardsRun/runs).toFixed(2), compPct:(comp/pass*100).toFixed(1), ypComp:(passYds/comp).toFixed(1), sackPct:(sacks/pass*100).toFixed(1), intPct:(ints/pass*100).toFixed(1), passShare:(pass/(pass+runs)*100).toFixed(0)+'%', tdPerGame:(tds/N).toFixed(2), fgMake:(fgs/fgAtt*100).toFixed(0)+'%', fgAttPerGame:(fgAtt/N).toFixed(2), puntsPerGame:(punts/N).toFixed(2), downsPerGame:(downs/N).toFixed(2), fumPerGame:(fum/N).toFixed(2)});
console.log(dist);
