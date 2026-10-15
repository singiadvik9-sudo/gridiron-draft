// In-process API test: accounts, league (human vs CPU & human vs human), tournament.
const E=require('./lib/engine.js'), LG=require('./lib/league.js');
const H={auth:require('./api/auth.js'),league:require('./api/league.js'),tourney:require('./api/tourney.js'),room:require('./api/room.js'),save:require('./api/save.js')};
async function call(name,body,tok){return new Promise(r=>{const req={method:'POST',body,headers:tok?{'x-token':tok}:{}};const res={status(c){this.c=c;return this},json(o){r(Object.assign({_c:this.c},o))},setHeader(){}};H[name](req,res)})}
const ok=(c,m)=>{if(!c){console.log('FAIL',m);process.exitCode=1}else console.log('ok  ',m)};
// play a human side locally: returns moves for that side
function playSide(info,live){
  const T=info.T,U={a:E.teamUnits(T.a),b:E.teamUnits(T.b)}; let st=E.initState(info.seed); const mine=info.side, other=mine==='a'?'b':'a', moves={}; let g=0;
  const r=E.mulberry32(info.seed);
  while(!st.over&&g++<200){const n=st.playNo,off=st.poss,def=off==='a'?'b':'a';
    const role=off===mine?'off':'def';
    const pick=E.cpuMove(st,U,mine,info.seed,role);
    const kick=role==='off'&&E.noDef(E.legalOff(st,pick));
    const ctl=live&&!kick&&n%3===0;
    const to=E.cpuTO(st,mine)?1:0;
    moves[n+'-'+mine]=Object.assign({pick},ctl?{ctl:1}:{},to?{to:1}:{});
    if(ctl){const a=[];let t=2;for(let k=0;k<10;k++){t+=1+Math.floor(r()*9);a.push(E.LIVE.enc(t,Math.floor(r()*3)-1,Math.floor(r()*3)-1,r()<.25?1+Math.floor(r()*6):0))}
      moves[n+'-lv']=mine==='a'?{a,b:[]}:{a:[],b:a}}
    let R=E.replay(info.seed,T,moves,[other]);
    if(R.wait&&R.wait.kind==='ret'){const a=[];let t=2;for(let k=0;k<8;k++){t+=2+Math.floor(r()*9);a.push(E.LIVE.enc(t,1,Math.floor(r()*3)-1,r()<.2?5:0))}
      moves[R.wait.n+'-rv']={s:mine,ev:a}; R=E.replay(info.seed,T,moves,[other]);}
    st=R.state;}
  return moves;
}
(async()=>{
  const a=await call('auth',{op:'register',name:'alice',password:'secret1'}),bb=await call('auth',{op:'register',name:'bob',password:'secret2'});
  ok(a.token&&bb.token,'register'); const ta=a.token,tb=bb.token;
  ok((await call('auth',{op:'register',name:'alice',password:'x12345'})).error==='name_taken','dup name');
  ok((await call('league',{op:'mine'})).error==='auth','league needs account');
  let r=await call('league',{op:'create',cfg:{name:'Test',entry:'nfl',divisions:true,games:5,playoffs:4}},ta); ok(r.code,'create league '+r.code); const code=r.code;
  ok((await call('league',{op:'join',code},tb)).ok,'bob joins');
  ok((await call('league',{op:'claim',code,abbr:'SF'},ta)).tid===0,'alice claims SF');
  ok((await call('league',{op:'claim',code,abbr:'KC'},tb)).tid===1,'bob claims KC');
  ok((await call('league',{op:'claim',code,abbr:'KC'},tb)).tid===1,'reclaim ok');
  r=await call('league',{op:'addcpu',code,n:4},ta); ok(r.made===4,'4 cpus');
  ok((await call('league',{op:'start',code},tb)).error==='manager_only','non-mgr cant start');
  r=await call('league',{op:'start',code},ta); ok(r.ok,'start '+JSON.stringify(r));
  let g=await call('league',{op:'get',code},ta); let L=g.L; ok(L.phase==='regular'&&L.sched.length>0,'regular, games '+L.sched.length);
  const same=await call('league',{op:'get',code,ver:g.ver},ta); ok(same.same,'ver poll');
  { // picks as trade assets between two managers, and with a CPU team
    const pa='pk:'+(L.season+1)+':1:0', pb='pk:'+(L.season+1)+':2:1';
    ok((await call('league',{op:'trade',code,to:1,give:[pa,pa],get:[]},ta)).error||(await call('league',{op:'trade',code,to:1,give:[pa,pa],get:[]},ta)).ok===false,'duplicate pick refused');
    let r2=await call('league',{op:'trade',code,to:1,give:[pa],get:[pb]},ta); ok(r2.ok&&r2.pending,'pick-for-pick offer sent to bob');
    const gg=await call('league',{op:'get',code},tb); const off=gg.L.offers.find(o=>o.give.includes(pa));
    ok(!!off,'offer lists the pick');
    ok((await call('league',{op:'tradeop',code,id:off.id,act:'accept'},ta)).error==='forbidden','sender cannot accept own offer');
    ok((await call('league',{op:'tradeop',code,id:off.id,act:'accept'},tb)).ok,'bob accepts');
    const g4=await call('league',{op:'get',code},ta); const P=g4.L.picks;
    ok(P.find(k=>k.y===L.season+1&&k.r===1&&k.o===0).t===1&&P.find(k=>k.y===L.season+1&&k.r===2&&k.o===1).t===0,'picks changed hands');
    ok((await call('league',{op:'trade',code,to:1,give:[pa],get:[]},ta)).ok===false,'alice no longer owns it');
  }
  { const fg=L.sched.find(x=>x.w===L.week&&!x.done&&L.teams[x.h].owner); if(fg){
    ok((await call('league',{op:'forfeit',code,gid:fg.id,loser:fg.h},tb)).error==='manager_only','non-mgr cant forfeit');
    ok((await call('league',{op:'forfeit',code,gid:fg.id,loser:999},ta)).error,'forfeit needs a team in the game');
    ok((await call('league',{op:'forfeit',code,gid:fg.id,loser:fg.a},ta)).ok,'manager forfeits a game');
    const g3=await call('league',{op:'get',code},ta); const done=g3.L.sched.find(x=>x.id===fg.id); ok(done.done&&done.ff===fg.a&&done.sa===0&&done.sh===1,'forfeit recorded 1-0');
    ok((await call('league',{op:'play',code,gid:fg.id},ta)).error,'cannot play a forfeited game'); } }
  // find a week-1 game for alice
  for(let season=0;season<1;season++){
    let guard=0;
    while(guard++<30){
      g=await call('league',{op:'get',code},ta);L=g.L;
      if(L.phase==='offseason')break;
      const tidA=L.teams.findIndex(t=>t.owner==='alice'),tidB=L.teams.findIndex(t=>t.owner==='bob');
      const gm=L.sched.filter(x=>x.w===L.week&&!x.done);
      if(!gm.length){console.log('no games?',L.phase,L.week);break}
      for(const x of gm){
        const who=[x.h,x.a].filter(t=>t===tidA||t===tidB);
        if(!who.length)continue;
        const hv=L.teams[x.h].owner&&L.teams[x.a].owner;
        if(hv){
          const pa=await call('league',{op:'play',code,gid:x.id},L.teams[x.h].owner==='alice'?ta:tb);
          const pb=await call('league',{op:'play',code,gid:x.id},L.teams[x.h].owner==='alice'?tb:ta);
          ok(pa.room&&pa.room===pb.room,'h-v-h room '+pa.room);
          // simulate both humans via room.move
          const sh=L.teams[x.h].owner,sa=L.teams[x.a].owner; const tok=n=>n==='alice'?ta:tb;
          const mh=playSide(pa), ma=playSide(Object.assign({},pa,{side:'b'}));
          for(const k in mh){const [n]=k.split('-');await call('room',{op:'move',code:pa.room,seat:'a',n:+n,pick:mh[k].pick,to:mh[k].to},tok(sh))}
          for(const k in ma){const [n]=k.split('-');await call('room',{op:'move',code:pa.room,seat:'b',n:+n,pick:ma[k].pick,to:ma[k].to},tok(sa))}
          const rp=await call('league',{op:'report',code,gid:x.id},ta); ok(rp.ok,'h-v-h verified '+rp.sh+'-'+rp.sa+' '+(rp.error||''));
        } else {
          const owner=L.teams[who[0]].owner, tok=owner==='alice'?ta:tb;
          const p=await call('league',{op:'play',code,gid:x.id},tok);
          const mv=playSide(p,true);
          const rp=await call('league',{op:'report',code,gid:x.id,moves:mv},tok); ok(rp.ok,'vs cpu verified '+rp.sh+'-'+rp.sa+' '+(rp.error||''));
          // tampered replay should fail
        }
      }
    }
    g=await call('league',{op:'get',code},ta);console.log('phase',g.L.phase,'season',g.L.season,'champ',g.L.hist[0]&&g.L.teams[g.L.hist[0].champ].name);
  }
  const me=await call('auth',{op:'me'},ta); ok(me.hist.length>=1&&me.hist[0].kind==='league','alice hist: '+JSON.stringify(me.hist[0]).slice(0,200));
  r=await call('league',{op:'offseason',code},ta); ok(r.ok,'offseason '+(r.error||'')); g=await call('league',{op:'get',code},ta);console.log('phase after offseason',g.L.phase);
  if(g.L.phase==='draft'){ for(let i=0;i<40&&(await call('league',{op:'get',code},ta)).L.phase==='draft';i++){const gg=(await call('league',{op:'get',code},ta)).L,tid=LG.onClock(gg),o=gg.teams[tid].owner;if(!o){await call('league',{op:'draftskip',code},ta);continue}const pid=LG.cpuPickFor(gg,tid,gg.draft.pool);await call('league',{op:'draft',code,pid},o==='alice'?ta:tb)} }
  g=await call('league',{op:'get',code},ta);ok(g.L.phase==='preseason','draft done -> '+g.L.phase);
  r=await call('league',{op:'season',code},ta);g=await call('league',{op:'get',code},ta);ok(g.L.season===2027&&g.L.phase==='regular','season 2027 '+(r.error||''));
  // trade with CPU
  const L2=g.L,tid=L2.teams.findIndex(t=>t.owner==='alice');
  const off=await call('league',{op:'cpuoffers',code},ta);console.log('cpu offers',off.offers&&off.offers.length);
  const offQ=await call('league',{op:'cpuoffers',code,pos:'QB'},ta);ok(Array.isArray(offQ.offers),'cpu offers for one position come back ('+(offQ.offers||[]).length+')');
  { const Lg=(await call('league',{op:'get',code},ta)).L, mine=Lg.teams.find(x=>x.owner&&LG.rosterOf(Lg,x.id).length&&true), pid=LG.rosterOf(Lg,mine.id).sort((p,q)=>q.o-p.o)[3].i;
    const bl=await call('league',{op:'block',code,pid,on:true},ta);
    const bids=await call('league',{op:'blockbids',code},ta);
    ok(bl.ok!==false&&Array.isArray(bids.bids),'trading block over the API: put a player up and get bids ('+(bids.bids||[]).map(b=>b.bids.length).join(',')+')');
    const off=await call('league',{op:'block',code,pid,on:false},ta); ok(off.ok!==false,'and take him off again'); }
  // tournament
  r=await call('tourney',{op:'create',cfg:{name:'Cup',teamMode:'nfl',semi:3,final:5}},ta);ok(r.code,'tourney '+r.code);const tc=r.code;
  await call('tourney',{op:'join',code:tc},ta);await call('tourney',{op:'join',code:tc},tb);
  ok((await call('tourney',{op:'pick',code:tc,abbr:'DAL'},ta)).ok,'pick');ok((await call('tourney',{op:'pick',code:tc,abbr:'DAL'},tb)).error,'dup pick blocked');await call('tourney',{op:'pick',code:tc,abbr:'GB'},tb);
  ok((await call('tourney',{op:'addcpu',code:tc,n:2},ta)).ok,'cpus');
  let tg=(await call('tourney',{op:'get',code:tc},ta)).T;
  const ord=[tg.ent[3].id,tg.ent[1].id,tg.ent[2].id,tg.ent[0].id];
  ok((await call('tourney',{op:'seeds',code:tc,order:ord},ta)).ok,'custom seeds');
  r=await call('tourney',{op:'start',code:tc},ta);ok(r.ok,'start '+(r.error||''));
  for(let g2=0;g2<12;g2++){
    tg=(await call('tourney',{op:'get',code:tc},ta)).T; if(tg.phase==='done')break;
    const live=tg.br.matches.filter(m=>m.a!=null&&m.b!=null&&m.win==null);
    for(const m of live){const A=tg.ent.find(e=>e.id===tg.seeds[m.a]),B=tg.ent.find(e=>e.id===tg.seeds[m.b]);
      const hs=[A,B].filter(e=>e.kind==='human');
      if(hs.length===2){const pa=await call('tourney',{op:'play',code:tc,mid:m.id},ta);const pb=await call('tourney',{op:'play',code:tc,mid:m.id},tb);ok(pa.room&&pa.room===pb.room,'t h-v-h room');
        const seatOf={a:pa.side==='a'?ta:tb,b:pa.side==='a'?tb:ta};const mh=playSide(pa),ma=playSide(Object.assign({},pa,{side:pa.side==='a'?'b':'a'}));
        for(const k in mh){await call('room',{op:'move',code:pa.room,seat:pa.side,n:+k.split('-')[0],pick:mh[k].pick,to:mh[k].to},ta)}
        const os=pa.side==='a'?'b':'a';for(const k in ma){await call('room',{op:'move',code:pa.room,seat:os,n:+k.split('-')[0],pick:ma[k].pick,to:ma[k].to},tb)}
        const rp=await call('tourney',{op:'report',code:tc,mid:m.id},ta);ok(rp.ok,'t report hvh '+(rp.error||''))}
      else if(hs.length===1){const tk=hs[0].owner==='alice'?ta:tb;const p=await call('tourney',{op:'play',code:tc,mid:m.id},tk);const rp=await call('tourney',{op:'report',code:tc,mid:m.id,moves:playSide(p,true)},tk);ok(rp.ok,'t report vs cpu '+(rp.error||''))}
    }
  }
  tg=(await call('tourney',{op:'get',code:tc},ta)).T;ok(tg.phase==='done','tourney done champ '+(tg.ent.find(e=>e.id===tg.champ)||{}).name);
  const me2=await call('auth',{op:'me'},tb);console.log('bob hist',me2.hist.map(h=>h.kind+':'+(h.place||h.lname)));
  // draft-mode tourney: snake draft with a cap, humans pick, CPUs auto-pick
  const DR=require('./lib/draft.js');
  r=await call('tourney',{op:'create',cfg:{teamMode:'draft',cap:325,max:64}},ta);const c3=r.code;
  await call('tourney',{op:'join',code:c3},ta);await call('tourney',{op:'join',code:c3},tb);await call('tourney',{op:'addcpu',code:c3,n:2},ta);
  ok((await call('tourney',{op:'start',code:c3},ta)).error,'start blocked until the draft is done');
  ok((await call('tourney',{op:'startdraft',code:c3},tb)).error,'only the manager starts the draft');
  ok((await call('tourney',{op:'startdraft',code:c3},ta)).ok,'draft started');
  let tt=(await call('tourney',{op:'get',code:c3},ta)).T;ok(tt.phase==='drafting'&&tt.cfg.cap===325&&tt.cfg.max===16,'drafting, cap kept, max clamped to 16');
  let guard=0;
  while(tt.phase==='drafting'&&guard++<60){
    const d=tt.dr.d,t=DR.onClock(d),ent=tt.ent.find(e=>e.id===tt.dr.order[t]);
    const tok=ent.owner==='alice'?ta:tb; const other=ent.owner==='alice'?tb:ta;
    const cid=DR.cpuPick(d,t);
    if(guard===1){ok((await call('tourney',{op:'dpick',code:c3,id:cid},other)).error,'not your turn rejected')}
    const taken=Object.keys(DR.taken(d))[0]; if(taken&&guard===2)ok((await call('tourney',{op:'dpick',code:c3,id:taken},tok)).error==='taken','duplicate player rejected');
    const rr=await call('tourney',{op:'dpick',code:c3,id:cid},tok);if(!rr.ok){console.log('pick err',rr);break}
    tt=(await call('tourney',{op:'get',code:c3},ta)).T;
  }
  ok(tt.phase==='setup'&&tt.drafted&&tt.ent.every(e=>e.squad),'draft finished, everyone has a squad');
  const seen={};let uniq=true;tt.dr.d.picks.forEach(p=>{if(seen[p.id])uniq=false;seen[p.id]=1});ok(uniq&&tt.dr.d.picks.length===44,'44 unique picks');
  ok(tt.ent.every((e,i)=>DR.spent(DR.teamIds(tt.dr.d,tt.dr.order.indexOf(e.id)))<=325+1e-6),'every team under the cap');
  ok((await call('tourney',{op:'start',code:c3},ta)).ok,'tournament starts after the draft');
  // quick room with a salary cap
  const ra=await call('room',{op:'create',pid:'pa',name:'Ann',cap:295});ok(ra.code&&ra.seat==='a','room created');
  ok(!(await call('room',{op:'state',code:ra.code})).dr,'no draft until the second player joins');
  const rb=await call('room',{op:'join',code:ra.code,pid:'pb',name:'Ben'});ok(rb.seat==='b','second player joined');
  let st=await call('room',{op:'state',code:ra.code});ok(st.dr&&st.dr.cap===295&&st.dr.picks.length===0,'draft created with cap');
  const who=t=>t===0?{pid:'pa',seat:'a'}:{pid:'pb',seat:'b'};
  const first=DR.onClock(st.dr),sec=1-first;
  const c1=DR.cpuPick(st.dr,first);
  ok((await call('room',Object.assign({op:'pick',code:ra.code,id:c1},who(sec)))).error==='turn','wrong player cannot pick');
  ok((await call('room',Object.assign({op:'pick',code:ra.code,id:c1},who(first)))).dr.picks.length===1,'first pick');
  ok((await call('room',Object.assign({op:'pick',code:ra.code,id:c1},who(sec)))).error==='taken','cannot take the same player');
  guard=0;while(guard++<40){st=await call('room',{op:'state',code:ra.code});if(DR.isDone(st.dr))break;const t=DR.onClock(st.dr);const rr=await call('room',Object.assign({op:'pick',code:ra.code,id:DR.cpuPick(st.dr,t)},who(t)));if(rr.error){console.log('room pick err',rr);break}}
  st=await call('room',{op:'state',code:ra.code});
  ok(DR.isDone(st.dr)&&st.seats.a.status==='ready'&&st.seats.b.status==='ready'&&E.validRoster(st.seats.a.roster)&&E.validRoster(st.seats.b.roster),'room draft completes into ready seats');
  ok(DR.spent(DR.teamIds(st.dr,0))<=295+1e-6&&DR.spent(DR.teamIds(st.dr,1))<=295+1e-6,'room teams under the cap');
  // custom league draft with a cap
  const lc=await call('league',{op:'create',cfg:{name:'CapL',entry:'draft',cap:300,rounds:21,cpus:true}},ta);ok(lc.code,'cap league');
  await call('league',{op:'join',code:lc.code},tb);await call('league',{op:'claim',code:lc.code,name:'Aces'},ta);await call('league',{op:'claim',code:lc.code,name:'Bees'},tb);
  await call('league',{op:'addcpu',code:lc.code,n:2},ta);
  const sl=await call('league',{op:'start',code:lc.code},ta);ok(sl.ok,'cap league starts '+(sl.error||''));
  await call('league',{op:'draftauto',code:lc.code,all:true,on:true},ta);
  await call('league',{op:'draftskip',code:lc.code},ta);
  const lg=(await call('league',{op:'get',code:lc.code},ta));const LL=lg.L;
  ok(LL&&(LL.phase!=='draft'||(LL.draft&&LL.draft.cap===300)),'league draft carries the cap, phase '+(LL&&LL.phase));
  const dd=(LL.draft||{});const over=Object.values(dd.spent||{}).filter(x=>x>300+1e-6);ok(!over.length,'no league team over the cap '+JSON.stringify(dd.spent||{}));
})();
