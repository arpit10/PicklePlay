const FORMATS = [
  {id:'rr-rotating', icon:'🔄', name:'Round Robin', desc:'Changing partners each round with balanced rotations.', tag:'INDIVIDUAL'},
  {id:'rr-fixed', icon:'🤝', name:'Fixed Partners', desc:'Teams stay together and play a team round robin.', tag:'TEAM'},
  {id:'kings', icon:'👑', name:"King / Queen Court", desc:'Winners move up, losers move down. Choose Challenge or Split each round.', tag:'LIVE'},
  {id:'scramble', icon:'⚖️', name:'Balanced Scramble', desc:'Uses DUPR when available to create balanced games.', tag:'SMART'},
  {id:'shootout', icon:'🔥', name:'Shootout', desc:'Two-game stages with individual promotion and relegation.', tag:'COMPETITIVE'},
  {id:'random', icon:'🎲', name:'Random Mixer', desc:'Fast random partners and opponents with repeat avoidance.', tag:'CASUAL'}
];

const state = {
  players: [], selectedFormat:'rr-rotating', courts:2, pointsTo:11, scoringMode:'traditional', rounds:7, tieBreak:'diff',
  schedule:[], currentRound:0, standings:{}, fixedTeams:[], courtChoice:'auto', kingTitle:'king', shootoutSeedOrder:[],
  cloud:{client:null,sessionId:null,owner:false,viewer:false,pollTimer:null,lastUpdated:null}
};

const $ = s=>document.querySelector(s);
const $$ = s=>[...document.querySelectorAll(s)];

function init(){
  renderFormats();
  renderKingNamingOptions();
  let saved = null;
  try { saved = localStorage.getItem('pickleplay_players'); } catch(e) {}
  if(saved){ try { state.players = JSON.parse(saved); } catch(e){} }
  if(!state.players.length) state.players = [{name:'',dupr:''},{name:'',dupr:''},{name:'',dupr:''},{name:'',dupr:''}];
  renderPlayers();
  bind();
  updateCourtOptions();
  updateSetupHints();
  initCloudSharing();
}

function bind(){
  $('#addPlayer').onclick=()=>{state.players.push({name:'',dupr:''});renderPlayers();updateCourtOptions();renderFormatNote()};
  $('#samplePlayers').onclick=()=>{state.players=['Arpit','Jatin','Paras','Avit','Bhavi','Richa','Ashu','Jay'].map((n,i)=>({name:n,dupr:[3.82,4.05,3.61,3.95,3.5,3.68,3.76,3.58][i]}));renderPlayers();updateCourtOptions();renderFormatNote()};
  $('#clearPlayers').onclick=()=>{state.players=[{name:'',dupr:''},{name:'',dupr:''},{name:'',dupr:''},{name:'',dupr:''}];renderPlayers();updateCourtOptions();renderFormatNote()};
  $('#startTournament').onclick=startTournament;
  $('#editSetup').onclick=()=>showScreen('setup');
  $('#prevRound').onclick=()=>changeRound(-1);
  $('#nextRound').onclick=()=>changeRound(1);
  $('#courtCount').onchange=e=>{state.courtChoice=e.target.value;updateCourtHint()};
  $('#pointsTo').onchange=updateSetupHints;
  $('#scoringMode').onchange=updateSetupHints;
  $('#completeRound').onclick=()=>{
    saveScoresFromUI();
    const err=$('#roundActionError'); if(err) err.textContent='';
    const rd=state.schedule[state.currentRound];
    const complete=rd.games.every(g=>Number.isFinite(g.score1)&&Number.isFinite(g.score2)&&g.score1!==g.score2);
    if(!complete){ if(err) err.textContent='Enter a non-tied score for every court before continuing.'; return; }

    const isDynamic = state.selectedFormat==='kings' || state.selectedFormat==='shootout';
    if(isDynamic && state.currentRound===state.schedule.length-1 && state.schedule.length<state.rounds){
      const next = state.selectedFormat==='kings' ? generateNextKingsRound() : generateNextShootoutRound();
      if(next) state.schedule.push(next);
    }

    if(state.currentRound<state.schedule.length-1){
      state.currentRound++;
      renderRound();
    } else {
      const btn=$('#completeRound');
      btn.textContent='Scores saved ✓';
      btn.classList.add('saved');
      setTimeout(()=>{btn.classList.remove('saved');updateRoundActionButton()},1200);
    }
    renderStandings();
    syncCloudSession();
  };
  $('#resetApp').onclick=()=>{ if(confirm('Reset this session?')) location.reload(); };
  $('#copyResults').onclick=copyResults;
  if($('#shareSession')) $('#shareSession').onclick=shareLiveSession;
  if($('#closeSharePanel')) $('#closeSharePanel').onclick=()=>$('#sharePanel').classList.remove('visible');
  if($('#copyShareLink')) $('#copyShareLink').onclick=copyShareLink;
  if($('#refreshShare')) $('#refreshShare').onclick=()=>syncCloudSession(true);
  $$('.tab').forEach(t=>t.onclick=()=>switchTab(t.dataset.tab));
  $$('[data-king-title]').forEach(b=>b.onclick=()=>{state.kingTitle=b.dataset.kingTitle;renderKingNamingOptions();});
}

function renderFormats(){
  const grid=$('#formatGrid'); grid.innerHTML='';
  FORMATS.forEach(f=>{
    const b=document.createElement('button'); b.className='format-card'+(f.id===state.selectedFormat?' selected':'');
    b.innerHTML=`<div class="format-icon">${f.icon}</div><h4>${f.name}</h4><p>${f.desc}</p><span class="tag">${f.tag}</span>`;
    b.onclick=()=>{state.selectedFormat=f.id;renderFormats();renderKingNamingOptions();updateSetupHints()}; grid.appendChild(b);
  });
  renderFormatNote();
}


function renderKingNamingOptions(){
  const panel=$('#kingNamingOptions');
  if(!panel) return;
  const show=state.selectedFormat==='kings';
  panel.classList.toggle('visible',show);
  $$('[data-king-title]').forEach(b=>b.classList.toggle('selected',b.dataset.kingTitle===state.kingTitle));
}
function kingWords(){
  if(state.kingTitle==='queen') return {session:"Queen's Court",court:'QUEEN COURT',result:'Queen of the Court',plural:'Queens of the Court'};
  if(state.kingTitle==='royal') return {session:'Royal Court',court:'ROYAL COURT',result:'Royal Court Champions',plural:'Royal Court Champions'};
  return {session:"King's Court",court:'KING COURT',result:'King of the Court',plural:'Kings of the Court'};
}

