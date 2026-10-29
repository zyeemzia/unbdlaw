/* ZyeemZia™ UNBD-LAW course engine */
(function(){
const T=window.TRACK, M=T.meta, KEY=M.storeKey, I=window.ZZI18N, t=I.t, n=I.num;
const SLUG='unbdlaw', API=(()=>{try{return localStorage.getItem('zz.api')||''}catch(e){return ''}})()||'https://api.zyeemzia.com';
const GOOGLE_CLIENT_ID='263569409532-o59be67f62mk9je2kgerpah84kg8vn4e.apps.googleusercontent.com';
const EXKEY='zz-unbdlaw-exam', AUTH_KEY='zz.auth';
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const all=[];T.modules.forEach(m=>m.lessons.forEach(l=>{l.mod=m;all.push(l)}));
const ids=new Set(all.map(l=>l.id));

/* ---------- state ---------- */
function normalize(s){
  s=(s&&typeof s==='object')?JSON.parse(JSON.stringify(s)):{};
  if(!s.done||typeof s.done!=='object')s.done={};
  Object.keys(s.done).forEach(k=>{if(!ids.has(k))delete s.done[k]});
  s.best=Math.max(0,Math.min(100,+s.best||0));
  const o=s.off&&typeof s.off==='object'?s.off:{};
  if(!s.cap||typeof s.cap!=='object')s.cap={};
  if(!s.cases||typeof s.cases!=='object')s.cases={};
  s.off={attempts:+o.attempts||0,best:+o.best||0,history:Array.isArray(o.history)?o.history.filter(h=>h&&typeof h==='object').slice(-60):[],
    passed:o.passed&&typeof o.passed==='object'&&o.passed.id?o.passed:null,unclaimed:o.unclaimed&&typeof o.unclaimed.attempt==='string'?o.unclaimed:null};
  return s;
}
let st=normalize((()=>{try{return JSON.parse(localStorage.getItem(KEY))}catch(e){return null}})());
let pushT=0,lastPushed='',syncNA=false;
const save=()=>{st._t=Date.now();try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}scheduleSync()};
// exam bank = dedicated questions + every multiple-choice lesson check
// every bank item: {q,o,a,e,m(module id),k(stable key)}; lesson checks carry their module, new scenario bank is localised per item
const BANK=[];
T.exam.forEach((q,i)=>BANK.push(Object.assign({m:'bank',k:'x'+i},q)));
all.forEach(l=>(l.quiz||[]).forEach((q,i)=>{if(q.o.length>2)BANK.push(Object.assign({m:l.mod.id,k:l.id+'.'+i},q))}));
(T.qbank||[]).forEach((x,i)=>{const L=x[I.lang]||x.en;if(L&&L.o&&L.o.length===4)BANK.push({q:L.q,o:L.o,a:x.a,e:L.e,m:x.m,k:'qb'+i})});
const doneCount=()=>all.filter(l=>st.done[l.id]).length;
const pct=()=>Math.round(100*doneCount()/all.length);
const view=$('#view');
const fmtDate=d=>{try{return new Date(d).toLocaleDateString(I.lang==='bn'?'bn-BD':I.lang==='fr'?'fr-FR':'en-GB',{day:'numeric',month:'long',year:'numeric'})}catch(e){return String(d)}};
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
function toast(msg,ms){let b=$('#toast');if(!b){b=document.createElement('div');b.id='toast';b.className='toast';b.setAttribute('role','status');document.body.appendChild(b)}b.textContent=msg;b.classList.add('on');clearTimeout(b._t);b._t=setTimeout(()=>b.classList.remove('on'),ms||4000)}

/* ---------- server ---------- */
let AUTH=(()=>{try{const a=JSON.parse(localStorage.getItem(AUTH_KEY)||'null');return a&&/^[0-9a-f]{64}$/.test(a.token)?a:null}catch(e){return null}})();
const saveAuth=()=>{try{if(AUTH)localStorage.setItem(AUTH_KEY,JSON.stringify(AUTH));else localStorage.removeItem(AUTH_KEY)}catch(e){}};
async function api(path,body,opts){
  const ctl=new AbortController();const tm=setTimeout(()=>ctl.abort(),25000);let res;
  const headers={};if(body)headers['content-type']='application/json';if(AUTH)headers.authorization='Bearer '+AUTH.token;
  try{res=await fetch(API+path,Object.assign({method:body?'POST':'GET',headers},body?{body:JSON.stringify(body)}:{},{signal:ctl.signal},opts||{}))}
  catch(e){throw Object.assign(new Error(t('offline')),{offline:true})}finally{clearTimeout(tm)}
  let j={};try{j=await res.json()}catch(e){}
  if(res.status===401&&AUTH&&path!=='/v1/auth/google')signOutLocal(t('expired'));
  if(!res.ok)throw Object.assign(new Error(j.error||t('serverErr')),{status:res.status,unknownTrack:/unknown track/i.test(j.error||'')});
  return j;
}

/* ---------- sync ---------- */
function scheduleSync(){if(!AUTH||syncNA)return;clearTimeout(pushT);pushT=setTimeout(()=>pushProgress(),5000)}
const syncData=()=>{const d=JSON.parse(JSON.stringify(st));delete d.theme;return d};
async function pushProgress(keepalive){
  clearTimeout(pushT);if(!AUTH||syncNA)return;const data=syncData();const body=JSON.stringify(data);if(body===lastPushed)return;
  try{await api('/v1/progress/'+SLUG,{data},{method:'PUT',keepalive:!!keepalive&&body.length<60000});lastPushed=body;AUTH.synced=Date.now();saveAuth();const s=$('#syncState');if(s)s.textContent=syncLabel()}
  catch(e){if(e.unknownTrack){syncNA=true;const s=$('#syncState');if(s)s.textContent=t('syncSoon')}}
}
function merge(L,R){
  L=normalize(L);R=normalize(R);const newer=(R._t||0)>(L._t||0)?R:L,older=newer===R?L:R;const out=normalize(newer);out.theme=L.theme;
  Object.keys(older.done).forEach(k=>{out.done[k]=1});out.best=Math.max(out.best,older.best);
  const E=out.off,O=older.off;E.attempts=Math.max(E.attempts,O.attempts);E.best=Math.max(E.best,O.best);
  const seen=new Set();E.history=E.history.concat(O.history).filter(h=>{const k=h.date+'|'+h.score;if(seen.has(k))return false;seen.add(k);return true}).slice(-60);
  const rank=p=>p?(p.distinction?1000:0)+(+p.score||0):-1;if(rank(O.passed)>rank(E.passed))E.passed=O.passed;
  if(!E.unclaimed&&O.unclaimed)E.unclaimed=O.unclaimed;if(E.unclaimed&&E.passed&&(E.unclaimed.attempt===E.passed.attempt||E.unclaimed.score<=E.passed.score))E.unclaimed=null;
  Object.keys(older.cases).forEach(k=>{out.cases[k]=1});
  Object.keys(older.cap).forEach(k=>{if(!(k in out.cap))out.cap[k]=older.cap[k]});
  ['name','certTs','certId'].forEach(k=>{if(!out[k]&&older[k])out[k]=older[k]});out._t=Math.max(L._t||0,R._t||0);return out;
}
async function pullProgress(quiet){
  if(!AUTH)return;
  try{const j=await api('/v1/progress/'+SLUG);syncNA=false;
    if(j.data&&typeof j.data==='object'){const m=merge(st,j.data);const changed=JSON.stringify(m)!==JSON.stringify(st);st=m;try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}if(changed&&!(EX&&!EX.done))route()}
    await pushProgress();
  }catch(e){if(e.unknownTrack)syncNA=true;else if(!quiet&&e.status!==401)toast(e.message,6000)}
}
const syncLabel=()=>syncNA?t('syncSoon'):AUTH&&AUTH.synced?t('synced',new Date(AUTH.synced).toLocaleString(I.lang==='bn'?'bn-BD':I.lang==='fr'?'fr-FR':'en-GB')):t('notSynced');
function signOutLocal(msg){AUTH=null;saveAuth();clearTimeout(pushT);lastPushed='';chrome();if(location.hash==='#account')route();if(msg)toast(msg,6000)}

