const E=require('./lib/engine.js'); const LG=require('./lib/league.js');
const t0=Date.now();
let L=LG.newNFL({user:0});
console.log('players',Object.keys(L.players).length,'sched',L.sched.length,'weeks',L.lastWeek,'t',Date.now()-t0);
console.log('rosters',L.teams.slice(0,3).map(t=>LG.rosterOf(L,t.id).length), LG.teamRating(L,0));
// sim full season
let guard=0;
while(L.phase!=='offseason'&&guard++<60){ LG.simWeek(L,false); LG.advanceWeek(L); LG.checkFinal(L); }
console.log('phase',L.phase,'season done',guard,'champ',L.teams[L.hist[0].champ].name,'runner',L.teams[L.hist[0].runner].name,'t',Date.now()-t0);
const R=LG.records(L); const tot=Object.values(R).reduce((a,r)=>a+r.w+r.l+r.t,0)/2; console.log('reg games',tot);
const o=LG.overallRank(L).slice(0,3).map(r=>L.teams[r.id].nick+' '+r.w+'-'+r.l); console.log(o);
console.log('po games',L.sched.filter(g=>g.pl==='po').length);
console.log('leaders pass',LG.leaders(L,'pyd',3),'rush',LG.leaders(L,'ryd',2),'sk',LG.leaders(L,'sk',2));
// offseason
const rep=LG.offseasonBegin(L,7); console.log('progress',rep.up.length,rep.down.length,rep.retired.length,'draft picks',L.draft.seq.length,'on clock',L.draft.seq[L.draft.pos],'phase',L.phase);
console.log('first picks order',L.draft.seq.slice(0,5).map(t=>L.teams[t].nick));
// user (team 0 owner)
L.teams[0].owner='me'; 
while(L.phase==='draft'){ const tid=LG.onClock(L); if(L.teams[tid].owner){ const pid=LG.cpuPickFor(L,tid,L.draft.pool); LG.draftPick(L,tid,pid);} LG.autoDraftToHuman(L); }
console.log('after draft phase',L.phase,'roster sizes',L.teams.slice(0,4).map(t=>LG.rosterOf(L,t.id).length));
LG.startSeason(L); console.log('season',L.season,'games',L.sched.length,'weeks',L.lastWeek, 'per team',Array.from(new Set(L.teams.map(t=>L.sched.filter(g=>g.a===t.id||g.h===t.id).length))));
// trade
const mine=LG.rosterOf(L,0).filter(p=>p.p==='WR')[0], other=LG.rosterOf(L,5).filter(p=>p.p==='WR')[0];
console.log('trade',LG.cpuTrade(L,0,5,[mine.i],[other.i]), 'offers',LG.cpuOffers(L,0).length);
// second season schedules for several seasons
for(let y=0;y<4;y++){ L.season++; const s=LG.nflMatchups(L); const per={}; s.forEach(g=>{per[g.a]=(per[g.a]||0)+1;per[g.h]=(per[g.h]||0)+1}); console.log('season',L.season,'pairs',s.length,'min/max per team',Math.min(...Object.values(per)),Math.max(...Object.values(per))); }
console.log('total ms',Date.now()-t0);