function renderFormatNote(){
  const note=$('#formatNote');
  if(!note) return;
  if(state.selectedFormat!=='shootout'){note.className='format-note';note.innerHTML='';return;}
  const count=activePlayerCount();
  note.className='format-note visible '+(count<12?'warning':'good');
  const sizeCopy=count<12
    ? `With ${count} player${count===1?'':'s'}, promotion groups can become repetitive. 12+ works better and 16+ is ideal.`
    : count<16
      ? `${count} players works well, although some repeat opponents are still likely.`
      : `${count} players gives plenty of movement between court levels.`;
  note.innerHTML=`<strong>Shootout = 2 games per stage</strong><p>${sizeCopy} Each court plays two games with a partner change, then the top 2 individuals stay/move up and the bottom 2 stay/move down. <strong>Because stages can run long, we recommend rally scoring or games to 7.</strong></p>`;
}

function updateSetupHints(){
  const label=$('#roundCountLabel');
  if(label) label.textContent=state.selectedFormat==='shootout'?'Stages':'Rounds';
  const hint=$('#scoringHint');
  if(hint){
    if(state.selectedFormat==='shootout') hint.textContent='Shootout recommendation: rally scoring or first to 7 keeps two-game stages moving.';
    else hint.textContent='Choose the scoring method your group will use on court.';
  }
}

function renderPlayers(){
  const list=$('#playerList'); list.innerHTML=''; const tpl=$('#playerRowTemplate');
  state.players.forEach((p,i)=>{
    const node=tpl.content.cloneNode(true); const row=node.querySelector('.player-row');
    row.querySelector('.avatar').textContent = p.name ? initials(p.name) : (i+1);
    const name=row.querySelector('.name-input'); name.value=p.name||'';
    name.oninput=e=>{state.players[i].name=e.target.value; row.querySelector('.avatar').textContent=e.target.value?initials(e.target.value):(i+1); savePlayerDraft(); updateCourtOptions(); renderFormatNote()};
    const dupr=row.querySelector('.dupr-input'); dupr.value=p.dupr||''; dupr.oninput=e=>{state.players[i].dupr=e.target.value;savePlayerDraft()};
    row.querySelector('.remove-player').onclick=()=>{if(state.players.length>4){state.players.splice(i,1);renderPlayers();updateCourtOptions();renderFormatNote()}};
    list.appendChild(node);
  });
}
function savePlayerDraft(){try{localStorage.setItem('pickleplay_players',JSON.stringify(state.players))}catch(e){}}
function activePlayerCount(){ return state.players.filter(p=>(p.name||'').trim()).length || state.players.length; }
function updateCourtOptions(){
  const sel=$('#courtCount'); if(!sel) return;
  const count=Math.max(4,activePlayerCount());
  const maxCourts=Math.max(1,Math.floor(count/4));
  const previous=state.courtChoice||sel.value||'auto';
  sel.innerHTML='';
  const auto=document.createElement('option'); auto.value='auto'; auto.textContent=`Auto (${maxCourts} court${maxCourts>1?'s':''})`; sel.appendChild(auto);
  for(let i=1;i<=maxCourts;i++){
    const o=document.createElement('option'); o.value=String(i); o.textContent=`${i} court${i>1?'s':''}`; sel.appendChild(o);
  }
  sel.value=[...sel.options].some(o=>o.value===previous)?previous:'auto';
  state.courtChoice=sel.value;
  updateCourtHint();
}
function updateCourtHint(){
  const hint=$('#courtHint'); if(!hint) return;
  const count=Math.max(4,activePlayerCount());
  const maxCourts=Math.max(1,Math.floor(count/4));
  const val=$('#courtCount')?.value||'auto';
  if(val==='auto') hint.textContent=`Auto uses ${maxCourts} court${maxCourts>1?'s':''} for ${count} player${count===1?'':'s'}. Choose fewer only if fewer courts are available.`;
  else {
    const c=Number(val); const sit=Math.max(0,count-c*4);
    hint.textContent=`Using ${c} court${c>1?'s':''}${sit?` • ${sit} player${sit>1?'s':''} will sit each round`:''}.`;
  }
}
function initials(n){return n.trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()}

function startTournament(){
  state.players=state.players.map((p,i)=>({id:'p'+i,name:(p.name||'').trim(),dupr:p.dupr===''?null:Number(p.dupr)})).filter(p=>p.name);
  const courtValue=$('#courtCount').value;
  const autoCourts=Math.max(1,Math.floor(state.players.length/4));
  state.courts=courtValue==='auto'?autoCourts:Number(courtValue);
  state.pointsTo=Number($('#pointsTo').value);
  state.scoringMode=$('#scoringMode')?.value||'traditional';
  state.rounds=Math.max(1,Number($('#roundCount').value)||1);
  state.tieBreak=$('#tieBreak').value;
  const err=$('#setupError'); err.textContent='';
  if(state.players.length<4){err.textContent='Add at least 4 players.'; return}
  if(state.selectedFormat==='rr-fixed' && state.players.length%2!==0){err.textContent='Fixed partners currently needs an even number of players.';return}
  if(state.courts*4>state.players.length) state.courts=Math.max(1,Math.floor(state.players.length/4));
  initializeStandings();
  state.schedule = generateSchedule(); state.currentRound=0;
  if(!state.schedule.length){err.textContent='Could not generate games for this setup.';return}
  $('#formatBadge').textContent=FORMATS.find(f=>f.id===state.selectedFormat).tag;
  $('#sessionTitle').textContent=state.selectedFormat==='kings'?kingWords().session:FORMATS.find(f=>f.id===state.selectedFormat).name;
  const scoringText=state.scoringMode==='rally'?'Rally scoring':'Traditional scoring';
  $('#sessionMeta').textContent=`${state.players.length} players • ${state.courts} court${state.courts>1?'s':''} • ${scoringText} • First to ${state.pointsTo}`;
  const resultsTabBtn=document.querySelector('.tab[data-tab="results"]');
  if(resultsTabBtn) resultsTabBtn.textContent=state.selectedFormat==='kings'?kingWords().result:'Results';
  showScreen('tournament'); switchTab('games'); renderRound(); renderStandings();
  syncCloudSession();
}