/* ---------- chrome ---------- */
document.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n)});
document.querySelectorAll('[data-i18n-ph]').forEach(e=>{e.placeholder=t(e.dataset.i18nPh);e.setAttribute('aria-label',t(e.dataset.i18nPh))});
document.querySelectorAll('[data-i18n-title]').forEach(e=>{e.title=t(e.dataset.i18nTitle);e.setAttribute('aria-label',t(e.dataset.i18nTitle))});
const sel=$('#lang');sel.innerHTML=I.LANGS.map(l=>`<option value="${l}"${l===I.lang?' selected':''}>${I.names[l]}</option>`).join('');sel.onchange=()=>{pushProgress(true);I.setLang(sel.value)};
function setTheme(th){document.documentElement.dataset.theme=th;st.theme=th;try{localStorage.setItem(KEY,JSON.stringify(st))}catch(e){}}
setTheme(st.theme||(matchMedia&&matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'));
$('#theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
$('#menu').onclick=()=>$('nav.main').classList.toggle('open');
const doSearch=e=>{if(e.key==='Enter'&&e.target.value.trim()){location.hash='#search/'+encodeURIComponent(e.target.value.trim());e.target.blur()}};
document.querySelectorAll('.search').forEach(i=>i.addEventListener('keydown',doSearch));
function chrome(){
  const a=$('#acct');if(!a)return;const u=AUTH&&AUTH.user;
  a.title=a.ariaLabel=u?(u.name||u.email||t('account')):t('signIn');
  a.innerHTML=u?(u.picture?`<img src="${esc(u.picture)}" alt="" referrerpolicy="no-referrer">`:`<span>${esc((u.name||u.email||'?').trim().charAt(0).toUpperCase())}</span>`):'<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  a.classList.toggle('in',!!u);
}
function bar(){const p=pct();$('.pbar i').style.width=p+'%';$('#pct').textContent=n(p)+'%'}
function navOn(r){const key=r==='lesson'?'modules':r;document.querySelectorAll('nav.main a').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+key));$('nav.main').classList.remove('open')}
const two=i=>n(String(i).padStart(2,'0'));

/* ---------- pages ---------- */
function home(){
  const mods=T.modules.map((m,i)=>{const d=m.lessons.filter(l=>st.done[l.id]).length;return `<a class="card link" href="#lesson/${m.lessons[0].id}"><span class="num">${t('module')} ${two(i+1)} · ${esc(I.code(m.code))}</span><h3>${esc(m.title)}</h3><p class="muted">${esc(m.sub)}</p><small class="muted">${t('lessonsOf',d,m.lessons.length)}</small><div class="meter"><i style="width:${100*d/m.lessons.length}%"></i></div></a>`}).join('');
  return `<section class="pg wrap">
  <div class="hero"><div><div class="kick">${t('kicker')} · ${esc(M.code)}</div>
  <h1>${esc(M.short)}<span>.</span></h1><div class="tag">${esc(M.tagline)}</div><p>${esc(M.lead)}</p>
  <div class="ctas"><a class="btn" href="#lesson/${all[0].id}">${t('start')} ›</a> <a class="btn ghost" href="book.html">📖 ${t('readBook')}</a></div>
  <div class="stats"><div><b>${n(T.modules.length)}</b><small>${t('sModules')}</small></div><div><b>${n(all.length)}</b><small>${t('sLessons')}</small></div><div><b>${n(T.workshops.length)}</b><small>${t('sWorkshops')}</small></div><div><b>${n(BANK.length)}</b><small>${t('sExam')}</small></div></div></div>
  <div class="shield">${T.figure||''}</div></div>
  <h2 class="sec">${t('pathTitle')} <small class="muted mono" style="font-size:13px">${n(pct())}% ${t('complete')}</small></h2>
  <div class="grid">
   <a class="card link" href="#modules"><span class="num">${t('step')} ${two(1)}</span><h3>${t('learn')}</h3><p class="muted">${t('lessonsOf',doneCount(),all.length)}</p></a>
   <a class="card link" href="#workshops"><span class="num">${t('step')} ${two(2)}</span><h3>${t('practise')}</h3><p class="muted">${t('practiseSub',T.workshops.length,T.flash.length)}</p></a>
   <a class="card link" href="#exam"><span class="num">${t('step')} ${two(3)}</span><h3>${t('certify')}</h3><p class="muted">${t('certifySub',M.examSize,M.passMark)}</p></a>
   <a class="card link" href="#certificate"><span class="num">${t('step')} ${two(4)}</span><h3>${t('getCert')}</h3><p class="muted">${t('getCertSub')}</p></a>
  </div>
  <h2 class="sec">${t('courseMap')}</h2><div class="grid">${mods}</div>
  <h2 class="sec">${t('bookTitle',esc(M.code))}</h2>
  <div class="card"><div class="kick">${t('bookKick')}</div><h3>${t('bookH')}</h3><p class="muted">${t('bookP')}</p><a class="btn" href="book.html">${t('readOnline')}</a> <a class="btn ghost" href="book.html#print">${t('downloadPdf')}</a></div>
  <h2 class="sec">${t('whoFor')}</h2><div class="grid">${M.audience.map(a=>`<div class="card">${esc(a)}</div>`).join('')}</div>
  </section>`;
}
function modules(){
  return `<section class="pg wrap"><h1>${t('modulesTitle')}</h1><p class="muted">${t('modulesLead',T.modules.length,all.length)}</p>`+
  T.modules.map((m,i)=>`<div class="card" style="margin:16px 0"><span class="num">${t('module')} ${two(i+1)}</span><h2>${esc(m.title)}</h2><p class="muted">${esc(m.sub)}</p>${m.lessons.map(l=>`<div class="lrow"><a href="#lesson/${l.id}">${st.done[l.id]?'✅':'○'} ${esc(l.title)}</a><small class="muted mono">${n(l.mins||20)} ${t('min')}</small></div>`).join('')}</div>`).join('')+`</section>`;
}
function quizHTML(qs){
  return `<div class="quiz">${qs.map((q,i)=>`<div class="q" data-a="${q.a}"><b>${n(i+1)}. ${esc(q.q)}</b>${q.o.map((o,j)=>`<button type="button" class="o" data-j="${j}">${String.fromCharCode(65+j)}. ${esc(o)}</button>`).join('')}<div class="exp" hidden>${esc(q.e||'')}</div></div>`).join('')}</div>`;
}
function wireQuiz(root){
  root.querySelectorAll('.quiz .q[data-a]').forEach(q=>q.querySelectorAll('button.o').forEach(b=>b.onclick=()=>{
    if(q.dataset.ans)return;q.dataset.ans=1;const a=+q.dataset.a;
    q.querySelectorAll('button.o').forEach(x=>{x.disabled=true;if(+x.dataset.j===a)x.classList.add('right')});
    if(+b.dataset.j!==a)b.classList.add('wrong');q.querySelector('.exp').hidden=false;}));
}
function lesson(id){
  const i=all.findIndex(l=>l.id===id);if(i<0)return home();const l=all[i],m=l.mod;
  const side=T.modules.map(mm=>`<h4>${esc(I.code(mm.code))} · ${esc(mm.title)}</h4>`+mm.lessons.map(x=>`<a href="#lesson/${x.id}" class="${x.id===id?'on':''} ${st.done[x.id]?'done':''}">${esc(x.title)}</a>`).join('')).join('');
  const prev=all[i-1],next=all[i+1];
  return `<section class="pg wrap lay"><aside class="side">${side}</aside><article class="lesson">
  <div class="kick">${esc(I.code(m.code))} · ${esc(m.title)} · ${t('lessonN',m.lessons.indexOf(l)+1,m.lessons.length)} · ${n(l.mins||20)} ${t('min')}</div>
  <h1>${esc(l.title)}</h1>
  ${l.objectives?`<div class="callout"><b class="h">🎯 ${t('objectives')}</b><ul>${l.objectives.map(o=>`<li>${esc(o)}</li>`).join('')}</ul></div>`:''}
  ${l.body}
  ${l.keys?`<h3>${t('keyTakeaways')}</h3><div class="keys">${l.keys.map(k=>`<div>✔ ${esc(k)}</div>`).join('')}</div>`:''}
  ${l.trainer?`<div class="callout new"><b class="h">🧑‍🏫 ${t('trainerNote')}</b>${l.trainer}</div>`:''}
  ${l.quiz&&l.quiz.length?`<h3>${t('check')}</h3>${quizHTML(l.quiz)}`:''}
  ${l.source?`<p class="muted" style="font-size:13px">📁 ${t('source')}: ${esc(l.source)}</p>`:''}
  <div class="navrow">${prev?`<a class="btn ghost" href="#lesson/${prev.id}">‹ ${esc(prev.title)}</a>`:'<span></span>'}
  <button type="button" class="btn" id="done" data-id="${l.id}">${st.done[id]?t('completed'):t('markComplete')}</button>
  ${next?`<a class="btn ghost" href="#lesson/${next.id}">${esc(next.title)} ›</a>`:`<a class="btn ghost" href="#exam">${t('goExam')} ›</a>`}</div>
  </article></section>`;
}
function workshops(){
  return `<section class="pg wrap"><h1>${t('wsTitle')}</h1><p class="muted">${t('wsLead')}</p>`+
  T.workshops.map((w,i)=>`<div class="card" style="margin:18px 0" id="ws-${i}"><span class="num">${t('workshop')} ${two(i+1)} · ${esc(w.type)}</span><h2>${esc(w.title)}</h2>${w.body}${w.answers?`<details><summary>${t('modelAnswers')}</summary>${w.answers}</details>`:''}</div>`).join('')+
  `<h2 class="sec">${t('flashcards')}</h2><div id="fc"></div></section>`;
}
function flash(){
  let k=0;const box=$('#fc');if(!box||!T.flash.length)return;
  const draw=()=>{const c=T.flash[k];box.innerHTML=`<div class="flash" role="button" tabindex="0" aria-label="${t('flipHint')}"><div class="in"><div class="f">${esc(c[0])}</div><div class="b">${esc(c[1])}</div></div></div><p class="muted" style="text-align:center;font-size:13px">${t('flipHint')}</p><p style="text-align:center"><button type="button" class="btn ghost sm" id="fp">${t('prev')}</button> <span class="mono">${n(k+1)}/${n(T.flash.length)}</span> <button type="button" class="btn ghost sm" id="fn">${t('next')}</button> <button type="button" class="btn ghost sm" id="fs">${t('shuffle')}</button></p>`;
    const card=box.querySelector('.flash');const flip=()=>card.classList.toggle('flip');
    card.onclick=flip;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip()}};
    $('#fp').onclick=()=>{k=(k-1+T.flash.length)%T.flash.length;draw()};$('#fn').onclick=()=>{k=(k+1)%T.flash.length;draw()};
    $('#fs').onclick=()=>{let r;do{r=Math.floor(Math.random()*T.flash.length)}while(T.flash.length>1&&r===k);k=r;draw()}};
  draw();
}
function shuffled(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

/* ---------- exam: official (server-graded) and practice (graded here) ---------- */
let EX=null,exTimer=0,exSyncT=0,offNA=false,offStarting=false;
const saveEX=()=>{try{if(EX&&!EX.done)localStorage.setItem(EXKEY,JSON.stringify({attempt:EX.attempt,items:EX.items,ans:EX.ans,end:EX.end}));else localStorage.removeItem(EXKEY)}catch(e){}};
(function restoreEX(){let r=null;try{r=JSON.parse(localStorage.getItem(EXKEY)||'null')}catch(e){}
  if(r&&typeof r.attempt==='string'&&Array.isArray(r.items)&&r.items.length&&r.items.every(q=>q&&typeof q.q==='string'&&Array.isArray(q.options)))EX={attempt:r.attempt,items:r.items,ans:r.ans||{},end:+r.end||Date.now(),done:false};
  else try{localStorage.removeItem(EXKEY)}catch(e){}})();
function exam(){
  if(EX&&!EX.done)return officialHTML();
  if(PX&&!PX.done&&PX.open)return pxHTML();
  if(PX&&PX.done&&PX.open)return pxResultHTML();
  const O=st.off,lessonsOk=pct()===100,np=Math.min(M.examSize,BANK.length);
  return `<section class="pg wrap"><h1>${t('examTitle')}</h1>
  <div class="grid exm">
   <div class="card"><div class="kick">${t('offTitle')}</div><p>${t('offP',M.examSize,60)}</p>
    ${offNA?`<div class="callout"><b class="h">ℹ</b>${t('offSoon')}</div>`:''}
    ${lessonsOk?'':`<div class="callout"><b class="h">🔒</b>${t('offLocked',doneCount(),all.length)}</div>`}
    <button type="button" class="btn" id="offstart" ${lessonsOk?'':'disabled'}>${t('offStart')}</button></div>
   <div class="card"><div class="kick">${t('pracTitle')}</div><p>${t('pracP',np,BANK.length)}</p><p class="muted">${t('best')}: <b>${n(st.best||0)}%</b>${(st.prac||[]).length?` · ${t('attempts')}: <b>${n(st.prac.length)}</b> · ${t('last')}: <b>${n(st.prac[st.prac.length-1].s)}%</b>`:''}</p>
    ${PX&&!PX.done?`<button type="button" class="btn" id="pxresume">${t('resume')}</button> `:''}<button type="button" class="btn ghost" id="startx">${t('pracStart')}</button>
    <details style="margin-top:10px"><summary>${t('drill')}</summary><div class="chips" style="margin-top:8px">${T.modules.map(m=>`<button type="button" class="chip" data-drill="${m.id}">${esc(I.code(m.code))}</button>`).join('')}</div></details></div>
  </div>
  ${O.attempts||O.passed?`<div class="card" style="margin-top:16px"><div class="kick">${t('record')}</div><p>${t('attempts')}: <b>${n(O.attempts)}</b> · ${t('best')}: <b>${n(O.best)}%</b>${O.unclaimed?` · <a href="#certificate">${t('claimH')} ›</a>`:O.passed?` · <a href="#certificate">${t('verifiedCert')}: ${esc(O.passed.id)}</a>`:''}</p></div>`:''}
  <div id="xbox"></div></section>`;
}
async function officialStart(){
  if(offStarting)return;if(pct()<100){toast(t('offLocked',doneCount(),all.length));return}
  offStarting=true;const b=$('#offstart');if(b){b.disabled=true;b.textContent=t('offPreparing')}
  try{const j=await api('/v1/exam/start',{track:SLUG,lang:I.lang});offNA=false;
    EX={attempt:j.attempt,items:j.questions,ans:{},end:Date.now()+(j.ends-j.now),done:false};saveEX();route();
  }catch(e){if(e.unknownTrack)offNA=true;else toast(e.message,7000);route()}finally{offStarting=false}
}
function officialHTML(){
  const a=Object.keys(EX.ans).length;
  return `<section class="pg wrap"><div class="exbar" role="status"><b>${t('official')}</b><span id="exAns">${t('answered',a,EX.items.length)}</span><span>⏱ ${t('timeLeft')}: <b id="exTime">–</b></span></div>
  ${EX.pending?`<div class="callout red" role="alert"><b class="h">${t('notSubmitted')}</b>${esc(EX.pending)} <button type="button" class="btn sm" id="offsubmit2">${t('tryAgain')}</button></div>`:''}
  <div class="quiz">${EX.items.map((q,i)=>`<fieldset class="q"><legend><b>${n(i+1)}. ${esc(q.q)}</b></legend>${q.options.map((o,j)=>`<label class="opt"><input type="radio" name="ox${i}" value="${j}" ${EX.ans[i]===j?'checked':''}> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}</div>
  <button type="button" class="btn" id="offsubmit">${t('submitExam')}</button></section>`;
}
function tick(){
  if(!EX||EX.done){clearInterval(exTimer);return}
  const left=Math.max(0,EX.end-Date.now()),el=$('#exTime');
  if(el){const m=Math.floor(left/60e3),s=Math.floor(left/1000)%60;el.textContent=n(m)+':'+n(String(s).padStart(2,'0'));el.classList.toggle('low',left<5*60e3)}
  if(left<=0){clearInterval(exTimer);officialSubmit(true)}
}
function wireOfficial(){
  clearInterval(exTimer);exTimer=setInterval(tick,1000);tick();
  view.querySelector('.quiz').addEventListener('change',e=>{const m=/^ox(\d+)$/.exec(e.target.name);if(!m)return;
    if(Date.now()>EX.end){toast(t('timeUp'));return}EX.ans[+m[1]]=+e.target.value;saveEX();
    $('#exAns').textContent=t('answered',Object.keys(EX.ans).length,EX.items.length);
    clearTimeout(exSyncT);exSyncT=setTimeout(()=>api('/v1/exam/save',{attempt:EX.attempt,answers:EX.ans}).catch(()=>{}),3000)});
  const sub=()=>{const miss=EX.items.length-Object.keys(EX.ans).length;if(miss&&!confirm(t('unanswered',miss)))return;officialSubmit(false)};
  $('#offsubmit').onclick=sub;if($('#offsubmit2'))$('#offsubmit2').onclick=sub;
}
async function officialSubmit(timeUp){
  const ex=EX;if(!ex||ex.sending||ex.done)return;ex.sending=true;clearTimeout(exSyncT);
  document.querySelectorAll('#offsubmit,#offsubmit2').forEach(b=>{b.disabled=true;b.textContent=t('submitting')});
  try{const r=await api('/v1/exam/submit',{attempt:ex.attempt,answers:ex.ans});
    ex.done=true;ex.sending=false;clearInterval(exTimer);saveEX();
    const date=r.date||today(),O=st.off;O.attempts++;O.best=Math.max(O.best,r.score);O.history.push({date,score:r.score});
    if(r.pass&&(!O.passed||r.score>O.passed.score))O.unclaimed={attempt:ex.attempt,score:r.score,date};save();
    ex.result=r;if(timeUp)toast(t('timeUp'),6000);showOfficialResult();
  }catch(e){ex.sending=false;
    if(e.status===404){EX=null;saveEX();toast(t('attemptGone'),7000);route();return}
    ex.pending=e.message;if(location.hash==='#exam'){view.innerHTML=officialHTML();wireOfficial()}else toast(e.message,7000)}
}
function showOfficialResult(){
  const r=EX.result,pass=r.pass,cl=pass&&st.off.unclaimed&&st.off.unclaimed.attempt===EX.attempt;
  if(location.hash!=='#exam'){location.hash='#exam';return}
  view.innerHTML=`<section class="pg wrap"><div class="callout ${pass?'new':'red'}"><b class="h">${t('official')} · ${t('score')}: ${n(r.score)}%</b>${t('offResult',r.right,EX.items.length)} ${pass?(r.score>=M.distinctionMark?t('distinction'):t('passed')):t('notYet')}</div>
   ${cl?claimHTML():''}
   <p class="muted">${t('offFair')}</p><div class="quiz">${EX.items.map((q,k)=>{const ok=(r.marks||[])[k]===1;return `<div class="q" style="border-color:${ok?'var(--ok)':'var(--bad)'}"><b>${n(k+1)}. ${esc(q.q)}</b>${EX.ans[k]!=null&&q.options[EX.ans[k]]!=null?`<p class="muted">${ok?'✅':'❌'} ${esc(q.options[EX.ans[k]])}</p>`:'<p class="muted">—</p>'}</div>`}).join('')}</div>
   <p><button type="button" class="btn ghost" id="exagain">${t('startExam')}</button></p></section>`;
  wireClaim();$('#exagain').onclick=()=>{EX=null;saveEX();route()};window.scrollTo(0,0);
}
/* ---------- practice / final mock exam engine ----------
   stratified draw across modules, shuffled options, no repeats from the last attempt, timer with autosave and resume,
   one question per screen with a question map, flags, review-before-submit, module breakdown and full answer review */
const PXKEY='zz-unbdlaw-practice-'+I.lang;let PX=null,pxTimer=0;
const modName=id=>{const m=T.modules.find(x=>x.id===id);return m?I.code(m.code):t('mixed')};
const pxSave=()=>{try{if(PX&&!PX.done)localStorage.setItem(PXKEY,JSON.stringify(PX));else localStorage.removeItem(PXKEY)}catch(e){}};
(function(){try{const r=JSON.parse(localStorage.getItem(PXKEY)||'null');if(r&&Array.isArray(r.items)&&r.items.length&&r.items.every(x=>BANK.some(b=>b.k===x.k))){PX=r;PX.open=false}}catch(e){}})();
function pxDraw(size,only){
  const pool=BANK.filter(b=>!only||b.m===only);const recent=new Set(only?[]:(st.lastKeys||[]));
  const fresh=pool.filter(b=>!recent.has(b.k)),src=fresh.length>=Math.min(size,pool.length)?fresh:pool;
  const by={};src.forEach(b=>(by[b.m]=by[b.m]||[]).push(b));Object.keys(by).forEach(k=>by[k]=shuffled(by[k]));
  const out=[];const mods=shuffled(Object.keys(by));let added=true;
  while(out.length<Math.min(size,src.length)&&added){added=false;for(const m of mods){if(out.length>=size)break;const b=by[m].pop();if(b){out.push(b);added=true}}}
  return shuffled(out).map(b=>({k:b.k,p:shuffled(b.o.map((_,j)=>j))}));
}
function pxStart(only){
  const size=only?Math.min(10,BANK.filter(b=>b.m===only).length):Math.min(M.examSize,BANK.length);
  PX={items:pxDraw(size,only),ans:{},flags:{},i:0,end:only?0:Date.now()+60*60e3,done:false,open:true,drill:only||''};
  if(!only)st.lastKeys=PX.items.map(x=>x.k);save();pxSave();route();
}
const pxQ=k=>{const it=PX.items[k],b=BANK.find(x=>x.k===it.k);return {b,opts:it.p.map(j=>b.o[j]),correct:it.p.indexOf(b.a)}};
function pxHTML(){
  const k=PX.i,{b,opts}=pxQ(k),N=PX.items.length,a=PX.ans[k],answered=Object.keys(PX.ans).length;
  return `<section class="pg wrap"><div class="exbar" role="status"><b>${PX.drill?t('drillOf',modName(PX.drill)):t('practiceX')}</b><span>${t('qOf',k+1,N)}</span><span id="pxAns">${t('answered',answered,N)}</span>${PX.end?`<span>⏱ <b id="pxTime">–</b></span>`:''}</div>
  <div class="card"><div class="kick">${esc(modName(b.m))}</div><h2 id="pxQ" tabindex="-1" style="font-size:22px">${esc(b.q)}</h2>
   <div class="decide" style="margin:0;border:0">${opts.map((o,j)=>`<button type="button" class="o pxo${a===j?' sel':''}" data-j="${j}" aria-pressed="${a===j}"><b>${'ABCD'[j]}.</b> ${esc(o)}</button>`).join('')}</div>
   <div class="navrow"><button type="button" class="btn ghost" id="pxPrev" ${k?'':'disabled'}>‹ ${t('prev').replace('‹','').trim()}</button>
    <button type="button" class="btn ghost" id="pxFlag" aria-pressed="${!!PX.flags[k]}">${PX.flags[k]?'⚑ '+t('flagged'):'⚐ '+t('flag')}</button>
    ${k+1<N?`<button type="button" class="btn" id="pxNext">${t('next').replace('›','').trim()} ›</button>`:`<button type="button" class="btn" id="pxReview">${t('reviewSubmit')}</button>`}</div></div>
  <div class="card" style="margin-top:14px"><div class="kick">${t('qmap')}</div><div class="qmap">${PX.items.map((_,j)=>`<button type="button" data-go="${j}" class="${PX.ans[j]!=null?'ans':''} ${PX.flags[j]?'flag':''} ${j===k?'cur':''}" aria-label="${t('qOf',j+1,N)}">${n(j+1)}</button>`).join('')}</div>
   <p class="muted" style="font-size:13px">${t('kbdHint')}</p><button type="button" class="btn sm ghost" id="pxReview2">${t('reviewSubmit')}</button> <button type="button" class="btn sm ghost" id="pxQuit">${t('pause')}</button></div></section>`;
}
function pxReviewHTML(){
  const N=PX.items.length,un=PX.items.map((_,j)=>j).filter(j=>PX.ans[j]==null),fl=PX.items.map((_,j)=>j).filter(j=>PX.flags[j]);
  return `<section class="pg wrap"><h1>${t('reviewSubmit')}</h1><div class="card"><p>${t('answered',N-un.length,N)}</p>
  ${un.length?`<p>⚠ ${t('unansweredList')}: ${un.map(j=>`<a href="#exam" data-go="${j}">${n(j+1)}</a>`).join(', ')}</p>`:''}
  ${fl.length?`<p>⚑ ${t('flaggedList')}: ${fl.map(j=>`<a href="#exam" data-go="${j}">${n(j+1)}</a>`).join(', ')}</p>`:''}
  <p><button type="button" class="btn ghost" id="pxBack">‹ ${t('backToQ')}</button> <button type="button" class="btn" id="pxSubmit">${t('submitExam')}</button></p></div></section>`;
}
function pxTick(){if(!PX||PX.done||!PX.end){clearInterval(pxTimer);return}const left=Math.max(0,PX.end-Date.now()),el=$('#pxTime');if(el){el.textContent=n(Math.floor(left/60e3))+':'+n(String(Math.floor(left/1000)%60).padStart(2,'0'));el.classList.toggle('low',left<5*60e3)}if(left<=0){clearInterval(pxTimer);toast(t('timeUp'),6000);pxSubmit()}}
function pxWire(){
  clearInterval(pxTimer);if(PX.end){pxTimer=setInterval(pxTick,1000);pxTick()}
  const go=j=>{PX.i=Math.max(0,Math.min(PX.items.length-1,j));pxSave();view.innerHTML=pxHTML();pxWire();const h=$('#pxQ');if(h)h.focus({preventScroll:true})};
  view.querySelectorAll('.pxo').forEach(b=>b.onclick=()=>{PX.ans[PX.i]=+b.dataset.j;pxSave();view.querySelectorAll('.pxo').forEach(x=>{const on=x===b;x.classList.toggle('sel',on);x.setAttribute('aria-pressed',on)});const m=view.querySelector(`[data-go="${PX.i}"]`);if(m)m.classList.add('ans');$('#pxAns').textContent=t('answered',Object.keys(PX.ans).length,PX.items.length)});
  view.querySelectorAll('[data-go]').forEach(b=>b.onclick=e=>{e.preventDefault();go(+b.dataset.go)});
  if($('#pxPrev'))$('#pxPrev').onclick=()=>go(PX.i-1);if($('#pxNext'))$('#pxNext').onclick=()=>go(PX.i+1);
  if($('#pxFlag'))$('#pxFlag').onclick=()=>{PX.flags[PX.i]=!PX.flags[PX.i];pxSave();go(PX.i)};
  const rev=()=>{view.innerHTML=pxReviewHTML();window.scrollTo(0,0);view.querySelectorAll('[data-go]').forEach(b=>b.onclick=e=>{e.preventDefault();go(+b.dataset.go)});$('#pxBack').onclick=()=>go(PX.i);$('#pxSubmit').onclick=pxSubmit};
  ['#pxReview','#pxReview2'].forEach(s=>{if($(s))$(s).onclick=rev});
  if($('#pxQuit'))$('#pxQuit').onclick=()=>{PX.open=false;pxSave();clearInterval(pxTimer);route()};
}
document.addEventListener('keydown',e=>{
  if(!PX||PX.done||!PX.open||location.hash!=='#exam'||/INPUT|TEXTAREA|SELECT/.test((e.target.tagName||''))||e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase(),idx='abcd'.indexOf(k)>=0?'abcd'.indexOf(k):'1234'.indexOf(k);
  if(idx>=0){const b=view.querySelector(`.pxo[data-j="${idx}"]`);if(b){b.click();e.preventDefault()}}
  else if(e.key==='ArrowRight'&&$('#pxNext')){$('#pxNext').click();e.preventDefault()}
  else if(e.key==='ArrowLeft'&&$('#pxPrev')&&!$('#pxPrev').disabled){$('#pxPrev').click();e.preventDefault()}
  else if(k==='f'&&$('#pxFlag')){$('#pxFlag').click();e.preventDefault()}
});
function pxSubmit(){
  if(!PX||PX.done)return;clearInterval(pxTimer);
  let right=0;const per={};PX.items.forEach((_,j)=>{const {b,correct}=pxQ(j);per[b.m]=per[b.m]||{r:0,n:0};per[b.m].n++;if(PX.ans[j]===correct){right++;per[b.m].r++}});
  const s=Math.round(100*right/PX.items.length);PX.done=true;PX.result={right,s,per};
  if(!PX.drill){st.best=Math.max(st.best||0,s);st.prac=(st.prac||[]).concat({d:today(),s}).slice(-20)}
  save();pxSave();bar();route();
}
function pxResultHTML(){
  const r=PX.result,N=PX.items.length,pass=r.s>=M.passMark,wrongOnly=PX.wrongOnly;
  const rows=Object.entries(r.per).map(([m,p])=>{const v=Math.round(100*p.r/p.n);return `<div class="bd"><span>${esc(modName(m))}</span><div class="meter"><i style="width:${v}%;background:${v>=M.passMark?'var(--ok)':'var(--bad)'}"></i></div><span class="mono">${n(p.r)}/${n(p.n)}</span></div>`}).join('');
  const weak=Object.entries(r.per).filter(([m,p])=>p.r/p.n<M.passMark/100&&T.modules.some(x=>x.id===m)).map(([m])=>m);
  return `<section class="pg wrap"><div class="callout ${pass?'new':'red'}"><b class="h">${PX.drill?t('drillOf',modName(PX.drill)):t('practiceX')} · ${t('score')}: ${n(r.s)}% (${n(r.right)}/${n(N)})</b>${r.s>=M.distinctionMark?t('distinction'):pass?t('passed'):t('notYet')}</div>
  <div class="card"><div class="kick">${t('byModule')}</div>${rows}${weak.length?`<p class="muted" style="margin-top:10px">${t('revise')}: ${weak.map(m=>{const mm=T.modules.find(x=>x.id===m);return `<a href="#lesson/${mm.lessons[0].id}">${esc(I.code(mm.code))}</a>`}).join(' · ')}</p>`:''}
   <p style="margin-top:12px"><button type="button" class="btn" id="pxAgain">${t('pracStart')}</button> <button type="button" class="btn ghost" id="pxWrong">${wrongOnly?t('showAll'):t('wrongOnly')}</button> <button type="button" class="btn ghost" id="pxClose">${t('close')}</button></p></div>
  <div class="quiz">${PX.items.map((_,j)=>{const {b,opts,correct}=pxQ(j),a=PX.ans[j],ok=a===correct;if(wrongOnly&&ok)return '';return `<div class="q" style="border-color:${ok?'var(--ok)':'var(--bad)'}"><b>${n(j+1)}. ${esc(b.q)}</b><div class="muted" style="font-size:12px">${esc(modName(b.m))}</div>${opts.map((o,x)=>`<div class="opt" style="${x===correct?'color:var(--ok);font-weight:600':x===a?'color:var(--bad)':''}">${x===correct?'✔':x===a?'✘':'·'} ${'ABCD'[x]}. ${esc(o)}</div>`).join('')}${a==null?`<p class="muted">${t('notAnswered')}</p>`:''}<div class="exp">${esc(b.e||'')}</div></div>`}).join('')}</div></section>`;
}
function pxResultWire(){$('#pxAgain').onclick=()=>pxStart(PX.drill||'');$('#pxWrong').onclick=()=>{PX.wrongOnly=!PX.wrongOnly;route()};$('#pxClose').onclick=()=>{PX.open=false;route()}}
const capDone=()=>M.capstone.deliverables.every((_,i)=>st.cap[i]);
function capstone(){const c=M.capstone,d=c.deliverables.filter((_,i)=>st.cap[i]).length;return `<section class="pg wrap"><h1>${esc(c.title)}</h1><div class="card">${c.brief}<h3>${t('deliverables')} · ${n(d)}/${n(c.deliverables.length)}</h3><div class="caplist">${c.deliverables.map((x,i)=>`<label class="opt"><input type="checkbox" data-cap="${i}" ${st.cap[i]?'checked':''}> ${esc(x)}</label>`).join('')}</div><p class="muted">${t('capNote',M.distinctionMark)}</p><h3>${t('rubric')}</h3><div class="tw"><table><tr><th>${t('criterion')}</th><th>${t('developing')}</th><th>${t('proficient')}</th><th>${t('distinguished')}</th></tr>${c.rubric.map(r=>`<tr><td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td></tr>`).join('')}</table></div></div></section>`}

/* ---------- certificates ---------- */
const claimHTML=()=>`<div class="card" id="claimBox" style="margin:16px 0"><div class="kick">${t('claimH')}</div><p>${t('claimP')}</p><form id="claimForm" class="row"><input class="txt" id="claimName" maxlength="80" autocomplete="name" required value="${esc(st.name||(AUTH&&AUTH.user&&AUTH.user.name)||'')}" placeholder="${t('namePh')}"> <button type="submit" class="btn">${t('claimBtn')}</button></form></div>`;
function wireClaim(){const f=$('#claimForm');if(!f)return;f.onsubmit=async e=>{e.preventDefault();const U=st.off.unclaimed;if(!U)return;
  const name=$('#claimName').value.replace(/\s+/g,' ').trim();if(name.length<2){$('#claimName').focus();return}
  const b=f.querySelector('button');b.disabled=true;b.textContent=t('issuing');
  try{const c=await api('/v1/cert/claim',{attempt:U.attempt,name,capstone:capDone()});st.name=c.name;st.off.passed={id:c.id,date:c.date,score:c.score,name:c.name,distinction:!!c.distinction,attempt:U.attempt};st.off.unclaimed=null;save();toast(t('issued',c.id),5000);location.hash='#certificate';route()}
  catch(e){toast(e.message,7000);if([403,404,410].includes(e.status)){st.off.unclaimed=null;save();route()}else{b.disabled=false;b.textContent=t('claimBtn')}}}}
const certFrame=(name,score,date,id,verified)=>`<div class="cert"><div class="cert-k">${t('certAcademy')}</div><h2>${t('certOf')}</h2><p>${t('certifies')}</p><div class="nm">${esc(name)}</div><p>${t('completedThe')}</p><h3>${esc(M.full)}</h3><p class="cert-s">${esc(M.certificate)}</p><p><b>${score>=M.distinctionMark?t('withDist'):''}${t('examScore',score)}</b></p><p style="margin-top:30px">${esc(date)}<br><small>${t('certId')}: ${esc(id)}</small></p><p style="margin-top:24px"><i class="sig">Zyeem Bin Zia</i><br><small>${t('ceo')}</small></p><div class="seal">${verified?'✓<br>':''}BD<br>UN</div><p class="cert-v">${verified?`${t('verifyAt')} unbdlaw.zyeemzia.com/#verify/${esc(id)}`:t('verifyNote')}</p></div>`;
function certId(){
  if(!st.certId){const d=new Date(st.certTs||Date.now());const ymd=d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0');
    const r=Array.from({length:6},()=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join('');st.certId=`UNBDLAW-L${ymd}-${r}`;save()}
  return st.certId;
}
function certificate(){
  const P=st.off.passed,U=st.off.unclaimed;
  if(P)return `<section class="pg wrap"><h1>${t('verifiedCert')}</h1><div class="card noprint"><button type="button" class="btn ghost" id="pr">${t('print')}</button> <a class="btn ghost" href="#verify/${encodeURIComponent(P.id)}">${t('verify')}</a></div>${certFrame(P.name,P.score,fmtDate(P.date),P.id,true)}</section>`;
  const p=pct(),b=st.best||0,ok=p===100&&b>=M.passMark;
  return `<section class="pg wrap"><h1>${t('certTitle')}</h1>${U?claimHTML():''}
  <div class="card noprint"><div class="kick">${t('courseCert')}</div><p>${t('certStatus',p,b,M.passMark)}</p><p class="muted">${t('courseCertNote')}</p>
  ${ok?`<input class="txt" id="nm" maxlength="80" placeholder="${t('namePh')}" value="${esc(st.name||'')}"> <button type="button" class="btn" id="mk">${t('generate')}</button> ${st.name?`<button type="button" class="btn ghost" id="pr">${t('print')}</button>`:''}`:`<p class="muted">${t('locked')}</p>`}</div>
  ${ok&&st.name?certFrame(st.name,b,st.certTs?fmtDate(st.certTs):'',certId(),false):''}
  <div class="card noprint" style="margin-top:16px"><p class="muted">${t('restore')}</p><form id="restoreForm" class="row"><input class="txt" id="restoreId" placeholder="${t('idPh')}" spellcheck="false" autocapitalize="characters"> <button class="btn ghost" type="submit">${t('restoreBtn')}</button></form></div></section>`;
}
function wireCert(){
  const mk=$('#mk');if(mk){const go=()=>{const v=$('#nm').value.trim();if(!v){$('#nm').focus();return}st.name=v;st.certTs=st.certTs||Date.now();save();route()};mk.onclick=go;$('#nm').onkeydown=e=>{if(e.key==='Enter')go()}}
  if($('#pr'))$('#pr').onclick=()=>print();wireClaim();
  const rf=$('#restoreForm');if(rf)rf.onsubmit=async e=>{e.preventDefault();const id=$('#restoreId').value.trim().toUpperCase().replace(/\s+/g,'');if(!id)return;
    try{const c=await api('/v1/verify/'+encodeURIComponent(id));if(c.track&&c.track!==SLUG){toast(t('otherTrack',c.domain||''),7000);return}if(c.revoked){toast(t('revoked'),7000);return}
      st.off.passed={id:c.id,date:c.date,score:c.score,name:c.name,distinction:!!c.distinction,restored:true};st.name=c.name;save();toast(t('restored',c.id),5000);route()}
    catch(err){toast(err.status===404||err.status===400?t('notFound'):err.message,7000)}};
}
function verify(id){
  return `<section class="pg wrap"><h1>${t('verify')}</h1><p class="muted">${t('verifyLead')}</p><form id="vForm" class="row"><input class="txt" id="vId" value="${esc(id||'')}" placeholder="${t('idPh')}" spellcheck="false" autocapitalize="characters"> <button type="submit" class="btn">${t('verifyBtn')}</button></form><div id="vOut" style="margin-top:16px"></div></section>`;
}
async function runVerify(id){
  id=String(id||'').trim().toUpperCase().replace(/\s+/g,'');const out=$('#vOut');if(!id||!out)return;out.innerHTML=`<p class="muted">${t('loading')}</p>`;
  try{const c=await api('/v1/verify/'+encodeURIComponent(id));
    out.innerHTML=`<div class="callout ${c.revoked?'red':'new'}"><b class="h">${c.revoked?t('revoked'):t('genuine')}${c.distinction&&!c.revoked?' · '+t('withDist').replace(/ · $/,''):''}</b><div class="tw"><table><tr><th>${t('vName')}</th><td>${esc(c.name)}</td></tr><tr><th>${t('vCert')}</th><td>${esc(c.trackName||M.full)}</td></tr><tr><th>${t('vIssued')}</th><td>${esc(fmtDate(c.date))}</td></tr><tr><th>${t('vScore')}</th><td>${n(c.score)}%</td></tr><tr><th>${t('certId')}</th><td>${esc(c.id)}</td></tr>${c.domain?`<tr><th>Course</th><td><a href="https://${esc(c.domain)}/" target="_blank" rel="noopener">${esc(c.domain)}</a></td></tr>`:''}</table></div></div>`}
  catch(e){out.innerHTML=`<div class="callout red"><b class="h">${e.status===404||e.status===400?t('notFound'):esc(e.message)}</b></div>`}
}

/* ---------- account ---------- */
const inApp=()=>/FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);
function account(){
  if(!AUTH)return `<section class="pg wrap"><h1>${t('acctTitle')}</h1><p class="muted">${t('acctLead')}</p><div class="card acct">
    ${inApp()?`<div class="callout red">${t('inApp')}</div>`:''}<div id="gsiBtn" class="gsi"><span class="muted">${t('gsiLoading')}</span></div><p class="muted" style="font-size:13px">${t('gsiNote')} <a href="privacy.html">${t('privacy')}</a></p></div></section>`;
  const u=AUTH.user||{};
  return `<section class="pg wrap"><h1>${t('yourAccount')}</h1><p class="muted">${t('acctIn')}</p>
  <div class="card acct"><div class="who">${u.picture?`<img src="${esc(u.picture)}" alt="" width="56" height="56" referrerpolicy="no-referrer">`:`<span class="ini">${esc((u.name||u.email||'?').trim().charAt(0).toUpperCase())}</span>`}<div><b>${esc(u.name||'')}</b><br><span class="muted">${esc(u.email||'')}</span></div></div>
   <p class="muted" id="syncState">${esc(syncLabel())}</p><p><button type="button" class="btn" id="aSync">${t('syncNow')}</button> <button type="button" class="btn ghost" id="aOut">${t('signOut')}</button></p></div>
  <div class="card" style="margin-top:16px"><div class="kick">${t('myCerts')}</div><div id="acctCerts"><p class="muted">${t('loading')}</p></div></div>
  <div class="card" style="margin-top:16px"><p class="muted">${t('privNote')} <a href="privacy.html">${t('privacy')}</a></p><button type="button" class="btn ghost sm" id="aDel">${t('delAcct')}</button></div></section>`;
}
let gisP=null;
const loadGIS=()=>gisP||(gisP=new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=res;s.onerror=()=>{gisP=null;rej(new Error(t('gsiFail')))};document.head.appendChild(s)}));
async function mountAccount(){
  if(!AUTH){const el=$('#gsiBtn');if(!el)return;
    try{await loadGIS();const slot=$('#gsiBtn');if(!slot||!(window.google&&google.accounts&&google.accounts.id))return;
      google.accounts.id.initialize({client_id:GOOGLE_CLIENT_ID,callback:onCredential,ux_mode:'popup',auto_select:false,cancel_on_tap_outside:true,itp_support:true});
      slot.innerHTML='';google.accounts.id.renderButton(slot,{theme:document.documentElement.dataset.theme==='dark'?'filled_black':'outline',size:'large',text:'signin_with',shape:'pill',locale:I.lang,width:Math.max(220,Math.min(340,slot.clientWidth||300))});
    }catch(e){el.innerHTML=`<p class="muted">${esc(e.message)}</p>`}return}
  $('#aSync').onclick=async()=>{lastPushed='';await pullProgress();const s=$('#syncState');if(s)s.textContent=syncLabel()};
  $('#aOut').onclick=async()=>{try{await pushProgress();await api('/v1/auth/logout',{})}catch(e){}try{if(window.google&&google.accounts)google.accounts.id.disableAutoSelect()}catch(e){}signOutLocal(t('signedOut'))};
  $('#aDel').onclick=async()=>{if(!confirm(t('delAsk')))return;try{await api('/v1/me',null,{method:'DELETE'});signOutLocal(t('deleted'))}catch(e){toast(e.message,7000)}};
  try{const j=await api('/v1/me');if(j.user&&AUTH){AUTH.user=j.user;saveAuth();chrome()}const el=$('#acctCerts');if(!el)return;const cs=j.certificates||[];
    el.innerHTML=cs.length?cs.map(c=>`<div class="lrow"><a href="https://${esc(c.domain)}/#verify/${encodeURIComponent(c.id)}" target="_blank" rel="noopener">✓ ${esc(c.trackName)}</a><small class="muted">${esc(c.id)} · ${esc(c.date)} · ${n(c.score)}%</small></div>`).join(''):`<p class="muted">${t('noCerts')}</p>`}
  catch(e){const el=$('#acctCerts');if(el)el.innerHTML=`<p class="muted">${esc(e.message)}</p>`}
}
async function onCredential(resp){
  try{const j=await api('/v1/auth/google',{credential:resp&&resp.credential});AUTH={token:j.token,user:j.user};saveAuth();lastPushed='';
    toast(t('signedIn',j.user.name||j.user.email),4000);chrome();await pullProgress();if(location.hash==='#account')route()}
  catch(e){toast(e.message,7000)}
}

/* ---------- search ---------- */
function search(q){
  q=decodeURIComponent(q||'').trim();if(!q)return home();const ql=q.toLowerCase();
  const plain=l=>(l.title+' '+l.body.replace(/<[^>]+>/g,' ')+' '+(l.keys||[]).join(' ')).replace(/\s+/g,' ');
  const hits=all.filter(l=>plain(l).toLowerCase().includes(ql));
  $('#search').value=q;
  return `<section class="pg wrap"><h1>${t('searchTitle',esc(q))}</h1><p class="muted">${hits.length?t('results',hits.length):t('noResults')}</p>${hits.map(l=>{const s=plain(l);const i=s.toLowerCase().indexOf(ql);return `<a class="card link" style="margin:10px 0" href="#lesson/${l.id}"><b>${esc(l.title)}</b><br><small class="muted">${esc(l.mod.title)}</small><p class="muted">…${esc(s.slice(Math.max(0,i-80),i))}<mark>${esc(s.slice(i,i+q.length))}</mark>${esc(s.slice(i+q.length,i+q.length+120))}…</p></a>`}).join('')}</section>`;
}

/* ---------- case lab: real cases, a commander's decision, then the legal solution ---------- */
let caseTag='';
function cases(id){
  const C=T.cases||[];
  if(id){const i=C.findIndex(c=>c.id===id);if(i<0)return cases('');const c=C[i],prev=C[i-1],next=C[i+1],seen=st.cases&&st.cases[c.id];
    return `<section class="pg wrap"><p><a href="#cases">‹ ${t('caseLab')}</a></p><article class="lesson">
    <div class="kick">${t('caseN',i+1,C.length)} · ${esc(c.where)} · ${esc(c.when)}</div><h1>${esc(c.title)}</h1>
    <p>${c.tags.map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</p>
    <h3>${t('facts')}</h3>${c.facts}
    ${c.decide?`<div class="card decide"><div class="kick">⚖ ${t('yourCall')}</div><p><b>${esc(c.decide.q)}</b></p>${c.decide.o.map((o,j)=>`<button type="button" class="o dopt" data-j="${j}">${String.fromCharCode(65+j)}. ${esc(o.t)}</button>`).join('')}<div id="dfb" hidden></div></div>`:''}
    <h3>${t('discuss')}</h3><ol>${c.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ol>
    <details id="sol"${seen?' open':''}><summary>${t('solution')}</summary>${c.solution}</details>
    ${c.trainer?`<div class="callout new"><b class="h">🧑‍🏫 ${t('trainerNote')}</b>${c.trainer}</div>`:''}
    ${c.sources&&c.sources.length?`<p class="muted" style="font-size:13px">📚 ${t('sourcesL')}: ${c.sources.map(s=>`<a href="${esc(s.u)}" target="_blank" rel="noopener">${esc(s.t)}</a>`).join(' · ')}</p>`:''}
    <div class="navrow">${prev?`<a class="btn ghost" href="#cases/${prev.id}">‹ ${esc(prev.title)}</a>`:'<span></span>'}${next?`<a class="btn ghost" href="#cases/${next.id}">${esc(next.title)} ›</a>`:'<span></span>'}</div></article></section>`}
  const tags=[...new Set(C.flatMap(c=>c.tags))];const list=C.filter(c=>!caseTag||c.tags.includes(caseTag));const done=C.filter(c=>st.cases&&st.cases[c.id]).length;
  return `<section class="pg wrap"><h1>${t('caseLab')}</h1><p class="muted">${t('caseLead',C.length)} <b>${n(done)}/${n(C.length)}</b></p>
  <div class="chips" role="group"><button type="button" class="chip${caseTag?'':' on'}" data-tag="">${t('allCases')}</button>${tags.map(x=>`<button type="button" class="chip${caseTag===x?' on':''}" data-tag="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  <div class="grid" style="margin-top:14px">${list.map(c=>`<a class="card link" href="#cases/${c.id}"><span class="num">${esc(c.where)} · ${esc(c.when)}</span><h3>${st.cases&&st.cases[c.id]?'✅ ':''}${esc(c.title)}</h3><p class="muted">${esc(c.teaser)}</p><p>${c.tags.slice(0,3).map(x=>`<span class="chip">${esc(x)}</span>`).join('')}</p></a>`).join('')}</div></section>`;
}
function wireCases(id){
  view.querySelectorAll('[data-tag]').forEach(b=>b.onclick=()=>{caseTag=b.dataset.tag;route()});
  if(!id)return;const c=(T.cases||[]).find(x=>x.id===id);if(!c)return;
  const mark=()=>{st.cases=st.cases||{};if(!st.cases[c.id]){st.cases[c.id]=1;save()}};
  const sol=$('#sol');if(sol)sol.addEventListener('toggle',()=>{if(sol.open)mark()});
  view.querySelectorAll('.dopt').forEach(b=>b.onclick=()=>{const box=b.closest('.decide');if(box.dataset.done)return;box.dataset.done=1;
    const o=c.decide.o[+b.dataset.j];box.querySelectorAll('.dopt').forEach(x=>{x.disabled=true;if(c.decide.o[+x.dataset.j].ok)x.classList.add('right')});if(!o.ok)b.classList.add('wrong');
    const f=$('#dfb');f.hidden=false;f.innerHTML=`<div class="callout ${o.ok?'new':'red'}"><b class="h">${o.ok?t('goodCall'):t('rethink')}</b>${esc(o.why)}</div>`;mark()});
}

/* ---------- abbreviations: search, category filter, expansion in the reader's language ---------- */
let abbrCat='',abbrQ='';
const abbrCol=I.lang==='bn'?2:I.lang==='fr'?3:1;
function abbrRows(){const q=abbrQ.trim().toLowerCase();return (T.abbr||[]).filter(a=>(!abbrCat||a[4]===abbrCat)&&(!q||a.slice(0,4).join(' ').toLowerCase().includes(q))).sort((x,y)=>x[0].localeCompare(y[0]))}
function abbrTable(){const rows=abbrRows();return rows.length?`<div class="tw"><table class="abbr"><tr><th>${t('abbrCol')}</th><th>${t('meaning')}</th>${I.lang!=='en'?'<th>English</th>':''}</tr>${rows.map(a=>`<tr><th scope="row" class="mono">${esc(a[0])}</th><td>${esc(a[abbrCol])}</td>${I.lang!=='en'?`<td class="muted">${esc(a[1])}</td>`:''}</tr>`).join('')}</table></div>`:`<p class="muted">${t('noResults')}</p>`}
function abbr(){
  const cats=[...new Set((T.abbr||[]).map(a=>a[4]))].sort();
  return `<section class="pg wrap"><h1>${t('abbrTitle')}</h1><p class="muted">${t('abbrLead',(T.abbr||[]).length)}</p>
  <div class="row"><input class="txt" id="abbrQ" type="search" value="${esc(abbrQ)}" placeholder="${t('abbrPh')}" aria-label="${t('abbrPh')}"></div>
  <div class="chips" style="margin:12px 0"><button type="button" class="chip${abbrCat?'':' on'}" data-acat="">${t('allCases')}</button>${cats.map(c=>`<button type="button" class="chip${abbrCat===c?' on':''}" data-acat="${esc(c)}">${esc(t('cat_'+c.replace(/\W+/g,''))||c)}</button>`).join('')}</div>
  <div id="abbrBox">${abbrTable()}</div></section>`;
}
// explain abbreviations inline: the first occurrence of each known abbreviation in a lesson gets a hover/tap title
const ABBR_MAP=(()=>{const m={};(T.abbr||[]).forEach(a=>a[0].split(/\s*\/\s*|\s+\(|\)/).map(s=>s.trim()).filter(s=>/^[A-Z][A-Z0-9-]{1,9}$/.test(s)).forEach(k=>{if(!m[k])m[k]=a[abbrCol]}));return m})();
function explainAbbr(root){
  if(!root||!Object.keys(ABBR_MAP).length)return;const re=new RegExp('\\b('+Object.keys(ABBR_MAP).sort((a,b)=>b.length-a.length).map(k=>k.replace(/-/g,'\\-')).join('|')+')\\b');
  const seen=new Set(),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('abbr,a,button,summary,script,code,.kick,h1')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(nd=>{let txt=nd.nodeValue,m,frag=null,last=0;const g=new RegExp(re.source,'g');
    while((m=g.exec(txt))){if(seen.has(m[1]))continue;seen.add(m[1]);frag=frag||document.createDocumentFragment();frag.appendChild(document.createTextNode(txt.slice(last,m.index)));const ab=document.createElement('abbr');ab.title=ABBR_MAP[m[1]];ab.textContent=m[1];ab.tabIndex=0;frag.appendChild(ab);last=m.index+m[1].length}
    if(frag){frag.appendChild(document.createTextNode(txt.slice(last)));nd.parentNode.replaceChild(frag,nd)}});
}
function wireAbbr(){
  const q=$('#abbrQ');q.oninput=()=>{abbrQ=q.value;$('#abbrBox').innerHTML=abbrTable()};
  view.querySelectorAll('[data-acat]').forEach(b=>b.onclick=()=>{abbrCat=b.dataset.acat;view.querySelectorAll('[data-acat]').forEach(x=>x.classList.toggle('on',x===b));$('#abbrBox').innerHTML=abbrTable()});
}

/* ---------- router ---------- */
function route(){
  const h=decodeURIComponent(location.hash.slice(1))||'home';const cut=h.indexOf('/');const r=cut<0?h:h.slice(0,cut),arg=cut<0?'':h.slice(cut+1);
  if(r==='updates'){location.replace('#lesson/'+T.updatesLesson);return}
  if(r==='print'){location.replace('#home');return}
  const fn={home,modules,lesson:()=>lesson(arg),workshops,cases:()=>cases(arg),abbr,exam,capstone,certificate,account,verify:()=>verify(arg),search:()=>search(arg)}[r]||home;
  view.innerHTML=fn();navOn(r==='lesson'&&arg===T.updatesLesson?'updates':r);bar();chrome();window.scrollTo(0,0);
  wireQuiz(view);flash();
  const d=$('#done');if(d)d.onclick=()=>{st.done[d.dataset.id]=1;save();const i=all.findIndex(l=>l.id===d.dataset.id);const nx=all[i+1];if(nx)location.hash='#lesson/'+nx.id;else route()};
  if(r==='exam'){if(EX&&!EX.done)wireOfficial();else if(PX&&PX.open&&!PX.done)pxWire();else if(PX&&PX.open&&PX.done)pxResultWire();else{
    if($('#startx'))$('#startx').onclick=()=>{if(PX&&!PX.done&&!confirm(t('discard')))return;pxStart('')};
    if($('#pxresume'))$('#pxresume').onclick=()=>{PX.open=true;route()};
    view.querySelectorAll('[data-drill]').forEach(b=>b.onclick=()=>pxStart(b.dataset.drill));
    if($('#offstart'))$('#offstart').onclick=officialStart}}
  if(r!=='exam')clearInterval(pxTimer);
  if(r==='certificate')wireCert();
  if(r==='cases')wireCases(arg);
  if(r==='abbr')wireAbbr();
  if(r==='lesson'||(r==='cases'&&arg))explainAbbr(view.querySelector('article.lesson'));
  if(r==='capstone')view.querySelectorAll('[data-cap]').forEach(b=>b.onchange=()=>{st.cap[b.dataset.cap]=b.checked;save();const h=b.closest('.card').querySelector('h3');const c=M.capstone.deliverables;h.textContent=`${t('deliverables')} · ${n(c.filter((_,i)=>st.cap[i]).length)}/${n(c.length)}`});
  if(r==='account')mountAccount();
  if(r==='verify'){$('#vForm').onsubmit=e=>{e.preventDefault();const v=$('#vId').value.trim();history.replaceState(null,'','#verify/'+encodeURIComponent(v));runVerify(v)};if(arg)runVerify(arg)}
  const cs=r==='cases'&&arg&&(T.cases||[]).find(c=>c.id===arg);
  document.title=(r==='lesson'&&all.find(l=>l.id===arg)?all.find(l=>l.id===arg).title+' · ':cs?cs.title+' · ':'')+M.full;
}
addEventListener('hashchange',route);
addEventListener('storage',e=>{if(e.key===AUTH_KEY){AUTH=(()=>{try{return JSON.parse(e.newValue||'null')}catch(x){return null}})();chrome();if(location.hash==='#account')route()}});
addEventListener('pagehide',()=>{pushProgress(true);if(EX&&!EX.done&&EX.attempt)api('/v1/exam/save',{attempt:EX.attempt,answers:EX.ans},{keepalive:true}).catch(()=>{})});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&AUTH)pullProgress(true)});
route();if(AUTH)pullProgress(true);
if(EX&&!EX.done&&EX.end<=Date.now())officialSubmit(true);
})();
