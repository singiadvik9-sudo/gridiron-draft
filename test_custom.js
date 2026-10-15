const E=require('./lib/engine.js'); const LG=require('./lib/league.js');
function run(entry, n, divs, games, playoffs){
  const L=LG.newCustom({entry,divisions:divs,nDivs:2,games,playoffs,name:'T'},'mgr');
  for(let i=0;i<n;i++) LG.addTeam(L,{owner:i<2?'user'+i:null,name:'Club'+i});
  const err=LG.startCustom(L); if(err) throw new Error(err);
  let g=0;
  if(L.phase==='draft'){
    while(L.phase==='draft' && g++<2000){ const tid=LG.onClock(L); if(tid==null) break; if(L.teams[tid].owner){ const pid=L.draft.units?LG.autoPickFor(L,tid):LG.cpuPickFor(L,tid,L.draft.pool.filter(id=>LG.canDraftPos(L,tid,L.players[id].p))); if(!LG.draftPick(L,tid,pid)) throw new Error('pick fail'); } LG.autoDraftToHuman(L); }
    LG.finalizeLeagueDraft(L);
  }
  console.log(entry,'teams',L.teams.length,'phase',L.phase,'roster',LG.rosterOf(L,0).length,'sched',L.sched.length,'lastWeek',L.lastWeek,'perTeam',Array.from(new Set(L.teams.map(t=>L.sched.filter(x=>x.a===t.id||x.h===t.id).length))));
  g=0; while(L.phase!=='offseason'&&g++<80){ LG.simWeek(L,false); LG.advanceWeek(L); LG.checkFinal(L); }
  console.log(' ->',L.phase,'champ',L.hist[0]&&L.hist[0].champ!=null?L.teams[L.hist[0].champ].name:'none','po games',L.sched.filter(x=>x.pl==='po').length);
  console.log(' owner rec',LG.ownerRecord(L,'user0'));
}
run('nfl',8,false,7,4); run('nfl',7,true,6,4); run('draft',6,true,8,0); run('draft',10,false,9,6); run('nfl',4,false,6,2);
// bracket
const br=LG.makeBracket(6,[1,3,3]); console.log('bracket matches',br.matches.length,br.matches.filter(m=>m.bye).length,'byes; r1',br.matches.filter(m=>m.r===1).map(m=>[m.a,m.b]));
LG.reportSeries(br,'r1m2',0,10,7); console.log(br.matches.find(m=>m.id==='r2m1'));