function initializeStandings(){ state.standings={}; state.players.forEach(p=>state.standings[p.id]={id:p.id,name:p.name,w:0,l:0,pf:0,pa:0,g:0,streak:0,bestStreak:0,currentCourt:null,currentRank:null}); }

function generateSchedule(){
  if(state.selectedFormat==='rr-fixed') return generateFixedRoundRobin();
  if(state.selectedFormat==='kings') return [generateInitialDynamicRound('kings')];
  if(state.selectedFormat==='scramble') return generateRotating(true,false);
  if(state.selectedFormat==='shootout') return [generateInitialDynamicRound('shootout')];
  if(state.selectedFormat==='random') return generateRotating(false,false,true);
  return generateRotating(false,false);
}

function generateRotating(useDupr=false, shootout=false, random=false){
  const rounds=[]; const partnerCount={}; const opponentCount={}; const byeCount={};
  state.players.forEach(p=>byeCount[p.id]=0);
  for(let r=0;r<state.rounds;r++){
    let pool=[...state.players];
    if(shootout && r>1){pool.sort((a,b)=>scoreForStandings(b.id)-scoreForStandings(a.id));}
    else if(useDupr){pool.sort((a,b)=>(b.dupr||3.5)-(a.dupr||3.5)); if(r%2) pool=rotate(pool,r%pool.length);}
    else shuffle(pool);

    const playCount=Math.min(state.courts*4, Math.floor(pool.length/4)*4);
    const sittingCount=pool.length-playCount;
    let sitters=[];
    if(sittingCount>0){
      pool.sort((a,b)=>byeCount[a.id]-byeCount[b.id]+(Math.random()-.5)*.2);
      sitters=pool.slice(0,sittingCount); sitters.forEach(p=>byeCount[p.id]++); pool=pool.slice(sittingCount); if(!shootout&&!useDupr) shuffle(pool);
    }
    const games=[];
    // Calculate the number of games before removing players from the pool.
    // Recomputing Math.floor(pool.length / 4) inside the loop caused the
    // available-court count to shrink after Court 1 was created.
    const gamesThisRound=Math.min(state.courts,Math.floor(pool.length/4));
    for(let c=0;c<gamesThisRound;c++){
      let group=pool.splice(0,4);
      let pairing = chooseBestPairing(group,partnerCount,opponentCount,useDupr);
      games.push({court:c+1,team1:pairing[0],team2:pairing[1],score1:null,score2:null,complete:false});
      recordPairCounts(pairing,partnerCount,opponentCount);
    }
    rounds.push({round:r+1,games,sitters:sitters.map(p=>p.id)});
  }
  return rounds;
}

function chooseBestPairing(g,pc,oc,useDupr){
  const opts=[[[g[0],g[1]],[g[2],g[3]]],[[g[0],g[2]],[g[1],g[3]]],[[g[0],g[3]],[g[1],g[2]]]];
  return opts.map(o=>({o,pen:pairPenalty(o,pc,oc,useDupr)})).sort((a,b)=>a.pen-b.pen)[0].o;
}
function pairPenalty(o,pc,oc,useDupr){
  let pen=0; const [a,b]=o;
  pen += 6*(pc[key(a[0].id,a[1].id)]||0)+6*(pc[key(b[0].id,b[1].id)]||0);
  for(const x of a) for(const y of b) pen += (oc[key(x.id,y.id)]||0);
  if(useDupr){const s1=(a[0].dupr||3.5)+(a[1].dupr||3.5),s2=(b[0].dupr||3.5)+(b[1].dupr||3.5);pen+=Math.abs(s1-s2)*4}
  return pen;
}
function recordPairCounts(o,pc,oc){const[a,b]=o; pc[key(a[0].id,a[1].id)]=(pc[key(a[0].id,a[1].id)]||0)+1;pc[key(b[0].id,b[1].id)]=(pc[key(b[0].id,b[1].id)]||0)+1;for(const x of a)for(const y of b)oc[key(x.id,y.id)]=(oc[key(x.id,y.id)]||0)+1}
function key(a,b){return[a,b].sort().join('|')}
function rotate(a,n){return a.slice(n).concat(a.slice(0,n))}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function generateFixedRoundRobin(){
  const ps=[...state.players]; state.fixedTeams=[];
  for(let i=0;i<ps.length;i+=2) state.fixedTeams.push([ps[i],ps[i+1]]);
  let teams=[...state.fixedTeams]; if(teams.length%2) teams.push(null);
  const rounds=[]; const n=teams.length;
  for(let r=0;r<Math.min(state.rounds,n-1);r++){
    const games=[]; const sitters=[];
    for(let i=0;i<n/2;i++){
      const a=teams[i],b=teams[n-1-i];
      if(a&&b&&games.length<state.courts) games.push({court:games.length+1,team1:a,team2:b,score1:null,score2:null,complete:false});
      else {if(a) sitters.push(...a.map(p=>p.id)); if(b) sitters.push(...b.map(p=>p.id));}
    }
    rounds.push({round:r+1,games,sitters}); teams=[teams[0],teams[n-1],...teams.slice(1,n-1)];
  }
  return rounds;
}

function generateInitialDynamicRound(kind){
  let all=[...state.players];
  const playCount=Math.min(state.courts*4,Math.floor(all.length/4)*4);
  if(kind==='shootout'){
    const anyDupr=all.some(p=>Number.isFinite(p.dupr));
    if(anyDupr) all.sort((a,b)=>(b.dupr??-1)-(a.dupr??-1) || a.name.localeCompare(b.name));
    else shuffle(all);
    state.shootoutSeedOrder=all.map(p=>p.id);
  } else shuffle(all);
  const playing=all.slice(0,playCount), sitters=all.slice(playCount).map(p=>p.id);
  const games=[];
  const rankSnapshot={};
  all.forEach((p,i)=>rankSnapshot[p.id]=i+1);
  for(let c=0;c<state.courts && playing.length>=4;c++){
    const group=playing.splice(0,4);
    if(kind==='shootout'){
      games.push(...makeShootoutStageGames(group,c+1,[group.slice(0,2),group.slice(2,4)]));
    }else{
      const pairing=chooseBestPairing(group,{}, {}, false);
      games.push({court:c+1,team1:pairing[0],team2:pairing[1],score1:null,score2:null,complete:false});
    }
  }
  return {round:1,games,sitters,kingMode:'challenge',rankSnapshot};
}

