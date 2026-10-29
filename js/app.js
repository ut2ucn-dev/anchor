/* Anchor MVP: інтерфейс. Карта + три вкладки, екран станції з режимами «поруч / далеко»,
   бронювання 15 хв – 3 год із наростаючою передоплатою, бонуси, налаштування й анкета.
   Платежі, коди й відкриття слотів лише імітуються. */
(function(){
'use strict';
const C = window.CONFIG, A = window.Anchor;
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rnd = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;
const fmt = ms => { const s = Math.max(0, Math.floor(ms/1000)); return [Math.floor(s/3600), Math.floor(s/60)%60, s%60].map(n => String(n).padStart(2, '0')).join(':'); };
const hm = ts => new Date(ts).toLocaleTimeString('uk-UA', {hour:'2-digit', minute:'2-digit'});
const dt = ts => new Date(ts).toLocaleString('uk-UA', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'});
const minTxt = m => m < 60 ? `${m} хв` : `${Math.floor(m/60)} год${m % 60 ? ' ' + (m % 60) + ' хв' : ''}`;
const maskPhone = p => p.replace(/(\+380\s?\d{2})\s?\d{3}/, '$1 ***');
const maskMail = m => m.replace(/^(.{2}).*(@.*)$/, '$1***$2');
const track = (e, p) => A.track(e, p);

/* ================= prices (all from CONFIG, ×multiplier in price test B) ================= */
const mult = () => (C.EXPERIMENTS.price && A.ab.price === 'B') ? C.PRICE_TEST_MULTIPLIER : 1;
const price = v => Math.round(v*mult());
const hourly = () => C.HOURLY_RATE*mult();
const bookingCost = min => hourly()*min/60;
const prepayPct = min => (C.PREPAY_TABLE.find(([m]) => min <= m) || C.PREPAY_TABLE[C.PREPAY_TABLE.length - 1])[1];
const prepayOf = min => Math.ceil(bookingCost(min)*prepayPct(min)/100 - 1e-9);
const DURS = []; for(let m = C.BOOKING_MIN; m <= C.BOOKING_MAX; m += C.BOOKING_STEP) DURS.push(m);
const T = id => C.TARIFFS.find(t => t.id === id);
function tariffCost(id, hours, elapsedMs){
  const t = T(id), h = elapsedMs/3.6e6;
  if(t.hours) return Math.max(hours, Math.ceil(h))*price(t.price);
  if(id === 'day') return price(t.price) + Math.max(0, Math.ceil(h - 10))*price(C.HOURLY_RATE);
  return price(t.price);
}

/* ================= stations (planned locations, demo slots) ================= */
const VEH = {
  bike:{name:'Велосипед', acc:'велосипед'}, scooter:{name:'Електросамокат', acc:'електросамокат', electric:true},
  mono:{name:'Моноколесо', acc:'моноколесо', electric:true}, adaptive:{name:'Адаптований велосипед', acc:'адаптований велосипед', wide:true},
};
const M = 90; /* metres per map unit */
const LINES = {
  r:{color:'var(--m-red)', pts:[[18,188],[55,194],[95,199],[115,204],[140,211],[160,209],[175,205],[190,200],[205,204],[222,205],[245,201],[275,205],[300,200],[325,195],[348,190]]},
  b:{color:'var(--m-blue)', pts:[[176,18],[172,44],[178,70],[181,95],[179,118],[186,140],[196,160],[190,198],[181,224],[176,250],[171,276],[167,300],[160,325],[150,350],[140,375],[130,400],[118,424]]},
  g:{color:'var(--m-green)', pts:[[93,118],[110,140],[130,160],[152,180],[172,196],[181,221],[196,233],[206,246],[216,266],[226,290],[250,309],[266,324],[285,335],[300,346],[311,361],[321,376],[331,392]]},
};
const STATIONS = [
  {id:'luk', name:'Лук’янівська', line:'g', x:130, y:160, addr:'вул. Дегтярівська, 2'},
  {id:'zol', name:'Золоті ворота', line:'g', x:172, y:196, addr:'вул. Володимирська, 40'},
  {id:'uni', name:'Університет', line:'r', x:160, y:209, addr:'бул. Тараса Шевченка, 14'},
  {id:'pol', name:'Політехнічний інститут', line:'r', x:115, y:204, addr:'просп. Берестейський, 37'},
  {id:'kon', name:'Контрактова площа', line:'b', x:186, y:140, addr:'Контрактова пл., 4'},
  {id:'poch', name:'Почайна', line:'b', x:181, y:95, addr:'просп. Степана Бандери, 23'},
  {id:'obo', name:'Оболонь', line:'b', x:178, y:70, addr:'просп. Оболонський, 21'},
  {id:'pal', name:'Палац спорту', line:'g', x:181, y:221, addr:'Спортивна пл., 1'},
  {id:'lb', name:'Лівобережна', line:'r', x:275, y:205, addr:'Броварський просп., 15'},
  {id:'poz', name:'Позняки', line:'g', x:285, y:335, addr:'вул. Драгоманова, 1'},
  {id:'vys', name:'Виставковий центр', line:'b', x:130, y:400, addr:'просп. Глушкова, 1'},
  {id:'aka', name:'Академмістечко', line:'r', x:18, y:188, addr:'просп. Берестейський, 132'},
];
const DISTRICTS = [['ОБОЛОНЬ',150,52],['ПОДІЛ',140,112],['ЛУК’ЯНІВКА',96,172],['СВЯТОШИН',45,150],['СОЛОМ’ЯНКА',85,250],['ПЕЧЕРСЬК',214,238],['ГОЛОСІЇВ',120,330],['ЛІВИЙ БЕРЕГ',292,160],['ДАРНИЦЯ',295,290]];
function seedSlots(id){
  let h = 0; for(const c of id) h = (h*31 + c.charCodeAt(0)) >>> 0;
  const r = () => { h = (h*1103515245 + 12345) >>> 0; return (h >>> 8)/16777216; };
  const s = Array.from({length:6}, (_, k) => { const x = r(); return {st: x < .4 ? 'free' : x < .6 ? 'booked' : 'busy', charge: k === 2 || k === 3 || k === 5, wide: k === 5}; });
  if(!s.some(z => z.st === 'free')) s[5].st = 'free';
  return s;
}
STATIONS.forEach(s => { s.slots = seedSlots(s.id); if(s.id === 'luk'){ s.slots[2].st = 'free'; s.slots[5].st = 'free'; } });
const stById = id => STATIONS.find(s => s.id === id);
const USER = {x:133, y:164};
const distTo = st => Math.hypot(st.x - USER.x, st.y - USER.y)*M;
const kmTxt = m => m < 1000 ? Math.round(m/10)*10 + ' м' : (m/1000).toFixed(1).replace('.', ',') + ' км';
const freeCount = st => st.slots.filter(s => s.st === 'free').length;

/* ================= state ================= */
const APP_KEY = 'anchor-app';
const canStore = () => A.consent() !== null;          /* the app remembers anything only after the visitor has made a choice */
function load(){ if(!canStore()) return {}; try{ return JSON.parse(localStorage.getItem(APP_KEY)) || {}; }catch(e){ return {}; } }
const P = Object.assign({account:null, vehicle:'bike', charge:false, big:false, voice:false, active:null, history:[]}, load());
function save(){ if(!canStore()) return; try{ localStorage.setItem(APP_KEY, JSON.stringify(P)); }catch(e){} }
const S = {
  tab:'map', station:null, list:false, mode:{}, flow:null, zoom:1.6, cx:null, cy:null,
  settingsView:null, bonusView:null, honestFrom:null, referralOpen:false, shareOpen:false, friendMsg:'',
  otp:{code:null, entered:'', tries:3, lockUntil:0, codeAt:0, purpose:null, checking:false, msg:'', cls:''},
  authTab:'phone', phoneDraft:'+380 67 123 45 67', mailDraft:'', failedOnce:false,
  camOpen:false, pinShow:false, payOpen:false, offerCard:false, speed:1,
  survey:{rating:0, understood:'', wouldUse:'', features:[], other:'', otherOn:false, sent:false, contact:''}, honestSent:false,
  refCode:'ANCHOR-' + Array.from({length:4}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[rnd(32)]).join(''),
  seen:{}, booted:false,
};
if(P.active && P.active.status){ const st = stById(P.active.stationId); if(st) st.slots[P.active.slot].st = 'mine'; }

/* ================= small helpers ================= */
function toast(t){ const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 2600); }
let notifH;
function notify(kind, text){
  $('#nIc').textContent = kind === 'mail' ? 'M' : kind === 'sms' ? 'SMS' : '!';
  $('#nIc').className = 'ni' + (kind === 'mail' ? ' mail' : '');
  $('#nFrom').textContent = kind === 'mail' ? 'Gmail · Anchor' : kind === 'sms' ? 'Повідомлення · Anchor' : 'Anchor';
  $('#nText').textContent = text; $('#notif').classList.add('on');
  clearTimeout(notifH); notifH = setTimeout(() => $('#notif').classList.remove('on'), 8000);
}
function say(t){ if(!P.voice) return; try{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'uk-UA'; speechSynthesis.speak(u); }catch(e){} }
async function copy(text, el){
  try{ await navigator.clipboard.writeText(text); toast('Скопійовано'); return true; }
  catch(e){ if(el){ const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } toast('Виділено: натисніть «Копіювати» в меню'); return false; }
}
function postForm(name, fields){
  /* Netlify Forms: urlencoded POST to "/" with form-name; the static hidden form in index.html lets Netlify detect it */
  const body = new URLSearchParams(Object.assign({'form-name': name, 'bot-field': ''}, fields)).toString();
  return fetch('/', {method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body}).then(r => { if(!r.ok) throw new Error(r.status); });
}
function payFx(amount, line){
  const el = document.createElement('div'); el.className = 'fx';
  el.innerHTML = `<div><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r="50"/><path d="M32 57l15 15 31-33"/></svg>${amount} грн<small>${esc(line)}</small></div>`;
  $('#app').append(el); setTimeout(() => el.remove(), 1900);
}

/* ================= icons and drawings ================= */
const I = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  search:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  locate:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
  bolt:'<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M7 0L1 8h4l-1.5 6L10 5H6l1-5z" fill="currentColor"/></svg>',
  wide:'<svg viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7h12M4 4L1 7l3 3M10 4l3 3-3 3"/></svg>',
  plug:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4"/></svg>',
  ble:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 4V3l5 4L7 17"/></svg>',
  cam:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>',
  key:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/></svg>',
  wallet:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M16 12h2M3 9h18"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>',
  gift:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18"/></svg>',
};
function sideVeh(t){
  if(t === 'scooter') return '<circle cx="-48" cy="-22" r="20"/><circle cx="50" cy="-22" r="20"/><line x1="-48" y1="-22" x2="-30" y2="-40" stroke="#1f9d8f" stroke-width="6"/><line x1="-30" y1="-40" x2="40" y2="-40" stroke="#1f9d8f" stroke-width="9"/><line x1="40" y1="-40" x2="50" y2="-22" stroke="#1f9d8f" stroke-width="6"/><line x1="34" y1="-40" x2="26" y2="-124" stroke="#1f9d8f" stroke-width="6"/><line x1="12" y1="-128" x2="40" y2="-128" stroke-width="7"/>';
  if(t === 'mono') return '<circle cx="0" cy="-44" r="40" stroke-width="9"/><rect x="-16" y="-96" width="32" height="64" rx="10" fill="#2F6DB5" stroke="#1d4a80" stroke-width="3"/><line x1="-30" y1="-48" x2="-16" y2="-48" stroke-width="7"/><line x1="16" y1="-48" x2="30" y2="-48" stroke-width="7"/>';
  if(t === 'adaptive') return '<circle cx="-50" cy="-30" r="30"/><circle cx="56" cy="-22" r="22"/><polyline points="-50,-30 -8,-24 44,-24 56,-22" stroke="#2F6DB5" stroke-width="6"/><path d="M-44 -42 Q -30 -18 -2 -30 L -8 -40 Z" fill="#2F6DB5" stroke="#2F6DB5" stroke-width="4"/><line x1="44" y1="-24" x2="30" y2="-64" stroke="#2F6DB5" stroke-width="5"/><line x1="20" y1="-74" x2="40" y2="-58" stroke-width="5"/>';
  return '<circle cx="-50" cy="-36" r="34"/><circle cx="50" cy="-36" r="34"/><polyline points="-50,-36 -18,-36 -4,-76 38,-76 50,-36" stroke="#2F6DB5" stroke-width="6"/><line x1="-18" y1="-36" x2="-28" y2="-82" stroke="#2F6DB5" stroke-width="6"/><line x1="-36" y1="-86" x2="-20" y2="-86" stroke-width="7"/><line x1="38" y1="-76" x2="34" y2="-96"/><line x1="26" y1="-98" x2="46" y2="-98" stroke-width="6"/>';
}
const chipVeh = t => `<svg viewBox="-92 -140 184 150" aria-hidden="true"><g class="uveh">${sideVeh(t)}</g></svg>`;
function slotArt(kind, veh){
  return `<svg class="art ${kind}" viewBox="0 0 240 130" aria-hidden="true">
    <rect x="0" y="118" width="240" height="4" rx="2" fill="var(--line)"/>
    <rect x="80" y="6" width="80" height="112" rx="6" fill="#2D3642"/><rect x="80" y="6" width="80" height="7" rx="3" fill="#F29A1F"/>
    <circle cx="120" cy="22" r="5" fill="${kind === 'out' ? '#2FD36B' : '#3F8CFF'}"/>
    <rect x="90" y="32" width="60" height="80" rx="3" fill="#1a222b"/>
    <path d="M124 36 v9 a4 4 0 0 1 -8 0" fill="none" stroke="#B9C2CC" stroke-width="2.5" stroke-linecap="round"/>
    <g class="veh"><g transform="translate(120 112) scale(.38)" class="uveh" style="stroke:#E7EEF4">${sideVeh(veh)}</g></g>
    <rect class="door" x="90" y="32" width="60" height="80" rx="3" fill="#7FC4CC" opacity=".75"/>
  </svg>`;
}
function camBlock(b){
  const st = stById(b.stationId), open = b.status !== 'parked';
  return `<div class="cam"><svg viewBox="0 0 300 170" class="${open ? '' : 'ir'}" role="img" aria-label="Відео з камери слота №${b.slot+1} (демо)">
    <rect width="300" height="170" fill="#1b242c"/><polygon points="30,0 270,0 220,95 80,95" fill="#35444f"/><polygon points="0,0 30,0 80,95 0,170" fill="#26323c"/><polygon points="300,0 270,0 220,95 300,170" fill="#26323c"/>
    ${['parked','out'].includes(b.status) ? `<g transform="translate(150 150) scale(.5)" class="uveh" style="stroke:#c9d4dc">${sideVeh(b.vehicle)}</g>` : ''}
    <text x="10" y="18" font-size="10" fill="#fff" font-family="monospace"><tspan class="rec" fill="#ff4a40">●</tspan> LIVE · ${esc(st.id.toUpperCase())}-0${b.slot+1} · ДЕМО</text>
    <text x="290" y="162" font-size="9" fill="#9fb0bd" text-anchor="end" font-family="monospace">${open ? 'ДВЕРІ ВІДЧИНЕНО' : 'ЗАЧИНЕНО · ІЧ'}</text>
  </svg></div>`;
}
const RING_C = 2*Math.PI*70;
const ring = (frac, inner, cls = '') => `<div class="ring"><svg viewBox="0 0 160 160" aria-hidden="true"><circle class="trk" cx="80" cy="80" r="70"/><circle class="val ${cls}" id="ringVal" cx="80" cy="80" r="70" stroke-dasharray="${RING_C.toFixed(1)}" stroke-dashoffset="${(RING_C*(1 - Math.max(0, Math.min(1, frac)))).toFixed(1)}"/></svg><div class="in">${inner}</div></div>`;

/* ================= map ================= */
function mapSVG(){
  const line = l => `<polyline class="m-line" stroke="${l.color}" points="${l.pts.map(q => q.join(',')).join(' ')}"/>` + l.pts.map(q => `<circle class="m-stop" stroke="${l.color}" cx="${q[0]}" cy="${q[1]}" r="1.6"/>`).join('');
  let blocks = '';
  for(let x = 6; x < 360; x += 26) for(let y = 6; y < 440; y += 22){ const k = (x*7 + y*13) % 11; if(k < 7) blocks += `<rect class="m-blk" x="${x}" y="${y}" width="${18 + k % 3*2}" height="${14 + k % 2*3}" rx="2"/>`; }
  const z = S.zoom, r = 9/Math.sqrt(z);
  return `<svg class="map" id="mapSvg" preserveAspectRatio="xMidYMid slice" viewBox="0 0 360 440" role="img" aria-label="Схематична карта Києва з планованими станціями Anchor біля метро">
    <rect class="m-bg" x="-200" y="-200" width="760" height="840"/>${blocks}
    <path class="m-park" d="M40 60 q30 -20 60 0 q10 30 -20 40 q-35 0 -40 -40z"/><path class="m-park" d="M150 380 q30 -15 55 5 q0 30 -30 35 q-30 -5 -25 -40z"/><path class="m-park" d="M205 120 q20 -10 25 10 l-5 30 q-15 5 -20 -40z"/>
    <path class="m-water" d="M228 -40 C 212 60, 232 110, 214 150 C 200 185, 238 215, 226 255 C 214 300, 246 340, 232 390 C 226 415, 238 430, 236 480 L 266 480 C 268 410, 256 380, 262 340 C 270 290, 244 250, 256 210 C 268 170, 240 120, 252 70 C 258 40, 250 15, 252 -40 Z"/>
    <path class="m-road2" d="M-20 230 C 80 228, 150 235, 230 230 C 290 228, 330 236, 380 232"/><path class="m-road" d="M150 -20 C 150 120, 140 260, 160 460"/><path class="m-road" d="M-20 300 C 90 290, 200 300, 380 310"/><path class="m-road" d="M-20 120 C 100 130, 200 110, 380 118"/>
    ${DISTRICTS.map(d => `<text class="m-dist" x="${d[1]}" y="${d[2]}">${d[0]}</text>`).join('')}
    ${line(LINES.r)}${line(LINES.b)}${line(LINES.g)}
    <circle class="me-halo" cx="${USER.x}" cy="${USER.y}" r="${10/Math.sqrt(z)}"/><circle class="pulse" cx="${USER.x}" cy="${USER.y}" r="${4/Math.sqrt(z)}"/><circle class="me" cx="${USER.x}" cy="${USER.y}" r="${3.4/Math.sqrt(z)}"/>
    ${STATIONS.map(st => { const f = freeCount(st), mine = P.active && P.active.stationId === st.id; return `<g class="pin" data-act="openStation" data-id="${st.id}" role="button" tabindex="0" aria-label="${esc(st.name)}: ${mine ? 'ваша сесія' : 'вільних слотів ' + f}">
      <path d="M${st.x} ${st.y} c ${-r*.55} ${-r*.9}, ${-r} ${-r*1.3}, ${-r} ${-r*1.9} a ${r} ${r} 0 1 1 ${2*r} 0 c 0 ${r*.6}, ${-r*.45} ${r} ${-r} ${r*1.9}z" fill="${mine ? '#F29A1F' : f ? '#1B8F4C' : '#8E96A3'}"/>
      <text x="${st.x}" y="${st.y - r*1.62}" style="font-size:${8/Math.sqrt(z)}px">${mine ? '★' : f}</text></g>`; }).join('')}
  </svg>`;
}
const ZMAX = 5;
function fitMap(){
  const svg = $('#mapSvg'); if(!svg) return;
  const W = svg.clientWidth || 1, H = svg.clientHeight || 1, a = W/H, z = S.zoom;
  let vh = 440/z, vw = vh*a; if(vw > 360){ vw = 360; vh = vw/a; }
  const cx = S.cx ?? USER.x, cy = S.cy ?? USER.y;
  const x = Math.max(-20, Math.min(380 - vw, cx - vw/2)), y = Math.max(-20, Math.min(460 - vh, cy - vh/2));
  svg.setAttribute('viewBox', `${x.toFixed(1)} ${y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
  svg._vb = {x, y, vw, vh};
}
let drag = null, dragMoved = false, pinch = null, zoomT = null; const ptrs = new Map();
function zoomAt(z, clientX, clientY){
  const svg = $('#mapSvg'); if(!svg || !svg._vb) return;
  const r = svg.getBoundingClientRect(), vb = svg._vb, k = vb.vw/r.width;
  const px = vb.x + (clientX - r.left)*k, py = vb.y + (clientY - r.top)*k;
  const nz = Math.min(ZMAX, Math.max(1, z)), f = S.zoom/nz, cx = S.cx ?? USER.x, cy = S.cy ?? USER.y;
  S.cx = px + (cx - px)*f; S.cy = py + (cy - py)*f; S.zoom = nz; fitMap();
  clearTimeout(zoomT); zoomT = setTimeout(renderMap, 220);
}
function bindMap(){
  const svg = $('#mapSvg'); if(!svg) return;
  svg.addEventListener('pointerdown', e => {
    ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
    if(ptrs.size === 2){ const [a, b] = [...ptrs.values()]; pinch = {d:Math.hypot(a.x - b.x, a.y - b.y), z:S.zoom}; drag = null; dragMoved = true; return; }
    drag = {x:e.clientX, y:e.clientY, cx:S.cx ?? USER.x, cy:S.cy ?? USER.y, k:svg._vb ? svg._vb.vw/svg.getBoundingClientRect().width : 1}; dragMoved = false;
  });
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(S.zoom*Math.exp(-e.deltaY*(e.ctrlKey ? .012 : .0025)), e.clientX, e.clientY); }, {passive:false});
  svg.addEventListener('dblclick', e => { e.preventDefault(); zoomAt(S.zoom*1.6, e.clientX, e.clientY); });
}
document.addEventListener('pointermove', e => {
  if(ptrs.has(e.pointerId)) ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(pinch && ptrs.size >= 2){ const [a, b] = [...ptrs.values()]; zoomAt(pinch.z*Math.hypot(a.x - b.x, a.y - b.y)/pinch.d, (a.x + b.x)/2, (a.y + b.y)/2); return; }
  if(!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if(!dragMoved && Math.hypot(dx, dy) < 6) return;
  dragMoved = true; const svg = $('#mapSvg'); if(svg) svg.classList.add('drag');
  S.cx = drag.cx - dx*drag.k; S.cy = drag.cy - dy*drag.k; fitMap();
});
const ptrEnd = e => { ptrs.delete(e.pointerId); if(ptrs.size < 2) pinch = null; if(drag && !ptrs.size){ const svg = $('#mapSvg'); if(svg) svg.classList.remove('drag'); drag = null; setTimeout(() => { dragMoved = false; }, 0); } };
document.addEventListener('pointerup', ptrEnd); document.addEventListener('pointercancel', ptrEnd);
window.addEventListener('resize', fitMap);

/* ================= map tab ================= */
function mapPane(){
  const a = P.active;
  let card = '';
  if(a){ const st = stById(a.stationId); card = `<button class="floatcard" data-act="openStation" data-id="${st.id}"><span class="ic">${I.lock}</span><span><b>${{reserved:'Заброньовано', open:'Слот відчинено', parked:'Під замком', out:'Видача'}[a.status]}</b><small>${esc(st.name)} · №${a.slot+1}</small></span></button>`; }
  else if(S.offerCard){ if(!S.seen.offer_map){ S.seen.offer_map = 1; track('offer_shown', {variant:A.ab.offer, place:'map'}); } } if(!a && S.offerCard) card = `<div class="floatcard"><span class="ic">${I.gift}</span><span class="grow"><b>${offerTitle()}</b><small>${C.DEMO_PAY_NOTE}</small></span><button class="btn sm" data-act="offerCta" data-place="map">Отримати</button><button class="x" data-act="closeOfferCard" aria-label="Закрити">✕</button></div>`;
  return `<div class="mapwrap${S.booted ? '' : ' boot'}">${mapSVG()}
    <button class="mapsearch" data-act="toggleList" aria-expanded="${S.list}">${I.search}<span>Станції біля метро</span><small>${STATIONS.length}</small></button>
    ${S.list ? `<div class="stlist" role="list">${STATIONS.slice().sort((a, b) => distTo(a) - distTo(b)).map(st => `<button class="strow" data-act="openStation" data-id="${st.id}"><span class="mline" style="background:${LINES[st.line].color}"></span><span><b>${esc(st.name)}</b><small>${freeCount(st)} вільні</small></span><span class="km">${kmTxt(distTo(st))}</span></button>`).join('')}</div>` : ''}
    <div class="mapctl"><button class="fab" data-act="zoom" data-d="1" aria-label="Наблизити">+</button><button class="fab" data-act="zoom" data-d="-1" aria-label="Віддалити">−</button><button class="fab" data-act="locate" aria-label="Моє місце">${I.locate}</button></div>
    ${card}
    <div class="edge l" aria-hidden="true"></div><div class="edge r" aria-hidden="true"></div>
  </div>`;
}

/* ================= station page ================= */
const modeOf = st => S.mode[st.id] || (distTo(st) <= 500 ? 'near' : 'far');
const fits = (st, k) => !VEH[P.vehicle].wide || st.slots[k].wide;
function stationPage(){
  const st = stById(S.station), mode = modeOf(st), a = P.active && P.active.stationId === st.id ? P.active : null;
  const distLabel = mode === 'near' ? '30 м' : kmTxt(Math.max(distTo(st), 1200));
  return `<div class="page">
    <div class="st-top"><button class="back" data-act="closeStation" aria-label="До карти">${I.back}</button><div class="grow"><div class="h">${esc(st.name)}</div><p class="sub">${esc(st.addr)} · планована станція</p></div></div>
    ${a ? rideCard(a) : ''}
    <div class="modebar"><div class="seg" role="group" aria-label="Де ви зараз (демо)"><button data-act="mode" data-v="near" aria-pressed="${mode === 'near'}">Я біля станції</button><button data-act="mode" data-v="far" aria-pressed="${mode === 'far'}">Я далеко</button></div>
      <div class="row"><span class="demo">Демо: імітація геолокації</span><span class="dist">${distLabel}</span></div></div>
    <div class="vrow" role="group" aria-label="Ваш транспорт">${Object.keys(VEH).map(k => `<button class="vbtn" data-act="veh" data-v="${k}" aria-pressed="${P.vehicle === k}" aria-label="${VEH[k].name}" title="${VEH[k].name}">${chipVeh(k)}</button>`).join('')}<button class="vbtn plug" data-act="charge" aria-pressed="${P.charge}" aria-label="Потрібна зарядка" title="Потрібна зарядка">${I.plug}</button></div>
    <div class="slots">${st.slots.map((sl, k) => slotRow(st, k, mode)).join('')}</div>
  </div>`;
}
function slotRow(st, k, mode){
  const sl = st.slots[k], mine = P.active && P.active.stationId === st.id && P.active.slot === k;
  const nc = sl.st === 'free' && !fits(st, k);
  const cls = mine ? 'b mine' : nc ? 'nc' : sl.st === 'free' ? 'g' : sl.st === 'booked' ? 'b' : 'r';
  const label = mine ? {reserved:'ваша бронь', open:'відчинено для вас', parked:'ваш транспорт', out:'видача'}[P.active.status] : nc ? 'вузький для вашого транспорту' : {free:'вільний', booked:'заброньовано', busy:'зайнято'}[sl.st];
  const icons = `<span class="icons">${sl.charge ? I.bolt : ''}${sl.wide ? I.wide : ''}</span>`;
  const open = S.flow && S.flow.slot === k && S.flow.station === st.id;
  let action = '';
  const canNear = mode === 'near' && ((sl.st === 'free' && !nc && !P.active) || (mine && P.active.status === 'reserved'));
  if(canNear && !open) action = `<button class="btn sm" data-act="nearOpen" data-k="${k}">${I.ble.replace('<svg', '<svg width="18" height="18"')} Відкрити (Bluetooth)</button>`;
  const tappable = mode === 'far' && sl.st === 'free' && !nc && !P.active;
  const head = tappable ? `<button class="slot-h" data-act="farTap" data-k="${k}" aria-expanded="${open}"><span class="sn">${k+1}</span><span class="meta"><b>${label} ${icons}</b><small>Натисніть, щоб забронювати</small></span></button>`
    : `<div class="slot-h"><span class="sn">${k+1}</span><span class="meta"><b>${label} ${icons}</b>${sl.charge ? '<small>із зарядкою</small>' : sl.wide ? '<small>широкий</small>' : ''}</span>${action}</div>`;
  return `<div class="slot ${cls}${open ? ' sel' : ''}">${head}${open ? flowPanel(st) : ''}</div>`;
}

/* ---- the in-flow panel under a slot: booking, auth, OTP, payment, BLE ---- */
function flowPanel(st){
  const f = S.flow;
  if(f.step === 'book') return bookPanel(f);
  if(f.step === 'tariff') return tariffPanel(f);
  if(f.step === 'auth') return `<div class="panel">${authBlock()}</div>`;
  if(f.step === 'otp') return `<div class="panel">${otpBlock()}</div>`;
  if(f.step === 'paying') return `<div class="panel"><span class="demo">${C.DEMO_PAY_NOTE}</span><button class="btn dark" disabled><span class="spin"></span> Оплата ${f.amount} грн · ${esc(f.method)}</button></div>`;
  if(f.step === 'payfail') return `<div class="panel"><div class="banner" role="alert"><b>Оплату відхилено</b>Банк не підтвердив платіж. Спробуйте ще раз або оберіть інший спосіб.</div>${payMethods(f.method)}<button class="btn" data-act="payRetry">Оплатити ще раз · ${f.amount} грн</button><span class="demo">${C.DEMO_PAY_NOTE}</span></div>`;
  if(f.step === 'ble') return `<div class="panel"><div class="ble"><span>${I.ble}</span></div><p class="sub" style="text-align:center">Відкриваємо слот №${f.slot+1} через Bluetooth…</p></div>`;
  return '';
}
const PAY_METHODS = [['gpay','Google Pay'],['apay','Apple Pay'],['card','Картка']];
const payMethods = cur => `<div class="paym" role="group" aria-label="Спосіб оплати (демо)">${PAY_METHODS.map(([k, l]) => `<button data-act="method" data-v="${l}" aria-pressed="${cur === l}">${l}</button>`).join('')}</div>`;
function bookPanel(f){
  const cost = bookingCost(f.min), pct = prepayPct(f.min), pre = prepayOf(f.min);
  const max = prepayOf(C.BOOKING_MAX);
  return `<div class="panel">
    <p class="label">Скільки тримати слот</p>
    <div class="durs" role="group" aria-label="Тривалість броні">${DURS.map(m => `<button data-act="dur" data-v="${m}" aria-pressed="${f.min === m}">${m < 60 ? m + 'хв' : (m/60).toString().replace('.', ',') + ' год'}</button>`).join('')}</div>
    <div class="sum"><div><span>Бронь ${minTxt(f.min)}</span><b>${Math.round(cost*100)/100} грн</b></div><div><span>Передоплата ${pct}%</span><b>${pre} грн</b></div><div class="tot"><span>Зараз</span><b>${pre} грн</b></div></div>
    <div><div class="stairs" aria-hidden="true">${DURS.map(m => `<i class="${m <= f.min ? 'on' : ''}${m === f.min ? ' cur' : ''}" style="height:${Math.max(6, prepayOf(m)/max*100)}%" title="${minTxt(m)}: ${prepayOf(m)} грн"></i>`).join('')}</div>
      <div class="stairs-x" aria-hidden="true">${DURS.map(m => `<span>${m % 60 ? '' : m/60 + 'г'}</span>`).join('')}</div>
      <p class="sub">${C.PREPAY_NOTE}</p></div>
    <p class="sub">${C.PREPAY_CREDITED}</p>
    <p class="label">Спосіб оплати</p>${payMethods(f.method)}
    <span class="demo">${C.DEMO_PAY_NOTE}</span>
    <button class="btn" data-act="bookConfirm" ${f.method ? '' : 'disabled'}>Підтвердити · ${pre} грн</button>
  </div>`;
}
function tariffPanel(f){
  const t = T(f.tariff), a = P.active;
  return `<div class="panel">
    <p class="label">Тариф паркування</p>
    <div class="tariffs" role="group" aria-label="Тариф">${C.TARIFFS.map(x => `<button data-act="tariff" data-v="${x.id}" aria-pressed="${f.tariff === x.id}"><b>${x.name}</b><span class="p">${price(x.price)} грн</span><small>${x.unit}</small></button>`).join('')}</div>
    ${t.hours ? `<div class="stepper"><span>Години</span><div><button data-act="hours" data-d="-1" aria-label="Менше годин">−</button><b>${f.hours}</b><button data-act="hours" data-d="1" aria-label="Більше годин">+</button></div></div>` : ''}
    ${a && a.prepay ? `<p class="sub">Передоплату ${a.prepay} грн зарахуємо при забиранні</p>` : ''}
    <span class="demo">${C.DEMO_PAY_NOTE}</span>
    <button class="btn" data-act="nearConfirm">${I.ble.replace('<svg', '<svg width="18" height="18"')} Відкрити слот №${f.slot+1}</button>
  </div>`;
}
function authBlock(){
  const ph = S.authTab === 'phone';
  return `<p class="label">Вхід, щоб продовжити</p>
    <div class="seg" role="tablist"><button role="tab" data-act="authTab" data-v="phone" aria-pressed="${ph}" aria-selected="${ph}">Телефон</button><button role="tab" data-act="authTab" data-v="gmail" aria-pressed="${!ph}" aria-selected="${!ph}">Gmail</button></div>
    <input class="field mono" id="authIn" type="${ph ? 'tel' : 'email'}" inputmode="${ph ? 'tel' : 'email'}" value="${esc(ph ? S.phoneDraft : S.mailDraft)}" placeholder="${ph ? '+380 XX XXX XX XX' : 'name@gmail.com'}" aria-label="${ph ? 'Номер телефону' : 'Адреса Gmail'}" autocomplete="off">
    <p class="err" id="authErr"></p>
    <button class="btn" data-act="sendAuth">Отримати код</button>
    <p class="sub">Демо: код приходить лише всередині сайту. Номер чи пошта лишаються у вашому браузері.</p>`;
}
function otpBlock(){
  const o = S.otp, locked = Date.now() < o.lockUntil;
  const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => k === '' ? '<button class="ph" tabindex="-1" aria-hidden="true"></button>' : `<button data-act="key" data-k="${k}" ${locked || o.checking ? 'disabled' : ''} aria-label="${k === '⌫' ? 'Стерти' : k}">${k}</button>`).join('');
  return `<p class="label">${{login:'Код для входу', book:'Підтвердіть бронювання', pickup:'Підтвердіть видачу'}[o.purpose]}</p>
    <div class="otpb${o.cls === 'bad' ? ' bad' : ''}" id="otpBoxes" role="img" aria-label="Введено цифр: ${o.entered.length} з 4">${[0,1,2,3].map(i => `<i class="${i === o.entered.length && !locked ? 'f' : ''}">${o.entered[i] || ''}</i>`).join('')}</div>
    ${locked ? `<div class="lock">Забагато спроб<b id="lockClock">${fmt(o.lockUntil - Date.now()).slice(3)}</b></div><button class="linkbtn" data-act="skipLock">Пропустити очікування (демо)</button>`
      : `<p class="${o.cls === 'ok' ? 'ok' : o.cls === 'bad' ? 'err' : 'sub'}" role="status" style="text-align:center;min-height:1.3em">${esc(o.msg)}</p><div class="tries">${[0,1,2].map(i => `<i class="${i >= o.tries ? 'used' : ''}"></i>`).join('')}</div>`}
    <div class="keypad">${keys}</div>
    <div class="row" style="justify-content:center"><button class="linkbtn" data-act="showCode">Показати код</button><button class="linkbtn" data-act="resend">Новий код</button></div>`;
}

/* ---- active session card ---- */
function rideCard(a){
  const t = a.tariff ? T(a.tariff) : null;
  const tools = `<div class="tools"><button data-act="cam" aria-pressed="${S.camOpen}">${I.cam}Камера</button><button data-act="pin" aria-pressed="${S.pinShow}">${I.key}${S.pinShow ? `<span class="mono">${a.pin}</span>` : 'PIN'}</button><button data-act="payInfo" aria-pressed="${S.payOpen}">${I.wallet}Оплата</button></div>
    ${S.payOpen ? `<p class="sub" style="text-align:center">${a.prepay ? `Передоплата ${a.prepay} грн · ` : ''}${a.tariff ? `зараз до сплати ${remaining(a)} грн` : 'тариф оберете при відкритті'}</p>` : ''}${S.camOpen && a.status !== 'reserved' ? camBlock(a) : ''}`;
  const f = S.flow && S.flow.ride ? S.flow : null;
  if(f && f.step === 'otp') return `<div class="ride">${otpBlock()}</div>`;
  if(f && f.step === 'pay') return `<div class="ride"><p class="label">Оплата паркування</p><div class="sum"><div><span>${t.name}${t.hours ? ' · ' + a.hours + ' год' : ''}</span><b>${tariffCost(a.tariff, a.hours, a.elapsed)} грн</b></div>${a.prepay ? `<div><span>Передоплата</span><b>−${a.prepay} грн</b></div>` : ''}<div class="tot"><span>До сплати</span><b>${f.amount} грн</b></div></div>${payMethods(f.method)}<span class="demo">${C.DEMO_PAY_NOTE}</span><button class="btn" data-act="pickupPay" ${f.method ? '' : 'disabled'}>Оплатити ${f.amount} грн</button></div>`;
  if(f && f.step === 'paying') return `<div class="ride"><button class="btn dark" disabled><span class="spin"></span> Оплата ${f.amount} грн · ${esc(f.method)}</button><span class="demo">${C.DEMO_PAY_NOTE}</span></div>`;
  if(f && f.step === 'payfail') return `<div class="ride"><div class="banner" role="alert"><b>Оплату відхилено</b>Спробуйте ще раз або оберіть інший спосіб.</div>${payMethods(f.method)}<button class="btn" data-act="payRetry">Оплатити ще раз · ${f.amount} грн</button></div>`;
  if(a.status === 'reserved') return `<div class="ride"><div class="row"><span class="pill b">Заброньовано</span><b class="grow">Слот №${a.slot+1}</b></div>
    ${ring((a.until - Date.now())/(a.min*60000), `<small>бронь ще</small><span id="resLeft">${fmt(a.until - Date.now()).slice(0, 5)}</span><small>год : хв</small>`)}
    ${tools}<p class="sub" style="text-align:center">На місці перемкніть «Я біля станції» і відкрийте слот</p>
    <button class="linkbtn" data-act="cancelRes">Скасувати бронь</button></div>`;
  if(a.status === 'open') return `<div class="ride"><div class="row"><span class="pill b">Слот відчинено</span><b class="grow">№${a.slot+1}</b></div>${slotArt('open', a.vehicle)}
    <p style="text-align:center;font-weight:700">${a.vehicle === 'bike' ? 'На гак' : 'У тримач'}${a.charge ? ' · підключіть зарядку' : ''} · зачиніть двері</p>
    <button class="btn" data-act="parked">Готово, двері зачинено</button></div>`;
  if(a.status === 'parked') return `<div class="ride"><div class="row"><span class="pill g">Під замком</span><b class="grow">№${a.slot+1} · ${t.name}</b></div>
    ${ring(Math.min(1, a.elapsed/((t.hours ? a.hours : (t.planHours || 12))*3.6e6)), `<span class="vic">${I.lock.replace('<svg', '<svg width="22" height="22"')}</span><span id="pkTimer">${fmt(a.elapsed)}</span>`, 'g')}
    ${a.charge ? `<div class="batt" aria-label="Заряд"><span class="cell"><b id="chgBar" style="width:${Math.floor(a.battery)}%"></b></span><span id="chgPct">${Math.floor(a.battery)}%</span></div>` : ''}
    ${tools}<button class="btn dark" data-act="pickup">Забрати ${VEH[a.vehicle].acc}</button></div>`;
  return `<div class="ride"><div class="row"><span class="pill g">Видача</span><b class="grow">№${a.slot+1}</b></div>${slotArt('out', a.vehicle)}
    <p style="text-align:center;font-weight:700">Забирайте · двері зачиняться самі</p><button class="btn" data-act="taken">Я забрав транспорт</button></div>`;
}
const remaining = a => Math.max(0, tariffCost(a.tariff, a.hours, a.elapsed) - (a.prepay || 0));

/* ================= bonuses tab ================= */
function offerTitle(){ return A.ab.offer === 'A' ? 'Забронюй 100 годин наперед' : `−${C.FIRST_DISCOUNT_PCT}% на перше паркування`; }
function offerCard(place){
  if((place !== 'bonus' || S.tab === 'bonus') && !S.seen['offer_' + place]){ S.seen['offer_' + place] = 1; track('offer_shown', {variant:A.ab.offer, place}); }
  const single = Math.round(100*hourly()), pack = price(C.PACK_100H_PRICE), save = Math.max(0, single - pack);
  const body = A.ab.offer === 'A'
    ? `<p class="big">${pack} грн</p><p class="sub">100 годин паркування, використати за ${C.PACK_VALID_DAYS} днів${save ? ` · економія ${save} грн проти разового тарифу (${single} грн)` : ''}</p>`
    : `<p class="big">−${C.FIRST_DISCOUNT_PCT}%</p><p class="sub">на перше паркування до ${C.FIRST_PARKING_MAX_HOURS} год: ${Math.round(hourly()*C.FIRST_PARKING_MAX_HOURS*(100 - C.FIRST_DISCOUNT_PCT)/100)} грн замість ${Math.round(hourly()*C.FIRST_PARKING_MAX_HOURS)} грн</p>`;
  return `<div class="card offer"><span class="demo">${C.DEMO_PAY_NOTE}</span><b style="font-size:1.1em">${offerTitle()}</b>${body}<button class="btn" data-act="offerCta" data-place="${place}">Отримати пропозицію</button></div>`;
}
function bonusPane(){
  if(S.bonusView === 'honest') return `<div class="page">
    <div class="st-top"><button class="back" data-act="honestBack" aria-label="Назад">${I.back}</button><div class="h grow">${offerTitle()}</div></div>
    ${S.honestSent ? '<div class="card"><p class="ok">Дякуємо! Повідомимо, коли пропозиція стане доступною.</p></div>' : `<div class="card"><p>${C.HONEST_OFFER_TEXT}</p>
      <input class="field" id="honestContact" placeholder="Телефон або Telegram (необов’язково)" aria-label="Телефон або Telegram" autocomplete="off">
      <label class="consentbox" for="honestOk"><input type="checkbox" id="honestOk"><span>Погоджуюсь, щоб команда Anchor зберегла цей контакт і написала мені про пропозицію. Його бачить лише команда; видалити — «Налаштування» → «Видалити мої дані» або напишіть нам. <a href="privacy.html">Політика приватності</a></span></label>
      <p class="err" id="honestErr"></p><button class="btn" data-act="honestSend">Повідомити мене</button></div>`}
    <span class="demo">${C.DEMO_PAY_NOTE}</span></div>`;
  return `<div class="page">
    <div class="h">Бонуси</div>
    ${offerCard('bonus')}
    <div class="card"><div class="row"><span class="grow"><b>Приведи друга</b><p class="sub">Розкажи про нас у соцмережах, приведи друга й отримай ${C.REFERRAL_HOURS} годин паркування</p></span><span class="demo">Демо</span></div>
      ${S.referralOpen ? `<div class="code" id="refCode">${S.refCode}</div>
        <div class="row"><button class="btn line" data-act="refCopy">Скопіювати код</button><button class="btn" data-act="refShare">Поділитися</button></div>
        ${S.shareOpen ? `<div class="post" id="refPost">${esc(shareText())}</div><button class="btn line" data-act="refCopyText">Скопіювати текст</button>` : ''}`
      : '<button class="btn" data-act="refOpen">Отримати код</button>'}
    </div>
    <div class="card"><b>Ввести код друга</b>
      <div class="row"><input class="field mono grow" id="friendCode" placeholder="ANCHOR-XXXX" aria-label="Код друга" autocomplete="off" maxlength="11"><button class="btn sm" data-act="friendCode">Активувати</button></div>
      <p class="${S.friendMsg.startsWith('Бонус') ? 'ok' : 'err'}" role="status">${esc(S.friendMsg)}</p><span class="demo">Демо: бонус не нараховується</span></div>
  </div>`;
}
const shareText = () => `Паркую велосипед біля метро в Anchor: слоти під замком і камерою, зарядка для самоката. Введи мій код ${S.refCode} — і ми обоє отримаємо по ${C.REFERRAL_HOURS} годин паркування, коли сервіс запрацює. ${location.origin}${location.pathname}`;

/* ================= settings tab ================= */
const SCENARIOS = [['main','Основний'],['term','Без застосунку'],['dead','Телефон розрядився'],['power','Відключення світла'],['bug','Збій застосунку'],['theft','Спроба злому'],['cam','Атака на камери']];
const EXAMPLES = [
  {example:true, station:'Золоті ворота', at:Date.now() - 3*864e5, tariff:'day', minutes:540, charge:false, total:75},
  {example:true, station:'Лук’янівська', at:Date.now() - 6*864e5, tariff:'once', minutes:95, charge:true, total:40},
];
function settingsPane(){
  if(S.settingsView === 'survey') return surveyPage();
  const c = A.consent(), code = A.sessionCode();
  const hist = P.history.concat(EXAMPLES);
  return `<div class="page">
    <div class="h">Налаштування</div>
    <div class="card" style="gap:0">
      <label class="sw" for="sBig"><span>Великий текст (Aa)</span><input type="checkbox" id="sBig" data-act="big" ${P.big ? 'checked' : ''}></label>
      <label class="sw" for="sVoice"><span>Голосові підказки</span><input type="checkbox" id="sVoice" data-act="voice" ${P.voice ? 'checked' : ''}></label>
      <label class="sw" for="sLang"><span>Мова</span><select id="sLang" class="field" style="width:auto;min-height:44px"><option selected>Українська</option><option disabled>English · скоро</option></select></label>
      <label class="sw" for="sCharge" style="border:0"><span>Потрібна зарядка</span><input type="checkbox" id="sCharge" data-act="charge" ${P.charge ? 'checked' : ''}></label>
    </div>
    <div class="card"><b>Статистика використання</b>
      <p class="sub">${c === 'accepted' ? 'Ви дозволили знеособлену статистику.' : c === 'necessary' ? 'Збираємо лише необхідне: статистика вимкнена.' : 'Ви ще не обрали.'}</p>
      <div class="row"><button class="btn line" data-act="consent" data-v="accepted" aria-pressed="${c === 'accepted'}">Прийняти</button><button class="btn line" data-act="consent" data-v="necessary" aria-pressed="${c === 'necessary'}">Лише необхідні</button></div>
      <details><summary class="linkbtn" style="list-style:none">Що саме збираємо</summary><ul class="sub">${C.CONSENT_DETAILS.map(x => `<li>${esc(x)}</li>`).join('')}</ul></details>
      <a href="privacy.html">Політика приватності</a>
      ${code ? `<p class="label">Код вашої сесії</p><div class="row"><span class="code grow" id="sessCode" style="font-size:1em">${esc(code)}</span><button class="btn sm line" data-act="copyCode">Скопіювати</button></div>` : ''}
    </div>
    <button class="btn" data-act="openSurvey">Анкета · 2 хвилини</button>
    <div class="card"><b>Сценарії надійності</b><p class="sub">Як станція поводиться в нештатних ситуаціях</p>
      <div class="scn">${SCENARIOS.map(([k, n]) => `<a href="scenarios.html#${k}" data-act="scenario" data-v="${esc(n)}">${esc(n)}</a>`).join('')}</div></div>
    <div class="card"><b>Історія</b><div class="hist">${hist.map(h => `<div class="hrow"><div class="top2"><span>${esc(h.station)}</span><span>${h.total} грн</span></div><small>${dt(h.at)} · ${T(h.tariff).name} · ${minTxt(h.minutes)}${h.charge ? ' · ⚡' : ''}</small>${h.example ? '<span class="pill a" style="align-self:flex-start">приклад</span>' : ''}</div>`).join('')}</div></div>
    <div class="card"><b>Демо</b>
      <div class="seg" role="group" aria-label="Швидкість часу"><button data-act="speed" data-v="1" aria-pressed="${S.speed === 1}">Час ×1</button><button data-act="speed" data-v="60" aria-pressed="${S.speed === 60}">×60</button><button data-act="speed" data-v="600" aria-pressed="${S.speed === 600}">×600</button></div>
      ${P.account ? `<p class="sub">Вхід: ${esc(P.account.method === 'gmail' ? maskMail(P.account.id) : maskPhone(P.account.id))}</p><button class="btn line" data-act="logout">Вийти</button>` : ''}
      <button class="btn line" data-act="forget">Видалити мої дані з цього браузера</button></div>
  </div>`;
}
const FEATURES = ['Карта і три вкладки замість меню','Автоматичний режим «поруч / далеко»','Бронювання до 3 годин із передоплатою',`Реферальна програма (${C.REFERRAL_HOURS} годин за друга)`,`Пакет 100 годин або знижка ${C.FIRST_DISCOUNT_PCT}% на перше паркування`,'Анімований логотип із фактами','Сценарії надійності (відключення світла, спроба злому)'];
function surveyPage(){
  const v = S.survey;
  if(v.sent) return `<div class="page"><div class="st-top"><button class="back" data-act="closeSurvey" aria-label="Назад">${I.back}</button><div class="h">Дякуємо!</div></div><div class="card"><p>Відповіді надіслано.</p></div></div>`;
  const yn = (k, opts) => `<div class="yn">${opts.map(([val, l]) => `<button data-act="sv" data-k="${k}" data-v="${val}" aria-pressed="${v[k] === val}">${l}</button>`).join('')}</div>`;
  const n = v.features.length + (v.otherOn ? 1 : 0);
  return `<div class="page">
    <div class="st-top"><button class="back" data-act="closeSurvey" aria-label="Назад">${I.back}</button><div class="h">Анкета</div></div>
    <fieldset class="q"><legend>Наскільки Anchor допоміг би вам?</legend><div class="stars" role="radiogroup" aria-label="Оцінка від 1 до 5">${[1,2,3,4,5].map(i => `<button role="radio" aria-checked="${v.rating === i}" aria-label="${i} з 5" class="${i <= v.rating ? 'on' : ''}" data-act="star" data-v="${i}">${I.star}</button>`).join('')}</div></fieldset>
    <fieldset class="q"><legend>Зрозуміло, як це працює?</legend>${yn('understood', [['yes','Так'],['part','Частково'],['no','Ні']])}</fieldset>
    <fieldset class="q"><legend>Користувалися б за такими цінами?</legend>${yn('wouldUse', [['yes','Так'],['no','Ні']])}</fieldset>
    <fieldset class="q"><legend>Які функції з тестування вам сподобались і ви хотіли б бачити у фінальній версії? (оберіть до 3)</legend>
      <div class="checks">${FEATURES.map((f, i) => `<label for="ft${i}"><input type="checkbox" id="ft${i}" data-act="feat" data-v="${i+1}" ${v.features.includes(i+1) ? 'checked' : ''} ${n >= 3 && !v.features.includes(i+1) ? 'disabled' : ''}>${esc(f)}</label>`).join('')}
      <label for="ftO"><input type="checkbox" id="ftO" data-act="featOther" ${v.otherOn ? 'checked' : ''} ${n >= 3 && !v.otherOn ? 'disabled' : ''}>Інше</label>
      ${v.otherOn ? `<input class="field" id="ftOther" value="${esc(v.other)}" maxlength="120" placeholder="Що саме?" aria-label="Інша функція">` : ''}</div>
      <p class="sub">Обрано ${n} з 3</p></fieldset>
    <p class="err" id="svErr"></p>
    <button class="btn" data-act="svSend">Надіслати</button>
  </div>`;
}

/* ================= rendering ================= */
const TABS = ['map','bonus','settings'];
function renderMap(){ const p = $('#pane-map'); p.innerHTML = S.station ? stationPage() : mapPane(); if(!S.station){ bindMap(); fitMap(); S.booted = true; } }
function renderPane(name){
  const ae = document.activeElement, keep = ae && ae.id && ae.closest('.pane') ? {id:ae.id, s:ae.selectionStart, e:ae.selectionEnd} : null;
  if(name === 'map') renderMap();
  if(name === 'bonus') $('#pane-bonus').innerHTML = bonusPane();
  if(name === 'settings') $('#pane-settings').innerHTML = settingsPane();
  if(keep){ const el = document.getElementById(keep.id); if(el){ el.focus({preventScroll:true}); try{ el.setSelectionRange(keep.s, keep.e); }catch(e){} } }
}
function render(){
  TABS.forEach(renderPane);
  $('#app').classList.toggle('big', P.big);
  $('#app').classList.toggle('mascot-on', mascotOn());
  $('#track').style.transform = `translateX(${-TABS.indexOf(S.tab)*33.3334}%)`;
  $$('#nav button').forEach(b => b.dataset.tab === S.tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $$('.pane').forEach((p, i) => { p.inert = TABS[i] !== S.tab; });
  $('#exp').textContent = 'exp: ' + A.expLabel();
}
function setTab(t){
  if(!TABS.includes(t) || t === S.tab){ render(); return; }
  S.tab = t; track('tab_changed', {tab:t});
  render();
}

/* ================= flows ================= */
function openStation(id){
  S.station = id; S.list = false; S.flow = null; S.camOpen = false;
  const st = stById(id); track(modeOf(st) === 'near' ? 'mode_near_shown' : 'mode_far_shown', {station:id, auto:true});
  renderPane('map'); $('#pane-map').scrollTop = 0;
}
function needAuth(next){ if(P.account) return false; S.flow.after = next; S.flow.step = 'auth'; return true; }
function sendOtp(purpose){
  const o = S.otp;
  Object.assign(o, {purpose, entered:'', msg:'', cls:'', checking:false});
  if(Date.now() < o.lockUntil) return;
  const code = o.code = String(1000 + rnd(9000)); o.codeAt = Date.now();
  const mail = (P.account ? P.account.method : S.authTab) === 'gmail';
  setTimeout(() => { if(o.code === code) notify(mail ? 'mail' : 'sms', `Ваш код Anchor: ${code}. Нікому його не повідомляйте.`); }, 600);
}
function press(k){
  const o = S.otp; if(!S.flow || S.flow.step !== 'otp' || o.checking || Date.now() < o.lockUntil) return;
  if(k !== '⌫' && o.entered.length >= 4) return;
  o.entered = k === '⌫' ? o.entered.slice(0, -1) : o.entered + k; o.cls = ''; o.msg = '';
  if(o.entered.length === 4){ o.checking = true; renderPane('map'); setTimeout(checkOtp, 220); return; }
  renderPane('map');
}
function checkOtp(){
  const o = S.otp; o.checking = false; if(!S.flow || S.flow.step !== 'otp') return;
  if(o.code && Date.now() - o.codeAt > 5*60000){ o.code = null; o.entered = ''; o.msg = 'Код застарів. Запросіть новий.'; o.cls = 'bad'; renderPane('map'); return; }
  if(o.code && o.entered === o.code){
    o.tries = 3; o.code = null; o.msg = 'Код підтверджено'; o.cls = 'ok'; $('#notif').classList.remove('on'); renderPane('map');
    setTimeout(() => otpPassed(o.purpose), 400); return;
  }
  o.tries--; o.entered = '';
  if(o.tries <= 0){ o.lockUntil = Date.now() + 60000; o.tries = 3; o.code = null; say('Забагато спроб. Зачекайте хвилину.'); renderPane('map'); return; }
  o.msg = `Невірний код. Залишилось спроб: ${o.tries}`; o.cls = 'bad'; renderPane('map');
}
function otpPassed(purpose){
  const f = S.flow; if(!f) return;
  if(purpose === 'login'){
    P.account = {method:S.authTab, id:S.authTab === 'gmail' ? S.mailDraft.trim().toLowerCase() : S.phoneDraft}; save(); say('Вхід виконано.');
    const next = f.after; f.after = null;
    if(next === 'book') startPay(f.amount);
    else if(next === 'near') doBle();
    return;
  }
  if(purpose === 'book') startPay(f.amount);
  if(purpose === 'pickup'){ const a = P.active, amt = remaining(a); if(amt > 0){ S.flow = {ride:true, step:'pay', amount:amt, method:a.method || null}; renderPane('map'); } else openForPickup(); }
}
function startPay(amount){ const f = S.flow; f.amount = amount; f.step = 'paying'; renderPane('map'); setTimeout(payResult, 1300); }
function payResult(){
  const f = S.flow; if(!f || f.step !== 'paying') return;
  if(C.PAYMENT_FAIL_FIRST && !S.failedOnce){ S.failedOnce = true; f.step = 'payfail'; say('Оплату відхилено. Спробуйте ще раз.'); renderPane('map'); return; }
  if(f.ride){ openForPickup(); return; }
  /* booking paid: hold the slot for the chosen time */
  const st = stById(f.station), now = Date.now();
  P.active = {stationId:st.id, slot:f.slot, status:'reserved', min:f.min, until:now + f.min*60000, prepay:f.amount, method:f.method, vehicle:P.vehicle, charge:P.charge && !!VEH[P.vehicle].electric && st.slots[f.slot].charge, pin:String(1000 + rnd(9000)), elapsed:0, battery:34};
  st.slots[f.slot].st = 'mine'; save();
  track('booking_confirmed', {station:st.id, min:f.min, uah:f.amount, method:f.method});
  S.flow = null; renderPane('map'); payFx(f.amount, `Слот тримаємо ${minTxt(f.min)}`); say('Слот заброньовано.');
  setTimeout(() => notify('info', `Бронь ${st.name}, слот №${f.slot+1}. Резервний PIN: ${P.active ? P.active.pin : ''}`), 1600);
}
function doBle(){
  const f = S.flow; f.step = 'ble'; renderPane('map');
  setTimeout(() => {
    const st = stById(f.station), prev = P.active && P.active.stationId === st.id && P.active.slot === f.slot ? P.active : null;
    P.active = Object.assign(prev || {stationId:st.id, slot:f.slot, prepay:0, pin:String(1000 + rnd(9000)), vehicle:P.vehicle}, {status:'open', tariff:f.tariff, hours:f.hours, elapsed:0, battery:34, charge:P.charge && !!VEH[P.vehicle].electric && st.slots[f.slot].charge});
    st.slots[f.slot].st = 'mine'; save();
    track('slot_opened_near', {station:st.id, slot:f.slot + 1, tariff:f.tariff, reserved:!!prev});
    S.flow = null; renderPane('map'); say(`Слот ${f.slot + 1} відкрито.`);
  }, 1600);
}
function openForPickup(){ const a = P.active; a.status = 'out'; a.paid = (a.prepay || 0) + (S.flow && S.flow.amount || 0); S.flow = null; save(); renderPane('map'); if(a.paid) payFx(S.lastPay || a.paid, 'Слот відчинено'); say('Слот відкрито. Заберіть транспорт.'); }
function finishSession(){
  const a = P.active, st = stById(a.stationId);
  P.history.unshift({station:st.name, at:Date.now(), tariff:a.tariff, minutes:Math.max(1, Math.round(a.elapsed/60000)), charge:a.charge, total:tariffCost(a.tariff, a.hours, a.elapsed)});
  st.slots[a.slot].st = 'free'; P.active = null; S.offerCard = true; S.camOpen = false; save();
  track('pickup_done', {station:st.id});
  S.station = null; render(); toast('Гарної поїздки! Запис збережено в історії');
}

/* ================= actions ================= */
const ACT = {
  openStation(b){ if(dragMoved) return; openStation(b.dataset.id); },
  closeStation(){ S.station = null; S.flow = null; renderPane('map'); },
  toggleList(){ S.list = !S.list; renderPane('map'); },
  zoom(b){ const svg = $('#mapSvg'), r = svg.getBoundingClientRect(); zoomAt(S.zoom*(+b.dataset.d > 0 ? 1.4 : 1/1.4), r.left + r.width/2, r.top + r.height/2); },
  locate(){ S.cx = USER.x; S.cy = USER.y; fitMap(); },
  closeOfferCard(){ S.offerCard = false; renderPane('map'); },
  mode(b){ const st = stById(S.station); S.mode[st.id] = b.dataset.v; S.flow = null; track(b.dataset.v === 'near' ? 'mode_near_shown' : 'mode_far_shown', {station:st.id, auto:false}); renderPane('map'); },
  veh(b){ P.vehicle = b.dataset.v; if(!VEH[P.vehicle].electric) P.charge = false; save(); if(S.flow && !fits(stById(S.station), S.flow.slot)) S.flow = null; renderPane('map'); renderPane('settings'); },
  charge(){ P.charge = !P.charge; save(); render(); },
  farTap(b){
    const k = +b.dataset.k;
    if(S.flow && S.flow.slot === k){ S.flow = null; renderPane('map'); return; }
    S.flow = {station:S.station, slot:k, step:'book', min:60, method:null};
    track('booking_started', {station:S.station, slot:k + 1});
    track('booking_duration_selected', {min:60}); track('booking_prepay_shown', {uah:prepayOf(60), pct:prepayPct(60)});
    renderPane('map');
  },
  dur(b){ const m = +b.dataset.v; S.flow.min = m; track('booking_duration_selected', {min:m}); track('booking_prepay_shown', {uah:prepayOf(m), pct:prepayPct(m)}); renderPane('map'); },
  method(b){ S.flow.method = b.dataset.v; track('payment_method_selected', {method:b.dataset.v, step:S.flow.ride ? 'pickup' : S.flow.step}); renderPane('map'); },
  bookConfirm(){ const f = S.flow; if(!f.method) return; f.amount = prepayOf(f.min); if(needAuth('book')){ renderPane('map'); return; } sendOtp('book'); f.step = 'otp'; renderPane('map'); },
  nearOpen(b){ if(P.active && !(P.active.status === 'reserved' && P.active.stationId === S.station && P.active.slot === +b.dataset.k)){ toast('У вас уже є активна сесія'); return; } S.flow = {station:S.station, slot:+b.dataset.k, step:'tariff', tariff:'once', hours:2}; renderPane('map'); },
  tariff(b){ S.flow.tariff = b.dataset.v; renderPane('map'); },
  hours(b){ S.flow.hours = Math.min(12, Math.max(1, S.flow.hours + +b.dataset.d)); renderPane('map'); },
  nearConfirm(){ if(needAuth('near')){ renderPane('map'); return; } doBle(); },
  authTab(b){ const i = $('#authIn'); if(i){ if(S.authTab === 'phone') S.phoneDraft = i.value; else S.mailDraft = i.value; } S.authTab = b.dataset.v; renderPane('map'); },
  sendAuth(){
    const v = $('#authIn').value.trim();
    if(S.authTab === 'phone'){ const d = v.replace(/\D/g, ''); if(d.length !== 12 || !d.startsWith('380')){ $('#authErr').textContent = 'Формат: +380 XX XXX XX XX'; return; } S.phoneDraft = '+' + d.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5'); }
    else { if(!/^[a-z0-9._%+-]+@gmail\.com$/i.test(v)){ $('#authErr').textContent = 'Вкажіть адресу Gmail'; return; } S.mailDraft = v; }
    sendOtp('login'); S.flow.step = 'otp'; renderPane('map');
  },
  key(b){ press(b.dataset.k); },
  showCode(){ if(S.otp.code) notify((P.account ? P.account.method : S.authTab) === 'gmail' ? 'mail' : 'sms', `Ваш код Anchor: ${S.otp.code}`); },
  resend(){ sendOtp(S.otp.purpose); S.otp.msg = 'Новий код надіслано'; S.otp.cls = 'ok'; renderPane('map'); },
  skipLock(){ S.otp.lockUntil = Date.now(); },
  payRetry(){ startPay(S.flow.amount); },
  cancelRes(){ const a = P.active; stById(a.stationId).slots[a.slot].st = 'free'; P.active = null; save(); toast(`Бронь скасовано, ${a.prepay} грн повернуто (демо)`); renderPane('map'); },
  parked(){ const a = P.active; a.status = 'parked'; a.parkedAt = Date.now(); save(); say('Слот зачинено. Транспорт у безпеці.'); renderPane('map'); },
  pickup(){ S.flow = {ride:true, step:'otp', station:S.station}; sendOtp('pickup'); renderPane('map'); },
  pickupPay(){ const f = S.flow; if(!f.method) return; P.active.method = f.method; S.lastPay = f.amount; startPay(f.amount); },
  taken(){ finishSession(); },
  cam(){ S.camOpen = !S.camOpen; renderPane('map'); },
  pin(){ S.pinShow = !S.pinShow; renderPane('map'); },
  payInfo(){ S.payOpen = !S.payOpen; renderPane('map'); },
  offerCta(b){ track('offer_clicked', {variant:A.ab.offer, place:b.dataset.place}); S.bonusView = 'honest'; S.honestSent = false; S.offerCard = false; setTab('bonus'); render(); },
  honestBack(){ S.bonusView = null; renderPane('bonus'); },
  honestSend(){
    const v = $('#honestContact').value.trim(), ok = $('#honestOk').checked;
    if(!v){ S.honestSent = true; renderPane('bonus'); return; }
    if(!ok){ $('#honestErr').textContent = 'Поставте позначку згоди або залиште поле порожнім'; return; }
    if(!/^(\+?\d[\d\s()-]{8,}|@?[A-Za-z0-9_]{5,32})$/.test(v)){ $('#honestErr').textContent = 'Вкажіть телефон або нік у Telegram'; return; }
    postForm('contact', {contact:v.slice(0, 60), source:'offer_' + A.ab.offer, consent:'yes'}).catch(() => {});
    track('contact_left', {source:'offer'}); S.honestSent = true; renderPane('bonus');
  },
  refOpen(){ S.referralOpen = true; track('referral_opened', {}); renderPane('bonus'); },
  refCopy(){ copy(S.refCode, $('#refCode')); track('referral_code_copied', {}); },
  refShare(){ S.shareOpen = true; track('referral_share_clicked', {}); renderPane('bonus'); },
  refCopyText(){ copy(shareText(), $('#refPost')); },
  friendCode(){
    const v = $('#friendCode').value.trim().toUpperCase(), valid = /^ANCHOR-[A-Z0-9]{4}$/.test(v) && v !== S.refCode;
    S.friendMsg = valid ? 'Бонус буде нараховано при запуску' : v === S.refCode ? 'Це ваш власний код' : 'Формат коду: ANCHOR-XXXX';
    track('referral_code_entered', {valid}); renderPane('bonus');
  },
  big(){ P.big = !P.big; save(); render(); },
  voice(){ P.voice = !P.voice; save(); render(); if(P.voice) say('Голосові підказки ввімкнено.'); },
  consent(b){ A.setConsent(b.dataset.v); if(b.dataset.v === 'accepted') save(); $('#consent').hidden = true; render(); },
  copyCode(){ copy(A.sessionCode(), $('#sessCode')); },
  scenario(b){ track('scenario_opened', {scenario:b.dataset.v}); },
  speed(b){ S.speed = +b.dataset.v; renderPane('settings'); },
  logout(){ P.account = null; save(); renderPane('settings'); },
  forget(){ A.forgetAll(); location.reload(); },
  openSurvey(){ S.settingsView = 'survey'; renderPane('settings'); $('#pane-settings').scrollTop = 0; },
  closeSurvey(){ S.settingsView = null; renderPane('settings'); },
  star(b){ S.survey.rating = +b.dataset.v; renderPane('settings'); },
  sv(b){ S.survey[b.dataset.k] = b.dataset.v; renderPane('settings'); },
  feat(b){ const v = +b.dataset.v, f = S.survey.features; if(b.checked){ if(f.length + (S.survey.otherOn ? 1 : 0) < 3) f.push(v); } else S.survey.features = f.filter(x => x !== v); renderPane('settings'); },
  featOther(b){ S.survey.otherOn = b.checked; renderPane('settings'); },
  svSend(){
    const v = S.survey; const o = $('#ftOther'); if(o) v.other = o.value.trim();
    if(!v.rating || !v.understood || !v.wouldUse){ $('#svErr').textContent = 'Дайте відповідь на перші три питання'; return; }
    const ab = A.expParams();
    postForm('survey', {rating:v.rating, understood:v.understood, would_use:v.wouldUse, features:v.features.join(','), features_other:v.otherOn ? v.other.slice(0, 120) : '', exp_offer:ab.exp_offer, exp_mascot:ab.exp_mascot, exp_price:ab.exp_price, session_code:A.sessionCode()})
      .then(() => toast('Анкету надіслано')).catch(() => toast('Не вдалося надіслати. Перевірте інтернет і спробуйте ще раз.'));
    track('features_survey_submitted', {features:v.features.join(','), count:v.features.length + (v.otherOn ? 1 : 0), other:v.otherOn, rating:v.rating});
    v.sent = true; renderPane('settings');
  },
};
document.addEventListener('click', e => {
  const tb = e.target.closest('#nav [data-tab]'); if(tb){ setTab(tb.dataset.tab); return; }
  const b = e.target.closest('[data-act]'); if(!b || b.disabled) return;
  const f = ACT[b.dataset.act]; if(f) f(b, e);
});
document.addEventListener('input', e => { if(e.target.id === 'ftOther') S.survey.other = e.target.value; });
document.addEventListener('keydown', e => {
  if(e.target.id === 'authIn' && e.key === 'Enter'){ ACT.sendAuth(); return; }
  if(e.target.classList && e.target.classList.contains('pin') && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openStation(e.target.dataset.id); return; }
  if(S.flow && S.flow.step === 'otp' && !e.target.closest('input,textarea,select')){ if(/^[0-9]$/.test(e.key)) press(e.key); else if(e.key === 'Backspace') press('⌫'); }
});
$('#notif').addEventListener('click', () => { $('#notif').classList.remove('on'); const o = S.otp; if(S.flow && S.flow.step === 'otp' && o.code && Date.now() >= o.lockUntil){ o.entered = ''; o.code.split('').forEach((c, i) => setTimeout(() => press(c), 90*i)); } });

/* ================= swipe between tabs ================= */
let sw = null;
$('#tabs').addEventListener('pointerdown', e => {
  if(e.target.closest('input,select,textarea,.durs,.tariffs,.stairs')) return;
  const onMap = S.tab === 'map' && !S.station && e.target.closest('.mapwrap') && !e.target.closest('.edge');
  if(onMap) return;                                   /* on the map a horizontal drag pans; swipe from the screen edge instead */
  sw = {x:e.clientX, y:e.clientY, w:$('#tabs').clientWidth, on:false};
});
document.addEventListener('pointermove', e => {
  if(!sw) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if(!sw.on){ if(Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)*1.4){ sw.on = true; $('#track').classList.add('dragging'); } else if(Math.abs(dy) > 12){ sw = null; return; } else return; }
  const i = TABS.indexOf(S.tab), pct = -i*33.3334 + dx/sw.w*33.3334;
  $('#track').style.transform = `translateX(${Math.max(-66.6668, Math.min(0, pct))}%)`;
});
document.addEventListener('pointerup', e => {
  if(!sw) return; const s = sw; sw = null; $('#track').classList.remove('dragging');
  if(!s.on) return;
  const dx = e.clientX - s.x, i = TABS.indexOf(S.tab);
  if(Math.abs(dx) > s.w*.2) setTab(TABS[Math.max(0, Math.min(2, i + (dx < 0 ? 1 : -1)))]); else render();
});

/* ================= logo with facts (EXP_MASCOT) ================= */
const FACTS = C.FACTS.filter(f => f && f.text && f.source && !/^ЗАПОВНИТИ/i.test(f.text) && !/^ЗАПОВНИТИ/i.test(f.source));
let factI = 0, factH = null;
const mascotOn = () => C.EXPERIMENTS.mascot ? A.ab.mascot === 'A' : true;
const sensitive = () => !!(S.flow && ['auth','otp','paying','payfail','pay','book'].includes(S.flow.step)) || !$('#consent').hidden;
function showFact(){
  if(!mascotOn() || !FACTS.length || sensitive()) return;
  const f = FACTS[factI % FACTS.length], el = $('#fact');
  el.innerHTML = `${esc(f.text)}<small>Джерело: ${esc(f.source)}</small>`; el.hidden = false;
  track('mascot_fact_shown', {i:factI % FACTS.length}); factI++;
  clearTimeout(factH); factH = setTimeout(() => { el.hidden = true; }, C.FACT_SHOW_SEC*1000);
}
setInterval(showFact, C.FACT_INTERVAL_SEC*1000);
$('#logo').addEventListener('click', () => { if(!mascotOn()) return; track('mascot_clicked', {}); showFact(); });

/* ================= clock ================= */
let last = performance.now();
setInterval(() => {
  const now = performance.now(), d = now - last; last = now;
  const a = P.active;
  if(a && a.status === 'parked'){
    a.elapsed += d*S.speed;
    if(a.charge && a.battery < 100) a.battery = Math.min(100, a.battery + d*S.speed/(3*60000));
    const tm = $('#pkTimer'); if(tm){ tm.textContent = fmt(a.elapsed); const t = T(a.tariff), rv = $('#ringVal'); if(rv) rv.setAttribute('stroke-dashoffset', (RING_C*(1 - Math.min(1, a.elapsed/((t.hours ? a.hours : (t.planHours || 12))*3.6e6)))).toFixed(1)); }
    const cb = $('#chgBar'); if(cb){ cb.style.width = Math.floor(a.battery) + '%'; $('#chgPct').textContent = Math.floor(a.battery) + '%'; }
  }
  if(a && a.status === 'reserved'){
    if(Date.now() >= a.until){ stById(a.stationId).slots[a.slot].st = 'free'; P.active = null; save(); toast('Час броні минув. Передоплата не повертається (демо)'); renderPane('map'); }
    else { const rl = $('#resLeft'); if(rl){ rl.textContent = fmt(a.until - Date.now()).slice(0, 5); const rv = $('#ringVal'); if(rv) rv.setAttribute('stroke-dashoffset', (RING_C*(1 - (a.until - Date.now())/(a.min*60000))).toFixed(1)); } }
  }
  const o = S.otp;
  if(o.lockUntil){ if(Date.now() >= o.lockUntil){ o.lockUntil = 0; if(S.flow && S.flow.step === 'otp'){ sendOtp(o.purpose); o.msg = 'Можна ще раз: новий код надіслано'; o.cls = 'ok'; renderPane('map'); } } else { const lc = $('#lockClock'); if(lc) lc.textContent = fmt(o.lockUntil - Date.now()).slice(3); } }
}, 250);
setInterval(save, 5000);

/* ================= consent banner + boot ================= */
$('#consentText').textContent = C.CONSENT_TEXT;
$('#consentList').innerHTML = C.CONSENT_DETAILS.map(x => `<li>${esc(x)}</li>`).join('');
$('#consent').hidden = A.consent() !== null;
$('#cAccept').addEventListener('click', () => { A.setConsent('accepted'); save(); $('#consent').hidden = true; render(); });
$('#cNecessary').addEventListener('click', () => { A.setConsent('necessary'); save(); $('#consent').hidden = true; render(); });
render();
})();
