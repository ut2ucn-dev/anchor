
(function(){
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rnd = n => Math.floor(Math.random()*n);
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = ms => { const s = Math.max(0, Math.floor(ms/1000)); return [Math.floor(s/3600), Math.floor(s/60)%60, s%60].map(n => String(n).padStart(2,'0')).join(':'); };
const mmss = ms => { const s = Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };
const dt = ts => new Date(ts).toLocaleString('uk-UA', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const hm = ts => new Date(ts).toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'});
const maskPhone = p => p.replace(/(\+380\s?\d{2})\s?\d{3}/, '$1 ***');
const maskMail = m => m.replace(/^(.{2}).*(@.*)$/, '$1***$2');

const C = window.CONFIG, AN = window.Anchor;
/* ================= data ================= */
const VEH = {
  bike:     {name:'Велосипед', acc:'велосипед', sub:'Звичайний'},
  scooter:  {name:'Електросамокат', acc:'електросамокат', sub:'Можна заряджати', electric:true},
  mono:     {name:'Моноколесо', acc:'моноколесо', sub:'Можна заряджати', electric:true},
  adaptive: {name:'Адаптований', acc:'адаптований велосипед', sub:'Триколісний, хендбайк', wide:true},
};
/* Prices come from CONFIG; in the price test (variant B) every sum is multiplied. */
const mult = () => (C.EXPERIMENTS.price && AN.ab.price === 'B') ? C.PRICE_TEST_MULTIPLIER : 1;
const TARIFFS = C.TARIFFS.map(t => Object.assign({}, t, {plan: t.hours ? null : (t.planHours || (t.id === 'pro' ? 10 : 14))}));
const T = id => TARIFFS.find(t => t.id === id);

const CONSENT = 'Погоджуюсь, щоб команда Anchor зберегла цей контакт і написала мені. Його бачить лише команда; видалити — напишіть нам або «Приватність і дані».';
const consentBox = id => `<label class="consent" for="${id}"><input type="checkbox" id="${id}"><span>${CONSENT} <a href="privacy.html">Приватність</a></span></label>`;
/* Netlify Forms: urlencoded POST to "/" with form-name; static hidden copies of the forms live in index.html */
function postForm(name, fields){
  const body = new URLSearchParams(Object.assign({'form-name': name, 'bot-field': ''}, fields)).toString();
  return fetch('/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body}).then(r => { if(!r.ok) throw new Error(r.status); });
}
async function copy(text, el){
  try{ await navigator.clipboard.writeText(text); toast('Скопійовано'); return true; }
  catch(e){ if(el){ const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Виділено: скопіюйте вручну'); return false; }
}
function saveContact(value, source){
  sess.contact = true;
  postForm('contact', {contact:value.slice(0, 60), source, consent:'yes'}).catch(() => {});
  track('contact', {source});
}
/* Kyiv, schematic. 1 map unit ≈ 90 m. */
const M = 90;
const LINES = {
  r:{color:'var(--m-red)', name:'червона', pts:[[18,188],[55,194],[95,199],[115,204],[140,211],[160,209],[175,205],[190,200],[205,204],[222,205],[245,201],[275,205],[300,200],[325,195],[348,190]]},
  b:{color:'var(--m-blue)', name:'синя', pts:[[176,18],[172,44],[178,70],[181,95],[179,118],[186,140],[196,160],[190,198],[181,224],[176,250],[171,276],[167,300],[160,325],[150,350],[140,375],[130,400],[118,424]]},
  g:{color:'var(--m-green)', name:'зелена', pts:[[93,118],[110,140],[130,160],[152,180],[172,196],[181,221],[196,233],[206,246],[216,266],[226,290],[250,309],[266,324],[285,335],[300,346],[311,361],[321,376],[331,392]]},
};
const STATIONS = [
  {id:'luk',  name:'Лук’янівська',           line:'g', x:130, y:160, addr:'вул. Дегтярівська, 2', dist:'Шевченківський'},
  {id:'zol',  name:'Золоті ворота',          line:'g', x:172, y:196, addr:'вул. Володимирська, 40', dist:'Шевченківський'},
  {id:'uni',  name:'Університет',            line:'r', x:160, y:209, addr:'бул. Тараса Шевченка, 14', dist:'Шевченківський'},
  {id:'pol',  name:'Політехнічний інститут', line:'r', x:115, y:204, addr:'просп. Берестейський, 37', dist:'Солом’янський'},
  {id:'kon',  name:'Контрактова площа',      line:'b', x:186, y:140, addr:'Контрактова пл., 4', dist:'Подільський'},
  {id:'poch', name:'Почайна',                line:'b', x:181, y:95,  addr:'просп. Степана Бандери, 23', dist:'Оболонський'},
  {id:'obo',  name:'Оболонь',                line:'b', x:178, y:70,  addr:'просп. Оболонський, 21', dist:'Оболонський'},
  {id:'pal',  name:'Палац спорту',           line:'g', x:181, y:221, addr:'Спортивна пл., 1', dist:'Печерський'},
  {id:'lb',   name:'Лівобережна',            line:'r', x:275, y:205, addr:'Броварський просп., 15', dist:'Дніпровський'},
  {id:'poz',  name:'Позняки',                line:'g', x:285, y:335, addr:'вул. Драгоманова, 1', dist:'Дарницький'},
  {id:'vys',  name:'Виставковий центр',      line:'b', x:130, y:400, addr:'просп. Глушкова, 1', dist:'Голосіївський'},
  {id:'aka',  name:'Академмістечко',         line:'r', x:18,  y:188, addr:'просп. Берестейський, 132', dist:'Святошинський'},
];
const DISTRICTS = [['Оболонський',150,52],['Подільський',140,110],['Шевченківський',100,170],['Святошинський',45,150],['Солом’янський',85,250],['Печерський',212,236],['Голосіївський',120,330],['Дніпровський',290,150],['Деснянський',300,60],['Дарницький',295,290]];
const ALL_DISTRICTS = ['Голосіївський','Дарницький','Деснянський','Дніпровський','Оболонський','Печерський','Подільський','Святошинський','Солом’янський','Шевченківський'];
/* slots: deterministic per station so every visitor sees the same picture */
function seedSlots(id){
  let h = 0; for(const c of id) h = (h*31 + c.charCodeAt(0)) >>> 0;
  const r = () => { h = (h*1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
  return Array.from({length:6}, (_, k) => {
    const x = r(); return {st: x < .38 ? 'free' : x < .58 ? 'booked' : 'busy', charge: k === 2 || k === 3 || k === 5, wide: k === 5};
  }).map((s, k, a) => (k === 5 && !a.some(z => z.st === 'free')) ? Object.assign(s, {st:'free'}) : s);
}
STATIONS.forEach(s => { s.slots = seedSlots(s.id); if(s.id === 'luk') s.slots[2].st = 'free'; });

/* ================= storage =================
   Nothing is written to the browser until the visitor has answered the consent banner;
   after that only what the app needs to work (account, bookings, settings) is kept here. */
const KEY = 'anchor-app';
const canStore = () => AN.consent() !== null;
function loadLocal(){ if(!canStore()) return {}; try{ return JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ return {}; } }
function saveLocal(){ if(!canStore()) return; try{ localStorage.setItem(KEY, JSON.stringify(L)); }catch(e){} }
let L = loadLocal();
L.bookings = L.bookings || [];
L.speed = L.speed || 1;
const CHANNELS = {threads:'Threads', instagram:'Instagram', 'kpi-a':'Чати КПІ, група A', 'kpi-b':'Чати КПІ, група B', qr:'QR-плакат біля метро', students:'Студентські чати', couriers:'Кур’єрські групи', direct:'Пряме посилання'};
const hashParts = (location.hash || '').slice(1).split(/[_.]/);
if(hashParts.includes('test')) L.tester = true;

/* ================= app state ================= */
const S = {
  screen:'welcome', tab:'map', authTab:'phone', big:!!L.big, voice:!!L.voice,
  phoneDraft:'+380 67 123 45 67', mailDraft:'', otp:'', code:null, codeAt:0, tries:3, lockUntil:0, otpFor:null, msg:'', msgCls:'', checking:false,
  stationId:null, slot:null, tariff:'once', hours:2, filter:null, picking:false, zoom:1, list:false, mode:{},
  min:60, method:null, payBusy:false, payErr:false, failedOnce:false, payFor:null, view:null, snap:'auto', bkId:null,
  survey:{rating:0, understood:null, wouldUse:null, contact:'', features:[], otherOn:false, other:'', sent:false}, req:{district:'', place:'', note:''},
  refOpen:false, shareOpen:false, friendMsg:'', honestSent:false, offerCard:false, seen:{},
  refCode:'ANCHOR-' + Array.from({length:4}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random()*32)]).join(''),
};
const me = () => L.account;   /* {method:'phone'|'gmail', id, vehicle, charge} */
const userPos = () => L.pos || {x:133, y:164};
const distTo = st => Math.hypot(st.x - userPos().x, st.y - userPos().y) * M;
const kmTxt = m => m < 1000 ? Math.round(m/10)*10 + ' м' : (m/1000).toFixed(1).replace('.', ',') + ' км';
const priceOf = t => Math.round(T(t).price*mult());
const tariffFull = (id, hours) => T(id).hours ? priceOf(id)*hours : priceOf(id);
/* booking ahead: 15 min – 3 h at the hourly rate, prepayment grows after 1:30 (CONFIG.PREPAY_TABLE) */
const hourly = () => C.HOURLY_RATE*mult();
const bookingCost = min => hourly()*min/60;
const prepayPct = min => (C.PREPAY_TABLE.find(([m]) => min <= m) || C.PREPAY_TABLE[C.PREPAY_TABLE.length - 1])[1];
const prepayOf = min => Math.ceil(bookingCost(min)*prepayPct(min)/100 - 1e-9);
const DURS = []; for(let m = C.BOOKING_MIN; m <= C.BOOKING_MAX; m += C.BOOKING_STEP) DURS.push(m);
const minTxt = m => m < 60 ? `${m} хв` : `${Math.floor(m/60)} год${m % 60 ? ' ' + (m % 60) + ' хв' : ''}`;

/* ================= analytics bridge =================
   All events go through window.Anchor.track (js/analytics.js): nothing is kept or sent before consent. */
const sess = {contact:false, ctaYes:null, rating:0, tester:hashParts.includes('test')};
const NAMES = {auth:'login_done', parked:'parked', picked:'pickup_done', request:'station_requested', contact:'contact_left', ctaAnswer:'cta_prepay_answer'};
const SCREENS = ['welcome','auth','onboard','map','station','tariff','book','pay','bookings','history','profile','survey','request','mydata','bonus','honest'];
function track(name, props){
  if(SCREENS.includes(name) && !props) return AN.track('screen_view', {screen:name, tester:sess.tester});
  AN.track(NAMES[name] || name, Object.assign({tester:sess.tester}, props || {}));
}

/* ================= sound + voice ================= */
let ac = null;
function ctx(){ try{ ac = ac || new (window.AudioContext||window.webkitAudioContext)(); if(ac.state === 'suspended') ac.resume(); }catch(e){ ac = null; } return ac; }
function tone(f, t, d, g){ const c = ctx(); if(!c) return; const o = c.createOscillator(), v = c.createGain(), at = c.currentTime + t; o.frequency.value = f; v.gain.setValueAtTime(.0001, at); v.gain.exponentialRampToValueAtTime(g || .12, at + .02); v.gain.exponentialRampToValueAtTime(.0001, at + d); o.connect(v); v.connect(c.destination); o.start(at); o.stop(at + d + .05); }
const sOk = () => { tone(880,0,.1); tone(1175,.1,.16); };
const sBad = () => { tone(200,0,.18,.1); tone(160,.2,.2,.1); };
const sKey = () => tone(900,0,.03,.04);
const sMsg = () => { tone(1046,0,.12); tone(1318,.14,.18); };
const sOpen = () => { tone(660,0,.14,.18); tone(880,.16,.18,.18); tone(1320,.36,.2,.1); };
function say(text){ if(!S.voice) return; try{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'uk-UA'; speechSynthesis.speak(u); }catch(e){} }

/* ================= notifications ================= */
let notifH;
function notify(kind, text){
  if(kind === 'mail'){ $('#nIc').textContent = 'M'; $('#nIc').className = 'ni mail'; $('#nFrom').textContent = 'Gmail · Anchor'; }
  else if(kind === 'sms'){ $('#nIc').textContent = 'SMS'; $('#nIc').className = 'ni'; $('#nFrom').textContent = 'Повідомлення · Anchor'; }
  else { $('#nIc').textContent = '!'; $('#nIc').className = 'ni'; $('#nFrom').textContent = 'Anchor'; }
  $('#nText').textContent = text; const n = $('#notif'); n.inert = false; n.classList.add('on'); sMsg();
  clearTimeout(notifH); notifH = setTimeout(hideNotif, 8000);
}
function hideNotif(){ const n = $('#notif'); n.classList.remove('on'); n.inert = true; }
function toast(t){ const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 2400); }

/* ================= OTP: the prototype's logic, by SMS or by Gmail =================
   4 digits, valid 5 minutes, 3 wrong tries lock input for 1 minute. */
function channelOf(){ const a = me(); return a ? a.method : S.authTab; }
function sendOtp(forWhat){
  S.otpFor = forWhat; S.otp = ''; S.msg = ''; S.msgCls = ''; S.checking = false;
  if(Date.now() < S.lockUntil) return;
  const code = S.code = String(1000 + rnd(9000)); S.codeAt = Date.now();
  const ch = channelOf();
  setTimeout(() => { if(S.code === code) notify(ch === 'gmail' ? 'mail' : 'sms', ch === 'gmail' ? `Ваш код Anchor: ${code}. Діє 5 хвилин. Якщо це не ви, проігноруйте лист.` : `Anchor: ваш код ${code}. Нікому його не повідомляйте.`); }, 600);
}
function press(k){
  if(S.screen !== 'otp' || Date.now() < S.lockUntil || S.checking) return;
  if(k !== '⌫' && S.otp.length >= 4) return;
  sKey(); S.otp = k === '⌫' ? S.otp.slice(0, -1) : S.otp + k;
  if(S.otp.length === 4){ S.checking = true; render(); setTimeout(checkOtp, 220); return; }
  render();
}
function checkOtp(){
  S.checking = false;
  if(S.screen !== 'otp') return;
  if(S.code && Date.now() - S.codeAt > 5*60000){ S.code = null; S.otp = ''; S.msg = 'Код застарів: він діє 5 хвилин. Запросіть новий.'; S.msgCls = 'err'; render(); return; }
  if(S.code && S.otp === S.code){
    sOk(); S.tries = 3; S.code = null; hideNotif(); S.msg = 'Код підтверджено'; S.msgCls = 'ok'; render();
    const f = S.otpFor; setTimeout(() => otpPassed(f), 450); return;
  }
  sBad(); S.tries--; S.otp = '';
  if(S.tries <= 0){ S.lockUntil = Date.now() + 60000; S.tries = 3; S.code = null; S.msg = ''; hideNotif(); say('Забагато невдалих спроб. Зачекайте хвилину.'); render(); return; }
  S.msg = `Невірний код. Залишилось спроб: ${S.tries}`; S.msgCls = 'err'; render();
  const b = $('#otpBoxes'); if(b) b.classList.add('bad');
}

/* ================= icons + drawings ================= */
const IC = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  speaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  mail:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  door:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><rect x="8" y="5" width="32" height="38" rx="2"/><path d="M8 5l14 5v36l-14-3z" fill="currentColor" opacity=".2"/><path d="M8 5l14 5v36"/></svg>',
  check:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 25l8 8 16-17"/></svg>',
  bolt:'<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M7 0L1 8h4l-1.5 6L10 5H6l1-5z" fill="currentColor"/></svg>',
  wide:'<svg viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7h12M4 4L1 7l3 3M10 4l3 3-3 3"/></svg>',
  map:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  ticket:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M8 9h.01M16 9h.01"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  user:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>',
};
function sideVeh(t){
  if(t==='scooter') return `<circle cx="-48" cy="-22" r="20"/><circle cx="50" cy="-22" r="20"/><line x1="-48" y1="-22" x2="-30" y2="-40" stroke="#1f9d8f" stroke-width="6"/><line x1="-30" y1="-40" x2="40" y2="-40" stroke="#1f9d8f" stroke-width="9"/><line x1="40" y1="-40" x2="50" y2="-22" stroke="#1f9d8f" stroke-width="6"/><line x1="34" y1="-40" x2="26" y2="-124" stroke="#1f9d8f" stroke-width="6"/><line x1="12" y1="-128" x2="40" y2="-128" stroke-width="7"/>`;
  if(t==='mono') return `<circle cx="0" cy="-44" r="40" stroke-width="9"/><rect x="-16" y="-96" width="32" height="64" rx="10" fill="#2F6DB5" stroke="#1d4a80" stroke-width="3"/><line x1="-30" y1="-48" x2="-16" y2="-48" stroke-width="7"/><line x1="16" y1="-48" x2="30" y2="-48" stroke-width="7"/>`;
  if(t==='adaptive') return `<circle cx="-50" cy="-30" r="30"/><circle cx="56" cy="-22" r="22"/><polyline points="-50,-30 -8,-24 44,-24 56,-22" stroke="#2F6DB5" stroke-width="6"/><path d="M-44 -42 Q -30 -18 -2 -30 L -8 -40 Z" fill="#2F6DB5" stroke="#2F6DB5" stroke-width="4"/><line x1="44" y1="-24" x2="30" y2="-64" stroke="#2F6DB5" stroke-width="5"/><line x1="20" y1="-74" x2="40" y2="-58" stroke-width="5"/>`;
  return `<circle cx="-50" cy="-36" r="34"/><circle cx="50" cy="-36" r="34"/><polyline points="-50,-36 -18,-36 -4,-76 38,-76 50,-36" stroke="#2F6DB5" stroke-width="6"/><line x1="-18" y1="-36" x2="-28" y2="-82" stroke="#2F6DB5" stroke-width="6"/><line x1="-36" y1="-86" x2="-20" y2="-86" stroke-width="7"/><line x1="38" y1="-76" x2="34" y2="-96"/><line x1="26" y1="-98" x2="46" y2="-98" stroke-width="6"/>`;
}
const chipVeh = t => `<svg viewBox="-92 -140 184 150" aria-hidden="true"><g class="uveh">${sideVeh(t)}</g></svg>`;
function camVeh(t){
  if(t==='scooter') return `<ellipse cx="150" cy="138" rx="5" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="136" y="118" width="28" height="5" rx="2" fill="#35505f" stroke="none"/><line x1="150" y1="118" x2="150" y2="84" stroke-width="4"/><line x1="128" y1="83" x2="172" y2="83" stroke-width="5"/>`;
  if(t==='mono') return `<ellipse cx="150" cy="130" rx="13" ry="34" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="139" y="92" width="22" height="34" rx="6" fill="#2F6DB5" stroke="none"/>`;
  if(t==='adaptive') return `<ellipse cx="124" cy="136" rx="4" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><ellipse cx="176" cy="136" rx="4" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="138" y="92" width="24" height="30" rx="6" fill="#2F6DB5" stroke="none"/><line x1="138" y1="106" x2="162" y2="106" stroke-width="4"/>`;
  return `<path d="M155 4 V14 a5 5 0 0 1 -10 0 v-3" stroke-width="3"/><ellipse cx="150" cy="44" rx="6" ry="28" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><line x1="150" y1="72" x2="150" y2="84" stroke-width="4"/><line x1="124" y1="84" x2="176" y2="84" stroke-width="5"/><rect x="146" y="84" width="8" height="18" fill="#D8453B" stroke="none"/><ellipse cx="150" cy="126" rx="7" ry="25" fill="#0b0f13" stroke="#59687a" stroke-width="3"/>`;
}
function camBlock(b){
  const open = b.status !== 'parked', st = stById(b.stationId);
  return `<div class="cam"><svg viewBox="0 0 300 170" class="${open ? '' : 'ir'}" aria-label="Відео з камери слота №${b.slot+1}">
    <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3a46"/><stop offset="1" stop-color="#10161c"/></linearGradient></defs>
    <rect width="300" height="170" fill="url(#cg)"/>
    <polygon points="30,0 270,0 220,95 80,95" fill="#35444f"/><polygon points="0,170 80,95 220,95 300,170" fill="#1b242c"/>
    <polygon points="0,0 30,0 80,95 0,170" fill="#26323c"/><polygon points="300,0 270,0 220,95 300,170" fill="#26323c"/>
    ${open ? '<rect width="300" height="170" fill="#fff6dc" opacity=".12"/>' : ''}
    <rect x="132" y="158" width="36" height="8" rx="2" fill="#0b0f13"/>
    ${['parked','pickupOpen'].includes(b.status) ? `<g fill="none" stroke="#c9d4dc" stroke-linecap="round">${camVeh(b.vehicle)}</g>` : ''}
    ${b.charge && b.status === 'parked' ? '<path d="M262 60 C 240 110, 200 110, 166 116" fill="none" stroke="#F2B21B" stroke-width="2.5"/><rect x="258" y="52" width="9" height="12" rx="2" fill="#d8dde3"/>' : ''}
    <text x="10" y="18" font-size="10" fill="#fff" font-family="JetBrains Mono,monospace"><tspan class="rec" fill="#ff4a40">●</tspan> LIVE · ${esc(st.id.toUpperCase())}-0${b.slot+1}</text>
    <text x="290" y="18" font-size="10" fill="#fff" text-anchor="end" font-family="JetBrains Mono,monospace" id="camTime">${new Date().toTimeString().slice(0,8)}</text>
    <text x="10" y="162" font-size="9" fill="#9fb0bd" font-family="JetBrains Mono,monospace">1080p · шифрований канал</text>
    <text x="290" y="162" font-size="9" fill="${open ? '#ffd27a' : '#9fb0bd'}" text-anchor="end" font-family="JetBrains Mono,monospace">${open ? 'ДВЕРІ ВІДЧИНЕНО' : 'ЗАЧИНЕНО · ІЧ'}</text>
  </svg><div class="scan"></div></div>`;
}
const stById = id => STATIONS.find(s => s.id === id);
const freeCount = st => st.slots.filter(s => s.st === 'free').length;
const fits = (st, k) => { const v = VEH[vehicle()]; const sl = st.slots[k]; return (!v.wide || sl.wide); };
const vehicle = () => (me() && me().vehicle) || 'bike';
const wantCharge = () => !!(me() && me().charge);
const activeBk = () => L.bookings.find(b => ['reserved','open','parked','pickupOpen'].includes(b.status));

/* ================= map ================= */
function mapSVG(){
  const z = S.zoom, p = userPos(), w = 360/z, h = 440/z;
  const vx = Math.max(0, Math.min(360 - w, p.x - w/2)), vy = Math.max(0, Math.min(440 - h, p.y - h/2));
  const line = l => `<polyline class="m-line" stroke="${l.color}" points="${l.pts.map(q => q.join(',')).join(' ')}"/>` + l.pts.map(q => `<circle class="m-stop" stroke="${l.color}" cx="${q[0]}" cy="${q[1]}" r="1.8"/>`).join('');
  const reqs = L.requests || [];
  const flt = st => !S.filter || (S.filter === 'charge' ? st.slots.some(s => s.charge && s.st === 'free') : S.filter === 'wide' ? st.slots.some(s => s.wide && s.st === 'free') : true);
  return `<svg class="map" id="mapSvg" preserveAspectRatio="xMidYMid slice" viewBox="${vx.toFixed(1)} ${vy.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="Схематична карта Києва з планованими станціями Anchor біля метро">
    <rect class="m-bg" x="0" y="0" width="360" height="440"/>
    <path class="m-park" d="M40 60 q30 -20 60 0 q10 30 -20 40 q-35 0 -40 -40z"/><path class="m-park" d="M150 380 q30 -15 55 5 q0 30 -30 35 q-30 -5 -25 -40z"/><path class="m-park" d="M205 120 q20 -10 25 10 l-5 30 q-15 5 -20 -40z"/>
    <path class="m-water" d="M228 0 C 212 60, 232 110, 214 150 C 200 185, 238 215, 226 255 C 214 300, 246 340, 232 390 C 226 415, 238 430, 236 440 L 266 440 C 268 410, 256 380, 262 340 C 270 290, 244 250, 256 210 C 268 170, 240 120, 252 70 C 258 40, 250 15, 252 0 Z"/>
    <path class="m-park" d="M226 150 q14 -20 22 0 q6 30 -10 45 q-14 -10 -12 -45z"/>
    <path class="m-road" d="M0 230 C 80 228, 150 235, 230 230 C 290 228, 330 236, 360 232"/><path class="m-road" d="M150 0 C 150 120, 140 260, 160 440"/><path class="m-road" d="M0 300 C 90 290, 200 300, 360 310"/>
    ${DISTRICTS.map(d => `<text class="m-dist" x="${d[1]}" y="${d[2]}">${esc(d[0].toUpperCase())}</text>`).join('')}
    <text class="m-dist" x="240" y="420" transform="rotate(-80 240 420)" style="fill:var(--blue);opacity:.6">ДНІПРО</text>
    ${line(LINES.r)}${line(LINES.b)}${line(LINES.g)}
    ${reqs.map(r => { const d = DISTRICTS.find(x => x[0] === r.district); return d ? `<circle class="req-pin" cx="${d[1]}" cy="${d[2] + 8}" r="9"/>` : ''; }).join('')}
    ${STATIONS.filter(flt).map(st => { const f = freeCount(st); return `<g class="st-pin${S.stationId === st.id ? ' sel' : ''}" data-act="pickStation" data-id="${st.id}" role="button" tabindex="0" aria-label="${esc(st.name)}: вільних ${f}">
      ${S.stationId === st.id ? `<circle class="sel-ring" cx="${st.x}" cy="${st.y}" r="${8/Math.sqrt(z)+1}"/>` : ''}<circle class="o" cx="${st.x}" cy="${st.y}" r="${8/Math.sqrt(z)+1}" fill="${f ? '#F29A1F' : '#8E96A3'}"/><text x="${st.x}" y="${st.y + 2.6}" style="font-size:${7.5/Math.sqrt(z)}px">${f}</text></g>`; }).join('')}
    <circle class="pulse" cx="${p.x}" cy="${p.y}" r="${5/Math.sqrt(z)}"/><circle class="me" cx="${p.x}" cy="${p.y}" r="${3.6/Math.sqrt(z)}"/>
  </svg>`;
}
const nearest = () => STATIONS.slice().sort((a, b) => distTo(a) - distTo(b))[0];

/* ================= views =================
   Like a sharing app: the map is home and fills the screen; choosing a slot, the tariff and the live booking all happen
   in one bottom sheet over it. Rare things (history, account, survey, requests, my data) live in the side menu. */
const IC2 = {
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  locate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg>',
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 9h18"/></svg>',
  pin:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  leaf:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19C5 9 11 4 20 4c0 9-5 15-15 15z"/><path d="M5 19l8-8"/></svg>',
  plug:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/></svg>',
  ble:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z"/></svg>',
  play:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  info:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
};
const TITLES = {mydata:'Приватність і дані', welcome:'', auth:'Вхід', otp:'Код підтвердження', onboard:'Ваш транспорт', pay:'Оплата', history:'Історія', profile:'Профіль', survey:'Анкета', request:'Нова станція', bonus:'Бонуси', honest:'Пропозиція'};
const MAPLIKE = ['map','station','tariff','book','bookings'];
const MSG = {
  A:{eb:'Безпека', h:'Ваш велосипед під замком біля метро', li:[[IC2.bell,'Охорона'],[IC.lock,'Сталеві двері'],[IC2.cam,'Камера']]},
  B:{eb:'Для всіх', h:'Місце для будь-якого транспорту біля метро', li:[[IC.map,'Будь-який транспорт'],[IC2.plug,'Зарядка'],[IC2.leaf,'Менше авто']]},
};
const LOGO = '<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="4" width="32" height="5" rx="1.5" fill="#F29A1F"/><rect x="3" y="9" width="28" height="22" rx="2" fill="#2D3642"/><rect x="5.5" y="13" width="9" height="16" rx="1" fill="#7FC4CC"/><rect x="19.5" y="13" width="9" height="16" rx="1" fill="#7FC4CC"/><rect x="15.5" y="12" width="3" height="19" fill="#8E96A3"/><circle class="l1" cx="10" cy="11" r="1.5" fill="#2FD36B"/><circle class="l2" cx="24" cy="11" r="1.5" fill="#FF4A3F"/></svg>';
const sw = (id, label, on, act) => `<label class="sw" for="${id}"><span>${label}</span><input type="checkbox" id="${id}" data-act="${act}" ${on ? 'checked' : ''}></label>`;
const vehTiles = () => `<div class="vtiles">${Object.keys(VEH).map(k => `<button class="vt2" data-act="setVeh" data-t="${k}" aria-pressed="${vehicle() === k}">${chipVeh(k)}<span>${VEH[k].name}</span></button>`).join('')}</div>`;
const V = {
  welcome(){
    const m = MSG[AN.ab.msg], cta = AN.ab.cta;
    return `<div class="pad wl">
      <div class="logo"><svg viewBox="0 0 34 34" aria-hidden="true"><rect x="1" y="4" width="32" height="5" rx="1.5" fill="#F29A1F"/><rect x="3" y="9" width="28" height="22" rx="2" fill="#2D3642"/><rect x="5.5" y="13" width="9" height="16" rx="1" fill="#7FC4CC"/><rect x="19.5" y="13" width="9" height="16" rx="1" fill="#7FC4CC"/><rect x="15.5" y="12" width="3" height="19" fill="#8E96A3"/></svg>ANCHOR</div>
      ${heroArt()}
      <h1 class="wl-h">${m.h}</h1>
      <div class="feat2">${m.li.map(([ic, t]) => `<span>${ic}${t}</span>`).join('')}</div>
      <div class="spacer"></div>
      <div class="cta2">${cta === 'A' ? (sess.contact ? '<p class="ok">Дякуємо! Повідомимо про запуск.</p>' : `<b>Повідомити про запуск?</b>
          <div class="inrow"><input class="field" id="ctaContact" placeholder="Телефон або пошта" aria-label="Телефон або пошта" autocomplete="off"><button class="btn line" data-act="ctaContact">OK</button></div>
          ${consentBox('ctaOk')}<p class="err" id="ctaErr"></p>`)
        : (sess.ctaYes === null ? `<span class="demo">${C.DEMO_PAY_NOTE}</span><b>Перший місяць Pro −20%: ${Math.round(priceOf('pro')*.8)} грн</b><p class="sub">Внесете передплату 50% на старті?</p>
          <div class="yn"><button data-act="ctaYes" data-v="1">Так</button><button data-act="ctaYes" data-v="0">Поки ні</button></div>`
          : `<p class="${sess.ctaYes ? 'ok' : 'sub'}">${sess.ctaYes ? 'Дякуємо! Знижку закріпимо за вами.' : 'Добре, спершу спробуйте застосунок.'}</p>`)}</div>
      <button class="btn" data-act="toAuth">Почати</button>
      <p class="fine">Тестова версія: станцій ще немає, оплата імітується · <button class="linkbtn" data-act="myData">Приватність</button></p>
    </div>`;
  },
  auth(){
    const ph = S.authTab === 'phone';
    return `<div class="pad">
      <div class="tabs2" role="tablist"><button role="tab" aria-selected="${ph}" data-act="authTab" data-v="phone">Телефон</button><button role="tab" aria-selected="${!ph}" data-act="authTab" data-v="gmail">Gmail</button></div>
      <h2 class="vt">${ph ? 'Ваш номер' : 'Ваш Gmail'}</h2>
      <input class="field mono" id="authIn" type="${ph ? 'tel' : 'email'}" inputmode="${ph ? 'tel' : 'email'}" value="${esc(ph ? S.phoneDraft : S.mailDraft)}" placeholder="${ph ? '+380 XX XXX XX XX' : 'name@gmail.com'}" aria-label="${ph ? 'Номер телефону' : 'Адреса Gmail'}" autocomplete="off">
      <p class="err" id="authErr"></p>
      <div class="spacer"></div>
      <button class="btn" data-act="sendAuth">Отримати код</button>
      <p class="fine">Код ${ph ? 'в SMS' : 'на пошту'} приходить лише всередині сайту. Номер чи пошта лишаються у вашому браузері.</p>
    </div>`;
  },
  otp(){
    const locked = Date.now() < S.lockUntil, ch = channelOf(), a = me();
    const target = S.otpFor === 'login' ? (ch === 'gmail' ? maskMail(S.mailDraft) : maskPhone(S.phoneDraft)) : (a.method === 'gmail' ? maskMail(a.id) : maskPhone(a.id));
    const dots = [0,1,2].map(i => `<i class="${i >= S.tries ? 'used' : ''}"></i>`).join('');
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => k === '' ? '<button class="ph" tabindex="-1" aria-hidden="true"></button>' : `<button data-act="key" data-k="${k}" ${locked || S.checking ? 'disabled' : ''} aria-label="${k === '⌫' ? 'Стерти' : k}">${k}</button>`).join('');
    return `<div class="pad center">
      <p class="sub">${{login:'Вхід', book:'Підтвердження бронювання', pickup:'Підтвердження видачі'}[S.otpFor]} · ${esc(target)}</p>
      <div class="otpb${S.msgCls === 'ok' ? ' okk' : ''}" id="otpBoxes" role="img" aria-label="Введено цифр: ${S.otp.length} з 4">${[0,1,2,3].map(i => `<i class="${i === S.otp.length && !locked ? 'f' : ''}">${S.otp[i] || ''}</i>`).join('')}</div>
      ${locked ? `<div class="lock">Забагато спроб<b id="lockClock">${mmss(S.lockUntil - Date.now())}</b></div><button class="linkbtn" data-act="skipLock">Пропустити (демо)</button>`
        : `<p class="${S.msgCls || 'sub'}" role="status" aria-live="polite" style="min-height:1.3em">${S.msg}</p><div class="tries">${dots}</div>`}
      <div class="spacer"></div>
      <div class="inrow" style="justify-content:center"><button class="linkbtn" data-act="showCode" ${locked ? 'disabled' : ''}>Показати код</button><button class="linkbtn" data-act="resend" ${locked ? 'disabled' : ''}>Новий код</button></div>
      <div class="keypad">${keys}</div>
    </div>`;
  },
  onboard(){
    const a = me();
    return `<div class="pad">
      <h2 class="vt">З яким транспортом ви?</h2>
      ${vehTiles()}
      <div class="yn"><button data-act="setCharge" data-v="1" aria-pressed="${a.charge === true}">${IC2.plug.replace('<svg', '<svg width="18" height="18"')} Потрібна зарядка</button><button data-act="setCharge" data-v="0" aria-pressed="${a.charge === false}">Без зарядки</button></div>
      ${VEH[vehicle()].wide ? '<p class="sub">Покажемо лише широкі слоти.</p>' : ''}
      <div class="spacer"></div>
      <button class="btn" data-act="onboardDone" ${a.charge == null ? 'disabled' : ''}>Готово</button>
    </div>`;
  },
  map(){ return mapScreen(); }, station(){ return mapScreen(); }, tariff(){ return mapScreen(); }, book(){ return mapScreen(); }, bookings(){ return mapScreen(); },
  pay(){
    const pf = S.payFor || {};
    return `<div class="pad center">
      <p class="sub">${esc(pf.label || '')}</p>
      <div class="amount">${pf.amount} грн</div>
      ${pf.note ? `<p class="sub">${esc(pf.note)}</p>` : ''}
      ${S.payErr ? '<div class="banner" role="alert" style="width:100%;text-align:left"><b>Оплату відхилено</b>Банк не підтвердив платіж. Спробуйте ще раз або оберіть інший спосіб.</div>' : ''}
      <p class="label" style="align-self:flex-start">Спосіб оплати</p>${payMethods()}
      <span class="demo">${C.DEMO_PAY_NOTE}</span>
      <div class="spacer"></div>
      <button class="btn dark" data-act="pay" ${S.payBusy || !S.method ? 'disabled' : ''}>${S.payBusy ? '<span class="spin"></span> Оплата' : (S.payErr ? 'Оплатити ще раз · ' : 'Сплатити ') + pf.amount + ' грн'}</button>
    </div>`;
  },
  bonus(){ return bonusPage(); },
  honest(){
    return `<div class="pad">
      <span class="demo">${C.DEMO_PAY_NOTE}</span>
      ${S.honestSent ? '<div class="empty"><b>Дякуємо!</b>Повідомимо, коли пропозиція стане доступною.</div>' : `<p>${esc(C.HONEST_OFFER_TEXT)}</p>
      <input class="field" id="honestContact" placeholder="Телефон або Telegram (необов’язково)" aria-label="Телефон або Telegram" autocomplete="off">
      ${consentBox('honestOk')}<p class="err" id="honestErr"></p>
      <button class="btn" data-act="honestSend">Повідомити мене</button>`}
      <div class="spacer"></div>
      <button class="linkbtn" data-act="back">Назад</button>
    </div>`;
  },
  history(){
    const h = L.bookings.filter(b => ['done','cancelled','expired'].includes(b.status)).sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    if(!h.length) return `<div class="pad"><div class="empty">${IC.clock.replace('<svg', '<svg width="34" height="34"')}<b>Поки порожньо</b>Тут будуть ваші паркування</div></div>`;
    return `<div class="pad"><div class="hist">${h.map(b => { const st = stById(b.stationId), t = b.tariff ? T(b.tariff) : {name:'Бронь ' + minTxt(b.min || 0)};
      return `<div class="hrow"><div class="top"><span>${esc(st.name)}</span><span>${b.status === 'done' ? b.paidTotal + ' грн' : `<span class="pill r">${b.status === 'cancelled' ? 'скасовано' : 'минула'}</span>`}</span></div>
        <div class="hmeta"><span>${dt(b.createdAt)}</span>${b.status === 'done' ? `<span>${hm(b.parkedAt)}–${hm(b.endedAt)} · ${fmt(b.elapsed).slice(0,5)}</span>` : ''}<span>${t.name}${t.hours ? ' ' + b.hours + ' год' : ''}</span><span>${b.charge ? '⚡ ' + (b.status === 'done' ? Math.floor(b.battery) + '%' : 'так') : 'без зарядки'}</span>${b.method ? `<span>${esc(b.method)}</span>` : ''}</div></div>`; }).join('')}</div><p class="fine">Оплати в історії демонстраційні</p></div>`;
  },
  profile(){
    const a = me();
    return `<div class="pad">
      <div class="prof"><span>${a.method === 'gmail' ? 'Gmail' : 'Телефон'}</span><b>${esc(a.method === 'gmail' ? maskMail(a.id) : maskPhone(a.id))}</b></div>
      <p class="label">Транспорт</p>${vehTiles()}
      ${sw('chSw', 'Потрібна зарядка', wantCharge(), 'toggleCharge')}
      ${sw('bigSw2', 'Великий текст', S.big, 'toggleBig')}
      ${sw('voiceSw2', 'Голосові підказки', S.voice, 'toggleVoice')}
      <label class="sw" for="langSel"><span>Мова</span><select id="langSel" class="field" style="width:auto"><option selected>Українська</option><option disabled>English · скоро</option></select></label>
    </div>`;
  },
  survey(){
    const f = S.survey, ans = (k, opts) => `<div class="yn${opts.length === 3 ? ' three' : ''}">${opts.map(([v, l]) => `<button data-act="svAns" data-k="${k}" data-v="${v}" aria-pressed="${f[k] === v}">${l}</button>`).join('')}</div>`;
    if(f.sent) return `<div class="pad center"><div class="okc g">${IC.check}</div><h2 class="vt">Дякуємо!</h2><div class="spacer"></div><button class="btn" data-act="tab" data-v="map">До мапи</button></div>`;
    const n = f.features.length + (f.otherOn ? 1 : 0);
    return `<div class="pad">
      <fieldset class="q"><legend>Наскільки Anchor допоміг би вам?</legend>
        <div class="stars" role="radiogroup" aria-label="Оцінка від 1 до 5">${[1,2,3,4,5].map(n => `<button role="radio" aria-checked="${f.rating === n}" aria-label="${n} з 5" class="${n <= f.rating ? 'on' : ''}" data-act="svStar" data-n="${n}">${IC.star}</button>`).join('')}</div></fieldset>
      <fieldset class="q"><legend>Зрозуміло, як це працює?</legend>${ans('understood', [['yes','Так'],['part','Частково'],['no','Ні']])}</fieldset>
      <fieldset class="q"><legend>Користувалися б за такими цінами?</legend>${ans('wouldUse', [['yes','Так'],['no','Ні']])}</fieldset>
      <fieldset class="q"><legend>Які функції з тестування вам сподобались і ви хотіли б бачити у фінальній версії? (до 3)</legend>
        <div class="checks">${FEATURES.map((t, i) => `<label for="ft${i}"><input type="checkbox" id="ft${i}" data-act="feat" data-v="${i+1}" ${f.features.includes(i+1) ? 'checked' : ''} ${n >= 3 && !f.features.includes(i+1) ? 'disabled' : ''}>${esc(t)}</label>`).join('')}
        <label for="ftO"><input type="checkbox" id="ftO" data-act="featOther" ${f.otherOn ? 'checked' : ''} ${n >= 3 && !f.otherOn ? 'disabled' : ''}>Інше</label>
        ${f.otherOn ? `<input class="field" id="ftOther" value="${esc(f.other)}" maxlength="120" placeholder="Що саме?" aria-label="Інша функція">` : ''}</div>
        <p class="sub">Обрано ${n} з 3</p></fieldset>
      ${sess.contact ? '' : `<div class="q"><label class="ql" for="svContact">Контакт для новин (за бажанням)</label><input class="field" id="svContact" value="${esc(f.contact)}" placeholder="Телефон або Telegram" autocomplete="off">${consentBox('svOk')}</div>`}
      <p class="err" id="svErr"></p>
      <button class="btn" data-act="svSend">Надіслати</button>
    </div>`;
  },
  mydata(){
    if(S.deleted) return `<div class="pad center"><div class="okc g">${IC.check}</div><h2 class="vt">Дані видалено</h2><p class="sub">Усе, що застосунок зберіг у цьому браузері, стерто.</p></div>`;
    const c = AN.consent(), code = AN.sessionCode();
    return `<div class="pad">
      <div class="q"><b>Статистика використання</b><p class="sub">${c === 'accepted' ? 'Увімкнено: знеособлена статистика.' : c === 'necessary' ? 'Вимкнено: ви не прийняли.' : 'Ви ще не обрали.'}</p>
        <div class="yn"><button data-act="consent" data-v="accepted" aria-pressed="${c === 'accepted'}"><span>Прийняти<small>лише необхідні для тестування MVP</small></span></button><button data-act="consent" data-v="necessary" aria-pressed="${c === 'necessary'}">Не приймаю</button></div>
        <details><summary class="linkbtn">Що саме збираємо</summary><ul class="sub">${C.CONSENT_DETAILS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details></div>
      ${code ? `<div class="q"><b>Код вашої сесії</b><div class="inrow"><span class="code grow" id="sessCode">${esc(code)}</span><button class="btn line" data-act="copyCode">Скопіювати</button></div></div>` : ''}
      <p class="sub">Контакт зберігаємо лише за окремою згодою. Номер чи пошта для входу лишаються в цьому браузері.</p>
      <a class="linkbtn" href="privacy.html" style="align-self:flex-start">Політика приватності</a>
      <div class="spacer"></div>
      <button class="btn dark" data-act="deleteData">Видалити мої дані з цього браузера</button>
    </div>`;
  },
  request(){
    const r = S.req;
    if(r.sent) return `<div class="pad center"><div class="okc g">${IC.check}</div><h2 class="vt">Заявку прийнято</h2><p class="sub">${esc(r.district)}: +1 голос</p><div class="spacer"></div><button class="btn" data-act="tab" data-v="map">До мапи</button></div>`;
    return `<div class="pad">
      <p class="sub">Найближча станція — ${kmTxt(distTo(nearest()))}. Скажіть, де вона потрібна.</p>
      <select class="field" id="rqDist" aria-label="Район"><option value="">Район</option>${ALL_DISTRICTS.map(d => `<option ${r.district === d ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <input class="field" id="rqPlace" value="${esc(r.place)}" placeholder="Метро, вулиця, ЖК, університет" aria-label="Місце" autocomplete="off">
      <input class="field" id="rqContact" placeholder="Контакт для новин (за бажанням)" aria-label="Контакт" autocomplete="off">
      ${consentBox('rqOk')}
      <p class="err" id="rqErr"></p>
      <div class="spacer"></div>
      <button class="btn" data-act="sendRequest">Надіслати</button>
    </div>`;
  },
};
const chargeFor = (st, k) => wantCharge() && VEH[vehicle()].electric && st.slots[k].charge;

/* ---- illustrations ---- */
function heroArt(){
  const mod = (x, lampCls, i) => `<rect x="${x}" y="36" width="70" height="78" rx="4" fill="#2D3642"/><rect x="${x+6}" y="50" width="26" height="58" rx="2" fill="#1a222b"/><rect x="${x+38}" y="50" width="26" height="58" rx="2" fill="#1a222b"/>
    <circle cx="${x+19}" cy="43" r="3.2" fill="${i ? '#FF4A3F' : '#2FD36B'}" class="${i === 2 ? 'ha-blink' : ''}"/><circle cx="${x+51}" cy="43" r="3.2" class="${lampCls}" fill="#2FD36B"/>
    <rect x="${x+6}" y="50" width="26" height="58" rx="2" fill="#7FC4CC" opacity=".55"/>`;
  return `<svg class="hero-art" viewBox="0 0 300 140" aria-hidden="true">
    <rect width="300" height="140" fill="var(--navy)"/><rect y="114" width="300" height="26" fill="#18263A"/>
    <rect x="34" y="28" width="232" height="8" rx="2" fill="#F29A1F"/>
    ${mod(36, '', 0)}${mod(115, 'ha-lamp', 1)}${mod(194, '', 2)}
    <rect x="194" y="50" width="26" height="58" rx="2" fill="#7FC4CC" opacity=".55"/><rect x="232" y="50" width="26" height="58" rx="2" fill="#7FC4CC" opacity=".55"/>
    <rect x="74" y="50" width="26" height="58" rx="2" fill="#7FC4CC" opacity=".55"/>
    <g class="ha-in"><ellipse cx="166" cy="84" rx="3" ry="16" fill="#0b0f13"/><line x1="156" y1="70" x2="176" y2="70" stroke="#c9d4dc" stroke-width="3" stroke-linecap="round"/></g>
    <rect class="ha-door" x="153" y="50" width="26" height="58" rx="2" fill="#7FC4CC" opacity=".75"/>
    <g class="ha-bikeg"><g class="ha-bike"><g transform="translate(166 112) scale(.32)" class="uveh" style="stroke:#E7EEF4">${sideVeh('bike')}</g></g></g>
    <text x="150" y="132" text-anchor="middle" fill="#93A4B4" style="font:700 9px var(--font-body);letter-spacing:.2em">ANCHOR · КИЇВ</text>
  </svg>`;
}
function slotArt(state, veh){
  const lamp = {open:'#3F8CFF', pickup:'#2FD36B', parked:'#FF4A3F', reserved:'#3F8CFF'}[state];
  const inside = state === 'parked' || state === 'pickup';
  return `<svg class="art art-${state}${state === 'parked' ? ' art-lock' : ''}" viewBox="0 0 240 130" aria-hidden="true">
    <rect x="0" y="118" width="240" height="4" rx="2" fill="var(--line)"/>
    <rect x="80" y="6" width="80" height="112" rx="6" fill="#2D3642"/><rect x="80" y="6" width="80" height="7" rx="3" fill="#F29A1F"/>
    <circle cx="120" cy="22" r="5" fill="${lamp}" class="${state === 'parked' ? '' : 'lampg'}"/>
    <rect x="90" y="32" width="60" height="80" rx="3" fill="#1a222b"/>
    <path d="M124 36 v9 a4 4 0 0 1 -8 0" fill="none" stroke="#B9C2CC" stroke-width="2.5" stroke-linecap="round"/>
    <g class="veh"${inside || state === 'open' ? '' : ' style="opacity:0"'}><g transform="translate(120 112) scale(.38)" class="uveh" style="stroke:#E7EEF4">${sideVeh(veh)}</g></g>
    <rect class="door" x="90" y="32" width="60" height="80" rx="3" fill="#7FC4CC" opacity="${state === 'parked' || state === 'reserved' ? .85 : .7}"/>
    ${state === 'parked' ? '<g transform="translate(108 58)"><path class="shackle" d="M5 12 V7 a7 7 0 0 1 14 0 V12" fill="none" stroke="#14202B" stroke-width="3.5"/><rect x="1" y="12" width="22" height="17" rx="3" fill="#F29A1F"/></g>' : ''}
  </svg>`;
}
const RING_C = 2*Math.PI*70;
const ring = (frac, inner, cls = '') => `<div class="ring"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="trk" cx="80" cy="80" r="70"/><circle class="val ${cls}" id="ringVal" cx="80" cy="80" r="70" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${(RING_C*(1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}"/></svg><div class="in">${inner}</div></div>`;
const parkFrac = b => Math.min(1, b.elapsed/((b.plan || 1)*3.6e6));
const resFrac = b => Math.max(0, (b.until - Date.now())/(b.min*60000));
function payFx(amount, line){
  const el = document.createElement('div'); el.className = 'fx';
  el.innerHTML = `<div><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="50"/><path d="M32 57l15 15 31-33"/></svg>${amount} грн<small>${line}</small></div>`;
  $('#app').append(el); setTimeout(() => el.remove(), 2000);
}

/* ---- the map screen and its bottom sheet ---- */
let mapBooted = false, lastSheetKey = '';
function mapScreen(){
  const f = (k, ic, l) => `<button class="chip f" data-act="filter" data-v="${k}" aria-pressed="${S.filter === k}">${ic}${l}</button>`;
  return `<div class="ms${mapBooted ? '' : ' boot'}">${mapSVG()}
    <div class="topbar">
      <button class="fab" data-act="menu" aria-label="Меню">${IC2.menu}</button>
      <button class="search" data-act="toggleList" aria-pressed="${S.list}">${IC2.pin}<span>Станції Києва<small> · ${STATIONS.length} локацій</small></span></button>
      <button class="fab mascot${mascotOn() ? ' anim' : ''}" data-act="mascot" aria-label="Anchor: факт">${LOGO}</button>
    </div>
    <div class="filters">${f('charge', IC.bolt.replace('<svg', '<svg width="11" height="13"'), ' Зарядка')}${f('wide', IC.wide.replace('<svg', '<svg width="13" height="13"'), ' Широкий')}<button class="chip f muted" data-act="testInfo">${IC2.info.replace('<svg', '<svg width="13" height="13"')} Тестова версія</button></div>
    <div class="side-fabs"><button class="fab" data-act="pickMe" aria-pressed="${S.picking}" aria-label="Обрати моє місце на мапі">${IC2.locate}</button><button class="fab" data-act="zoom" data-d="1" aria-label="Наблизити">+</button><button class="fab" data-act="zoom" data-d="-1" aria-label="Віддалити">−</button></div>
    ${S.picking ? '<div class="picking">Торкніться мапи там, де ви зараз</div>' : ''}
    <div class="bs${S.snap && S.snap !== 'auto' ? ' h-' + S.snap : ''}" id="sheet"><div class="grabber" data-grab role="button" tabindex="0" aria-label="Розгорнути або згорнути картку"><div class="grab"></div></div>${sheetHtml()}</div>
  </div>`;
}
function sheetHtml(){
  const b = activeBk();
  if(S.screen === 'station') return sheetSlots();
  if(S.screen === 'tariff') return sheetTariff();
  if(S.screen === 'book') return sheetBook();
  if(b) return rideCard(b);
  const last = L.bookings.find(x => x.id === S.bkId && x.status === 'done');
  if(last) return receipt(last);
  if(S.list) return sheetList();
  return sheetStation();
}
const stHead = (st, back) => `<div class="st-head">${back ? `<button class="fab sm" data-act="back" aria-label="Назад">${IC.back}</button>` : `<span class="mline" style="background:${LINES[st.line].color}"></span>`}
  <div class="nm"><b>${esc(st.name)}</b><small>${esc(st.addr)}</small></div><span class="dist">${distTxt(st)}</span></div>`;
/* demo: geolocation is simulated, the visitor can switch "near / far" by hand */
const isNear = st => S.mode[st.id] ? S.mode[st.id] === 'near' : distTo(st) <= 500;
const distTxt = st => S.mode[st.id] ? (isNear(st) ? '30 м' : '1,2 км') : kmTxt(distTo(st));
function modeSwitch(st){
  const n = isNear(st), k = 'mode_' + st.id + (n ? 'n' : 'f');
  if(!S.seen[k]){ S.seen[k] = 1; track(n ? 'mode_near_shown' : 'mode_far_shown', {station:st.id, auto:!S.mode[st.id]}); }
  return `<div class="modesw"><div class="tabs2" role="group" aria-label="Демо: де ви зараз"><button data-act="mode" data-v="near" aria-pressed="${n}">Я біля станції</button><button data-act="mode" data-v="far" aria-pressed="${!n}">Я далеко</button></div><small>Демо: імітація геолокації</small></div>`;
}
function sheetStation(){
  const nd = distTo(nearest());
  if(nd > 1500 && !S.stationId) return `<div class="st-head"><span class="ic-c">${IC2.pin}</span><div class="nm"><b>Поруч немає станції</b><small>Найближча за ${kmTxt(nd)}</small></div></div>
    <button class="btn" data-act="toRequest">Попросити станцію тут</button><button class="btn line" data-act="pickStation" data-id="${nearest().id}">Показати найближчу</button>`;
  const st = S.stationId ? stById(S.stationId) : nearest();
  const free = freeCount(st), ch = st.slots.filter(s => s.charge && s.st === 'free').length, wd = st.slots.filter(s => s.wide && s.st === 'free').length;
  return `${stHead(st)}
    <div class="stats"><span><i class="dot g"></i>${free} вільні</span><span>${IC.bolt.replace('<svg', '<svg width="11" height="13"')} ${ch}</span><span>${IC.wide.replace('<svg', '<svg width="13" height="13"')} ${wd}</span><span class="muted">планована</span></div>
    ${modeSwitch(st)}
    <button class="btn" data-act="openStation" data-id="${st.id}" ${free ? '' : 'disabled'}>${free ? (isNear(st) ? `${IC2.ble.replace('<svg', '<svg width="18" height="18"')} Обрати слот і відкрити` : `Забронювати до ${minTxt(C.BOOKING_MAX)}`) : 'Немає вільних слотів'}</button>
    ${S.snap !== 'auto' ? `<p class="label">Інші станції</p><div class="stlist">${STATIONS.filter(x => x.id !== st.id).sort((a, b) => distTo(a) - distTo(b)).map(x => `<button class="strow" data-act="pickStation" data-id="${x.id}"><span class="mline" style="background:${LINES[x.line].color}"></span><span><b>${esc(x.name)}</b><small>${freeCount(x)} вільні${x.slots.some(q => q.charge && q.st === 'free') ? ' · ⚡' : ''}</small></span><span class="km">${kmTxt(distTo(x))}</span></button>`).join('')}</div><button class="linkbtn" data-act="toRequest">Немає вашого району? Попросіть станцію</button>` : ''}`;
}
function sheetList(){
  const list = STATIONS.slice().sort((a, b) => distTo(a) - distTo(b));
  return `<div class="st-head"><div class="nm"><b>Усі станції</b></div><button class="fab sm" data-act="toggleList" aria-label="Закрити список">${IC2.close}</button></div>
    <div class="stlist">${list.map(st => `<button class="strow" data-act="pickStation" data-id="${st.id}"><span class="mline" style="background:${LINES[st.line].color}"></span><span><b>${esc(st.name)}</b><small>${freeCount(st)} вільні${st.slots.some(s => s.charge && s.st === 'free') ? ' · ⚡' : ''}</small></span><span class="km">${kmTxt(distTo(st))}</span></button>`).join('')}</div>
    <button class="linkbtn" data-act="toRequest">Немає вашого району? Попросіть станцію</button>`;
}
function sheetSlots(){
  const st = stById(S.stationId), v = vehicle();
  const sq = k => { const sl = st.slots[k], nc = sl.st === 'free' && !fits(st, k), cls = nc ? 'nc' : sl.st === 'free' ? 'g' : sl.st === 'booked' ? 'b' : 'r';
    return `<button class="sq ${cls}${S.slot === k ? ' sel' : ''}" data-act="pickSlot" data-k="${k}" aria-label="Слот ${k+1}: ${nc ? 'не підходить' : {g:'вільний', b:'заброньований', r:'зайнятий'}[cls] || ''}${sl.charge ? ', із зарядкою' : ''}${sl.wide ? ', широкий' : ''}">${k+1}<small>${sl.charge ? IC.bolt.replace('<svg', '<svg width="8" height="10"') : ''}${sl.wide ? IC.wide.replace('<svg', '<svg width="10" height="10"') : ''}</small></button>`; };
  const hint = VEH[v].wide ? 'Підходить лише широкий слот' : wantCharge() && VEH[v].electric ? 'Оберіть слот з ⚡' : v === 'bike' ? 'У кожному слоті гак для колеса' : 'Оберіть зелений слот';
  return `${stHead(st, true)}
    <div class="vrow">${Object.keys(VEH).map(k => `<button class="vmini" data-act="setVeh" data-t="${k}" aria-pressed="${v === k}" aria-label="${VEH[k].name}" title="${VEH[k].name}">${chipVeh(k)}</button>`).join('')}<button class="vmini" data-act="toggleCharge" aria-pressed="${wantCharge()}" aria-label="Потрібна зарядка" title="Потрібна зарядка">${IC2.plug}</button></div>
    <div class="slotrow">${[0,1,2].map(m => `<div class="pair">${sq(m*2)}${sq(m*2+1)}</div>`).join('')}</div>
    <p class="sub center-t">${hint} · ${isNear(st) ? 'відкриємо через Bluetooth' : 'забронюємо наперед'}</p>`;
}
const PAY_METHODS = ['Google Pay', 'Apple Pay', 'Картка'];
const payMethods = () => `<div class="paym" role="group" aria-label="Спосіб оплати (демо)">${PAY_METHODS.map(l => `<button data-act="method" data-v="${l}" aria-pressed="${S.method === l}">${l}</button>`).join('')}</div>`;
function sheetTariff(){
  const st = stById(S.stationId), t = T(S.tariff), b = activeBk();
  if(S.ble) return `<div class="ble"><span>${IC2.ble}</span></div><p class="sub center-t">Відкриваємо слот №${S.slot+1} через Bluetooth…</p>`;
  return `<div class="st-head"><button class="fab sm" data-act="back" aria-label="Назад">${IC.back}</button><div class="nm"><b>Слот №${S.slot+1}${chargeFor(st, S.slot) ? ' · ⚡' : ''}</b><small>${esc(st.name)}</small></div></div>
    <div class="tcards">${TARIFFS.map(x => `<button class="tc" data-act="setTariff" data-id="${x.id}" aria-pressed="${S.tariff === x.id}"><b>${x.name}</b><span class="p">${priceOf(x.id)} грн</span><small>${x.unit}</small></button>`).join('')}</div>
    ${t.hours ? `<div class="stepper"><span>Години</span><div><button data-act="hours" data-d="-1" aria-label="Менше годин">−</button><b>${S.hours}</b><button data-act="hours" data-d="1" aria-label="Більше годин">+</button></div></div>` : ''}
    <div class="payline"><span>${t.name}${t.hours ? ' · ' + S.hours + ' год' : ''}</span><b>${tariffFull(S.tariff, S.hours)} грн</b></div>
    <p class="fine">${b && b.prepay ? `Передоплату ${b.prepay} грн зарахуємо при забиранні · ` : ''}Оплата при забиранні · ${C.DEMO_PAY_NOTE}</p>
    <button class="btn" data-act="openSlot">${IC2.ble.replace('<svg', '<svg width="18" height="18"')} Відкрити слот №${S.slot+1}</button>`;
}
function sheetBook(){
  const st = stById(S.stationId), min = S.min, cost = bookingCost(min), pct = prepayPct(min), pre = prepayOf(min), max = prepayOf(C.BOOKING_MAX);
  if(!S.seen['pp' + min]){ S.seen['pp' + min] = 1; track('booking_prepay_shown', {min, pct, uah:pre}); }
  return `<div class="st-head"><button class="fab sm" data-act="back" aria-label="Назад">${IC.back}</button><div class="nm"><b>Бронь слота №${S.slot+1}${chargeFor(st, S.slot) ? ' · ⚡' : ''}</b><small>${esc(st.name)}</small></div></div>
    <p class="label">Скільки тримати слот</p>
    <div class="durs" role="group" aria-label="Тривалість броні">${DURS.map(m => `<button data-act="dur" data-v="${m}" aria-pressed="${min === m}">${m < 60 ? m + ' хв' : (m/60).toString().replace('.', ',') + ' год'}</button>`).join('')}</div>
    <div class="sum"><div><span>Бронь ${minTxt(min)}</span><b>${Math.round(cost*100)/100} грн</b></div><div><span>Передоплата ${pct}%</span><b>${pre} грн</b></div></div>
    <div><div class="stairs" aria-hidden="true">${DURS.map(m => `<i class="${m <= min ? 'on' : ''}${m === min ? ' cur' : ''}" style="height:${Math.max(6, prepayOf(m)/max*100)}%" title="${minTxt(m)}: ${prepayOf(m)} грн"></i>`).join('')}</div>
      <div class="stairs-x" aria-hidden="true">${DURS.map(m => `<span>${m % 60 ? '' : m/60 + 'г'}</span>`).join('')}</div>
      <p class="sub">${C.PREPAY_NOTE}</p></div>
    <p class="sub">${C.PREPAY_CREDITED}</p>
    <p class="label">Спосіб оплати</p>${payMethods()}
    <span class="demo">${C.DEMO_PAY_NOTE}</span>
    <button class="btn" data-act="toConfirm" ${S.method ? '' : 'disabled'}>Підтвердити кодом · ${pre} грн</button>`;
}
function rideCard(b){
  const st = stById(b.stationId), t = b.tariff ? T(b.tariff) : null;
  const st2 = {reserved:['a','Заброньовано'], open:['b','Слот відчинено'], parked:['g','Під замком'], pickupOpen:['b','Видача']}[b.status];
  const head = `<div class="st-head"><span class="pill ${st2[0]}">${st2[1]}</span><div class="nm"><b>${esc(st.name)} · №${b.slot+1}</b><small>${t ? t.name + (t.hours ? ' · ' + b.hours + ' год' : '') : 'Бронь ' + minTxt(b.min)}${b.charge ? ' · ⚡' : ''}</small></div></div>`;
  const wide = S.snap !== 'auto', camOn = S.camOpen || wide, payOn = S.payOpen || wide;
  const tools = `<div class="iconrow"><button class="ib" data-act="camToggle" aria-pressed="${!!S.camOpen}">${IC2.cam}Камера</button><button class="ib" data-act="pinShow" aria-pressed="${!!S.pinShow}">${IC2.key}${S.pinShow ? `<span class="pinv">${b.pin}</span>` : 'PIN'}</button><button class="ib" data-act="payInfo" aria-pressed="${!!S.payOpen}">${IC2.wallet}<span id="restTxt">${S.payOpen && b.tariff ? restOf(b) + ' грн' : 'Оплата'}</span></button></div>
    ${payOn ? `<p class="sub center-t">${b.prepay ? `Передоплата ${b.prepay} грн · ` : ''}${b.tariff ? `до сплати ${restOf(b)} грн при забиранні` : C.PREPAY_CREDITED}</p>` : ''}${camOn ? camBlock(b) : ''}`;
  if(b.status === 'reserved') return `${head}
    ${ring(resFrac(b), `<small>бронь ще</small><span id="bkLeft">${fmt(b.until - Date.now()).slice(0,5)}</span><small>год : хв</small>`)}
    ${tools}
    <button class="btn" data-act="arrive">${IC2.ble.replace('<svg', '<svg width="18" height="18"')} Я на станції · відкрити</button>
    <button class="linkbtn" data-act="cancelBk">Скасувати бронь</button>`;
  if(b.status === 'open') return `${head}
    ${slotArt('open', b.vehicle)}
    <p class="lead-t">${b.vehicle === 'bike' ? 'На гак' : 'У тримач'}${b.charge ? ' · ⚡ підключіть' : ''} · зачиніть двері</p>
    ${tools}
    <button class="btn" data-act="parked">Готово, двері зачинено</button>`;
  if(b.status === 'parked') return `${head}
    ${ring(parkFrac(b), `<span class="vic">${IC.lock}</span><span id="pkTimer">${fmt(b.elapsed)}</span><small id="pkInfo">${tariffInfo(b)}</small>`, 'g')}
    ${b.charge ? `<div class="batt" aria-label="Заряд"><span class="cell"><b id="chgBar" style="width:${Math.floor(b.battery)}%"></b></span><span id="chgPct">${Math.floor(b.battery)}%</span>${IC.bolt}</div>` : ''}
    ${tools}
    <button class="btn dark" data-act="pickup">Забрати ${VEH[b.vehicle].acc}</button>`;
  return `${head}
    ${slotArt('pickup', b.vehicle)}
    <p class="lead-t">Забирайте · двері зачиняться самі</p>
    ${S.camOpen ? camBlock(b) : ''}
    <button class="btn" data-act="taken">Я забрав транспорт</button>`;
}
function receipt(b){
  const t = T(b.tariff);
  return `<div class="st-head"><span class="ic-c ok-c ok-draw">${IC.check}</span><div class="nm"><b>Гарної поїздки!</b><small>${fmt(b.elapsed).slice(0,5)} · ${t.name}${b.charge ? ' · ⚡ ' + Math.floor(b.battery) + '%' : ''}</small></div><span class="dist">${b.paidTotal} грн</span></div>
    ${offerCard('receipt', true)}
    <div class="inrow">${sess.rating ? '' : '<button class="btn" data-act="toSurvey">Оцінити</button>'}<button class="btn line" data-act="tab" data-v="history">Історія</button></div>
    <button class="linkbtn" data-act="newBooking">Закрити</button>`;
}
/* ---- bonuses: the A/B offer, referral, friend's code ---- */
const offerTitle = () => AN.ab.offer === 'A' ? 'Забронюй 100 годин наперед' : `−${C.FIRST_DISCOUNT_PCT}% на перше паркування`;
function offerCard(place, compact){
  if(!S.seen['offer_' + place]){ S.seen['offer_' + place] = 1; track('offer_shown', {variant:AN.ab.offer, place}); }
  const single = Math.round(100*hourly()), pack = Math.round(C.PACK_100H_PRICE*mult()), save = Math.max(0, single - pack);
  const body = AN.ab.offer === 'A'
    ? `<p class="big">${pack} грн</p><p class="sub">100 годин паркування, використати за ${C.PACK_VALID_DAYS} днів${save ? ` · економія ${save} грн проти разового тарифу (${single} грн)` : ''}</p>`
    : `<p class="big">−${C.FIRST_DISCOUNT_PCT}%</p><p class="sub">на перше паркування до ${C.FIRST_PARKING_MAX_HOURS} год: ${Math.round(hourly()*C.FIRST_PARKING_MAX_HOURS*(100 - C.FIRST_DISCOUNT_PCT)/100)} грн замість ${Math.round(hourly()*C.FIRST_PARKING_MAX_HOURS)} грн</p>`;
  if(compact) return `<button class="offer-mini" data-act="offerCta" data-place="${place}">${IC2.gift}<span><b>${offerTitle()}</b><small>${C.DEMO_PAY_NOTE}</small></span>${IC.back.replace('<svg', '<svg style="transform:rotate(180deg)"')}</button>`;
  return `<div class="bcard offer"><span class="demo">${C.DEMO_PAY_NOTE}</span><b class="ot">${offerTitle()}</b>${body}<button class="btn" data-act="offerCta" data-place="${place}">Отримати пропозицію</button></div>`;
}
const shareText = () => `Паркую велосипед біля метро в Anchor: слоти під замком і камерою, зарядка для самоката. Введи мій код ${S.refCode} — і ми обоє отримаємо по ${C.REFERRAL_HOURS} годин паркування, коли сервіс запрацює. ${location.origin}${location.pathname}`;
function bonusPage(){
  return `<div class="pad">
    ${offerCard('bonus')}
    <div class="bcard"><div class="inrow"><span class="grow"><b>Приведи друга</b><p class="sub">Розкажи про нас у соцмережах, приведи друга й отримай ${C.REFERRAL_HOURS} годин паркування</p></span><span class="demo">Демо</span></div>
      ${S.refOpen ? `<div class="code" id="refCode">${S.refCode}</div>
        <div class="inrow"><button class="btn line" data-act="refCopy">Скопіювати код</button><button class="btn" data-act="refShare">Поділитися</button></div>
        ${S.shareOpen ? `<div class="post" id="refPost">${esc(shareText())}</div><button class="btn line" data-act="refCopyText">Скопіювати текст</button>` : ''}`
      : '<button class="btn" data-act="refOpen">Отримати код</button>'}
    </div>
    <div class="bcard"><b>Ввести код друга</b>
      <div class="inrow"><input class="field mono grow" id="friendCode" placeholder="ANCHOR-XXXX" aria-label="Код друга" autocomplete="off" maxlength="11"><button class="btn line" data-act="friendCode">OK</button></div>
      <p class="${S.friendMsg.startsWith('Бонус') ? 'ok' : 'err'}" role="status">${esc(S.friendMsg)}</p><span class="demo">Демо: бонус не нараховується</span></div>
  </div>`;
}
const FEATURES = ['Мапа на весь екран і меню збоку', 'Режим «поруч / далеко»: відкрити через Bluetooth або забронювати', 'Бронювання до 3 годин із передоплатою', `Реферальна програма (${C.REFERRAL_HOURS} годин за друга)`, `Пакет 100 годин або знижка ${C.FIRST_DISCOUNT_PCT}% на перше паркування`, 'Логотип із фактами', 'Камера слота і резервний PIN'];
const SCENARIOS = [['main','Основний'],['term','Без застосунку'],['dead','Телефон розрядився'],['power','Відключення світла'],['bug','Збій застосунку'],['theft','Спроба злому'],['cam','Атака на камери']];
function drawer(){
  const a = me(); if(!a) return '';
  const item = (act, ic, l, v) => `<button class="dlink" data-act="${act}"${v ? ` data-v="${v}"` : ''}>${ic}<span>${l}</span></button>`;
  return `<div class="scrim" data-act="menu"></div><nav class="dpanel" aria-label="Меню">
    <div class="dme">${IC.user}<div><b>${esc(a.method === 'gmail' ? maskMail(a.id) : maskPhone(a.id))}</b><small>${VEH[vehicle()].name}${wantCharge() ? ' · ⚡' : ''}</small></div></div>
    ${item('tab', IC.clock, 'Історія', 'history')}${item('tab', IC2.gift, 'Бонуси', 'bonus')}${item('tab', IC.user, 'Профіль і транспорт', 'profile')}${item('toSurvey', IC.star.replace('fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="2"'), 'Анкета')}${item('toRequest', IC2.pin, 'Попросити станцію')}${item('myData', IC2.shield, 'Приватність і дані')}
    <details class="dscen"><summary class="dlink">${IC2.play}<span>Сценарії надійності</span></summary><div class="scen">${SCENARIOS.map(([id, l]) => `<a href="scenarios.html#${id}" data-act="scenario" data-v="${id}">${l}</a>`).join('')}</div></details>
    <div class="dsep"></div>
    ${sw('bigSwD', 'Великий текст', S.big, 'toggleBig')}${sw('voiceSwD', 'Голосові підказки', S.voice, 'toggleVoice')}
    <div class="spacer"></div>
    ${item('logout', IC2.logout, 'Вийти')}
    <p class="fine">Тестова версія · станцій ще немає · ${C.DEMO_PAY_NOTE}</p><p class="fine mono">exp: ${esc(AN.expLabel())}</p></nav>`;
}
function costNow(b){
  const t = T(b.tariff), h = b.elapsed/3.6e6, p = priceOf(b.tariff), hr = priceOf('once');
  if(t.hours) return Math.max(b.hours, Math.ceil(h))*p;
  if(b.tariff === 'day') return p + Math.max(0, Math.ceil(h - 10))*hr;
  return p;
}
const restOf = b => Math.max(0, costNow(b) - (b.prepay || 0));
function tariffInfo(b){
  const t = T(b.tariff);
  if(t.hours){ const left = b.hours*3.6e6 - b.elapsed; return left > 0 ? `ще ${fmt(left).slice(0,5)} з ${b.hours} год` : `понад тариф +${costNow(b) - tariffFull(b.tariff, b.hours)} грн`; }
  if(b.tariff === 'day'){ const left = 10*3.6e6 - b.elapsed; return left > 0 ? `ще ${fmt(left).slice(0,5)} до кінця тарифу` : `понад 10 год: ${priceOf('once')} грн/год`; }
  return b.tariff === 'night' ? 'до 08:00' : 'у підписці';
}

/* ================= render ================= */
function backTarget(){
  const s = S.screen;
  if(s === 'auth') return 'welcome';
  if(s === 'otp') return S.otpFor === 'login' ? 'auth' : S.otpFor === 'book' ? 'book' : 'bookings';
  if(s === 'station') return 'map';
  if(s === 'tariff') return activeBk() ? 'bookings' : 'station';
  if(s === 'book') return 'station';
  if(s === 'pay' && !S.payBusy) return S.payFor && S.payFor.kind === 'book' ? 'book' : 'bookings';
  if(s === 'history' || s === 'profile' || s === 'bonus') return 'map';
  if(s === 'honest') return S.honestFrom || 'bonus';
  if(s === 'survey' || s === 'request') return S.prevTab || 'map';
  if(s === 'mydata') return me() ? 'map' : 'welcome';
  return null;
}
function header(){
  const back = backTarget(), pre = ['welcome','auth','otp','onboard'].includes(S.screen);
  return `${back ? `<button class="icbtn" data-act="back" aria-label="Назад">${IC.back}</button>` : ''}
    <span class="ttl">${TITLES[S.screen] || ''}</span>
    ${pre ? `<button class="icbtn" data-act="toggleBig" aria-pressed="${S.big}" aria-label="Великий текст" title="Великий текст">Aa</button>
    <button class="icbtn" data-act="toggleVoice" aria-pressed="${S.voice}" aria-label="Голосові підказки" title="Голосові підказки">${IC.speaker}</button>` : ''}`;
}
function render(){
  const ai = $('#authIn'); if(ai){ if(S.authTab === 'phone') S.phoneDraft = ai.value; else S.mailDraft = ai.value; }
  const rp = $('#rqPlace'); if(rp) S.req.place = rp.value;
  const rd = $('#rqDist'); if(rd) S.req.district = rd.value;
  const sc = $('#svContact'); if(sc) S.survey.contact = sc.value;
  const ae = document.activeElement, fk = ae && ae.closest && ae.closest('#view') && ae.dataset.k;
  const mapLike = MAPLIKE.includes(S.screen);
  $('#head').hidden = mapLike; if(!mapLike) $('#head').innerHTML = header();
  $('#view').innerHTML = V[S.screen]();
  $('#app').classList.toggle('big', S.big);
  $('#nav').hidden = true;
  const d = $('#drawer'); d.hidden = !(S.menu && me()); d.innerHTML = d.hidden ? '' : drawer();
  if(fk){ const nb = $(`#view [data-k="${fk}"]`); if(nb && !nb.disabled) nb.focus({preventScroll:true}); }
  paintExp();
  fitMap();
  if(MAPLIKE.includes(S.screen)){
    mapBooted = true;
    const b = activeBk(), key = S.screen + '|' + (b ? b.status : '') + '|' + (S.stationId || '') + '|' + S.list + '|' + (S.bkId || '');
    const sh = $('#sheet'); if(sh && key !== lastSheetKey){ if(lastSheetKey && S.snap !== 'auto'){ S.snap = 'auto'; sh.classList.remove('h-half','h-full'); } sh.classList.add('enter'); setTimeout(() => sh.classList.remove('enter'), 700); }
    lastSheetKey = key;
  }
}
function go(screen){
  S.menu = false;
  S.screen = screen; $('#view').scrollTop = 0; $('#toast').classList.remove('on');
  if(SCREENS.includes(screen) && screen !== 'bookings') track(screen);
  render();
}

/* ================= flows ================= */
function otpPassed(f){
  if(f === 'login'){
    const method = S.authTab, id = method === 'gmail' ? S.mailDraft.trim().toLowerCase() : S.phoneDraft;
    L.accounts = L.accounts || {};
    const key = method + ':' + id;
    L.accounts[key] = L.accounts[key] || {method, id, vehicle:'bike', charge:null};
    L.accountKey = key; L.account = L.accounts[key]; saveLocal();
    track('auth', {method});
    say('Вхід виконано.');
    go(L.account.charge == null ? 'onboard' : 'map'); return;
  }
  if(f === 'book'){
    S.payFor = {kind:'book', amount:prepayOf(S.min), label:`Передоплата броні ${minTxt(S.min)} · слот №${S.slot+1}`, note:C.PREPAY_CREDITED};
    S.payErr = false; go('pay'); return;
  }
  if(f === 'pickup'){
    const b = activeBk(); if(!b) return;
    const amt = restOf(b);
    if(amt > 0){
      S.payFor = {kind:'pickup', amount:amt, label:`${T(b.tariff).name}${b.hours ? ' · ' + b.hours + ' год' : ''} · ${fmt(b.elapsed).slice(0,5)}`, note:b.prepay ? `Передоплату ${b.prepay} грн уже враховано` : ''};
      S.method = S.method || b.method || null; S.payErr = false; go('pay');
    } else openForPickup(b, 0);
  }
}
function saveAccount(){ if(L.accountKey){ L.accounts[L.accountKey] = L.account; saveLocal(); } }
function openForPickup(b, paid){
  b.rest = paid; b.status = 'pickupOpen'; saveLocal(); sOpen();
  say(`Слот ${b.slot+1} відкрито. Заберіть транспорт.`);
  go('bookings'); if(paid) payFx(paid, 'Слот відчинено');
}
/* demo payment: nothing is charged; the first attempt in a session is declined to show the retry */
function doPay(){
  if(S.payBusy || !S.method) return;
  S.payBusy = true; S.payErr = false; render();
  setTimeout(() => {
    S.payBusy = false;
    const pf = S.payFor;
    if(C.PAYMENT_FAIL_FIRST && !S.failedOnce){
      S.failedOnce = true; S.payErr = true; sBad(); track('payment_failed', {kind:pf.kind, method:S.method});
      say('Оплату відхилено. Спробуйте ще раз.'); render(); return;
    }
    sOk(); track('payment_done', {kind:pf.kind, method:S.method, uah:pf.amount});
    if(pf.kind === 'pickup'){ openForPickup(activeBk(), pf.amount); return; }
    const st = stById(S.stationId), now = Date.now();
    const b = {id:uid('b'), stationId:st.id, slot:S.slot, vehicle:vehicle(), charge:!!chargeFor(st, S.slot), tariff:null, hours:null, plan:null,
      min:S.min, until:now + S.min*60000, prepay:pf.amount, method:S.method, remote:true, createdAt:now, pin:String(1000 + rnd(9000)), status:'reserved', elapsed:0, battery:34};
    st.slots[S.slot].st = 'booked';
    L.bookings.push(b); saveLocal();
    track('booking_confirmed', {station:st.id, min:b.min, uah:pf.amount, method:S.method});
    S.slot = null; S.pinShow = false;
    say('Оплачено. Слот заброньовано.');
    go('bookings');
    payFx(pf.amount, `Слот тримаємо ${minTxt(b.min)}`);
    setTimeout(() => notify('info', `Бронь «${st.name}», слот №${b.slot+1}. Резервний PIN: ${b.pin}.`), 1600);
  }, 1300);
}
/* near the station: the slot opens over Bluetooth, the parking is paid at pickup */
function openSlot(){
  if(S.ble) return;
  S.ble = true; render();
  setTimeout(() => {
    S.ble = false;
    const st = stById(S.stationId), t = T(S.tariff), res = activeBk();
    const fields = {status:'open', tariff:S.tariff, hours:t.hours ? S.hours : null, plan:t.hours ? S.hours : t.plan, elapsed:0, battery:34};
    const b = res && res.status === 'reserved' ? Object.assign(res, fields)
      : Object.assign({id:uid('b'), stationId:st.id, slot:S.slot, vehicle:vehicle(), charge:!!chargeFor(st, S.slot), prepay:0, remote:false, createdAt:Date.now(), pin:String(1000 + rnd(9000))}, fields);
    if(b !== res) L.bookings.push(b);
    st.slots[b.slot].st = 'booked'; saveLocal(); sOpen();
    track('slot_opened_near', {station:st.id, slot:b.slot + 1, tariff:b.tariff, reserved:!!b.min});
    S.slot = null; S.pinShow = false;
    say(`Слот ${b.slot+1} відкрито.`);
    go('bookings');
  }, 1600);
}
function finish(b, status){
  b.status = status; b.endedAt = Date.now();
  if(status === 'done') b.paidTotal = (b.prepay || 0) + (b.rest || 0);
  stById(b.stationId).slots[b.slot].st = 'free'; saveLocal();
}

/* ================= actions ================= */
const ACT = {
  back(){ hideNotif(); const t = backTarget(); if(t){ if(S.screen === 'otp'){ S.code = null; S.otp = ''; } go(t); } },
  toggleBig(){ S.big = !S.big; L.big = S.big; saveLocal(); render(); },
  toggleVoice(){ S.voice = !S.voice; L.voice = S.voice; saveLocal(); render(); if(S.voice) say('Голосові підказки ввімкнено.'); else { try{ speechSynthesis.cancel(); }catch(e){} } },
  toAuth(){ go('auth'); },
  ctaContact(){
    const v = $('#ctaContact').value.trim();
    if(!/^\+?\d[\d\s]{8,}$/.test(v) && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v)){ $('#ctaErr').textContent = 'Вкажіть телефон у форматі +380… або адресу пошти'; return; }
    if(!$('#ctaOk').checked){ $('#ctaErr').textContent = 'Поставте позначку згоди, щоб ми могли зберегти контакт'; return; }
    saveContact(v, 'cta'); render();
  },
  ctaYes(b){ sess.ctaYes = b.dataset.v === '1'; track('ctaAnswer', {yes:sess.ctaYes}); render(); },
  authTab(b){ render(); S.authTab = b.dataset.v; render(); },
  sendAuth(){
    const v = $('#authIn').value.trim();
    if(S.authTab === 'phone'){
      const d = v.replace(/\D/g, '');
      if(d.length !== 12 || !d.startsWith('380')){ $('#authErr').textContent = 'Введіть номер у форматі +380 XX XXX XX XX'; return; }
      S.phoneDraft = '+' + d.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5');
    } else {
      if(!/^[a-z0-9._%+-]+@gmail\.com$/i.test(v)){ $('#authErr').textContent = 'Вкажіть адресу Gmail, наприклад name@gmail.com'; return; }
      S.mailDraft = v;
    }
    S.tries = S.tries || 3; sendOtp('login'); go('otp');
  },
  key(b){ press(b.dataset.k); },
  notifFill(){ hideNotif(); if(S.screen === 'otp' && S.code && Date.now() >= S.lockUntil && !S.checking){ S.otp = ''; S.code.split('').forEach((c, i) => setTimeout(() => press(c), 90*i)); } },
  showCode(){ if(S.code) notify(channelOf() === 'gmail' ? 'mail' : 'sms', `Ваш код Anchor: ${S.code}`); else toast('Код ще не надіслано'); },
  resend(){ sendOtp(S.otpFor); S.msg = 'Новий код надіслано'; S.msgCls = 'ok'; render(); },
  skipLock(){ S.lockUntil = Date.now(); },
  setVeh(b){ L.account.vehicle = b.dataset.t; if(!VEH[b.dataset.t].electric && L.account.charge) L.account.charge = false; saveAccount(); if(S.slot != null && S.stationId && !fits(stById(S.stationId), S.slot)) S.slot = null; render(); },
  setCharge(b){ L.account.charge = b.dataset.v === '1'; saveAccount(); render(); },
  toggleCharge(){ L.account.charge = !L.account.charge; saveAccount(); render(); },
  onboardDone(){ track('onboard_done', {vehicle:vehicle(), charge:wantCharge()}); go('map'); },
  tab(b){ go(b.dataset.v); },
  menu(){ S.menu = !S.menu; render(); },
  camToggle(){ S.camOpen = !S.camOpen; render(); },
  payInfo(){ S.payOpen = !S.payOpen; render(); },
  testInfo(){ toast('Тестова версія: станцій ще немає, на мапі плановані локації. Оплата й коди імітуються.'); },
  filter(b){ S.filter = S.filter === b.dataset.v ? null : b.dataset.v; render(); },
  toggleList(){ S.list = !S.list; if(S.screen !== 'map') S.screen = 'map'; render(); },
  zoom(b){ S.zoom = Math.min(ZMAX, Math.max(1, S.zoom*(+b.dataset.d > 0 ? 1.4 : 1/1.4))); render(); },
  pickMe(){ S.picking = !S.picking; render(); },
  pickStation(b){ if(S.picking) return; S.stationId = b.dataset.id; S.list = false; const st = stById(S.stationId); S.cx = st.x; S.cy = st.y; render(); },
  openStation(b){
    if(activeBk()){ toast('У вас уже є активне бронювання'); go('bookings'); return; }
    S.stationId = b.dataset.id; S.slot = null; go('station');
  },
  pickSlot(b){
    const st = stById(S.stationId), k = +b.dataset.k, sl = st.slots[k];
    if(sl.st !== 'free'){ sBad(); toast(sl.st === 'booked' ? `Слот ${k+1} уже заброньовано` : `Слот ${k+1} зайнятий`); return; }
    if(!fits(st, k)){ sBad(); toast('Для адаптованого велосипеда потрібен широкий слот №6'); return; }
    if(wantCharge() && VEH[vehicle()].electric && !sl.charge) toast('У цьому слоті немає зарядки');
    S.slot = k; sKey();
    if(isNear(st)){ S.tariff = S.tariff || 'once'; go('tariff'); }
    else { S.min = S.min || 60; track('booking_started', {station:st.id, slot:k + 1}); go('book'); }
  },
  mode(b){ const st = S.stationId ? stById(S.stationId) : nearest(); S.mode[st.id] = b.dataset.v; render(); },
  dur(b){ S.min = +b.dataset.v; track('booking_duration_selected', {min:S.min}); render(); },
  method(b){ S.method = b.dataset.v; S.payErr = false; track('payment_method_selected', {method:S.method}); render(); },
  openSlot(){ openSlot(); },
  setTariff(b){ S.tariff = b.dataset.id; render(); },
  hours(b){ S.hours = Math.min(12, Math.max(1, S.hours + +b.dataset.d)); render(); },
  toConfirm(){ if(!S.method) return; sendOtp('book'); go('otp'); },
  pay(){ doPay(); },
  pinShow(){ S.pinShow = !S.pinShow; render(); },
  arrive(){ const b = activeBk(); if(!b || b.status !== 'reserved') return; S.stationId = b.stationId; S.slot = b.slot; S.mode[b.stationId] = 'near'; S.tariff = S.tariff || 'once'; go('tariff'); },
  parked(){ const b = activeBk(); if(!b || b.status !== 'open') return; b.status = 'parked'; b.parkedAt = Date.now(); stById(b.stationId).slots[b.slot].st = 'busy'; saveLocal(); track('parked', {tariff:b.tariff, charge:b.charge}); say('Слот зачинено. Транспорт у безпеці.'); render(); },
  pickup(){ const b = activeBk(); if(!b || b.status !== 'parked') return; sendOtp('pickup'); go('otp'); },
  taken(){ const b = activeBk(); if(!b || b.status !== 'pickupOpen') return; finish(b, 'done'); S.bkId = b.id; S.camOpen = false; track('picked', {tariff:b.tariff, uah:b.paidTotal}); sOk(); render(); },
  cancelBk(){ const b = activeBk(); if(!b || b.status !== 'reserved') return; finish(b, 'cancelled'); track('booking_cancelled', {min:b.min}); toast(`Бронювання скасовано. Демо: ${b.prepay} грн повернуто`); render(); },
  newBooking(){ S.bkId = null; go('map'); },
  toSurvey(){ S.prevTab = 'map'; go('survey'); },
  svStar(b){ S.survey.rating = +b.dataset.n; render(); },
  svAns(b){ S.survey[b.dataset.k] = b.dataset.v; render(); },
  feat(b){ const f = S.survey, v = +b.dataset.v; f.features = f.features.includes(v) ? f.features.filter(x => x !== v) : f.features.concat(v).slice(0, 3); render(); },
  featOther(){ S.survey.otherOn = !S.survey.otherOn; render(); },
  svSend(){
    const f = S.survey, c = ($('#svContact') || {value:''}).value.trim();
    if(!f.rating || !f.understood || !f.wouldUse){ $('#svErr').textContent = 'Дайте відповідь на перші три питання'; return; }
    if(c && !$('#svOk').checked){ $('#svErr').textContent = 'Щоб залишити контакт, поставте позначку згоди або залиште поле порожнім'; return; }
    if(c) saveContact(c, 'survey');
    const ep = AN.expParams();
    postForm('survey', {rating:f.rating, understood:f.understood, would_use:f.wouldUse, features:f.features.join(','), features_other:f.otherOn ? f.other.slice(0, 120) : '',
      exp_offer:ep.exp_offer, exp_mascot:ep.exp_mascot, exp_price:ep.exp_price, exp_msg:ep.exp_msg, exp_cta:ep.exp_cta, channel:ep.channel, session_code:AN.sessionCode()}).catch(() => {});
    track('survey', {rating:f.rating, understood:f.understood, would_use:f.wouldUse});
    track('features_survey_submitted', {features:f.features.join(','), other:f.otherOn});
    sess.rating = f.rating; f.sent = true; render();
  },
  toRequest(){ S.prevTab = 'map'; S.req = {district: (STATIONS.length && distTo(nearest()) > 1500) ? '' : '', place:'', sent:false}; go('request'); },
  sendRequest(){
    const d = $('#rqDist').value, p = $('#rqPlace').value.trim();
    if(!d){ $('#rqErr').textContent = 'Оберіть район'; return; }
    const c = $('#rqContact').value.trim();
    if(c && !$('#rqOk').checked){ $('#rqErr').textContent = 'Щоб залишити контакт, поставте позначку згоди або залиште поле порожнім'; return; }
    if(c) saveContact(c, 'request');
    postForm('request', {district:d, place:p.slice(0, 120), vehicle:vehicle(), charge:wantCharge() ? 'yes' : 'no', nearest_km:(distTo(nearest())/1000).toFixed(1)}).catch(() => {});
    L.requests = (L.requests || []).concat({district:d}); saveLocal();
    track('request', {district:d}); S.req = {district:d, place:p, sent:true}; render();
  },
  logout(){ L.account = null; L.accountKey = null; saveLocal(); go('welcome'); },
  speed(b){ L.speed = +b.dataset.x; saveLocal(); paintSide(); },
  ab(b){ AN.setAb(b.dataset.k, b.dataset.v); paintSide(); render(); },
  tmenu(){ const m = $('#tmenu'); m.hidden = !m.hidden; $('#tbtn').setAttribute('aria-expanded', !m.hidden); if(!m.hidden) paintSide(); },
  leaveTest(){ L.tester = false; saveLocal(); location.hash = ''; location.reload(); },
  resetAll(){ AN.forgetAll(); location.hash = 'test'; location.reload(); },
  myData(){ go('mydata'); },
  consent(b){ AN.setConsent(b.dataset.v); saveLocal(); $('#consent').hidden = true; render(); },
  copyCode(){ copy(AN.sessionCode(), $('#sessCode')); },
  deleteData(){ AN.forgetAll(); location.hash = ''; location.reload(); },
  scenario(b){ track('scenario_opened', {scenario:b.dataset.v}); },
  offerCta(b){ track('offer_clicked', {variant:AN.ab.offer, place:b.dataset.place}); S.honestFrom = S.screen === 'bonus' ? 'bonus' : 'map'; S.honestSent = false; go('honest'); },
  honestSend(){
    const v = $('#honestContact').value.trim(), ok = $('#honestOk').checked;
    if(!v){ S.honestSent = true; render(); return; }
    if(!/^(\+?\d[\d\s()-]{8,}|@?[A-Za-z0-9_]{5,32})$/.test(v)){ $('#honestErr').textContent = 'Вкажіть телефон або нік у Telegram'; return; }
    if(!ok){ $('#honestErr').textContent = 'Поставте позначку згоди або залиште поле порожнім'; return; }
    saveContact(v, 'offer_' + AN.ab.offer); S.honestSent = true; render();
  },
  refOpen(){ S.refOpen = true; track('referral_opened', {}); render(); },
  refCopy(){ copy(S.refCode, $('#refCode')); track('referral_code_copied', {}); },
  refShare(){
    S.shareOpen = true; track('referral_share_clicked', {});
    if(navigator.share) navigator.share({title:'Anchor', text:shareText()}).catch(() => {});
    render();
  },
  refCopyText(){ copy(shareText(), $('#refPost')); },
  friendCode(){
    const v = $('#friendCode').value.trim().toUpperCase(), valid = /^ANCHOR-[A-Z0-9]{4}$/.test(v) && v !== S.refCode;
    S.friendMsg = valid ? 'Бонус буде нараховано при запуску' : v === S.refCode ? 'Це ваш власний код' : 'Формат коду: ANCHOR-XXXX';
    track('referral_code_entered', {valid}); render();
  },
  mascot(){
    track('mascot_clicked', {variant:AN.ab.mascot});
    if(!showFact(true)) toast('Тут з’являтимуться перевірені факти про велосипеди й місто');
  },
};
document.addEventListener('click', e => {
  if(dragMoved && e.target.closest('#mapSvg')){ dragMoved = false; return; }
  const svg = e.target.closest('#mapSvg');
  if(svg && S.picking){
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    L.pos = {x:Math.round(p.x), y:Math.round(p.y)}; saveLocal(); S.picking = false; S.stationId = null; S.cx = L.pos.x; S.cy = L.pos.y; render(); return;
  }
  const b = e.target.closest('[data-act]'); if(!b || b.disabled) return;
  ctx(); const f = ACT[b.dataset.act]; if(f) f(b, e);
});
document.addEventListener('keydown', e => {
  const t = e.target;
  if(t.id === 'authIn' && e.key === 'Enter'){ ACT.sendAuth(); return; }
  if(t.classList && t.classList.contains('st-pin') && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); ACT.pickStation(t); return; }
  if(S.screen === 'otp' && !t.closest('input,textarea,select')){ if(/^[0-9]$/.test(e.key)) press(e.key); else if(e.key === 'Backspace') press('⌫'); }
});
document.addEventListener('input', e => { if(e.target.id === 'ftOther') S.survey.other = e.target.value; });

/* ================= clock ================= */
let last = performance.now();
setInterval(() => {
  const now = performance.now(), d = now - last; last = now;
  const b = activeBk();
  if(b && b.status === 'parked'){
    b.elapsed += d*L.speed;
    if(b.charge && b.battery < 100) b.battery = Math.min(100, b.battery + d*L.speed/(3*60000));
    const tm = $('#pkTimer'); if(tm){ tm.textContent = fmt(b.elapsed); $('#pkInfo').textContent = tariffInfo(b); const rt = $('#restTxt'); if(rt && S.payOpen) rt.textContent = restOf(b) + ' грн'; const rv = $('#ringVal'); if(rv) rv.setAttribute('stroke-dashoffset', (RING_C*(1 - parkFrac(b))).toFixed(1)); }
    const cp = $('#chgPct'); if(cp){ cp.textContent = Math.floor(b.battery) + '%'; $('#chgBar').style.width = Math.floor(b.battery) + '%'; }
  }
  if(b && b.status === 'reserved'){
    if(Date.now() >= b.until){ finish(b, 'expired'); toast('Час броні минув. Демо: передоплату не повернуто'); render(); }
    else { const bl = $('#bkLeft'); if(bl){ bl.textContent = fmt(b.until - Date.now()).slice(0,5); const rv = $('#ringVal'); if(rv) rv.setAttribute('stroke-dashoffset', (RING_C*(1 - resFrac(b))).toFixed(1)); } }
  }
  if(S.lockUntil){
    if(Date.now() >= S.lockUntil){ S.lockUntil = 0; if(S.screen === 'otp'){ sendOtp(S.otpFor); S.msg = 'Блокування знято. Ми надіслали новий код.'; S.msgCls = 'ok'; render(); } }
    else { const lc = $('#lockClock'); if(lc) lc.textContent = mmss(S.lockUntil - Date.now()); }
  }
  const ct = $('#camTime'); if(ct) ct.textContent = new Date().toTimeString().slice(0,8);
  const c = new Date(); $('#clock').textContent = c.getHours() + ':' + String(c.getMinutes()).padStart(2,'0');
}, 250);
setInterval(saveLocal, 5000);

/* ================= map: fill the screen, drag to pan ================= */
let drag = null, dragMoved = false;
function fitMap(){
  const svg = $('#mapSvg'); if(!svg) return;
  const W = svg.clientWidth || 1, H = svg.clientHeight || 1, a = W/H, z = S.zoom;
  let vh = 440/z, vw = vh*a; if(vw > 360){ vw = 360; vh = vw/a; }
  const p = userPos(), cx = S.cx ?? p.x, cy = (S.cy ?? p.y) + vh*.16;
  const x = Math.max(0, Math.min(360 - vw, cx - vw/2)), y = Math.max(-vh*.1, Math.min(440 - vh*.7, cy - vh/2));
  svg.setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
  svg._vb = {x, y, vw, vh, W};
}
/* one finger or mouse pans; two fingers pinch; the wheel or a trackpad pinch zooms; double tap zooms in */
const ZMAX = 5, ptrs = new Map();
let pinch = null, zoomT = null;
function zoomAt(z, clientX, clientY){
  const svg = $('#mapSvg'); if(!svg || !svg._vb) return;
  const r = svg.getBoundingClientRect(), vb = svg._vb, k = vb.vw/r.width;
  const px = vb.x + (clientX - r.left)*k, py = vb.y + (clientY - r.top)*k;          /* map point under the fingers stays put */
  const nz = Math.min(ZMAX, Math.max(1, z)), f = S.zoom/nz;
  const cx = S.cx ?? userPos().x, cy = S.cy ?? userPos().y;
  S.cx = px + (cx - px)*f; S.cy = py + (cy - py)*f; S.zoom = nz; fitMap();
  clearTimeout(zoomT); zoomT = setTimeout(render, 220);                          /* redraw pins at the new size once the gesture settles */
}
document.addEventListener('pointerdown', e => {
  const svg = e.target.closest && e.target.closest('#mapSvg'); if(!svg || S.picking) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), z:S.zoom}; drag = null; dragMoved = true; return; }
  drag = {x:e.clientX, y:e.clientY, cx:(S.cx ?? userPos().x), cy:(S.cy ?? userPos().y), k:svg._vb ? svg._vb.vw/svg.getBoundingClientRect().width : 1}; dragMoved = false;
});
document.addEventListener('pointermove', e => {
  if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pinch && ptrs.size >= 2){ const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); zoomAt(pinch.z*d/pinch.d, (a.x + b.x)/2, (a.y + b.y)/2); return; }
  if(!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if(!dragMoved && Math.hypot(dx, dy) < 6) return;
  dragMoved = true; const svg = $('#mapSvg'); if(svg) svg.classList.add('drag');
  S.cx = drag.cx - dx*drag.k; S.cy = drag.cy - dy*drag.k; fitMap();
});
const ptrEnd = e => { ptrs.delete(e.pointerId); if(ptrs.size < 2) pinch = null; if(drag && !ptrs.size){ const svg = $('#mapSvg'); if(svg) svg.classList.remove('drag'); drag = null; setTimeout(() => { dragMoved = false; }, 0); } };
document.addEventListener('pointerup', ptrEnd); document.addEventListener('pointercancel', ptrEnd);
document.addEventListener('wheel', e => { if(!(e.target.closest && e.target.closest('#mapSvg'))) return; e.preventDefault(); zoomAt(S.zoom*Math.exp(-e.deltaY*(e.ctrlKey ? .012 : .0025)), e.clientX, e.clientY); }, {passive:false});
document.addEventListener('dblclick', e => { if(e.target.closest && e.target.closest('#mapSvg') && !S.picking){ e.preventDefault(); zoomAt(S.zoom*1.6, e.clientX, e.clientY); } });

/* bottom sheet: drag the handle (or the card where nothing is tappable) to half or full screen; tap the handle to cycle */
let sdrag = null;
const SNAPS = ['auto','half','full'];
function sheetSnapTo(name){ const sh = $('#sheet'); if(!sh) return; const was = S.snap; S.snap = name; sh.style.height = ''; sh.style.maxHeight = ''; sh.classList.remove('h-half','h-full'); if(name !== 'auto') sh.classList.add('h-' + name); if((was === 'auto') !== (name === 'auto')) render(); }
document.addEventListener('pointerdown', e => {
  const sh = e.target.closest && e.target.closest('#sheet'); if(!sh) return;
  const onGrab = !!e.target.closest('[data-grab]');
  if(!onGrab && (e.target.closest('button,input,select,textarea,a,label,.tcards,.cam') || sh.scrollTop > 0)) return;
  sdrag = {y:e.clientY, h:sh.offsetHeight, moved:false, grab:onGrab, id:e.pointerId};
});
document.addEventListener('pointermove', e => {
  if(!sdrag || e.pointerId !== sdrag.id) return;
  const dy = e.clientY - sdrag.y; if(!sdrag.moved && Math.abs(dy) < 6) return;
  const sh = $('#sheet'), H = $('#sheet').parentElement.clientHeight; if(!sh) return;
  sdrag.moved = true; sh.classList.add('dragging'); sh.classList.remove('h-half','h-full');
  sh.style.maxHeight = 'none'; sh.style.height = Math.max(110, Math.min(H - 58, sdrag.h - dy)) + 'px';
});
document.addEventListener('pointerup', e => {
  if(!sdrag || e.pointerId !== sdrag.id) return;
  const sh = $('#sheet'), d = sdrag; sdrag = null; if(!sh) return;
  sh.classList.remove('dragging');
  if(!d.moved){ if(d.grab) sheetSnapTo(SNAPS[(SNAPS.indexOf(S.snap || 'auto') + 1) % 3]); return; }
  const H = sh.parentElement.clientHeight, h = sh.offsetHeight;
  sh.style.height = ''; sh.style.maxHeight = ''; const natural = Math.min(sh.scrollHeight, H*.74); sh.style.height = h + 'px';
  const cand = [['auto', natural], ['half', H*.56], ['full', H - 58]];
  const best = cand.reduce((m, c) => Math.abs(c[1] - h) < Math.abs(m[1] - h) ? c : m);
  requestAnimationFrame(() => sheetSnapTo(best[0]));
});
document.addEventListener('keydown', e => { if(e.target.dataset && 'grab' in e.target.dataset && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); sheetSnapTo(SNAPS[(SNAPS.indexOf(S.snap || 'auto') + 1) % 3]); } });
window.addEventListener('resize', fitMap);

/* ================= tester panel (#test) ================= */
const AB_NAMES = {msg:{A:'Безпека', B:'Для всіх'}, cta:{A:'контакт', B:'передплата'}, offer:{A:'100 год', B:`−${C.FIRST_DISCOUNT_PCT}%`}, mascot:{A:'з фактами', B:'статичний'}, price:{A:'поточні', B:'+30%'}};
function paintSide(){
  $$('.seg[data-ab]').forEach(el => { const k = el.dataset.ab; el.innerHTML = C.EXPERIMENTS[k] ? ['A','B'].map(v => `<button data-act="ab" data-k="${k}" data-v="${v}" aria-pressed="${AN.ab[k] === v}">${v}: ${AB_NAMES[k][v]}</button>`).join('') : '<span class="muted">вимкнено в CONFIG</span>'; });
  $('#chNow').textContent = CHANNELS[AN.channel] || AN.channel;
  $$('#spdSeg button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.x === L.speed));
  $('#tCode').textContent = AN.sessionCode() || 'з’явиться після згоди на статистику';
}
function paintExp(){ const e = $('#exp'); if(e) e.textContent = 'exp: ' + AN.expLabel() + (AN.channel !== 'direct' ? ' · ' + AN.channel : ''); }

/* ================= logo with facts (experiment "mascot") ================= */
const FACTS = C.FACTS.filter(f => f && f.text && f.source && !/^ЗАПОВНИТИ/i.test(f.text) && !/^ЗАПОВНИТИ/i.test(f.source));
let factI = 0, factH = null;
const mascotOn = () => C.EXPERIMENTS.mascot ? AN.ab.mascot === 'A' : true;
const busy = () => ['auth','otp','pay','book','welcome'].includes(S.screen) || S.ble || !$('#consent').hidden;
function showFact(byClick){
  if(!FACTS.length || (!byClick && (!mascotOn() || busy()))) return false;
  const f = FACTS[factI % FACTS.length], el = $('#fact');
  el.innerHTML = `${esc(f.text)}<small>Джерело: ${esc(f.source)}</small>`; el.hidden = false;
  track('mascot_fact_shown', {i:factI % FACTS.length, click:!!byClick}); factI++;
  clearTimeout(factH); factH = setTimeout(() => { el.hidden = true; }, C.FACT_SHOW_SEC*1000);
  return true;
}
setInterval(() => { if(MAPLIKE.includes(S.screen)) showFact(false); }, C.FACT_INTERVAL_SEC*1000);
document.addEventListener('click', e => { if(e.target.closest('#fact')) $('#fact').hidden = true; });

/* ================= consent banner ================= */
$('#consentText').textContent = C.CONSENT_TEXT;
$('#consentList').innerHTML = C.CONSENT_DETAILS.map(x => `<li>${esc(x)}</li>`).join('');
$('#consent').hidden = AN.consent() !== null;
['cAccept', 'cNecessary'].forEach(id => $('#' + id).addEventListener('click', () => {
  AN.setConsent(id === 'cAccept' ? 'accepted' : 'necessary'); saveLocal(); $('#consent').hidden = true; render();
}));
function route(){
  if((location.hash || '').slice(1).split(/[_.]/).includes('test')){ L.tester = true; sess.tester = true; saveLocal(); }
  $('#tbtn').hidden = !L.tester; if(!L.tester) $('#tmenu').hidden = true;
}
window.addEventListener('hashchange', route);

/* ================= boot ================= */
if(L.account && L.accountKey && L.accounts && L.accounts[L.accountKey]){ L.account = L.accounts[L.accountKey]; S.screen = L.account.charge == null ? 'onboard' : 'map'; }
else { L.account = null; }
L.bookings.forEach(b => { if(['reserved','open','parked','pickupOpen'].includes(b.status)){ const st = stById(b.stationId); if(st) st.slots[b.slot].st = b.status === 'parked' ? 'busy' : 'booked'; } });
if(L.tester) sess.tester = true;
hideNotif(); route(); paintSide(); render(); track(S.screen);
})();