function makeShootoutStageGames(group,court,sourcePairs){
  const a=sourcePairs?.[0]||group.slice(0,2), b=sourcePairs?.[1]||group.slice(2,4);
  if(a.length!==2||b.length!==2) return [];
  return [
    {court,gameInStage:1,team1:[a[0],b[0]],team2:[a[1],b[1]],score1:null,score2:null,complete:false},
    {court,gameInStage:2,team1:[a[0],b[1]],team2:[a[1],b[0]],score1:null,score2:null,complete:false}
  ];
}

function shootoutCourtResults(rd){
  const byCourt={};
  rd.games.forEach(g=>{
    if(!byCourt[g.court]) byCourt[g.court]={};
    [...g.team1,...g.team2].forEach(p=>{if(!byCourt[g.court][p.id])byCourt[g.court][p.id]={player:p,pf:0,pa:0,w:0};});
    if(!Number.isFinite(g.score1)||!Number.isFinite(g.score2)||g.score1===g.score2) return;
    const t1win=g.score1>g.score2;
    g.team1.forEach(p=>{const x=byCourt[g.court][p.id];x.pf+=g.score1;x.pa+=g.score2;if(t1win)x.w++;});
    g.team2.forEach(p=>{const x=byCourt[g.court][p.id];x.pf+=g.score2;x.pa+=g.score1;if(!t1win)x.w++;});
  });
  const out={};
  Object.entries(byCourt).forEach(([court,map])=>{
    out[Number(court)]=Object.values(map).sort((a,b)=>b.pf-a.pf || (b.pf-b.pa)-(a.pf-a.pa) || b.w-a.w || (rd.rankSnapshot?.[a.player.id]||999)-(rd.rankSnapshot?.[b.player.id]||999));
  });
  return out;
}

function latestShootoutRanks(){
  const latest=state.schedule[state.currentRound]||state.schedule.at(-1);
  return latest?.rankSnapshot||{};
}

function sortedShootoutStandings(){
  const ranks=latestShootoutRanks();
  return Object.values(state.standings).sort((a,b)=>(ranks[a.id]||999)-(ranks[b.id]||999) || b.pf-a.pf || ((b.pf-b.pa)-(a.pf-a.pa)) || a.name.localeCompare(b.name));
}
function currentShootoutRanks(){const ranks=latestShootoutRanks(); return {...ranks};}

function generateNextShootoutRound(){
  const prev=state.schedule.at(-1);
  if(!prev) return null;
  const results=shootoutCourtResults(prev);
  const courtCount=Math.max(...Object.keys(results).map(Number));
  if(!courtCount) return null;
  const top={}, bottom={};
  for(let c=1;c<=courtCount;c++){
    const ranked=results[c]||[];
    if(ranked.length<4) return null;
    top[c]=ranked.slice(0,2).map(x=>x.player);
    bottom[c]=ranked.slice(2,4).map(x=>x.player);
  }
  const groups=[];
  if(courtCount===1){groups.push({players:[...top[1],...bottom[1]],sources:[top[1],bottom[1]]});}
  else{
    groups.push({players:[...top[1],...top[2]],sources:[top[1],top[2]]});
    for(let c=2;c<courtCount;c++) groups.push({players:[...bottom[c-1],...top[c+1]],sources:[bottom[c-1],top[c+1]]});
    groups.push({players:[...bottom[courtCount-1],...bottom[courtCount]],sources:[bottom[courtCount-1],bottom[courtCount]]});
  }

  // Rotate resting players back through the lowest court when capacity is limited.
  let sitters=(prev.sitters||[]).map(player).filter(Boolean);
  if(sitters.length && groups.length){
    const last=groups[groups.length-1];
    const incoming=sitters.slice(0,Math.min(sitters.length,2));
    const leaving=last.players.slice(-incoming.length);
    if(incoming.length){
      last.players=[...last.players.slice(0,4-incoming.length),...incoming];
      last.sources=[last.players.slice(0,2),last.players.slice(2,4)];
      sitters=[...leaving,...sitters.slice(incoming.length)];
    }
  }

  const games=[]; const rankSnapshot={};
  let rank=1;
  groups.forEach((g,i)=>{
    // Within each court, display order follows previous stage performance where possible.
    const prevScores=shootoutCourtResults(prev);
    g.players.sort((a,b)=>{
      const sa=Object.values(prevScores).flat().find(x=>x.player.id===a.id);
      const sb=Object.values(prevScores).flat().find(x=>x.player.id===b.id);
      return (sb?.pf||0)-(sa?.pf||0) || a.name.localeCompare(b.name);
    });
    g.players.forEach(p=>rankSnapshot[p.id]=rank++);
    // Preserve the two source pairs after sorting by rebuilding from original membership.
    const sourceA=g.sources[0].filter(p=>g.players.some(x=>x.id===p.id));
    const sourceB=g.sources[1].filter(p=>g.players.some(x=>x.id===p.id));
    const validSources=(sourceA.length===2&&sourceB.length===2)?[sourceA,sourceB]:[g.players.slice(0,2),g.players.slice(2,4)];
    games.push(...makeShootoutStageGames(g.players,i+1,validSources));
  });
  const sittingIds=sitters.map(p=>p.id);
  state.players.filter(p=>!rankSnapshot[p.id]&&!sittingIds.includes(p.id)).forEach(p=>sittingIds.push(p.id));
  return {round:state.schedule.length+1,games,sitters:sittingIds,rankSnapshot};
}

function buildPartnerCounts(){
  const pc={};
  state.schedule.forEach(r=>r.games.forEach(g=>{
    [g.team1,g.team2].forEach(t=>pc[key(t[0].id,t[1].id)]=(pc[key(t[0].id,t[1].id)]||0)+1);
  }));
  return pc;
}
function buildOpponentCounts(){
  const oc={};
  state.schedule.forEach(r=>r.games.forEach(g=>{
    for(const x of g.team1) for(const y of g.team2) oc[key(x.id,y.id)]=(oc[key(x.id,y.id)]||0)+1;
  }));
  return oc;
}

function generateNextKingsRound(){
  const prev=state.schedule.at(-1);
  if(!prev || !prev.games.length) return null;
  const roundNo=state.schedule.length+1;
  const outcomes=prev.games.map(g=>({
    winners:g.score1>g.score2?[...g.team1]:[...g.team2],
    losers:g.score1>g.score2?[...g.team2]:[...g.team1]
  }));
  const games=[];
  for(let c=0;c<outcomes.length;c++){
    let pairA,pairB;
    if(outcomes.length===1){ pairA=outcomes[0].winners; pairB=outcomes[0].losers; }
    else if(c===0){ pairA=outcomes[0].winners; pairB=outcomes[1].winners; }
    else if(c===outcomes.length-1){ pairA=outcomes[c-1].losers; pairB=outcomes[c].losers; }
    else { pairA=outcomes[c+1].winners; pairB=outcomes[c-1].losers; }
    if(pairA&&pairB) games.push({court:c+1,team1:[...pairA],team2:[...pairB],score1:null,score2:null,complete:false});
  }

  // When there are sitters because fewer courts were chosen, rotate them onto the bottom court.
  const previousSitters=(prev.sitters||[]).map(player).filter(Boolean);
  let sitters=[];
  if(previousSitters.length && games.length){
    const bottom=games[games.length-1];
    const bottomPlayers=[...bottom.team1,...bottom.team2];
    const needed=Math.min(previousSitters.length,bottomPlayers.length);
    const entering=previousSitters.slice(0,needed);
    const leaving=bottomPlayers.slice(-needed);
    const nextBottom=[...bottomPlayers.slice(0,bottomPlayers.length-needed),...entering];
    if(nextBottom.length===4){ bottom.team1=[nextBottom[0],nextBottom[1]]; bottom.team2=[nextBottom[2],nextBottom[3]]; }
    sitters=leaving.map(p=>p.id);
    const leftovers=previousSitters.slice(needed).map(p=>p.id); sitters.push(...leftovers);
  }
  const playingIds=new Set(games.flatMap(g=>[...g.team1,...g.team2].map(p=>p.id)));
  state.players.forEach(p=>{if(!playingIds.has(p.id)&&!sitters.includes(p.id))sitters.push(p.id)});
  return {round:roundNo,games,sitters,kingMode:'challenge'};
}

function scoreForStandings(id){const s=state.standings[id];return s.w*100+(s.pf-s.pa)}

function showScreen(which){$('#setupScreen').classList.toggle('active',which==='setup');$('#tournamentScreen').classList.toggle('active',which==='tournament')}
function switchTab(name){$$('.tab').forEach(t=>t.classList.toggle('active',t.dataset.tab===name));$$('.tab-panel').forEach(p=>p.classList.remove('active'));const panel=$('#'+name+'Tab');if(panel) panel.classList.add('active');if(name==='standings')renderStandings();if(name==='results')renderResults()}

function renderRound(){
  const rd=state.schedule[state.currentRound];
  const dynamic=state.selectedFormat==='kings'||state.selectedFormat==='shootout';
  $('#roundTypeLabel').textContent=state.selectedFormat==='shootout'?'STAGE':'ROUND';
  $('#roundLabel').textContent=`${state.currentRound+1} / ${dynamic?state.rounds:state.schedule.length}`;
  $('#prevRound').disabled=state.currentRound===0;$('#nextRound').disabled=state.currentRound===state.schedule.length-1;
  $('#roundSummary').textContent='';
  const list=$('#gamesList');list.innerHTML='';
  if(rd.sitters.length){
    const rest=document.createElement('div'); rest.className='resting-card';
    rest.innerHTML=`<div class="resting-icon">⏸️</div><div class="resting-copy"><strong>RESTING THIS ${state.selectedFormat==='shootout'?'STAGE':'ROUND'}</strong><div class="resting-names">${rd.sitters.map(id=>player(id)?.name||'Unknown').join(' • ')}</div><small>These players sit out and rotate back in according to the format.</small></div>`;
    list.appendChild(rest);
  } else {
    const all=document.createElement('div'); all.className='all-playing-card'; all.innerHTML=`<span>✓</span><span>Everyone is playing this ${state.selectedFormat==='shootout'?'stage':'round'}</span>`; list.appendChild(all);
  }
  rd.games.forEach((g,i)=>{
    const d=document.createElement('div');d.className='game-card';
    const kingCourtSuffix=state.selectedFormat==='kings'&&g.court===1?` • ${kingWords().court}`:'';
    const rankName=p=>state.selectedFormat==='shootout'?`<span class="rank-chip">#${rd.rankSnapshot?.[p.id]||'—'}</span>${p.name}`:p.name;
    const shootoutLabel=state.selectedFormat==='shootout'?`<span class="game-stage-label">GAME ${g.gameInStage} OF 2</span>`:'';
    d.innerHTML=`<div class="game-top"><span class="court-label">COURT ${g.court}${kingCourtSuffix}</span><span class="game-status">${shootoutLabel}${g.complete?'FINAL':'ENTER SCORE'}</span></div>
    <div class="teams"><div class="team"><strong>${g.team1.map(rankName).join(' / ')}</strong><small>${teamRating(g.team1)}</small></div><div class="vs">VS</div><div class="team"><strong>${g.team2.map(rankName).join(' / ')}</strong><small>${teamRating(g.team2)}</small></div></div>
    <div class="score-row"><input class="score-input" data-game="${i}" data-side="1" type="number" min="0" max="99" value="${g.score1??''}"><span>—</span><input class="score-input" data-game="${i}" data-side="2" type="number" min="0" max="99" value="${g.score2??''}"></div>`;
    list.appendChild(d);
    if(state.selectedFormat==='shootout' && g.gameInStage===2){
      const stage=shootoutCourtResults(rd)[g.court]||[];
      if(stage.length===4 && rd.games.filter(x=>x.court===g.court).every(x=>x.complete)){
        const summary=document.createElement('div'); summary.className='shootout-stage-summary';
        summary.innerHTML=`<strong>Court ${g.court} stage totals</strong><div>${stage.map((x,j)=>`${j+1}. ${x.player.name} — ${x.pf} pts ${j<2?'↑':'↓'}`).join(' &nbsp; • &nbsp; ')}</div>`;
        list.appendChild(summary);
      }
    }
  });
  $$('.score-input').forEach(inp=>inp.onchange=saveScoresFromUI);
  renderKingRoundChoice(); updateRoundActionButton();
}
function renderKingRoundChoice(){
  const panel=$('#kingRoundChoice');
  if(!panel) return;
  const rd=state.schedule[state.currentRound];
  const show=state.selectedFormat==='kings' && state.currentRound>0 && rd.games.length>0;
  panel.classList.toggle('visible',show);
  if(!show) return;
  const heading=panel.querySelector('h4'); if(heading) heading.textContent=`This round: ${kingWords().court.replace(' COURT',' Court')}`;
  const mode=rd.kingMode||'challenge';
  $$('[data-round-king-mode]').forEach(b=>{
    b.classList.toggle('selected',b.dataset.roundKingMode===mode);
    b.onclick=()=>{
      if(rd.kingMode===b.dataset.roundKingMode) return;
      setKingModeForCurrentRound(rd,b.dataset.roundKingMode);
      renderRound();
    };
  });
}
function setKingModeForCurrentRound(rd,mode){
  const g=rd.games[0]; if(!g) return;
  if(!rd.kingBase) rd.kingBase={team1:[...g.team1],team2:[...g.team2]};
  const base=rd.kingBase;
  rd.kingMode=mode;
  if(mode==='split'){
    g.team1=[base.team1[0],base.team2[0]];
    g.team2=[base.team1[1],base.team2[1]];
  } else {
    g.team1=[...base.team1]; g.team2=[...base.team2];
  }
  g.score1=null; g.score2=null; g.complete=false;
  syncCloudSession();
}

function updateRoundActionButton(){
  const btn=$('#completeRound');
  if(!btn) return;
  const dynamic=state.selectedFormat==='kings'||state.selectedFormat==='shootout';
  const isLast=dynamic ? (state.currentRound===state.rounds-1) : (state.currentRound===state.schedule.length-1);
  btn.textContent=isLast?'Save scores':'Save scores & next round';
  btn.classList.remove('saved');
}
function teamRating(team){const vals=team.map(p=>p.dupr).filter(Boolean);return vals.length?`Avg DUPR ${(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(2)}`:'DUPR not set'}
function changeRound(delta){saveScoresFromUI();state.currentRound=Math.max(0,Math.min(state.schedule.length-1,state.currentRound+delta));renderRound()}

function saveScoresFromUI(){
  const rd=state.schedule[state.currentRound];
  $$('.score-input').forEach(inp=>{const g=rd.games[Number(inp.dataset.game)];const val=inp.value===''?null:Number(inp.value);if(inp.dataset.side==='1')g.score1=val;else g.score2=val;});
  recomputeStandings(); renderStandings();
  rd.games.forEach(g=>g.complete=Number.isFinite(g.score1)&&Number.isFinite(g.score2)&&g.score1!==g.score2);
  syncCloudSession();
}

function recomputeStandings(){
  initializeStandings();
  state.schedule.forEach(rd=>rd.games.forEach(g=>{
    if(!Number.isFinite(g.score1)||!Number.isFinite(g.score2)||g.score1===g.score2)return;
    const t1win=g.score1>g.score2;
    [...g.team1,...g.team2].forEach(p=>{const s=state.standings[p.id];s.g++;});
    g.team1.forEach(p=>applyGame(p.id,t1win,g.score1,g.score2));g.team2.forEach(p=>applyGame(p.id,!t1win,g.score2,g.score1));
  }));
}
function applyGame(id,won,pf,pa){const s=state.standings[id];s.pf+=pf;s.pa+=pa;if(won){s.w++;s.streak++;s.bestStreak=Math.max(s.bestStreak,s.streak)}else{s.l++;s.streak=0}}
function sortedStandings(){if(state.selectedFormat==='shootout')return sortedShootoutStandings();return Object.values(state.standings).sort((a,b)=>b.w-a.w || ((state.tieBreak==='pf'?b.pf-a.pf:(b.pf-b.pa)-(a.pf-a.pa))) || b.pf-a.pf || a.name.localeCompare(b.name))}
function renderStandings(){
  const body=$('#standingsBody');if(!body)return;body.innerHTML='';
  const head=$('#standingsHead');
  if(head) head.innerHTML=state.selectedFormat==='shootout'?'<tr><th>#</th><th>Player</th><th>Court</th><th>W-L</th><th>PF</th><th>+/-</th><th>Win%</th></tr>':'<tr><th>#</th><th>Player</th><th>W-L</th><th>PF</th><th>PA</th><th>+/-</th><th>Win%</th></tr>';
  const ranks=latestShootoutRanks();
  sortedStandings().forEach((s,i)=>{
    const tr=document.createElement('tr');if(i===0)tr.className='rank1';
    if(state.selectedFormat==='shootout'){
      const rank=ranks[s.id]||i+1; const court=Math.ceil(rank/4);
      tr.innerHTML=`<td>${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td class="player-name-cell">${s.name}</td><td>Court ${court}</td><td>${s.w}-${s.l}</td><td>${s.pf}</td><td>${signed(s.pf-s.pa)}</td><td>${s.g?Math.round(s.w/s.g*100):0}%</td>`;
    }else{
      tr.innerHTML=`<td>${i<3?['🥇','🥈','🥉'][i]:i+1}</td><td class="player-name-cell">${s.name}</td><td>${s.w}-${s.l}</td><td>${s.pf}</td><td>${s.pa}</td><td>${signed(s.pf-s.pa)}</td><td>${s.g?Math.round(s.w/s.g*100):0}%</td>`;
    }
    body.appendChild(tr);
  });
}

function signed(n){return n>0?'+'+n:String(n)}
function player(id){return state.players.find(p=>p.id===id)}



function finalKingCourtWinner(){
  const completed=[...state.schedule].reverse().find(r=>r.games?.[0]&&Number.isFinite(r.games[0].score1)&&Number.isFinite(r.games[0].score2)&&r.games[0].score1!==r.games[0].score2);
  if(!completed) return null;
  const g=completed.games[0];
  const team=g.score1>g.score2?g.team1:g.team2;
  return {team,round:completed.round,score:g.score1>g.score2?`${g.score1}-${g.score2}`:`${g.score2}-${g.score1}`};
}
function topCourtPlayerWins(){
  const wins={}; state.players.forEach(p=>wins[p.id]=0);
  state.schedule.forEach(r=>{const g=r.games?.[0]; if(!g||!Number.isFinite(g.score1)||!Number.isFinite(g.score2)||g.score1===g.score2)return; const team=g.score1>g.score2?g.team1:g.team2; team.forEach(p=>wins[p.id]++);});
  return wins;
}
function renderResults(){
  recomputeStandings();const s=sortedStandings();
  const podium=$('#podium');
  if(state.selectedFormat==='kings'){
    const champ=finalKingCourtWinner(); const words=kingWords();
    if(!champ){
      podium.innerHTML=`<span class="eyebrow">${words.result.toUpperCase()}</span><h2>Complete a scored round to crown the winners</h2>`;
      $('#awards').innerHTML=''; return;
    }
    const wins=topCourtPlayerWins();
    podium.innerHTML=`<span class="eyebrow">FINAL CROWN</span><h2>${words.plural}</h2><div class="crown-card"><div class="crown-icon">👑</div><strong>${champ.team.map(p=>p.name).join(' / ')}</strong><span>Won the final ${kingWords().court.toLowerCase()} match ${champ.score}</span></div>`;
    $('#awards').innerHTML=champ.team.map(p=>`<div class="award"><span>${p.name}</span><strong>${wins[p.id]||0} top-court win${(wins[p.id]||0)===1?'':'s'}</strong></div>`).join('');
    return;
  }
  const top=s.slice(0,3);
  if(state.selectedFormat==='shootout'){
    const final=state.schedule[state.schedule.length-1];
    const topCourt=shootoutCourtResults(final)[1]||[];
    const champ=topCourt[0];
    const finalists=topCourt.slice(0,3);
    podium.innerHTML=`<span class="eyebrow">FINAL SHOOTOUT</span><h2>Individual Shootout Champion</h2><div class="podium-grid">${podiumShootout(finalists[1],2)}${podiumShootout(finalists[0],1)}${podiumShootout(finalists[2],3)}</div>`;
    const bestDiff=[...s].sort((a,b)=>(b.pf-b.pa)-(a.pf-a.pa))[0], streak=[...s].sort((a,b)=>b.bestStreak-a.bestStreak)[0];
    $('#awards').innerHTML=`<div class="award"><span>Shootout champion</span><strong>${champ?.player.name||'—'}${champ?` • ${champ.pf} final-stage pts`:''}</strong></div><div class="award"><span>Most total points</span><strong>${[...s].sort((a,b)=>b.pf-a.pf)[0]?.name||'—'}</strong></div><div class="award"><span>Best differential</span><strong>${bestDiff?.name||'—'} • ${bestDiff?signed(bestDiff.pf-bestDiff.pa):0}</strong></div><div class="award"><span>Longest streak</span><strong>${streak?.name||'—'} • ${streak?.bestStreak||0}</strong></div>`;
    return;
  }
  podium.innerHTML=`<span class="eyebrow">FINAL RESULTS</span><h2>Tonight's champions</h2><div class="podium-grid">${podiumPlace(top[1],2)}${podiumPlace(top[0],1)}${podiumPlace(top[2],3)}</div>`;
  const mostPF=[...s].sort((a,b)=>b.pf-a.pf)[0],bestDiff=[...s].sort((a,b)=>(b.pf-b.pa)-(a.pf-a.pa))[0],streak=[...s].sort((a,b)=>b.bestStreak-a.bestStreak)[0];
  $('#awards').innerHTML=`<div class="award"><span>Most wins</span><strong>${s[0]?.name||'—'} • ${s[0]?.w||0}</strong></div><div class="award"><span>Most points</span><strong>${mostPF?.name||'—'} • ${mostPF?.pf||0}</strong></div><div class="award"><span>Best differential</span><strong>${bestDiff?.name||'—'} • ${bestDiff?signed(bestDiff.pf-bestDiff.pa):0}</strong></div><div class="award"><span>Longest streak</span><strong>${streak?.name||'—'} • ${streak?.bestStreak||0}</strong></div>`;
}
function podiumShootout(x,n){if(!x)return '<div></div>';const name=x.player?.name||x.name;const pts=x.pf??x.pf;return `<div class="podium-place ${n===1?'first':''}"><div class="medal">${['','🥇','🥈','🥉'][n]}</div><strong>${name}</strong><small>${pts??0} final-stage pts</small></div>`}

function podiumPlace(s,n){if(!s)return '<div></div>';return `<div class="podium-place ${n===1?'first':''}"><div class="medal">${['','🥇','🥈','🥉'][n]}</div><strong>${s.name}</strong><small>${s.w} wins • ${signed(s.pf-s.pa)}</small></div>`}
async function copyResults(){const s=sortedStandings();let txt;if(state.selectedFormat==='shootout')txt=`PicklePlay Shootout Results\n${s.map((x,i)=>`${i+1}. ${x.name} — Court ${Math.ceil((latestShootoutRanks()[x.id]||i+1)/4)}, ${x.pf} total points`).join('\n')}`;else if(state.selectedFormat==='kings'){const c=finalKingCourtWinner();txt=c?`${kingWords().plural}: ${c.team.map(p=>p.name).join(' / ')} (${c.score})`:`${kingWords().result}: no completed result yet`;}else txt=`PicklePlay Results\n${s.map((x,i)=>`${i+1}. ${x.name} — ${x.w}-${x.l}, ${signed(x.pf-x.pa)}`).join('\n')}`;try{await navigator.clipboard.writeText(txt);$('#copyResults').textContent='Copied!';setTimeout(()=>$('#copyResults').textContent='Copy results',1400)}catch{prompt('Copy results:',txt)}}


// ---------- Optional live cloud sharing ----------
function cloudConfigured(){
  const c=window.PICKLEPLAY_CLOUD||{};
  return !!(c.supabaseUrl&&c.supabaseAnonKey&&window.supabase);
}

function cloudStatus(message,isError=false){
  const el=$('#shareStatus'); if(!el) return; el.textContent=message; el.style.color=isError?'#b42318':'';
}

function serializeSession(){
  return {
    version:1,
    selectedFormat:state.selectedFormat,courts:state.courts,pointsTo:state.pointsTo,scoringMode:state.scoringMode,rounds:state.rounds,tieBreak:state.tieBreak,
    schedule:state.schedule,currentRound:state.currentRound,standings:state.standings,fixedTeams:state.fixedTeams,courtChoice:state.courtChoice,kingTitle:state.kingTitle,shootoutSeedOrder:state.shootoutSeedOrder,players:state.players,
    title:$('#sessionTitle')?.textContent||'PicklePlay',meta:$('#sessionMeta')?.textContent||''
  };
}

function hydrateSession(snapshot){
  if(!snapshot) return;
  ['selectedFormat','courts','pointsTo','scoringMode','rounds','tieBreak','schedule','currentRound','standings','fixedTeams','courtChoice','kingTitle','shootoutSeedOrder','players'].forEach(k=>{if(snapshot[k]!==undefined)state[k]=snapshot[k]});
  $('#formatBadge').textContent=FORMATS.find(f=>f.id===state.selectedFormat)?.tag||'LIVE';
  $('#sessionTitle').textContent=snapshot.title||(state.selectedFormat==='kings'?kingWords().session:(FORMATS.find(f=>f.id===state.selectedFormat)?.name||'Tournament'));
  $('#sessionMeta').textContent=snapshot.meta||`${state.players.length} players • ${state.courts} courts`;
  const resultsTabBtn=document.querySelector('.tab[data-tab="results"]');
  if(resultsTabBtn) resultsTabBtn.textContent=state.selectedFormat==='kings'?kingWords().result:'Results';
  showScreen('tournament'); renderRound(); renderStandings();
}

async function initCloudSharing(){
  const params=new URLSearchParams(location.search);
  const sessionId=params.get('session');
  if(!cloudConfigured()){
    if(sessionId){alert('This shared PicklePlay link needs cloud configuration on the deployed site.');}
    return;
  }
  const c=window.PICKLEPLAY_CLOUD;
  state.cloud.client=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey);
  if(sessionId){
    state.cloud.sessionId=sessionId; state.cloud.viewer=true; state.cloud.owner=false;
    document.body.classList.add('viewer-mode'); $('#viewerBanner')?.classList.add('visible');
    await loadCloudSession();
    state.cloud.pollTimer=setInterval(loadCloudSession,2500);
  }
}

async function ensureCloudOwner(){
  if(!state.cloud.client) return false;
  const {data:{session}}=await state.cloud.client.auth.getSession();
  if(session?.user){state.cloud.owner=true;return true;}
  const {data,error}=await state.cloud.client.auth.signInAnonymously();
  if(error){cloudStatus('Could not start organizer session: '+error.message,true);return false;}
  state.cloud.owner=!!data.user; return state.cloud.owner;
}

async function shareLiveSession(){
  const panel=$('#sharePanel'); panel?.classList.add('visible');
  if(location.protocol==='file:'){cloudStatus('Deploy the app as a website first. QR sharing cannot work from a local file.',true);return;}
  if(!cloudConfigured()){cloudStatus('Cloud sharing is ready in the code. Add your free Supabase URL/key in cloud-config.js and run supabase-setup.sql.',true);return;}
  if(!await ensureCloudOwner()) return;
  if(!state.cloud.sessionId){
    const uid=(await state.cloud.client.auth.getUser()).data.user?.id;
    const {data,error}=await state.cloud.client.from('pickleplay_sessions').insert({owner_id:uid,snapshot:serializeSession()}).select('id,updated_at').single();
    if(error){cloudStatus('Could not create live session: '+error.message,true);return;}
    state.cloud.sessionId=data.id; state.cloud.lastUpdated=data.updated_at;
  } else { await syncCloudSession(true); }
  renderShareCode();
}

function viewerUrl(){
  if(!state.cloud.sessionId) return '';
  const u=new URL(location.href); u.search=''; u.hash=''; u.searchParams.set('session',state.cloud.sessionId); return u.toString();
}

function renderShareCode(){
  const url=viewerUrl(); if(!url) return;
  $('#shareUrl').value=url; const box=$('#qrCode'); box.innerHTML='';
  if(window.QRCode){new QRCode(box,{text:url,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});}
  else box.textContent='QR library unavailable — use the link instead.';
  cloudStatus('Live link ready • viewers are read-only');
}

async function copyShareLink(){
  const url=$('#shareUrl')?.value||viewerUrl(); if(!url) return;
  try{await navigator.clipboard.writeText(url);cloudStatus('Link copied ✓');}catch{prompt('Copy this viewer link:',url);}
}

let cloudSyncTimer=null;
function syncCloudSession(immediate=false){
  if(state.cloud.viewer||!state.cloud.owner||!state.cloud.client||!state.cloud.sessionId) return;
  clearTimeout(cloudSyncTimer);
  const run=async()=>{
    cloudStatus('Syncing…');
    const {data,error}=await state.cloud.client.from('pickleplay_sessions').update({snapshot:serializeSession(),updated_at:new Date().toISOString()}).eq('id',state.cloud.sessionId).select('updated_at').single();
    if(error){cloudStatus('Sync failed: '+error.message,true);return;}
    state.cloud.lastUpdated=data.updated_at; cloudStatus('Live • synced just now');
  };
  if(immediate) run(); else cloudSyncTimer=setTimeout(run,500);
}

async function loadCloudSession(){
  if(!state.cloud.client||!state.cloud.sessionId) return;
  const {data,error}=await state.cloud.client.from('pickleplay_sessions').select('snapshot,updated_at').eq('id',state.cloud.sessionId).single();
  if(error){cloudStatus('Could not load shared session: '+error.message,true);return;}
  if(data.updated_at===state.cloud.lastUpdated) return;
  state.cloud.lastUpdated=data.updated_at; hydrateSession(data.snapshot);
}

init();
