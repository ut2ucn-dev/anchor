(function(){
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NS = 'http://www.w3.org/2000/svg';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= data ================= */
const VEH = {
  bike:     {name:'Велосипед', acc:'велосипед', sub:'Звичайний'},
  scooter:  {name:'Електросамокат', acc:'електросамокат', sub:'Зарядка в слоті', electric:true},
  mono:     {name:'Моноколесо', acc:'моноколесо', sub:'Зарядка в слоті', electric:true},
  adaptive: {name:'Адаптований', acc:'адаптований велосипед', sub:'Триколісний, хендбайк', wide:true},
};
const TARIFFS = [
  {id:'once',  name:'Разовий',      price:20,  unit:'грн/год',        desc:'Погодинно, години обираєте ви', hours:true},
  {id:'day',   name:'Робочий день', price:75,  unit:'грн · до 10 год', desc:'Будь-які 10 годин поспіль'},
  {id:'night', name:'Нічний',       price:55,  unit:'грн · 20:00–08:00', desc:'Паркування на ніч'},
  {id:'pro',   name:'Pro',          price:499, unit:'грн/міс · до 22:00', desc:'Необмежено щодня до 22:00', sub:true},
  {id:'unlim', name:'Unlim',        price:899, unit:'грн/міс · 24/7',  desc:'Цілодобово, без обмежень', sub:true},
];
const T = id => TARIFFS.find(t => t.id === id);
const initialSlots = () => [
  {st:'busy',   v:'bike', charge:false, wide:false},
  {st:'booked', v:null,   charge:false, wide:false},
  {st:'free',   v:null,   charge:true,  wide:false},
  {st:'busy',   v:'mono', charge:true,  wide:false},
  {st:'free',   v:null,   charge:false, wide:false},
  {st:'free',   v:null,   charge:true,  wide:true},
];
let slots = initialSlots();
const fresh = () => ({
  screen:'map', stage:'map', transport:'bike', slot:null, tariff:'once', hours:1, card:'4417',
  phone:'+380 67 123 45 67', otpSent:false, code:null, otp:'', tries:3, lockUntil:0, authFor:'rent', msg:'', msgCls:'',
  fb:{rating:0, need:null, wish:''}, fbErr:{}, fbOpened:false, payTries:0, paying:false, payError:false, verified:false, checking:false, phoneDraft:null, holdT:null, codeAt:0,
  parked:false, doorOpen:false, elapsed:0, battery:34, paid:0, extra:0, parkedAt:0, reminded:false, theft:'none', cam:'none',
  px:null, chan:'app', pin:null, pinShow:false, pinTries:3, pinLock:0, termPhone:'', bleUntil:0, bleBusy:false, bleT:null,
  power:'on', stBat:96, phoneDead:false, phoneBat:85, bugFixed:false, bugTries:0, bugBusy:false, chat:[], chatAsk:false, chatTyping:false, bonus:0,
});
let S = Object.assign(fresh(), {speed:1, sound:true, voice:false, big:false, failFirst:true, phoneOk:false, subActive:null, scn:'main', dev:'app'});
{ const h0 = (location.hash || '').slice(1); if(['main','term','dead','power','bug','theft','cam'].includes(h0)) S.scn = h0; }

/* timers that reset() must cancel */
let pending = [];
const later = (fn, ms) => { const id = setTimeout(() => { pending = pending.filter(x => x !== id); fn(); }, ms); pending.push(id); return id; };

/* ================= sound ================= */
let ac = null;
function ctx(){ try{ ac = ac || new (window.AudioContext||window.webkitAudioContext)(); if(ac.state==='suspended') ac.resume(); }catch(e){ ac = null; } return ac; }
function tone(f, t, d, type, g, f2){
  const c = ctx(); if(!c || !S.sound) return;
  const o = c.createOscillator(), v = c.createGain(), at = c.currentTime + t;
  o.type = type || 'sine'; o.frequency.setValueAtTime(f, at); if(f2) o.frequency.exponentialRampToValueAtTime(f2, at + d);
  v.gain.setValueAtTime(.0001, at); v.gain.exponentialRampToValueAtTime(g || .2, at + .02); v.gain.exponentialRampToValueAtTime(.0001, at + d);
  o.connect(v); v.connect(c.destination); o.start(at); o.stop(at + d + .05);
}
function noise(t, d, g, freq){
  const c = ctx(); if(!c || !S.sound) return;
  const len = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
  for(let i=0;i<len;i++) data[i] = (Math.random()*2-1) * Math.pow(1 - i/len, 3);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), v = c.createGain();
  f.type = 'lowpass'; f.frequency.value = freq; v.gain.value = g;
  src.buffer = buf; src.connect(f); f.connect(v); v.connect(c.destination); src.start(c.currentTime + t);
}
const click = t => tone(1400, t, .04, 'square', .12, 300);
function sOpen(){ noise(0, .07, .6, 1500); click(.05); tone(660,.14,.14,'sine',.22); tone(880,.3,.2,'sine',.22); tone(1320,.52,.22,'sine',.12); }
function sClose(){ tone(784,0,.14,'sine',.2); tone(523,.14,.16,'sine',.2); tone(330,.3,.22,'sine',.2); noise(.5,.14,.9,380); click(.56); }
function sBad(){ tone(180,0,.18,'sawtooth',.13); tone(150,.2,.22,'sawtooth',.13); }
function sOk(){ tone(880,0,.1,'sine',.14); tone(1175,.1,.16,'sine',.14); }
function sKey(){ tone(900,0,.03,'square',.04); }
function sSms(){ tone(1046,0,.12,'sine',.12); tone(1318,.14,.18,'sine',.12); }
function say(text){ if(!S.voice) return; try{ speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'uk-UA'; speechSynthesis.speak(u); }catch(e){} }

/* ================= scene geometry ================= */
const X0=130, MW=210, TOP=200, BOT=430, DX=40, DY=-24, DW=86, FY=232, FH=192, PERS=14, XE=X0+MW*3;
const doorX = k => X0 + MW*Math.floor(k/2) + (k%2 ? 118 : 6);
const CX = k => doorX(k) + DW/2;
const HOME_P = 912, HOME_V = 805, GROUND = 478;
const TERM_X = X0 + 150; /* where the person stands at the terminal */
const HOME_UV = `translate(${HOME_V}px,${GROUND}px) scale(.62)`;
const LAMP = {free:'L-g', busy:'L-r', booked:'L-b', hold:'L-b', open:'L-b L-blink', mine:'L-r', alarm:'L-r L-fast', pickup:'L-g L-blink'};

/* ---- vehicles: head-on (inside slot), side (on the street), camera ---- */
function headOn(t, cx, charging){
  let s;
  if(t==='scooter') s = `<ellipse cx="${cx}" cy="390" rx="5" ry="28" fill="#161616"/><rect x="${cx-16}" y="356" width="32" height="7" rx="2" fill="#2b3a46"/>
    <line x1="${cx}" y1="358" x2="${cx}" y2="306" stroke="#2a2f35" stroke-width="5"/><line x1="${cx-26}" y1="305" x2="${cx+26}" y2="305" stroke="#2a2f35" stroke-width="5" stroke-linecap="round"/>
    <rect x="${cx-30}" y="302" width="8" height="7" fill="#1f9d8f"/><rect x="${cx+22}" y="302" width="8" height="7" fill="#1f9d8f"/><rect x="${cx-4}" y="312" width="8" height="8" fill="#ffd54a"/>`;
  else if(t==='mono') s = `<ellipse cx="${cx}" cy="384" rx="17" ry="40" fill="#161616" stroke="#2b3a46" stroke-width="3"/><rect x="${cx-13}" y="330" width="26" height="54" rx="8" fill="#2F6DB5"/>
    <rect x="${cx-27}" y="378" width="10" height="5" fill="#2a2f35"/><rect x="${cx+17}" y="378" width="10" height="5" fill="#2a2f35"/><rect x="${cx-5}" y="340" width="10" height="5" fill="#ffd54a"/><line x1="${cx}" y1="330" x2="${cx}" y2="318" stroke="#2a2f35" stroke-width="4"/><line x1="${cx-8}" y1="317" x2="${cx+8}" y2="317" stroke="#2a2f35" stroke-width="4" stroke-linecap="round"/>`;
  else if(t==='adaptive') s = `<ellipse cx="${cx-31}" cy="392" rx="5" ry="30" fill="#161616"/><ellipse cx="${cx+31}" cy="392" rx="5" ry="30" fill="#161616"/>
    <line x1="${cx-31}" y1="396" x2="${cx+31}" y2="396" stroke="#2F6DB5" stroke-width="4"/><rect x="${cx-15}" y="330" width="30" height="40" rx="8" fill="#2F6DB5"/>
    <ellipse cx="${cx}" cy="398" rx="6" ry="24" fill="#161616"/><circle cx="${cx}" cy="350" r="8" fill="none" stroke="#2a2f35" stroke-width="3"/><line x1="${cx-15}" y1="350" x2="${cx+15}" y2="350" stroke="#2a2f35" stroke-width="4" stroke-linecap="round"/><rect x="${cx-4}" y="338" width="8" height="5" fill="#ffd54a"/>`;
  else s = `<ellipse cx="${cx}" cy="${FY+64}" rx="5" ry="38" fill="#161616" stroke="#2b3a46" stroke-width="1.5"/><circle cx="${cx}" cy="${FY+64}" r="3" fill="#59616e"/>
    <line x1="${cx}" y1="${FY+100}" x2="${cx}" y2="${FY+114}" stroke="#2a2f35" stroke-width="4"/><line x1="${cx-28}" y1="${FY+114}" x2="${cx+28}" y2="${FY+114}" stroke="#2a2f35" stroke-width="5" stroke-linecap="round"/>
    <rect x="${cx-5}" y="${FY+114}" width="10" height="24" fill="#D8453B"/><rect x="${cx-10}" y="${FY+134}" width="20" height="6" rx="2" fill="#333"/>
    <ellipse cx="${cx}" cy="${FY+164}" rx="6" ry="27" fill="#161616" stroke="#2b3a46" stroke-width="1.5"/>`;
  if(charging) s += `<rect x="${cx+33}" y="296" width="8" height="11" rx="1.5" fill="#d8dde3"/><path d="M${cx+37} 307 C ${cx+40} 330, ${cx+20} 330, ${cx+10} 352" fill="none" stroke="#F2B21B" stroke-width="2.5"/><circle class="L-blink" cx="${cx+37}" cy="292" r="2.5" fill="#2FD36B"/>`;
  return s;
}
function sideVeh(t){
  if(t==='scooter') return `<circle cx="-48" cy="-22" r="20"/><circle cx="50" cy="-22" r="20"/><line x1="-48" y1="-22" x2="-30" y2="-40" stroke="#1f9d8f" stroke-width="6"/><line x1="-30" y1="-40" x2="40" y2="-40" stroke="#1f9d8f" stroke-width="9"/><line x1="40" y1="-40" x2="50" y2="-22" stroke="#1f9d8f" stroke-width="6"/><line x1="34" y1="-40" x2="26" y2="-124" stroke="#1f9d8f" stroke-width="6"/><line x1="12" y1="-128" x2="40" y2="-128" stroke-width="7"/><circle cx="46" cy="-118" r="4" fill="#ffd54a" stroke="none"/>`;
  if(t==='mono') return `<circle cx="0" cy="-44" r="40" stroke-width="9"/><circle cx="0" cy="-44" r="26" stroke-width="2" opacity=".5"/><rect x="-16" y="-96" width="32" height="64" rx="10" fill="#2F6DB5" stroke="#1d4a80" stroke-width="3"/><line x1="-30" y1="-48" x2="-16" y2="-48" stroke-width="7"/><line x1="16" y1="-48" x2="30" y2="-48" stroke-width="7"/><rect x="-6" y="-84" width="12" height="6" fill="#ffd54a" stroke="none"/><line x1="0" y1="-96" x2="0" y2="-108" stroke-width="5"/>`;
  if(t==='adaptive') return `<circle cx="-40" cy="-34" r="30" opacity=".45"/><circle cx="-50" cy="-30" r="30"/><circle cx="56" cy="-22" r="22"/><polyline points="-50,-30 -8,-24 44,-24 56,-22" stroke="#2F6DB5" stroke-width="6"/><path d="M-44 -42 Q -30 -18 -2 -30 L -8 -40 Z" fill="#2F6DB5" stroke="#2F6DB5" stroke-width="4"/><line x1="-44" y1="-42" x2="-52" y2="-74" stroke="#2F6DB5" stroke-width="6"/><line x1="44" y1="-24" x2="30" y2="-64" stroke="#2F6DB5" stroke-width="5"/><circle cx="30" cy="-66" r="6" stroke-width="3"/><line x1="20" y1="-74" x2="40" y2="-58" stroke-width="5"/>`;
  return `<circle cx="-50" cy="-36" r="34"/><circle cx="50" cy="-36" r="34"/><polyline points="-50,-36 -18,-36 -4,-76 38,-76 50,-36" stroke="#2F6DB5" stroke-width="6"/><line x1="-18" y1="-36" x2="-28" y2="-82" stroke="#2F6DB5" stroke-width="6"/><line x1="-36" y1="-86" x2="-20" y2="-86" stroke-width="7"/><line x1="38" y1="-76" x2="34" y2="-96"/><line x1="26" y1="-98" x2="46" y2="-98" stroke-width="6"/>`;
}
function camVeh(t){
  if(t==='scooter') return `<ellipse cx="150" cy="138" rx="5" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="136" y="118" width="28" height="5" rx="2" fill="#35505f" stroke="none"/><line x1="150" y1="118" x2="150" y2="84" stroke-width="4"/><line x1="128" y1="83" x2="172" y2="83" stroke-width="5"/>`;
  if(t==='mono') return `<ellipse cx="150" cy="130" rx="13" ry="34" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="139" y="92" width="22" height="34" rx="6" fill="#2F6DB5" stroke="none"/><rect x="128" y="124" width="9" height="4" fill="#9fb0bd" stroke="none"/><rect x="163" y="124" width="9" height="4" fill="#9fb0bd" stroke="none"/>`;
  if(t==='adaptive') return `<ellipse cx="124" cy="136" rx="4" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><ellipse cx="176" cy="136" rx="4" ry="22" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><rect x="138" y="92" width="24" height="30" rx="6" fill="#2F6DB5" stroke="none"/><ellipse cx="150" cy="142" rx="5" ry="18" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><line x1="138" y1="106" x2="162" y2="106" stroke-width="4"/>`;
  return `<path d="M155 4 V14 a5 5 0 0 1 -10 0 v-3" stroke-width="3"/><ellipse cx="150" cy="44" rx="6" ry="28" fill="#0b0f13" stroke="#59687a" stroke-width="3"/><line x1="150" y1="72" x2="150" y2="84" stroke-width="4"/><line x1="124" y1="84" x2="176" y2="84" stroke-width="5"/><rect x="146" y="84" width="8" height="18" fill="#D8453B" stroke="none"/><ellipse cx="150" cy="126" rx="7" ry="25" fill="#0b0f13" stroke="#59687a" stroke-width="3"/>`;
}
function chipVeh(t){ return `<svg viewBox="-92 -140 184 150" aria-hidden="true"><g class="uveh">${sideVeh(t)}</g></svg>`; }

/* ---- doors: drawn as a perspective projection so the free edge grows as it swings toward the viewer ---- */
const dT = [0,0,0,0,0,0], dRAF = {};
const ICON_BOLT = '<path d="M3 -9 L-3 1 H1 L-1 9 L5 -1 H1 L3 -9Z"/>';
const ICON_WIDE = '<path d="M-7 0 H7 M-4 -3 L-7 0 L-4 3 M4 -3 L7 0 L4 3" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
function doorSVG(k, t){
  const dx = doorX(k), dir = k%2 ? -1 : 1, hx = dir === 1 ? dx : dx + DW;
  const ang = t * 78 * Math.PI/180, co = Math.cos(ang), si = Math.sin(ang);
  const P = (lx, ly) => { const u = dir === 1 ? lx/DW : 1 - lx/DW, v = ly/FH; return [hx + dir*u*DW*co, FY + ly + (2*v-1)*PERS*si*u]; };
  const f = p => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const quad = (x0,y0,x1,y1) => [P(x0,y0), P(x1,y0), P(x1,y1), P(x0,y1)];
  const poly = a => a.map(f).join(' ');
  const path = a => 'M' + a.map(f).join('L') + 'Z';
  const outer = quad(0,0,DW,FH), hole = quad(6,8,80,118), panel = quad(6,124,80,184);
  const glare = [P(12,8), P(34,8), P(10,118), P(6,118)];
  const hl = dir === 1 ? 74 : 12, h1 = P(hl,56), h2 = P(hl,94);
  const freeLx = dir === 1 ? DW : 0, F0 = P(freeLx,0), F1 = P(freeLx,FH), th = dir*5*si;
  const edge = [F0, [F0[0]+th, F0[1]], [F1[0]+th, F1[1]], F1];
  const lcx = 43, lcy = 154, c = P(lcx,lcy), u = dir === 1 ? lcx/DW : 1 - lcx/DW, v = lcy/FH;
  const ma = co, mb = (2*v-1)*PERS*si*dir/DW, md = (FH + 2*PERS*si*u)/FH;
  const sl = slots[k];
  let icons = '';
  if(sl.charge) icons += `<g class="dic" transform="translate(24 -1)">${ICON_BOLT}</g>`;
  if(sl.wide) icons += `<g class="dic" transform="translate(-24 -1)" stroke="var(--panel-ink)">${ICON_WIDE}</g>`;
  return `${t > .02 ? `<polygon class="dedge" points="${poly(edge)}"/>` : ''}
    <path class="dframe" fill-rule="evenodd" d="${path(outer)}${path(hole)}"/>
    <polygon class="dglass" points="${poly(hole)}"/><polygon class="dglare" points="${poly(glare)}"/>
    <polygon class="dpanel" points="${poly(panel)}"/>
    <g transform="matrix(${ma.toFixed(3)} ${mb.toFixed(3)} 0 ${md.toFixed(3)} ${c[0].toFixed(1)} ${c[1].toFixed(1)})"><text class="dnum" x="0" y="8">${k+1}</text>${icons}</g>
    <line class="dhandle" x1="${h1[0].toFixed(1)}" y1="${h1[1].toFixed(1)}" x2="${h2[0].toFixed(1)}" y2="${h2[1].toFixed(1)}"/>
    ${t > .02 ? `<polygon class="dshade" points="${poly(outer)}" style="opacity:${(t*.4).toFixed(2)}"/>` : ''}`;
}
function drawDoor(k){
  const g = document.getElementById('dr'+k); if(g) g.innerHTML = doorSVG(k, dT[k]);
  const cl = document.getElementById('cl'+k); if(cl) cl.style.opacity = (dT[k]*.9).toFixed(2);
}
function animDoor(k, open, dur){
  dur = REDUCED ? 1 : (dur || (open ? 950 : 800));
  return new Promise(res => {
    cancelAnimationFrame(dRAF[k]);
    const from = dT[k], to = open ? 1 : 0, t0 = performance.now();
    const step = now => {
      const p = Math.min(1, (now - t0)/dur);
      const e = open ? 1 - Math.pow(1-p, 3) : p*p;
      dT[k] = from + (to - from)*e; drawDoor(k);
      if(p < 1) dRAF[k] = requestAnimationFrame(step); else res();
    };
    dRAF[k] = requestAnimationFrame(step);
  });
}

/* ---- build the street ---- */
function buildScene(){
  const o = [];
  o.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sk1"/><stop offset="1" class="sk2"/></linearGradient>
    <linearGradient id="gl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A5DADE"/><stop offset="1" stop-color="#5FA3AE"/></linearGradient>
    <linearGradient id="cav" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cav-c1"/><stop offset="1" class="cav-c2"/></linearGradient>
    <radialGradient id="cavL" cx=".5" cy="0" r="1.1"><stop offset="0" stop-color="#FFF4D6" stop-opacity=".95"/><stop offset=".55" stop-color="#FFE2A3" stop-opacity=".35"/><stop offset="1" stop-color="#FFE2A3" stop-opacity="0"/></radialGradient>
    <filter id="glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>`);
  o.push('<rect width="1000" height="440" fill="url(#sky)"/>');
  const bx = [[0,70,200],[70,60,262],[205,80,230],[300,70,170],[480,64,150],[760,90,250],[850,70,300],[915,90,205]];
  bx.forEach((b,i) => {
    o.push(`<rect class="${i%2?'bld2':'bld1'}" x="${b[0]}" y="${430-b[2]}" width="${b[1]}" height="${b[2]}"/>`);
    for(let y = 430-b[2]+14; y < 410; y += 26) for(let x = b[0]+8; x < b[0]+b[1]-14; x += 20)
      o.push(`<rect class="win${(x*7+y*13)%5===0?' lit':''}" x="${x}" y="${y}" width="10" height="13"/>`);
  });
  o.push('<rect class="walk" y="430" width="1000" height="80"/>');
  for(let gx = 0; gx < 1040; gx += 70) o.push(`<line class="walk-l" x1="${gx}" y1="430" x2="${gx-22}" y2="510"/>`);
  o.push('<rect class="curb" y="510" width="1000" height="10"/><rect class="road" y="520" width="1000" height="40"/>');
  for(let rx = 20; rx < 1000; rx += 140) o.push(`<rect class="dash" x="${rx}" y="538" width="70" height="5"/>`);
  /* metro */
  o.push(`<rect class="mbld" x="10" y="330" width="110" height="100"/><rect class="mroof" x="4" y="320" width="122" height="14"/>
    <rect class="mdoor" x="26" y="368" width="34" height="62"/><rect class="mdoor" x="68" y="368" width="34" height="62"/>
    <circle cx="65" cy="288" r="26" fill="#D8262F"/><path d="M52 300 V276 L65 292 L78 276 V300" fill="none" stroke="#fff" stroke-width="5.5" stroke-linejoin="round"/><rect class="mroof" x="62" y="313" width="6" height="8"/>`);
  /* cloud + links */
  o.push(`<path class="cloud" d="M800 60 q0-22 24-22 q10-18 34-9 q22-3 26 19 q22 3 16 24 h-92 q-18-3-8-12z"/><text class="cloud-t" x="852" y="66">Хмара</text>`);
  o.push(`<path id="sig" class="sig" d="M${X0+30} ${TOP-56} C ${X0+30} 60, 600 40, 806 66"/>`);
  o.push(`<path id="sigNb" d="M${X0+30} ${TOP-56} C ${X0+60} 120, 620 110, 812 80"/><g id="nbLabel"><rect x="402" y="96" width="138" height="20" rx="10"/><text x="471" y="110">Резерв: NB-IoT</text></g>`);
  o.push(`<path id="sigX" class="sigX" d="M1000 18 C 960 4, 920 20, 884 48"/>`);
  o.push(`<g id="shield"><path d="M918 30 l16 6 v12 c0 10-7 16-16 19 c-9-3-16-9-16-19 v-12z" fill="#1F9D55" stroke="#fff" stroke-width="2"/><path d="M911 47 l5 5 l9-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></g>`);
  /* street lamp and the city-wide darkening used by the power cut; the station is drawn above it and stays lit */
  o.push(`<g class="streetlight"><polygon class="cone" points="947,338 918,508 1000,508 1000,470 965,338"/><rect x="973" y="330" width="5" height="180" fill="#5A6270"/><path d="M975 333 H954" stroke="#5A6270" stroke-width="4" stroke-linecap="round"/><rect class="bulb" x="944" y="333" width="20" height="6" rx="2"/></g>`);
  o.push('<rect id="cityDark" width="1000" height="560"/>');
  /* station body */
  o.push(`<polygon points="${X0-6},${BOT} ${XE+DX+10},${BOT+DY+46} ${XE+DX+34},${BOT+40} ${X0+10},${BOT+34}" fill="#000" opacity=".14"/>`);
  o.push(`<polygon class="st-side" points="${XE},${TOP} ${XE+DX},${TOP+DY} ${XE+DX},${BOT+DY} ${XE},${BOT}"/>`);
  o.push(`<g transform="translate(${XE+6} 268) skewY(-31)"><rect width="28" height="42" rx="2" fill="#1F6FE0" stroke="#0b2a55"/><circle cx="14" cy="11" r="7" fill="#fff"/><rect x="12.7" y="9.5" width="2.6" height="6" fill="#1F6FE0"/><circle cx="14" cy="6.8" r="1.5" fill="#1F6FE0"/><rect x="5" y="22" width="18" height="2" fill="#CFE2FF"/><rect x="5" y="27" width="18" height="2" fill="#CFE2FF"/><rect x="5" y="32" width="12" height="2" fill="#CFE2FF"/></g>`);
  o.push(`<polygon class="st-roof" points="${X0},${TOP} ${XE},${TOP} ${XE+DX},${TOP+DY} ${X0+DX},${TOP+DY}"/>`);
  [548, 644].forEach(x => o.push(`<polygon class="solar" points="${x},189 ${x+86},189 ${x+103},179 ${x+17},179"/>${[1,2,3].map(i => `<line class="solar-l" x1="${x+i*21.5}" y1="189" x2="${x+i*21.5+17}" y2="179"/>`).join('')}<line class="solar-l" x1="${x+8.5}" y1="184" x2="${x+94.5}" y2="184"/>`));
  o.push(`<text class="st-name" x="${(X0+XE)/2+20}" y="${TOP-8}">ANCHOR</text>`);
  o.push(`<rect class="st-body" x="${X0}" y="${TOP}" width="${MW*3}" height="${BOT-TOP}"/>`);
  for(let k = 0; k < 6; k++){
    const dx = doorX(k), cx = CX(k);
    o.push(`<g id="slot${k}">
      <rect x="${dx}" y="${FY}" width="${DW}" height="${FH}" fill="url(#cav)"/>
      <rect id="cl${k}" class="cavlight" x="${dx}" y="${FY}" width="${DW}" height="${FH}"/>
      <rect x="${dx+8}" y="${FY+4}" width="${DW-16}" height="3" rx="1.5" fill="#FFE9B8" opacity=".5"/>
      <rect class="hook-b" x="${cx-2}" y="${FY+7}" width="14" height="4" rx="1"/><path class="hook" d="M${cx+5} ${FY+10} V${FY+24} a5 5 0 0 1 -10 0 v-3"/>
      <rect class="clamp" x="${cx-14}" y="${FY+FH-14}" width="28" height="8" rx="2"/>
      <g class="inslot" id="bk${k}"></g>
      <g id="dr${k}"></g>
      <g id="bolts${k}" class="bolts ${k % 2 ? 'l' : 'r'}">${[FY + 34, FY + FH/2, FY + FH - 34].map(y => `<rect x="${k % 2 ? dx - 9 : dx + DW - 3}" y="${y - 3}" width="12" height="6" rx="1.5"/>`).join('')}</g>
      <rect id="sel${k}" class="sel" x="${dx-3}" y="${FY-3}" width="${DW+6}" height="${FH+6}" rx="4"/>
      <rect id="al${k}" class="alarmfx" x="${dx-4}" y="${FY-4}" width="${DW+8}" height="${FH+8}" rx="4"/>
      <g id="lamp${k}" class="L-g"><circle class="glow" cx="${cx}" cy="216" r="11" filter="url(#glow)"/><circle class="lamp" cx="${cx}" cy="216" r="6.5"/></g>
      <g id="bub${k}" class="bubble"><rect x="${cx-46}" y="148" width="92" height="22" rx="11"/><text id="bubt${k}" x="${cx}" y="163"></text></g>
    </g>`);
  }
  for(let m = 0; m < 3; m++){
    const x0 = X0 + MW*m;
    o.push(`<rect class="st-frame" x="${x0}" y="${TOP}" width="6" height="${BOT-TOP}"/><rect class="pillar" x="${x0+92}" y="${TOP+24}" width="26" height="${BOT-TOP-24}"/>`);
    o.push(`<rect class="led-ok" x="${x0+98}" y="${BOT-22}" width="14" height="5" rx="1"/>`);
    if(m === 0){
      o.push(`<rect id="termGlow" class="term-glow" x="${x0+89}" y="345" width="32" height="50" rx="5"/><rect class="term" x="${x0+94}" y="350" width="22" height="40" rx="3"/><rect class="term-s" x="${x0+97}" y="354" width="16" height="24" rx="1"/><text id="termT" class="term-t" x="${x0+105}" y="371">A</text><rect x="${x0+99}" y="381" width="12" height="5" rx="1.5" fill="#BFD9FF"/>`);
      o.push(`<circle class="spk" cx="${x0+105}" cy="252" r="8"/><circle class="spk-h" cx="${x0+102}" cy="249" r="1.3"/><circle class="spk-h" cx="${x0+108}" cy="249" r="1.3"/><circle class="spk-h" cx="${x0+102}" cy="255" r="1.3"/><circle class="spk-h" cx="${x0+108}" cy="255" r="1.3"/>
        <g id="spkw"><path class="spkw" d="M${x0+117} 244 a10 10 0 0 1 0 16"/><path class="spkw" d="M${x0+93} 244 a10 10 0 0 0 0 16"/></g>`);
    } else {
      o.push(`<rect x="${x0+97}" y="282" width="16" height="16" rx="1" fill="#fff"/><rect x="${x0+99}" y="284" width="5" height="5" fill="#1b2033"/><rect x="${x0+106}" y="291" width="5" height="5" fill="#1b2033"/><rect x="${x0+99}" y="292" width="4" height="4" fill="#1b2033"/>`);
    }
  }
  o.push(`<rect class="st-frame" x="${XE-6}" y="${TOP}" width="6" height="${BOT-TOP}"/>`);
  o.push(`<rect x="${X0}" y="${TOP-9}" width="${MW*3}" height="10" fill="#F29A1F" stroke="#7a4a06"/>`);
  o.push(`<rect class="st-frame" x="${X0-4}" y="${BOT}" width="${MW*3+8}" height="10"/>`);
  o.push(`<line x1="${X0+30}" y1="${TOP-9}" x2="${X0+30}" y2="${TOP-50}" stroke="#222" stroke-width="4"/><circle cx="${X0+30}" cy="${TOP-53}" r="5" fill="#F29A1F"/>`);
  o.push(`<g id="pwr"><rect x="296" y="140" width="258" height="26" rx="13"/><text id="pwrT" x="425" y="157">⚡ Акумулятор 96% · ~36 год</text></g>`);
  /* the rider's vehicle and the rider */
  o.push(`<g id="uv" class="uv" style="transform:${HOME_UV}"><g id="uveh" class="uveh"></g></g>`);
  o.push(`<g id="person" class="person" style="transform:translate(${HOME_P}px,0px)">
    <line class="leg legL" x1="-6" y1="444" x2="-10" y2="500"/><line class="leg legR" x1="6" y1="444" x2="10" y2="500"/>
    <g class="body-bob"><rect class="torso" x="-16" y="378" width="32" height="70" rx="13"/><circle class="head" cx="0" cy="362" r="14"/><path class="hair" d="M-14 359 q14-19 28 0z"/>
    <line class="arm" x1="-14" y1="390" x2="-38" y2="408"/><rect class="phone-s" x="-50" y="394" width="12" height="20" rx="2" transform="rotate(-25 -44 404)"/>
    <g id="ble" class="ble"><path d="M-62 382 a22 22 0 0 0 0 40"/><path d="M-74 374 a32 32 0 0 0 0 56"/></g></g>
  </g>`);
  const guard = id => `<g id="${id}" class="actor" style="transform:translate(1100px,0px);opacity:0">
    <line class="leg legL" x1="-6" y1="444" x2="-10" y2="500"/><line class="leg legR" x1="6" y1="444" x2="10" y2="500"/>
    <g class="body-bob"><rect x="-17" y="378" width="34" height="70" rx="12" fill="#1F3B73"/><rect x="-17" y="392" width="34" height="8" fill="#F2C94C"/>
    <circle class="head" cx="0" cy="362" r="14"/><path d="M-16 356 q16-16 32 0 l3 3 h-38z" fill="#14244A"/>
    <line x1="-14" y1="392" x2="-30" y2="420" stroke="#1F3B73" stroke-width="7" stroke-linecap="round"/></g></g>`;
  o.push(`<g id="car" class="actor" style="transform:translate(1150px,0px)">
    <rect x="-78" y="500" width="156" height="34" rx="9" fill="#1F3B73"/><path d="M-46 500 L-32 476 H34 L50 500 Z" fill="#1F3B73"/>
    <path d="M-38 499 L-28 481 H-3 V499 Z M3 499 V481 H30 L42 499 Z" fill="#9FC3E8"/>
    <rect x="-20" y="469" width="20" height="7" rx="2" class="beacon-b"/><rect x="0" y="469" width="20" height="7" rx="2" class="beacon-r"/>
    <rect x="-78" y="512" width="156" height="9" fill="#F2C94C"/><text x="0" y="520" text-anchor="middle" style="font:800 8.5px var(--font-body);fill:#14202B;letter-spacing:.12em">ОХОРОНА</text>
    <circle cx="-48" cy="536" r="12" fill="#111"/><circle cx="48" cy="536" r="12" fill="#111"/><circle cx="-48" cy="536" r="5" fill="#777"/><circle cx="48" cy="536" r="5" fill="#777"/></g>`);
  o.push(guard('guard1')); o.push(guard('guard2'));
  o.push(`<g id="thief" class="actor" style="transform:translate(-90px,0px)">
    <line class="leg legL" x1="-6" y1="444" x2="-10" y2="500"/>
    <g class="dKick"><line class="leg legR" x1="6" y1="444" x2="10" y2="500"/></g>
    <g class="body-bob">
      <rect x="-16" y="378" width="32" height="70" rx="13" fill="#2D3E8C"/><line x1="-12" y1="384" x2="-12" y2="444" stroke="#fff" stroke-width="2"/><line x1="-8" y1="384" x2="-8" y2="444" stroke="#fff" stroke-width="2"/>
      <circle cx="0" cy="362" r="14" fill="#E8B590"/><circle cx="-13" cy="365" r="4.5" fill="#E0473C"/>
      <path d="M-13 354 q13-18 27-2 q-4-5-9-3 q-3-4-8-1 q-5-3-10 6z" fill="#C0392B"/><line x1="-9" y1="359" x2="-4" y2="360" stroke="#222" stroke-width="2" stroke-linecap="round"/>
      <circle cx="-4" cy="371" r="1" fill="#555"/><circle cx="1" cy="372" r="1" fill="#555"/><circle cx="5" cy="370" r="1" fill="#555"/>
      <g class="dArmB"><line x1="10" y1="390" x2="22" y2="410" stroke="#2D3E8C" stroke-width="7" stroke-linecap="round"/>
        <g id="dBottle"><rect x="18" y="400" width="12" height="27" rx="3" fill="#2E7D3A"/><rect x="22" y="387" width="5" height="14" fill="#2E7D3A"/><rect x="19" y="408" width="10" height="8" fill="#F2E3B3"/></g>
        <g id="dRose" style="display:none"><path d="M18 427 V406 L20 396 L23 404 L25 392 L27 403 L30 397 V427 Z" fill="#2E7D3A" stroke="#C8F5CF" stroke-width="1.4"/></g></g>
      <g class="dArmF"><line x1="-12" y1="392" x2="-31" y2="402" stroke="#2D3E8C" stroke-width="7" stroke-linecap="round"/>
        <g class="dBar"><line x1="-30" y1="414" x2="-46" y2="342" stroke="#C0392B" stroke-width="4.5" stroke-linecap="round"/><path d="M-46 342 q-7-1-8 6" stroke="#C0392B" stroke-width="4.5" fill="none" stroke-linecap="round"/>
        <circle class="spark2" cx="-49" cy="352" r="2.6"/><circle class="spark2" cx="-47" cy="360" r="2"/></g>
        <circle cx="-34" cy="403" r="5.5" fill="#E8B590"/></g>
    </g></g>`);
  o.push(`<g id="droppedRose" style="display:none"><path d="M0 497 L20 493 L22 488 L26 493 L30 487 L33 492 L35 490 L36 496 Z" fill="#2E7D3A"/><path d="M-14 499 l5 -3 l2 4z M40 500 l4 -4 l3 4z M-26 501 l3 -2 l2 3z" fill="#9BE7A6"/></g>`);
  o.push(`<g id="shards"><polygon points="0,0 6,2 2,7" style="--dx:-18px;--dy:70px"/><polygon points="0,0 5,-2 4,5" style="--dx:-6px;--dy:84px"/><polygon points="0,0 4,3 -2,5" style="--dx:8px;--dy:76px"/><polygon points="0,0 3,-3 6,3" style="--dx:-26px;--dy:62px"/><polygon points="0,0 5,1 1,4" style="--dx:14px;--dy:88px"/></g>`);
  o.push(`<g id="swear" style="transform:translate(-300px,0px)"><g class="swear-in">
    <circle cx="-34" cy="306" r="18"/><circle cx="-8" cy="296" r="22"/><circle cx="22" cy="300" r="20"/><circle cx="42" cy="312" r="15"/><ellipse cx="4" cy="318" rx="52" ry="16"/>
    <circle cx="-14" cy="342" r="5"/><circle cx="-20" cy="352" r="3"/>
    <text id="swearT" x="4" y="318">#@$%!</text></g></g>`);
  o.push(`<path id="sig2" class="sig2" d=""/>`);
  o.push('<g id="pkts"></g>');
  $('#scene').innerHTML = o.join('');
  for(let k = 0; k < 6; k++){ dT[k] = 0; drawDoor(k); }
  setUV(); setPhonePath(HOME_P); paintScene();
}
function setUV(){ $('#uveh').innerHTML = sideVeh(S.transport); }
function setPhonePath(px){ $('#sig2').setAttribute('d', `M${px-46} 372 C ${px-60} 250, ${(px+860)/2} 170, 858 94`); }
function setInSlot(k){
  const g = document.getElementById('bk'+k), sl = slots[k];
  if(sl.v){
    const charging = sl.charge && VEH[sl.v].electric;
    const html = headOn(sl.v, CX(k), charging);
    if(g.dataset.v !== sl.v + charging){
      g.style.opacity = 0; g.innerHTML = html; g.dataset.v = sl.v + charging;
      g.classList.remove('lift'); if(sl.v === 'bike'){ void g.getBBox(); g.classList.add('lift'); }
      requestAnimationFrame(() => requestAnimationFrame(() => { g.style.opacity = 1; }));
    }
  } else if(g.dataset.v){
    g.style.opacity = 0; delete g.dataset.v; later(() => { if(!slots[k].v) g.innerHTML = ''; }, 520);
  }
}
function paintScene(){
  slots.forEach((sl, k) => {
    document.getElementById('lamp'+k).setAttribute('class', LAMP[sl.st]);
    const bl = document.getElementById('bolts'+k); if(bl) bl.classList.toggle('unlocked', ['open','pickup'].includes(sl.st));
    document.getElementById('sel'+k).classList.toggle('on', S.slot === k && ['hold','open'].includes(sl.st));
    setInSlot(k);
  });
  const tt = $('#termT');
  if(tt) tt.textContent = S.slot != null && ['hold','open','pickup'].includes(slots[S.slot].st) ? String(S.slot+1) : 'A';
}
function bubble(k, text, kind, ms){
  const b = document.getElementById('bub'+k), tx = kind ? text : '♪ ' + text; document.getElementById('bubt'+k).textContent = tx;
  const bw = Math.max(92, Math.round(tx.length*7.2 + 22)), br = b.querySelector('rect'); br.setAttribute('width', bw); br.setAttribute('x', CX(k) - bw/2);
  b.setAttribute('class', 'bubble on' + (kind ? ' ' + kind : ''));
  clearTimeout(b._h); if(ms !== 0) b._h = later(() => b.classList.remove('on'), ms || 1900);
  $$('#spkw .spkw').forEach(p => { p.classList.remove('on'); void p.getBBox(); p.classList.add('on'); });
}
function packet(dir, from){
  const path = from === 'app' ? $('#sig2') : $('#sig'); if(!path) return;
  const L = path.getTotalLength(), dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', 6); dot.setAttribute('class', 'pkt' + (from === 'app' ? ' app' : ''));
  $('#pkts').appendChild(dot);
  if(from === 'app'){ const b = $('#ble'); b.classList.remove('tx'); void b.getBBox(); b.classList.add('tx'); }
  const t0 = performance.now(), D = 1000;
  (function f(now){
    const p = Math.min(1, (now - t0)/D), pt = path.getPointAtLength((dir === 'up' ? p : 1 - p)*L);
    dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
    if(p < 1) requestAnimationFrame(f); else dot.remove();
  })(t0);
}
function walkTo(x, ms){
  const p = $('#person'); ms = REDUCED ? 1 : ms; S.px = x;
  p.classList.add('walking'); p.style.transitionDuration = ms + 'ms'; p.style.transform = `translate(${x}px,0px)`;
  const sp = $('#sig2'); sp.style.opacity = 0;
  later(() => { p.classList.remove('walking'); setPhonePath(x); sp.style.opacity = ''; }, ms);
}
function scrollToSlot(k){
  const w = $('#sceneScroll'); if(!w || w.scrollWidth <= w.clientWidth) return;
  w.scrollTo({left: CX(k)/1000*w.scrollWidth - w.clientWidth/2, behavior: REDUCED ? 'auto' : 'smooth'});
}
function moveUV(transform, ms, opacity){
  const el = $('#uv'); ms = REDUCED ? 1 : ms;
  el.style.transitionDuration = ms + 'ms'; el.style.transform = transform; el.style.opacity = opacity;
}
function placeUV(transform, opacity){
  const el = $('#uv'); el.style.transitionDuration = '0ms'; el.style.transform = transform; el.style.opacity = opacity; void el.getBBox();
}

/* ================= log + caption ================= */
const WHO = {st:'Станція', cl:'Хмара', app:'Застосунок', us:'Людина', term:'Термінал', sup:'Підтримка'};
function log(who, msg){
  const li = document.createElement('li');
  li.innerHTML = `<time>${new Date().toTimeString().slice(0,8)}</time><span class="who ${who}">${WHO[who]}</span><span></span>`;
  li.lastChild.textContent = msg;
  const ol = $('#log'); ol.prepend(li); while(ol.children.length > 10) ol.lastChild.remove();
}
const CAP = {
  map:     [1,'Людина біля станції','Телефон показує карту зі станцією, біля якої стоїть людина. Торкніться мітки станції в застосунку.'],
  station: [2,'Міні-версія станції','Синім позначено слоти, заброньовані через застосунок, червоним — зайняті, зеленим — вільні. Оберіть свій транспорт і зелений слот.'],
  tariff:  [3,'Тарифна сітка','Слот №{n} заброньовано: його лампа на станції стала синьою і блимає виділення. Оберіть тариф.'],
  otp:     [4,'Вхід за OTP','На телефон приходить одноразовий код. Після 3 невдалих спроб введення блокується на хвилину.'],
  lock:    [5,'Блокування на хвилину','Тричі введено неправильний код. Повторити можна через 60 секунд, потім прийде новий код.'],
  pickLock:[11,'Забрати {v}: блокування на хвилину','Тричі введено неправильний код. Повторити можна через 60 секунд, потім прийде новий код.'],
  pay:     [6,'Оплата','Підтвердьте оплату. Якщо банк відхилить платіж, застосунок попросить оплатити ще раз.'],
  payFail: [7,'Оплата не пройшла','Банк відхилив платіж. Слот №{n} і далі синій: він утримується за людиною. Оплатіть ще раз.'],
  opened:  [8,'Слот відкрито','Пролунав звук відкриття, двері слота №{n} відчинилися, всередині ввімкнулася підсвітка, лампа блимає синім. {how}',7],
  session: [9,'Таймер і IP-камера','Датчик побачив {v} у слоті. У застосунку пішов таймер і з’явилася трансляція з камери. Тепер зачиніть двері.'],
  thApproach:[10,'Підходить «гість»','Власник пішов. До станції, похитуючись, підходить нетверезий «гість» з пляшкою.'],
  thDrink: [10,'Ковток для хоробрості','«Гість» робить кілька ковтків. Камера слота вже бачить рух біля дверей.'],
  thPunch: [10,'Удари кулаком','Б’є кулаком по дверях слота №{n}. Двері зачинені майже впритик: зазор менше 1 мм, вчепитися нема за що. Замок тримає.'],
  thKick:  [10,'Удари ногами','Переходить на ноги. Датчики вібрації фіксують кожен удар, двері не піддаються.'],
  thPry:   [10,'Монтувалка','Дістає монтувалку і пробує віджати двері. Зачепитися нема за що: двері заходять за раму, зазор менше 1 мм, а три сталеві ригелі тримають край. Динамік попереджає: «Відійдіть від станції».'],
  thSmash: [10,'«Розочка»','Розбиває пляшку об модуль: у руці тепер «розочка». Скло і рама модуля цілі.'],
  thAlarm: [10,'Сигналізація кричить','Удари й розбите скло перевищили поріг датчиків: увімкнулися сирена і червоний стробоскоп, станція надіслала критичну тривогу в хмару.'],
  thCall:  [10,'Тривога в охорону і власнику','Хмара за секунду передала критичне повідомлення службі охорони і власнику. Екіпаж виїхав, власник бачить усе на камері.'],
  thArrive:[10,'Охорона на місці','Екіпаж приїхав раніше, ніж «гість» устиг щось зламати: двері витримали.'],
  thTake:  [10,'Охорона пакує «гостя»','«Розочку» відібрано, «гостя» пакують в машину. Сирену вимкнено, лампа знову червона: {v} на місці.'],
  caScan:  [10,'Атака на камеру: сканування','Хтось з інтернету шукає камеру слота за IP-адресою. Камери не мають публічної IP: запит зупиняється на хмарі Anchor.'],
  caToken: [10,'Атака на камеру: старе посилання','Хтось пробує відкрити відео за старим посиланням. Доступ видається лише власнику активної сесії, токен прострочений: відмовлено.'],
  caJam:   [10,'Глушіння зв’язку','Основний канал LTE заглушили. Станція перейшла на резервний NB-IoT для тривог, відео пишеться в зашифроване сховище модуля.'],
  caDone:  [10,'Камери захищені','Атаку відбито: відео не витекло, зв’язок відновлено, власник отримав звіт.'],
  thDone:  [10,'Інцидент закрито','Слот цілий, {v} на місці, власник отримав звіт і запис камери. Забрати транспорт можна як завжди.'],
  closed:  [10,'Слот зачинено','Пролунав звук закриття, лампа червона. Транспорт під замком і під камерою, можна спокійно йти у справах.{tip}'],
  bleNear: [10,'Поруч зі слотом','Людина підійшла до слота №{n}. Застосунок бачить станцію через Bluetooth: слот можна відчинити без коду, щоб дістати шолом чи речі. Сесія при цьому не завершується.'],
  bleOpen: [10,'Слот відчинено поруч','Хмара видала одноразовий ключ, станція відчинила слот №{n} через Bluetooth, лампа блимає синім. Таймер паркування йде далі. Якщо двері не зачинити, слот зачиниться сам через 2 хвилини.'],
  deadLow: [10,'Телефон сідає','Поки транспорт у слоті, телефон власника майже розрядився. Застосунок попереджає: якщо телефон вимкнеться, транспорт можна забрати на терміналі станції.'],
  deadPhone:[10,'Телефон розрядився','Застосунок і SMS недоступні. Це не проблема: термінал станції працює без телефону. Підійдіть до нього.'],
  deadTerm:[11,'Забрати через термінал','На терміналі: «Забрати транспорт» → слот №{n} → резервний PIN {pin}, який застосунок показав під час паркування. Забули PIN — підійде та сама банківська картка.'],
  pwOff:   [10,'Відключення світла','У місті зникло світло: згасли вікна й ліхтарі. Станція перейшла на власний акумулятор (приблизно на 36 годин) і сонячну панель. Замки, лампи, камери, термінал і зв’язок працюють, зарядку транспорту призупинено. Забрати транспорт можна як завжди.'],
  bugErr:  [11,'Тимчасова помилка застосунку','Код підтверджено, але сервіс видачі не відповів: застосунок показав помилку ANC-503. Слот зачинений, транспорт у безпеці. Спробуйте ще раз або напишіть у підтримку.'],
  bugSup:  [11,'Чат з підтримкою','Застосунок сам додав до звернення код помилки, номер слота і сесію. Оператор перевіряє, що транспорт ваш, і відчиняє слот дистанційно.'],
  supOpen: [11,'Підтримка відчинила слот','Оператор підтвердив власника за карткою і відчинив слот №{n} дистанційно, лампа зелена. Доплату за час збою скасовано, нараховано 20 бонусних гривень. {take}'],
  tHome:   [1,'Термінал станції','У людини немає застосунку. На стійці модуля 1 стоїть сенсорний термінал: він працює локально на станції (localhost) і передає в хмару статуси слотів, оплати й дані клієнта. Натисніть «Орендувати слот».',1],
  tStation:[2,'Транспорт і слот','Термінал показує ту саму схему станції, що й застосунок. Оберіть свій транспорт і зелений слот.',2],
  tTariff: [3,'Тариф на терміналі','Слот №{n} заброньовано, лампа синя. На терміналі доступні разові тарифи, підписки Pro і Unlim — у застосунку.',3],
  tPhone:  [4,'Номер для чека','Номер телефону необов’язковий: на нього прийде чек і нагадування. Реєстрація не потрібна.',4],
  tPin:    [5,'PIN для слота','Людина задає 4-значний PIN і повторює його. Термінал зберігає лише хеш PIN і передає його в хмару: так PIN можна перевірити навіть без зв’язку.',5],
  tPay:    [6,'Оплата карткою','Прикладіть банківську картку або телефон до NFC-зчитувача під екраном термінала.',6],
  tPayFail:[7,'Картку відхилено','Банк відхилив платіж. Слот №{n} лишається заброньованим. Прикладіть картку ще раз.',6],
  tPick:   [11,'Забрати: номер слота','На терміналі натисніть «Забрати транспорт» і оберіть номер слота, написаний на дверях.',8],
  tPickPin:[11,'Забрати: PIN','Введіть PIN слота. Термінал перевіряє його локально за хешем. Після 3 хибних спроб введення блокується на 5 хвилин, а власник отримує сповіщення.',8],
  tPinLock:[11,'PIN заблоковано на 5 хвилин','Тричі введено хибний PIN. Введення для слота №{n} заблоковано на 5 хвилин, власник отримав сповіщення. Забрати транспорт можна за карткою, якою платили, або через підтримку.',8],
  tCard:   [11,'Забрати за карткою','Забули PIN? Прикладіть ту саму банківську картку, якою оплачували паркування: термінал знайде сесію за карткою.',8],
  tExtra:  [11,'Доплата на терміналі','Час вийшов за тариф. Прикладіть картку, щоб доплатити, і слот відчиниться.',8],
  pickOtp: [11,'Забрати {v}: підтвердження','Для видачі потрібен новий OTP-код, як і при вході.'],
  pickOpen:[11,'Слот відкрито для видачі','Пролунав звук відкриття, лампа слота №{n} знову зелена. {take}'],
  feedback:[11,'Відгук про сесію','Після чека застосунок пропонує коротку анкету з трьох питань. Надіслати її може кожен, без реєстрації.'],
  handoff: [11,'Відгук через Google Форму','Відповіді надсилаються через Google Форму, вже заповнену застосунком. Реєстрація не потрібна. Щогодини вони з’являються у вкладці «Відгуки».'],
  done:    [11,'Сесію завершено','Датчик побачив порожній слот, двері зачинилися. Слот №{n} вільний і світиться зеленим для наступного райдера.'],
};
/* terminal-channel versions of shared steps; the 4th number is the step in the 9-step terminal-only scenario */
const CAP_T = {
  session: [9,'Транспорт у слоті','Датчик побачив {v} у слоті. Термінал нагадує номер слота: разом із вашим PIN він знадобиться, щоб забрати транспорт. Зачиніть двері.',7],
  closed:  [10,'Слот зачинено','Пролунав звук закриття, лампа червона, 3 ригелі замкнено. Термінал передав у хмару статус «зайнято». Щоб забрати транспорт, поверніться до термінала: «Забрати транспорт» → номер слота → PIN.',7],
  pickOpen:[11,'Слот відкрито для видачі','Термінал підтвердив доступ, пролунав звук відкриття, лампа слота №{n} знову зелена. {take}',9],
  done:    [11,'Сесію завершено','Датчик побачив порожній слот, двері зачинилися. Термінал показав чек і передав у хмару, що слот №{n} знову вільний.',9],
};
const howText = () => S.transport === 'bike' ? 'Повісьте велосипед на гак за переднє колесо, заднє стане в тримач на підлозі.' : `Заведіть ${VEH[S.transport].acc} у слот і закріпіть колесо в тримачі.`;
function stage(key, acts){
  S.stage = key;
  const c = (S.chan === 'term' && CAP_T[key]) || CAP[key], t9 = S.scn === 'term';
  const fill = s => s.replace(/\{how\}/g, howText())
    .replace(/\{take\}/g, S.transport === 'bike' ? 'Зніміть велосипед з гака й викотіть його.' : 'Викотіть {v}.')
    .replace(/\{tip\}/g, bleOk() ? ' Щоб дістати речі, не завершуючи сесію, підійдіть до слота: застосунок відчинить його поруч через Bluetooth.' : '')
    .replace(/\{v\}/g, VEH[S.transport].acc).replace(/\{n\}/g, S.slot != null ? S.slot+1 : '').replace(/\{pin\}/g, S.pin || '');
  const n = t9 && c[3] ? c[3] : c[0], tot = t9 ? 9 : 11;
  $('#stepNo').textContent = `Крок ${n} з ${tot}`;
  $('#capTitle').textContent = fill(c[1]).replace(/^./, ch => ch.toUpperCase());
  $('#capText').textContent = fill(c[2]);
  $('#prog').style.width = (n/tot*100) + '%';
  const a = $('#actions'), hadFocus = a.contains(document.activeElement); a.innerHTML = '';
  if(!acts || !acts.length){ a.innerHTML = `<span class="hint-none">Продовжуйте ${S.chan === 'term' ? 'на терміналі' : 'в застосунку'} <span class="wide">праворуч →</span><span class="narrow">нижче ↓</span></span>`; if(hadFocus) $('#capTitle').focus({preventScroll:true}); return; }
  acts.forEach(([label, fn]) => { const b = document.createElement('button'); b.className = 'act'; b.textContent = label; b.onclick = () => { ctx(); fn(); }; a.appendChild(b); });
  if(hadFocus) a.querySelector('.act').focus({preventScroll:true});
}

/* ================= phone ================= */
const IC = {
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  speaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/></svg>',
  door:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"><rect x="8" y="5" width="32" height="38" rx="2"/><path d="M8 5l14 5v36l-14-3z" fill="currentColor" opacity=".2"/><path d="M8 5l14 5v36"/><path d="M28 24h6M31 21l3 3-3 3"/></svg>',
  check:'<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 25l8 8 16-17"/></svg>',
  bolt:'<svg viewBox="0 0 12 14" aria-hidden="true"><path d="M7 0L1 8h4l-1.5 6L10 5H6l1-5z" fill="currentColor"/></svg>',
  wide:'<svg viewBox="0 0 14 14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7h12M4 4L1 7l3 3M10 4l3 3-3 3"/></svg>',
  search:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
  ble:'<svg width="12" height="14" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4l8 7-4 3V2l4 3-8 7"/></svg>',
};
const TITLES = {map:'Станції поруч', station:'Станція №14', tariff:'Тариф', auth:'Вхід', pay:'Оплата', opened:'Слот відкрито', session:'Моє паркування', pickupOpen:'Видача', done:'Чек', feedback:'Відгук', handoff:'Google Форма', appErr:'Видача', support:'Підтримка'};
const fmt = ms => { const s = Math.floor(ms/1000); return [Math.floor(s/3600), Math.floor(s/60)%60, s%60].map(n => String(n).padStart(2,'0')).join(':'); };
const mask = p => p.replace(/(\+380\s?\d{2})\s?\d{3}/, '$1 ***');
const subOn = () => T(S.tariff).sub && S.subActive === S.tariff;
const prepay = () => { const t = T(S.tariff); return subOn() ? 0 : t.hours ? t.price*S.hours : t.price; };
const nightOk = () => { const h = new Date().getHours(); return h >= 20 || h < 8; };
function costNow(){
  const h = S.elapsed/3.6e6;
  if(S.tariff === 'once') return Math.max(S.hours, Math.ceil(h))*20;
  if(S.tariff === 'day') return 75 + Math.max(0, Math.ceil(h - 10))*20;
  return S.paid;
}
const compatible = k => VEH[S.transport].wide ? slots[k].wide : true;
function toast(t){ const e = $('#toast'); e.textContent = t; e.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => e.classList.remove('on'), 2200); }
let smsH;
function sms(t){
  if(S.phoneDead || S.scn === 'term') return;
  const el = $('#sms'), ah = $('#apphead');
  el.style.setProperty('--sms-top', (ah.offsetTop + ah.offsetHeight + 4) + 'px');
  $('#smsText').textContent = t; el.inert = false; el.classList.remove('warn','crit'); $('#smsIc').textContent = 'SMS'; $('#smsFrom').textContent = 'Anchor · зараз'; el.classList.add('on'); sSms();
  clearTimeout(smsH); smsH = setTimeout(hideSms, 7000);
}
function push(text, kind){
  if(S.phoneDead || S.scn === 'term') return;
  const el = $('#sms'), ah = $('#apphead');
  el.style.setProperty('--sms-top', (ah.offsetTop + ah.offsetHeight + 4) + 'px');
  el.classList.remove('warn','crit'); el.classList.add(kind);
  $('#smsIc').textContent = kind === 'crit' ? '!' : '30';
  $('#smsFrom').textContent = kind === 'crit' ? 'Anchor · КРИТИЧНО' : 'Anchor · нагадування';
  $('#smsText').textContent = text; el.inert = false; el.classList.add('on');
  if(kind === 'crit'){ tone(988,0,.14,'square',.08); tone(988,.2,.14,'square',.08); tone(988,.4,.14,'square',.08); } else sSms();
  clearTimeout(smsH); smsH = setTimeout(hideSms, kind === 'crit' ? 5500 : 6500);
}
function hideSms(){ const el = $('#sms'); el.classList.remove('on'); el.inert = true; }

function header(){
  const back = ['station','tariff','handoff','feedback'].includes(S.screen) || (S.screen === 'pay' && !S.paying) || (S.screen === 'auth' && Date.now() >= S.lockUntil && !S.verified);
  return `${back ? `<button class="icbtn" data-act="back" aria-label="Назад">${IC.back}</button>` : ''}
    <span class="ttl">${TITLES[S.screen]}</span>
    <button class="icbtn" data-act="big" aria-pressed="${S.big}" aria-label="Великий текст" title="Великий текст">Aa</button>
    <button class="icbtn" data-act="voice" aria-pressed="${S.voice}" aria-label="Голосові підказки" title="Голосові підказки">${IC.speaker}</button>`;
}
const sumRows = () => { const t = T(S.tariff); return `<div><span>Слот</span><b>№${S.slot+1}${slots[S.slot].charge?' · зарядка':''}${slots[S.slot].wide?' · широкий':''}</b></div><div><span>Транспорт</span><b>${VEH[S.transport].name}</b></div><div><span>Тариф</span><b>${t.name}${t.hours?' · '+S.hours+' год':''}</b></div><div class="tot"><span>До сплати</span><b>${prepay()} грн</b></div>`; };

function camBlock(){
  const sl = slots[S.slot], v = sl.v, charging = v && sl.charge && VEH[v].electric;
  return `<div class="cam">
        <svg viewBox="0 0 300 170" class="${S.doorOpen?'':'ir'}${theftLive() ? ' alarm' : ''}" aria-label="Відео з IP-камери всередині слота №${S.slot+1}">
          <defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d3a46"/><stop offset="1" stop-color="#10161c"/></linearGradient>
          <linearGradient id="cgo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff6dc" stop-opacity=".55"/><stop offset="1" stop-color="#fff6dc" stop-opacity="0"/></linearGradient></defs>
          <rect width="300" height="170" fill="url(#cg)"/>
          <polygon points="30,0 270,0 220,95 80,95" fill="#35444f"/><polygon points="0,170 80,95 220,95 300,170" fill="#1b242c"/>
          <polygon points="0,0 30,0 80,95 0,170" fill="#26323c"/><polygon points="300,0 270,0 220,95 300,170" fill="#26323c"/>
          ${S.doorOpen ? '<rect width="300" height="170" fill="url(#cgo)"/>' : ''}
          <rect x="132" y="158" width="36" height="8" rx="2" fill="#0b0f13"/>
          <g fill="none" stroke="#c9d4dc" stroke-linecap="round">${v ? camVeh(v) : ''}</g>
          ${charging ? '<path d="M262 60 C 240 110, 200 110, 166 116" fill="none" stroke="#F2B21B" stroke-width="2.5"/><rect x="258" y="52" width="9" height="12" rx="2" fill="#d8dde3"/>' : ''}
          <text x="10" y="18" font-size="10" fill="#fff" font-family="JetBrains Mono,monospace"><tspan class="rec" fill="#ff4a40">●</tspan> LIVE · CAM 14-0${S.slot+1}</text>
          <text x="290" y="18" font-size="10" fill="#fff" text-anchor="end" font-family="JetBrains Mono,monospace" id="camTime">${new Date().toTimeString().slice(0,8)}</text>
          <text x="10" y="162" font-size="9" fill="#9fb0bd" font-family="JetBrains Mono,monospace">${S.cam === 'jam' ? 'ЗАПИС ЛОКАЛЬНО · NB-IoT' : S.power === 'off' ? 'АКУМУЛЯТОР · ЗАПИС ІДЕ' : '1080p · зашифрований канал'}</text>
          <text x="290" y="162" font-size="9" fill="${S.doorOpen?'#ffd27a':'#9fb0bd'}" text-anchor="end" font-family="JetBrains Mono,monospace">${!v ? 'СЛОТ ПОРОЖНІЙ' : S.doorOpen ? 'ДВЕРІ ВІДЧИНЕНО' : 'ЗАЧИНЕНО · ІЧ'}</text>
          ${theftLive() ? '<rect width="300" height="170" fill="#ff2a2a" opacity=".22"/><rect x="58" y="62" width="184" height="26" rx="4" fill="#E5322B"/><text x="150" y="80" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="JetBrains Mono,monospace">ТРИВОГА · УДАРИ ПО ДВЕРЯХ</text>' : ''}
        </svg><div class="scan"></div>
      </div>`;
}
function vehChips(act){ return Object.keys(VEH).map(k => `<button class="vchip" data-act="${act}" data-t="${k}" aria-pressed="${S.transport===k}">${chipVeh(k)}<span>${VEH[k].name}<small>${VEH[k].sub}</small></span></button>`).join(''); }
function miniGrid(act){
  let mini = '';
  for(let m = 0; m < 3; m++){
    mini += `<div class="mod"><h4>Модуль ${m+1}</h4><div class="mod-row">`;
    for(const s of [0,1]){
      const k = m*2 + s, sl = slots[k];
      const cls = sl.st === 'free' ? 'g' : ['booked','hold'].includes(sl.st) ? 'b' : 'r';
      const nc = sl.st === 'free' && !compatible(k);
      const lbl = nc ? 'не той' : {g:'вільно', b:'бронь', r:'зайнято'}[cls];
      mini += `<button class="slot ${nc?'nc':cls}${S.slot===k&&sl.st==='hold'?' sel':''}" data-act="${act}" data-k="${k}" aria-label="Слот ${k+1}: ${nc?'не підходить для вашого транспорту':lbl}${sl.charge?', із зарядкою':''}${sl.wide?', широкий':''}">
        <span class="s-led"></span><span class="s-n">${k+1}</span><span class="s-l">${lbl}</span><span class="s-ic">${sl.charge?IC.bolt:''}${sl.wide?IC.wide:''}</span></button>`;
    }
    mini += '</div></div>';
  }
  return mini;
}
const V = {
  map(){
    const c = {g:0, b:0, r:0}; slots.forEach(s => c[{free:'g', booked:'b', hold:'b'}[s.st] || 'r']++);
    return `<div class="map-wrap">
      <svg class="map" viewBox="0 0 330 350" aria-hidden="true">
        <rect class="m-bg" width="330" height="350"/>
        <path class="m-water" d="M255 0 C 238 90, 304 150, 284 230 S 302 320, 330 350 L330 0Z"/>
        <rect class="m-block" x="14" y="18" width="88" height="68" rx="6"/><rect class="m-block" x="124" y="18" width="98" height="68" rx="6"/>
        <rect class="m-block" x="14" y="110" width="88" height="80" rx="6"/><rect class="m-park" x="124" y="212" width="110" height="76" rx="10"/>
        <rect class="m-block" x="14" y="212" width="88" height="76" rx="6"/><rect class="m-block" x="14" y="306" width="206" height="44" rx="6"/>
        <path class="m-road" d="M0 99 L330 99"/><path class="m-road" d="M113 0 L113 350"/>
        <path class="m-road2" d="M0 201 L262 201"/><path class="m-road2" d="M234 0 L244 201 L252 350"/><path class="m-road2" d="M0 297 L252 297"/>
        <text class="m-txt" x="8" y="95">ВУЛ. ДЕГТЯРІВСЬКА</text><text class="m-txt" x="160" y="254">ПАРК</text>
        <circle cx="160" cy="146" r="11" fill="#D8262F"/><text x="160" y="151" fill="#fff" style="font:800 12px var(--font-body);text-anchor:middle">M</text>
        <circle class="m-other" cx="58" cy="54" r="12"/><text class="m-other-t" x="58" y="58">2</text>
        <circle class="m-other" cx="62" cy="250" r="12"/><text class="m-other-t" x="62" y="254">0</text>
        <circle class="pulse brand" cx="186" cy="150" r="14"/>
        <circle class="pulse" cx="206" cy="176" r="10"/><circle class="m-me" cx="206" cy="176" r="7"/>
      </svg>
      <div class="search">${IC.search} Станції біля метро «Лук’янівська»</div>
      <button class="pin" data-act="openStation" style="left:56.4%;top:45%" aria-label="Станція Anchor №14, вільних слотів: ${c.g}">
        <svg viewBox="0 0 54 66"><path d="M27 64 C 27 64 4 40 4 25 a23 23 0 0 1 46 0 C 50 40 27 64 27 64Z" fill="#F29A1F" stroke="#1B1204" stroke-width="2.5"/><rect x="15" y="14" width="24" height="4" fill="#1B1204"/><rect x="16" y="18" width="22" height="15" fill="#2D3642"/><rect x="18" y="20" width="8" height="11" fill="#7FC4CC"/><rect x="28" y="20" width="8" height="11" fill="#7FC4CC"/></svg>
        <span class="pin-badge">${c.g}</span>
      </button>
    </div>
    <div class="sheet">
      <div class="grab"></div>
      <span class="near">${IC.ble} Ви біля станції · 40 м</span>
      <div><b>Станція Anchor №14 «Лук’янівська»</b><p class="sub">вул. Дегтярівська, 2 · 3 модулі, 6 слотів</p></div>
      <div class="counts"><span><i class="dot g"></i>${c.g} вільні</span><span><i class="dot b"></i>${c.b} бронь</span><span><i class="dot r"></i>${c.r} зайняті</span></div>
      <button class="btn" data-act="openStation">Переглянути слоти</button>
      <p class="fine">Або торкніться позначки станції на карті</p>
    </div>`;
  },
  station(){
    const v = VEH[S.transport];
    const hint = v.wide ? 'Для адаптованого велосипеда підходить лише широкий слот №6.' : v.electric ? 'Слоти з блискавкою мають розетку: транспорт заряджатиметься, поки стоїть.' : 'Велосипед можна поставити в будь-який вільний слот: у кожному є гак для переднього колеса.';
    return `<div class="pad">
      <p class="sub">Станція №14 · вул. Дегтярівська, 2</p>
      <p class="label">Ваш транспорт</p>
      <div class="vchips">${vehChips('transport')}</div>
      <p class="label">Оберіть зелений слот</p>
      <div class="mini">${miniGrid('pickSlot')}</div>
      <div class="lg"><span><i class="dot g"></i>зелений — вільний</span><span><i class="dot b"></i>синій — заброньовано</span><span><i class="dot r"></i>червоний — зайнятий</span></div>
      <p class="hint">${hint}</p>
      <button class="linkbtn" data-act="rules" style="align-self:flex-start">Правила станції</button>
    </div>`;
  },
  tariff(){
    const t = T(S.tariff);
    return `<div class="pad">
      <div><h2 class="vt">Оберіть тариф</h2><p class="sub">Слот №${S.slot+1} · ${VEH[S.transport].name}. Ціна однакова для будь-якого транспорту.</p></div>
      <div class="tar">${TARIFFS.map(x => { const off = x.id === 'night' && !nightOk(), act = x.sub && S.subActive === x.id;
        return `<button class="tr" data-act="tariff" data-id="${x.id}" aria-pressed="${S.tariff===x.id}" ${off?'disabled aria-disabled="true"':''}><span><b>${x.name}${x.sub?`<span class="tag">${act?'активна':'підписка'}</span>`:''}</b><small>${off?'Доступний з 20:00 до 08:00':act?'Вже оплачено, паркування безкоштовне':x.desc}</small></span><span class="pr">${x.price}<br><small>${x.unit}</small></span></button>`; }).join('')}</div>
      ${t.hours ? `<div class="stepper"><span>Кількість годин</span><div><button data-act="hours" data-d="-1" aria-label="Менше годин">−</button><b>${S.hours}</b><button data-act="hours" data-d="1" aria-label="Більше годин">+</button></div></div>` : ''}
      <div class="spacer"></div>
      <button class="btn" data-act="toAuth">Продовжити · ${prepay()} грн</button>
      <p class="fine">Слот №${S.slot+1} утримується за вами 5 хвилин</p>
    </div>`;
  },
  auth(){
    const pick = S.authFor === 'pickup', locked = Date.now() < S.lockUntil;
    if(!pick && !S.otpSent){
      return `<div class="pad center">
        <div class="big-ic">${IC.lock}</div>
        <h2 class="vt">Вхід за номером телефону</h2>
        <p class="sub">Надішлемо одноразовий код (OTP) в SMS</p>
        <label for="phoneIn" class="label" style="align-self:flex-start">Номер телефону</label>
        <input class="field" id="phoneIn" type="tel" inputmode="tel" value="${S.phoneDraft ?? S.phone}" autocomplete="tel">
        <p class="msg err" id="phoneErr"></p>
        <div class="spacer"></div>
        <button class="btn" data-act="sendCode">Отримати код</button>
      </div>`;
    }
    const dots = [0,1,2].map(i => `<i class="${i >= S.tries ? 'used' : ''}"></i>`).join('');
    const keys = ['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => k === '' ? '<button class="ph" tabindex="-1" aria-hidden="true"></button>' : `<button data-act="key" data-k="${k}" ${locked?'disabled':''} aria-label="${k==='⌫'?'Стерти':k}">${k}</button>`).join('');
    return `<div class="pad center">
      <h2 class="vt">${pick ? 'Підтвердіть видачу' : 'Введіть код з SMS'}</h2>
      <p class="sub">Код надіслано на <b>${mask(S.phone)}</b></p>
      <div class="otpb" id="otpBoxes" role="img" aria-label="Введено цифр: ${S.otp.length} з 4">${[0,1,2,3].map(() => '<i></i>').join('')}</div>
      ${locked
        ? `<div class="lock">Забагато невдалих спроб. Вхід заблоковано<b id="lockClock">${lockText()}</b></div><button class="linkbtn" data-act="skipLock">Пропустити очікування (демо)</button>`
        : `<p class="msg ${S.msgCls}" id="otpMsg" role="status" aria-live="polite">${S.msg}</p><div class="tries">${dots}<span>Залишилось спроб: ${S.tries}</span></div>`}
      <div class="spacer"></div>
      <div class="links"><button class="linkbtn" data-act="showSms" ${locked?'disabled':''}>Показати SMS ще раз</button><button class="linkbtn" data-act="resend" ${locked?'disabled':''}>Новий код</button></div>
      <div class="keypad">${keys}</div>
      <p class="fine">Демо: торкніться SMS угорі, щоб вставити код, або тричі введіть хибний</p>
    </div>`;
  },
  pay(){
    const t = T(S.tariff);
    return `<div class="pad">
      <h2 class="vt">Оплата</h2>
      ${S.payError ? '<div class="banner" role="alert"><b>Оплату не проведено</b>Банк відхилив платіж: недостатньо коштів на картці. Спробуйте ще раз або змініть картку.</div>' : ''}
      <div class="sum">${sumRows()}</div>
      ${subOn() ? '<p class="note">Підписка активна: паркування вже оплачене.</p>' : ''}
      <div class="card ${S.card==='9032'?'alt':''}"><small>Картка для оплати</small><b>•••• •••• •••• ${S.card}</b><small>${S.card==='4417'?'Основна картка · діє до 08/28':'Додаткова картка · діє до 11/27'}</small></div>
      <button class="linkbtn" data-act="swapCard" style="align-self:flex-start">Змінити картку</button>
      <div class="spacer"></div>
      <button class="btn ${S.payError?'':'dark'}" data-act="pay" ${S.paying?'disabled':''}>${S.paying ? (S.paid ? 'Оплачено · відчиняємо слот…' : '<span class="spin"></span> Обробка платежу') : (S.payError ? 'Оплатити ще раз · ' : t.sub ? 'Оформити підписку · ' : 'Сплатити · ') + prepay() + ' грн'}</button>
      <p class="fine">Слот відчиниться одразу після успішної оплати</p>
    </div>`;
  },
  opened(){
    const sl = slots[S.slot];
    return `<div class="pad center">
      <div class="okc b">${IC.door}</div>
      <h2 class="vt">Слот №${S.slot+1} відкрито</h2>
      <p class="sub">Станція подала звуковий сигнал, лампа блимає синім. ${howText()}</p>
      ${sl.charge && VEH[S.transport].electric ? '<p class="note">У слоті є розетка: підключіть зарядку, і рівень заряду буде видно в застосунку.</p>' : ''}
      <div class="sum" style="width:100%;text-align:left">${sumRows()}</div>
      ${S.pin ? `<p class="note" style="width:100%">Резервний PIN для термінала: <b class="pinv">${S.pin}</b>. Запам’ятайте: разом із номером слота він допоможе забрати транспорт, якщо телефон розрядиться.</p>` : ''}
      <div class="spacer"></div>
      <p class="fine">Дія відбувається на станції: кнопка під сценою</p>
    </div>`;
  },
  session(){
    const sl = slots[S.slot], charging = sl.charge && VEH[S.transport].electric, t = T(S.tariff);
    return `<div class="pad">
      ${theftBox() || (S.doorOpen ? (S.bleUntil ? '<span class="pill a"><i class="dot b"></i>Слот відчинено поруч: сесія триває</span>' : '<span class="pill a"><i class="dot b"></i>Двері відчинені: зачиніть слот</span>') : '<span class="pill g"><i class="dot g"></i>Слот зачинено: транспорт у безпеці</span>')}
      ${S.power === 'off' ? `<span class="pill a">⚡ Станція на акумуляторі · <b id="stBatT">${Math.round(S.stBat)}%</b></span>` : ''}
      ${remindBox()}
      <div class="timer"><small>Час паркування · ${t.name}</small><div class="t" id="timer">${fmt(S.elapsed)}</div><div class="tinfo" id="tinfo"></div></div>
      ${camBlock()}

      ${charging ? `<div class="chg"><div class="row"><span>Зарядка від станції</span><span id="chgPct">${Math.floor(S.battery)}%</span></div><div class="meter"><b id="chgBar" style="width:${Math.floor(S.battery)}%"></b></div>${S.power === 'off' ? '<span>Зарядку призупинено, поки немає світла</span>' : ''}</div>` : ''}
      ${S.doorOpen && !S.bleUntil ? '' : accBox()}
      ${camBox()}
      <p class="sub">Відео доступне лише вам, поки транспорт у слоті. Канал зашифрований, у камер немає публічної IP-адреси.</p>
      <div class="spacer"></div>
      ${S.doorOpen ? (S.bleUntil ? '' : '<p class="fine">Зачиніть двері на станції: кнопка під сценою</p>') : theftBusy() || camBusy() ? `<button class="btn dark" disabled>${camBusy() ? 'Зачекайте: станція відбиває атаку' : 'Зачекайте: реагує охорона'}</button>` : `<button class="btn dark" data-act="pickup">Забрати ${VEH[S.transport].acc}</button>`}
    </div>`;
  },
  pickupOpen(){
    return `<div class="pad center">
      <div class="okc g">${IC.door}</div>
      <h2 class="vt">Слот №${S.slot+1} відкрито</h2>
      <p class="sub">Лампа слота знову зелена. ${S.transport === 'bike' ? 'Зніміть велосипед з гака й викотіть його' : 'Викотіть ' + VEH[S.transport].acc}: двері зачиняться самі, коли слот спорожніє.</p>
      ${S.extra ? `<p class="note">Доплата ${S.extra} грн за час понад тариф списана з картки •••• ${S.card}.</p>` : ''}
      <div style="width:100%">${camBlock()}</div>
      <div class="sum" style="width:100%;text-align:left"><div><span>Час паркування</span><b>${fmt(S.elapsed)}</b></div><div><span>Тариф</span><b>${T(S.tariff).name}</b></div></div>
      <div class="spacer"></div>
      <p class="fine">Дія відбувається на станції: кнопка під сценою</p>
    </div>`;
  },
  done(){
    const t = T(S.tariff);
    return `<div class="pad">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center"><div class="okc g">${IC.check}</div><h2 class="vt">Гарної поїздки!</h2><p class="sub">Слот №${S.slot+1} знову вільний. Дякуємо, що користуєтесь Anchor.</p></div>
      <div class="sum">
        <div><span>Транспорт</span><b>${VEH[S.transport].name}</b></div>
        <div><span>Тариф</span><b>${t.name}${t.hours?' · '+S.hours+' год':''}</b></div>
        <div><span>Час паркування</span><b>${fmt(S.elapsed)}</b></div>
        <div><span>Сплачено при бронюванні</span><b>${S.paid} грн</b></div>
        <div><span>Доплата</span><b>${S.extra} грн</b></div>
        ${S.bonus ? `<div><span>Бонус за збій</span><b>+${S.bonus} грн на рахунок</b></div>` : ''}
        <div class="tot"><span>Разом</span><b>${S.paid + S.extra} грн</b></div>
      </div>
      ${S.bonus ? '<p class="note">Звернення #A-1042 закрито. Доплату за час збою скасовано.</p>' : ''}
      <div class="spacer"></div>
      <button class="btn" data-act="toFeedback">Залишити відгук</button>
      <button class="linkbtn" data-act="again" style="align-self:center">Пропустити й почати нову сесію</button>
    </div>`;
  },
  appErr(){
    return `<div class="pad center">
      <div class="okc r" aria-hidden="true">!</div>
      <h2 class="vt">Не вдалося відчинити слот</h2>
      <p class="sub">Слот №${S.slot+1} зачинений, ${VEH[S.transport].acc} у безпеці. За час збою доплата не нараховується.</p>
      <div class="banner" role="alert" style="width:100%;text-align:left"><b>Помилка ANC-503</b>Сервіс видачі тимчасово недоступний.${S.bugTries ? ' Повторна спроба теж не вдалася.' : ''}</div>
      <div class="spacer"></div>
      <button class="btn ${S.bugTries ? 'dark' : ''}" data-act="bugRetry" ${S.bugBusy ? 'disabled' : ''}>${S.bugBusy ? '<span class="spin"></span> Пробуємо ще раз' : 'Спробувати ще раз'}</button>
      <button class="btn ${S.bugTries ? '' : 'dark'}" data-act="support">Написати в підтримку</button>
      <p class="fine">Або на терміналі станції: номер слота і PIN${S.pin ? ' ' + S.pin : ''}</p>
    </div>`;
  },
  support(){
    const who = {bot:'Бот Anchor', op:'Олена · підтримка', me:'Ви'};
    return `<div class="pad">
      <div class="msgs" aria-live="polite">${S.chat.map(m => m.who === 'sys' ? `<p class="m-sys">${esc(m.t)}</p>` : `<div class="m ${m.who}"><small>${who[m.who]}</small>${esc(m.t)}</div>`).join('')}
      ${S.chatTyping ? '<div class="m op"><small>Олена · підтримка</small><span class="dots" aria-label="друкує"><i></i><i></i><i></i></span></div>' : ''}</div>
      <div class="spacer"></div>
      ${S.chatAsk ? `<button class="btn" data-act="chatCard">Надіслати: картка •••• ${S.card}</button>` : '<div class="chatin" aria-hidden="true">Повідомлення…</div>'}
    </div>`;
  },
  feedback(){
    const f = S.fb, e = S.fbErr, labels = ['', 'Дуже незручно', 'Незручно', 'Нормально', 'Зручно', 'Дуже зручно'];
    const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>';
    return `<form class="pad" id="fbForm" novalidate>
      <div><h2 class="vt">Як пройшла сесія?</h2><p class="sub">3 короткі питання. Відповіді анонімні.</p></div>
      <p class="note">Відповіді надсилаються через Google Форму: вона відкриється вже заповненою, лишиться натиснути «Надіслати». Реєстрація не потрібна.</p>
      <fieldset class="q${e.rating?' err':''}"><legend><span class="qn">1</span>Наскільки зручний для вас інтерфейс застосунку?</legend>
        <div class="stars" role="radiogroup" aria-label="Оцінка від 1 до 5">${[1,2,3,4,5].map(n => `<button type="button" role="radio" aria-checked="${f.rating===n}" aria-label="${n} з 5: ${labels[n]}" class="${n<=f.rating?'on':''}" data-act="fbStar" data-n="${n}" tabindex="${(f.rating||1)===n?0:-1}">${star}</button>`).join('')}</div>
        <span class="stars-l">${f.rating ? f.rating + ' з 5 · ' + labels[f.rating] : 'Оберіть від 1 до 5 зірок'}</span>
        ${e.rating ? '<p class="qerr">Поставте оцінку від 1 до 5</p>' : ''}
      </fieldset>
      <fieldset class="q${e.need?' err':''}"><legend><span class="qn">2</span>Чи виконує ця станція вашу потребу в зберіганні?</legend>
        <div class="yn" role="radiogroup" aria-label="Так або ні"><button type="button" role="radio" aria-checked="${f.need===true}" data-act="fbNeed" data-v="1">Так</button><button type="button" role="radio" aria-checked="${f.need===false}" data-act="fbNeed" data-v="0">Ні</button></div>
        ${e.need ? '<p class="qerr">Оберіть «Так» або «Ні»</p>' : ''}
      </fieldset>
      <div class="q"><label class="ql" for="fbWish"><span class="qn">3</span>Які ваші побажання щодо покращення сервісу станції?</label>
        <textarea class="ta" id="fbWish" maxlength="500" placeholder="Наприклад: більше слотів із зарядкою, навіс від дощу…">${esc(f.wish)}</textarea>
        <span class="cnt" id="fbCnt">${f.wish.length} / 500</span>
      </div>
      <button class="btn" type="submit">Продовжити в Google Формі</button>
    </form>`;
  },
  handoff(){
    return `<div class="pad center">
      <div class="okc b"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10H10v28h28V28"/><path d="M28 8h12v12M40 8L22 26"/></svg></div>
      <h2 class="vt">Останній крок</h2>
      <p class="sub">Відкрийте Google Форму: ваші відповіді вже вставлені. Натисніть у ній «Надіслати». Реєстрація не потрібна.</p>
      <div class="sum" style="width:100%;text-align:left">
        <div><span>Зручність інтерфейсу</span><b>${S.fb.rating} з 5</b></div>
        <div><span>Станція виконує потребу</span><b>${S.fb.need ? 'Так' : 'Ні'}</b></div>
        <div><span>Побажання</span><b>${S.fb.wish.trim() ? esc(S.fb.wish.trim().slice(0, 60)) + (S.fb.wish.trim().length > 60 ? '…' : '') : '—'}</b></div>
      </div>
      <a class="btn" href="${esc(gformUrl())}" target="_blank" rel="noopener" data-act="formOpened">Відкрити Google Форму ↗</a>
      ${S.fbOpened ? '<p class="note">Надіслали у формі? Дякуємо! Відповідь з’явиться у вкладці «Відгуки» протягом години.</p>' : ''}
      <div class="spacer"></div>
      <button class="linkbtn" data-act="again" style="align-self:center">Нова сесія</button>
    </div>`;
  },
};
const lockText = () => { const l = Math.max(0, Math.ceil((S.lockUntil - Date.now())/1000)); return Math.floor(l/60) + ':' + String(l%60).padStart(2,'0'); };
function render(){
  const pi = $('#phoneIn'); if(pi) S.phoneDraft = pi.value;
  const ae = document.activeElement, fk = ae && ae.closest && ae.closest('#view') && ae.dataset.k;
  $('#apphead').innerHTML = header();
  $('#view').innerHTML = V[S.screen]();
  $('#view').scrollTop = S.screen === 'support' ? $('#view').scrollHeight : 0;
  $('#screen').classList.toggle('big', S.big);
  if(S.screen === 'auth') paintOtp();
  if(S.screen === 'session') updateLive();
  if(fk){ const nb = $(`#view [data-act="key"][data-k="${fk}"]`); if(nb && !nb.disabled) nb.focus({preventScroll:true}); }
}
function go(screen){ S.screen = screen; $('#toast').classList.remove('on'); clearTimeout(toast.h); render(); }
function paintOtp(){
  $$('#otpBoxes i').forEach((e, i) => { e.textContent = S.otp[i] || ''; e.className = i === S.otp.length && Date.now() >= S.lockUntil ? 'f' : ''; });
}

/* ================= flow ================= */
function sendOtp(){
  const code = S.code = String(1000 + Math.floor(Math.random()*9000)); S.otp = ''; S.otpSent = true; S.codeAt = Date.now();
  packet('down', 'app'); log('cl', `OTP надіслано на ${mask(S.phone)}`);
  later(() => { if(S.code === code && S.screen === 'auth') sms(`Anchor: ваш код ${code}. Нікому його не повідомляйте.`); }, 500);
}
function press(k){
  if(S.screen !== 'auth' || !S.otpSent || Date.now() < S.lockUntil || S.otp.length >= 4 && k !== '⌫' || S.checking || S.verified) return;
  sKey();
  if(k === '⌫') S.otp = S.otp.slice(0, -1); else S.otp += k;
  paintOtp();
  if(S.otp.length === 4){ S.checking = true; S.checkT = later(checkOtp, 220); }
}
function checkOtp(){
  S.checking = false;
  if(S.screen !== 'auth'){ S.otp = ''; return; }
  const box = $('#otpBoxes');
  packet('up', 'app');
  if(S.code && Date.now() - S.codeAt > 5*60000){ S.code = null; S.otp = ''; S.msg = 'Код застарів: він діє 5 хвилин. Запросіть новий.'; S.msgCls = 'err'; render(); return; }
  if(S.code && S.otp === S.code){
    sOk(); S.tries = 3; S.code = null; S.verified = true; hideSms(); render(); $('#otpBoxes').classList.add('ok');
    const m = $('#otpMsg'); if(m){ m.className = 'msg ok'; m.textContent = 'Код підтверджено'; }
    log('cl', S.authFor === 'rent' ? 'Код вірний, користувача авторизовано' : 'Код вірний, видачу підтверджено');
    S.phoneOk = true;
    later(() => { S.verified = false; if(S.screen !== 'auth') return; S.authFor === 'rent' ? goPay() : pickupConfirmed(); }, 450);
    return;
  }
  sBad(); S.tries--;
  if(S.tries <= 0){
    S.lockUntil = Date.now() + 60000; S.tries = 3; S.otp = ''; S.code = null; S.msg = ''; hideSms();
    log('cl', '3 невдалі спроби OTP: вхід заблоковано на 60 с');
    say('Забагато невдалих спроб. Зачекайте хвилину.');
    stage(S.authFor === 'pickup' ? 'pickLock' : 'lock'); render(); return;
  }
  S.msg = `Невірний код. Залишилось спроб: ${S.tries}`; S.msgCls = 'err'; S.otp = '';
  log('cl', `Невірний OTP, залишилось спроб: ${S.tries}`);
  render(); const b = $('#otpBoxes'); if(b) b.classList.add('bad');
}
function enterAuth(forWhat){
  S.authFor = forWhat; S.msg = ''; S.msgCls = ''; S.otp = ''; S.verified = false; S.checking = false;
  const locked = Date.now() < S.lockUntil;
  stage(forWhat === 'rent' ? (locked ? 'lock' : 'otp') : (locked ? 'pickLock' : 'pickOtp'));
  if(Date.now() >= S.lockUntil && (forWhat === 'pickup' || S.phoneOk)) sendOtp();
  else if(forWhat === 'rent' && !S.phoneOk) S.otpSent = false;
  go('auth');
}
function goPay(){ S.payError = false; stage('pay'); go('pay'); }
function pay(){
  if(S.paying) return;
  S.paying = true; render();
  packet('up', 'app'); log('app', `Платіж ${prepay()} грн, картка •••• ${S.card}`);
  later(() => {
    const fail = S.failFirst && S.payTries === 0;
    S.payTries++; packet('down', 'app');
    if(fail){
      S.paying = false; S.payError = true; sBad(); say('Оплата не пройшла. Спробуйте ще раз.');
      log('cl', 'Банк відхилив платіж. Слот лишається заброньованим');
      stage('payFail'); render(); return;
    }
    S.payError = false; S.paid = prepay(); sOk(); clearTimeout(S.holdT);
    if(!S.pin) S.pin = String(1000 + Math.floor(Math.random()*9000));
    if(T(S.tariff).sub) S.subActive = S.tariff;
    render(); stage('pay');
    log('cl', `${S.paid ? 'Оплату підтверджено' : 'Підписка активна'}. Команда станції: відчинити слот №${S.slot+1}`);
    log('cl', `Резервний PIN для слота №${S.slot+1} створено: на терміналі й у хмарі зберігається лише хеш`);
    later(() => packet('down', 'station'), 150);
    later(openForRent, 1100);
  }, 1400);
}
function openForRent(){
  const term = S.chan === 'term';
  if(S.slot == null || (term ? TS.scr !== 'pay' : S.screen !== 'pay')) return;
  S.paying = false; TS.paying = false;
  const k = S.slot; scrollToSlot(k);
  slots[k].st = 'open'; paintScene(); sOpen(); bubble(k, 'Відкриття'); animDoor(k, true);
  log('st', `Слот №${k+1} відчинено, підсвітка ввімкнена, лампа блимає синім`);
  say(`Слот ${k+1} відкрито. Заведіть транспорт.`);
  if(term) tgo('opened'); else go('opened');
  stage('opened', [[parkLabel(k), park]]);
  later(() => {
    if(S.stage !== 'opened' || S.slot !== k) return;
    animDoor(k, false).then(() => {
      sClose(); bubble(k, 'Закриття'); slots[k].st = 'free'; paintScene();
      log('cl', `Транспорт не заведено за 2 хв: слот №${k+1} зачинено, ${S.paid} грн повернуто`);
      S.slot = null; S.paid = 0; S.payTries = 0;
      const msg = 'Слот зачинено: транспорт не заведено за 2 хвилини. Кошти повернуто.';
      if(term){ TS = tfresh(); ttoast(msg); tRest(); trender(); }
      else { toast(msg); stage('station'); go('station'); }
    });
  }, 120000);
}
const parkLabel = k => S.transport === 'bike' ? `Повісити велосипед на гак у слоті №${k+1}` : `Завести ${VEH[S.transport].acc} у слот №${k+1}`;
function park(){
  if(S.stage !== 'opened') return;
  const k = S.slot, cx = CX(k), bike = S.transport === 'bike'; scrollToSlot(k);
  S.stage = 'parking'; $('#actions').innerHTML = `<span class="hint-none">${bike ? 'Людина вішає велосипед на гак…' : 'Людина заводить транспорт у слот…'}</span>`;
  log('us', bike ? `Вішає велосипед на гак у слоті №${k+1}` : `Котить ${VEH[S.transport].acc} до слота №${k+1}`);
  walkTo(cx + 96, 1700); moveUV(`translate(${cx}px,${GROUND}px) scale(.62)`, 1700, 1);
  later(() => {
    moveUV(`translate(${cx}px,${BOT+8}px) scale(.34)`, 900, 0);
    later(() => { slots[k].v = S.transport; paintScene(); }, 300);
    later(() => {
      log('st', bike ? 'Датчик присутності: велосипед на гаку' : 'Датчик присутності: транспорт у слоті');
      if(bike) bubble(k, 'Гак · до 20 кг', 'info', 1800);
      packet('up', 'station');
      S.parked = true; S.doorOpen = true; S.elapsed = 0; S.battery = 34; S.parkedAt = Date.now(); S.reminded = false;
      say('Транспорт у слоті. Зачиніть двері.');
      if(S.chan === 'term'){ log('term', `Сесію слота №${k+1} розпочато, статус передано в хмару`); tgo('parked'); }
      else { log('cl', 'Паркування почалося, камера слота доступна власнику'); go('session'); }
      stage('session', [[`Зачинити двері слота №${k+1}`, closeDoor]]);
    }, 1000);
  }, 1750);
}
function closeDoor(){
  if(S.stage !== 'session') return;
  const k = S.slot;
  S.stage = 'closing'; $('#actions').innerHTML = '';
  animDoor(k, false).then(() => {
    if(S.slot !== k || S.stage !== 'closing') return;
    sClose(); bubble(k, 'Закриття');
    slots[k].st = 'mine'; S.doorOpen = false; paintScene();
    later(() => { const bl = $('#bolts'+k); bl.classList.add('flash'); click(0); click(.12); click(.24); bubble(k, 'Замкнено: 3 ригелі', 'info', 1800); later(() => bl.classList.remove('flash'), 1400); }, 500);
    log('st', `Слот №${k+1}: 3 сталеві ригелі зайшли в раму`);
    packet('up', 'station');
    log('st', `Двері слота №${k+1} зачинено, лампа червона`);
    say('Слот зачинено. Транспорт у безпеці.');
    render();
    if(S.chan === 'term'){ log('term', `PUT /api/slots/${k+1} · стан «зайнято» → хмара: 200`); tgo('closed'); }
    stage('closed');
    later(() => walkTo(HOME_P, 1900), 900);
    later(() => { if(S.stage === 'closed') restStage(); }, 2900);
    if(S.scn === 'theft') scheduleTheft(4200);
    else if(S.scn === 'cam') scheduleCam(3500);
    else if(S.scn === 'dead') later(drainPhone, 3600);
    else if(S.scn === 'power') later(blackout, 3600);
  });
}
function pickupConfirmed(by){
  if(S.scn === 'bug' && !S.bugFixed && by !== 'term'){ appError(); return; }
  const k = S.slot, term = S.chan === 'term';
  S.parked = false; S.extra = S.bugFixed ? 0 : Math.max(0, costNow() - S.paid);
  if(S.extra) log('cl', `Доплата ${S.extra} грн за час понад тариф`);
  if(by !== 'sup') log('cl', `Команда станції: відчинити слот №${k+1} для видачі`);
  if(S.power === 'off') log('st', 'Світла в місті немає: замок відчиняється від акумулятора станції');
  packet('down', 'station');
  later(() => {
    slots[k].st = 'pickup'; S.doorOpen = true; paintScene(); sOpen(); bubble(k, 'Відкриття'); animDoor(k, true); scrollToSlot(k);
    log('st', `Слот №${k+1} відчинено, лампа знову зелена`);
    say(`Слот ${k+1} відкрито. Заберіть транспорт.`);
    const acts = [[S.transport === 'bike' ? 'Зняти велосипед з гака й викотити' : `Викотити ${VEH[S.transport].acc}`, take]];
    if(by === 'sup'){ stage('supOpen', acts); render(); return; }
    if(term){ tgo('pickupOpen'); if(S.screen === 'session' && !S.phoneDead) go('pickupOpen'); }
    else go('pickupOpen');
    stage('pickOpen', acts);
  }, 1000);
}
function take(){
  if(!['pickOpen','supOpen'].includes(S.stage)) return;
  const k = S.slot, cx = CX(k);
  S.stage = 'taking'; $('#actions').innerHTML = '<span class="hint-none">Людина викочує транспорт…</span>';
  log('us', `Підходить до слота №${k+1}`);
  walkTo(cx + 96, 1700);
  later(() => {
    placeUV(`translate(${cx}px,${BOT+8}px) scale(.34)`, 0);
    slots[k].v = null; paintScene();
    if(S.screen === 'pickupOpen') render();
    moveUV(`translate(${cx}px,${GROUND}px) scale(.62)`, 900, 1);
    log('us', `Викочує ${VEH[S.transport].acc}`);
    later(() => {
      walkTo(HOME_P, 1900); moveUV(HOME_UV, 1900, 1);
      log('st', 'Датчик: слот порожній');
      animDoor(k, false).then(() => {
        if(S.slot !== k || S.stage !== 'taking') return;
        sClose(); bubble(k, 'Закриття'); S.doorOpen = false;
        slots[k].st = 'free'; paintScene(); packet('up', 'station');
        log('st', `Слот №${k+1} зачинено і вільний`);
        log('cl', 'Сесію завершено, доступ до камери закрито');
        if(S.bonus) log('sup', 'Звернення #A-1042 закрито: транспорт видано');
        if(S.chan === 'term'){ tgo('done'); if(S.screen === 'pickupOpen') go('done'); } else go('done');
        stage('done');
        S.slot = k;
      });
    }, 950);
  }, 1750);
}
function releaseHold(){
  const k = S.slot;
  clearTimeout(S.holdT);
  if(k != null && slots[k].st === 'hold'){ slots[k].st = 'free'; log('cl', `Бронь слота №${k+1} скасовано`); }
  S.slot = null; paintScene();
}
function hardReset(keepSlots){
  pending.forEach(clearTimeout); pending = [];
  Object.keys(dRAF).forEach(k => cancelAnimationFrame(dRAF[k]));
  $$('.bubble.on').forEach(b => b.classList.remove('on')); $$('#spkw .spkw').forEach(p => p.classList.remove('on'));
  $('#ble').classList.remove('tx'); $('#pkts').innerHTML = ''; $('#sig2').style.opacity = ''; $('#kToast').classList.remove('on');
  resetActors();
  hideSms();
  const keep = {speed:S.speed, sound:S.sound, voice:S.voice, big:S.big, failFirst:$('#failFirst').checked, phoneOk:keepSlots ? S.phoneOk : false, phone:S.phone, scn:S.scn, lockUntil:keepSlots ? S.lockUntil : 0, subActive:keepSlots ? S.subActive : null};
  if(!keepSlots) slots = initialSlots();
  S = Object.assign(fresh(), keep);
  const p = $('#person'); p.classList.remove('walking'); p.style.transitionDuration = '0ms'; p.style.transform = `translate(${HOME_P}px,0px)`;
  placeUV(HOME_UV, 1); setUV(); setPhonePath(HOME_P);
  for(let k = 0; k < 6; k++){ dT[k] = 0; drawDoor(k); const g = document.getElementById('bk'+k); delete g.dataset.v; g.innerHTML = ''; }
  paintScene();
  if(!keepSlots) $('#log').innerHTML = '';
  boot();
}

/* ================= actions ================= */
const ACT = {
  back(){
    hideSms();
    if(S.verified) return;
    if(S.screen === 'station'){ stage('map'); go('map'); }
    else if(S.screen === 'tariff'){ releaseHold(); stage('station'); go('station'); }
    else if(S.screen === 'auth'){
      clearTimeout(S.checkT); S.checking = false; S.otp = ''; S.code = null;
      if(S.authFor === 'pickup'){ go('session'); restStage(); } else { S.otpSent = false; stage('tariff'); go('tariff'); }
    }
    else if(S.screen === 'feedback'){ stage('done'); go('done'); }
    else if(S.screen === 'handoff'){ stage('feedback'); go('feedback'); }
    else if(S.screen === 'pay' && !S.paying){ S.payError = false; stage('tariff'); go('tariff'); }
  },
  big(){ S.big = !S.big; render(); },
  voice(){ S.voice = !S.voice; render(); if(S.voice) say('Голосові підказки ввімкнено.'); else { try{ speechSynthesis.cancel(); }catch(e){} } },
  openStation(){
    packet('up', 'app'); log('app', 'Запит стану станції №14');
    later(() => { packet('up', 'station'); const n = slots.filter(s => s.st === 'free').length; log('st', `Стан слотів: вільних ${n} з 6`); }, 450);
    say('Станція 14. Оберіть зелений слот.');
    stage('station'); go('station');
  },
  transport(b){ if(S.slot != null) return; S.transport = b.dataset.t; setUV(); render(); toast(`Обрано: ${VEH[S.transport].acc}`); },
  pickSlot(b){
    if(S.screen !== 'station' || S.slot != null) return;
    const k = +b.dataset.k, sl = slots[k];
    if(sl.st !== 'free' || !compatible(k)){
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); sBad();
      toast(sl.st !== 'free' ? (['booked','hold'].includes(sl.st) ? `Слот ${k+1} уже заброньовано` : `Слот ${k+1} зайнятий`) : 'Для адаптованого велосипеда потрібен широкий слот №6');
      return;
    }
    S.slot = k; sl.st = 'hold'; render(); scrollToSlot(k);
    S.holdT = later(() => {
      if(S.slot === k && slots[k].st === 'hold' && !S.paying){
        releaseHold(); hideSms(); toast('Бронь скасовано: минуло 5 хвилин'); stage('station'); go('station');
      }
    }, 300000);
    packet('up', 'app'); log('app', `Бронювання слота №${k+1}`);
    later(() => { packet('down', 'station'); paintScene(); log('st', `Слот №${k+1}: лампа синя (бронь)`); }, 500);
    later(() => { if(S.screen === 'station' && S.slot === k){ stage('tariff'); go('tariff'); } }, 380);
  },
  tariff(b){ if(b.dataset.id === 'night' && !nightOk()){ toast('Нічний тариф доступний з 20:00 до 08:00'); return; } S.tariff = b.dataset.id; render(); },
  hours(b){ S.hours = Math.min(12, Math.max(1, S.hours + +b.dataset.d)); render(); },
  toAuth(){ enterAuth('rent'); },
  sendCode(){
    const v = $('#phoneIn').value.trim(), d = v.replace(/\D/g, '');
    if(d.length !== 12 || !d.startsWith('380')){ $('#phoneErr').textContent = 'Введіть номер у форматі +380 XX XXX XX XX'; return; }
    S.phone = '+' + d.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5'); S.phoneDraft = null; sendOtp(); render();
  },
  key(b){ press(b.dataset.k); },
  showSms(){ if(S.code) sms(`Anchor: ваш код ${S.code}. Нікому його не повідомляйте.`); else toast('Код ще не надіслано'); },
  resend(){ clearTimeout(S.checkT); S.checking = false; S.msg = 'Новий код надіслано'; S.msgCls = 'ok'; sendOtp(); render(); },
  skipLock(){ S.lockUntil = Date.now(); },
  smsFill(){
    hideSms();
    if(S.screen === 'auth' && S.code && Date.now() >= S.lockUntil && !S.checking && !S.verified){ S.otp = ''; paintOtp(); S.code.split('').forEach((c, i) => later(() => press(c), 90*i)); }
  },
  swapCard(){ S.card = S.card === '4417' ? '9032' : '4417'; render(); },
  pay(){ pay(); },
  pickup(){ if(camBusy()){ toast('Зачекайте: станція відбиває атаку на камери'); return; } if(theftBusy()){ toast('Зачекайте: триває реагування охорони'); return; } if(S.bleBusy || S.doorOpen) return; S.chan = 'app'; S.theft = S.theft === 'scheduled' ? 'none' : S.theft; log('app', 'Запит на видачу транспорту'); enterAuth('pickup'); },
  extend(){ S.hours++; S.paid += 20; S.reminded = false; log('app', `Оренду продовжено до ${S.hours} год, списано 20 грн`); toast(`Продовжено: ${S.hours} год`); render(); },
  again(){ hardReset(true); },
  toFeedback(){ S.fbErr = {}; stage('feedback'); go('feedback'); },
  fbStar(b){ S.fb.rating = +b.dataset.n; delete S.fbErr.rating; render(); const nb = $(`[data-act="fbStar"][data-n="${b.dataset.n}"]`); if(nb) nb.focus({preventScroll:true}); },
  fbNeed(b){ S.fb.need = b.dataset.v === '1'; delete S.fbErr.need; render(); const nb = $(`[data-act="fbNeed"][data-v="${b.dataset.v}"]`); if(nb) nb.focus({preventScroll:true}); },
  openFbTab(){ showTab('fb'); },
  formOpened(){ S.fbOpened = true; log('app', 'Відкрито Google Форму з відповідями'); later(render, 300); },
  speed(b){ S.speed = +b.dataset.x; $$('[data-act="speed"]').forEach(x => x.setAttribute('aria-pressed', x === b)); },
  reset(){ hardReset(false); },
  scn(b){ S.scn = b.dataset.s; hardReset(false); },
  dev(b){ setDev(b.dataset.d); trender(); },
  rules(){ openRules(); },
  rulesClose(){ const d = $('#rulesDlg'); try{ d.close(); }catch(e){ d.removeAttribute('open'); } },
  toSec(b){ const el = document.getElementById(b.dataset.id); if(el) el.scrollIntoView({behavior: REDUCED ? 'auto' : 'smooth', block:'start'}); },
  pinShow(){ S.pinShow = !S.pinShow; render(); },
  bleOpen(){ bleOpenNow(); },
  bleClose(){ bleCloseNow(); },
  bugRetry(){ bugRetryNow(); },
  support(){ startSupport(); },
  chatCard(){ chatCardNow(); },
};
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if(tab){
    $$('.tab').forEach(t => t.setAttribute('aria-selected', t === tab));
    showTab(tab.dataset.tab);
    return;
  }
  const b = e.target.closest('[data-act]'); if(!b || b.disabled) return;
  ctx(); const f = ACT[b.dataset.act]; if(f) f(b, e);
});
document.addEventListener('input', e => {
  if(e.target.id === 'fbWish'){ S.fb.wish = e.target.value.slice(0, 500); $('#fbCnt').textContent = S.fb.wish.length + ' / 500'; }
  if(e.target.dataset && e.target.dataset.rid){ respDraft[e.target.dataset.rid] = e.target.value; const n = respNote[e.target.dataset.rid]; if(n && !n.err) delete respNote[e.target.dataset.rid]; }
});
document.addEventListener('submit', e => {
  if(e.target.id === 'fbForm'){ e.preventDefault(); submitFeedback(); }
});
document.addEventListener('change', e => {
  if(e.target.id === 'failFirst') S.failFirst = e.target.checked;
  if(e.target.id === 'soundOn'){ S.sound = e.target.checked; if(!S.sound) sirenOff(); }
});
document.addEventListener('keydown', e => {
  if(e.target.id === 'phoneIn'){ if(e.key === 'Enter') ACT.sendCode(); return; }
  if(e.target.id === 'tPhoneIn'){ if(e.key === 'Enter') ACT.tPhoneNext(); return; }
  if(e.target.dataset && e.target.dataset.act === 'fbStar' && /^Arrow/.test(e.key)){
    e.preventDefault(); const n = Math.min(5, Math.max(1, (S.fb.rating || 1) + (/Right|Up/.test(e.key) ? 1 : -1)));
    ACT.fbStar({dataset:{n:String(n)}}); return;
  }
  if(S.dev === 'term'){
    if(['pin','pickPin'].includes(TS.scr) && !e.target.closest('input,textarea,dialog')){ if(/^[0-9]$/.test(e.key)) termKey(e.key); else if(e.key === 'Backspace') termKey('⌫'); }
    return;
  }
  if(S.screen === 'auth' && S.otpSent && !e.target.closest('input,textarea')){
    if(/^[0-9]$/.test(e.key)) press(e.key); else if(e.key === 'Backspace') press('⌫');
  }
});

/* ================= live clock ================= */
function updateLive(){
  const tm = $('#timer'); if(!tm) return;
  tm.textContent = fmt(S.elapsed);
  const info = $('#tinfo'), c = costNow();
  if(S.tariff === 'once') info.textContent = c > S.paid ? `Сплачено ${S.paid} грн · доплата ${c - S.paid} грн при забиранні` : `Сплачено ${S.paid} грн за ${S.hours} год · залишилось ${fmt(Math.max(0, S.hours*3.6e6 - S.elapsed))}`;
  else if(S.tariff === 'day'){ const left = 10*3.6e6 - S.elapsed; info.textContent = left > 0 ? `До кінця тарифу: ${fmt(left)}` : `Понад 10 год: доплата ${c - 75} грн за тарифом «Разовий»`; }
  else if(S.tariff === 'night') info.textContent = 'Фіксовано 55 грн · до 08:00';
  else info.textContent = `Включено в підписку «${T(S.tariff).name}»`;
  const ct = $('#camTime'); if(ct) ct.textContent = new Date().toTimeString().slice(0,8);
  const pct = Math.floor(S.battery), cp = $('#chgPct'), cb = $('#chgBar');
  if(cp){ cp.textContent = pct >= 100 ? 'Заряджено' : pct + '%'; cb.style.width = pct + '%'; }
}
let last = performance.now();
setInterval(() => {
  const now = performance.now(), dt = now - last; last = now;
  if(S.parked){
    S.elapsed += dt*S.speed;
    const sl = slots[S.slot];
    if(sl && sl.charge && VEH[S.transport].electric && S.power !== 'off') S.battery = Math.min(100, S.battery + dt*S.speed/(3*60000));
    if(S.screen === 'session') updateLive();
    const end = tariffEnd();
    if(!S.reminded && end != null && end - S.elapsed <= 30*60000) remind();
    const rl = $('#remLeft'); if(rl && end != null) rl.textContent = end - S.elapsed > 0 ? fmt(end - S.elapsed) : 'тариф закінчився';
  }
  if(S.lockUntil){
    if(Date.now() >= S.lockUntil){
      S.lockUntil = 0; log('cl', 'Блокування знято');
      if(S.screen === 'auth'){ S.msg = 'Блокування знято. Ми надіслали новий код.'; S.msgCls = 'ok'; stage(S.authFor === 'rent' ? 'otp' : 'pickOtp'); if(S.authFor === 'pickup' || S.otpSent || S.phoneOk) sendOtp(); render(); }
    } else { const lc = $('#lockClock'); if(lc) lc.textContent = lockText(); }
  }
  if(S.power === 'off'){ S.stBat = Math.max(15, S.stBat - dt*S.speed*2.7/3.6e6); paintPwr(); const sb = $('#stBatT'); if(sb) sb.textContent = Math.round(S.stBat) + '%'; }
  if(S.pinLock){
    if(Date.now() >= S.pinLock){ S.pinLock = 0; log('term', 'Блокування PIN знято'); if(TS.scr === 'pickPin'){ if(!TS.cardMode) stage('tPickPin'); trender(); } }
    else { const lc = $('#tLockClock'); if(lc) lc.textContent = mmss(S.pinLock - Date.now()); }
  }
  if(S.bleUntil){ const bl = $('#bleLeft'); if(bl) bl.textContent = mmss(S.bleUntil - Date.now()); }
  const kc = $('#kClock'); if(kc) kc.textContent = kTime();
  const d = new Date(); $('#clock').textContent = d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0');
}, 250);

/* ================= reminder 30 min before the tariff ends ================= */
function tariffEnd(){
  const t = S.tariff;
  if(t === 'once') return S.hours*3.6e6;
  if(t === 'day') return 10*3.6e6;
  const st = new Date(S.parkedAt || Date.now()), e = new Date(st);
  if(t === 'night'){ e.setHours(8,0,0,0); if(e <= st) e.setDate(e.getDate() + 1); return e - st; }
  if(t === 'pro'){ e.setHours(22,0,0,0); return e > st ? e - st : null; }
  return null;
}
const REM_HINT = {once:'Продовжіть оренду в застосунку або заберіть транспорт.', day:'Далі кожна година за тарифом «Разовий», 20 грн.', night:'Заберіть транспорт до 08:00.', pro:'Заберіть транспорт до 22:00.'};
function remind(){
  S.reminded = true;
  const name = T(S.tariff).name;
  if(S.scn === 'term'){ log('cl', S.termPhone ? `SMS-нагадування на ${mask(S.termPhone)}: до кінця тарифу «${name}» 30 хв` : `До кінця тарифу «${name}» 30 хв: номер не вказано, нагадування не надіслано`); return; }
  log('cl', `Нагадування власнику: до кінця тарифу «${name}» 30 хв`);
  packet('down', 'app');
  push(`До кінця тарифу «${name}» 30 хвилин. ${REM_HINT[S.tariff]}`, 'warn');
  say('До кінця тарифу тридцять хвилин.');
  if(S.screen === 'session') render();
}
function remindBox(){
  if(!S.reminded || S.doorOpen) return '';
  const end = tariffEnd(); if(end == null) return '';
  return `<div class="warnbox" role="status"><div><b>Тариф «${T(S.tariff).name}» закінчується</b> · залишилось <b id="remLeft" style="font-family:var(--font-mono)">${fmt(Math.max(0, end - S.elapsed))}</b></div>
    <div>${REM_HINT[S.tariff]}</div>
    ${S.tariff === 'once' ? '<button class="btn" data-act="extend">Продовжити на 1 год · 20 грн</button>' : ''}</div>`;
}

/* ================= camera attack simulation ================= */
const camBusy = () => ['scan','token','jam'].includes(S.cam);
function camBox(){
  if(S.cam === 'none' || S.cam === 'scheduled') return '';
  if(S.cam === 'done') return `<div class="note" role="status"><b>Атаку на камери відбито.</b> Відео не потрапило стороннім, звіт надіслано вам.</div>`;
  const at = ['scan','token','jam'].indexOf(S.cam);
  const steps = ['Сканування з інтернету: камера не має публічної IP', 'Старе посилання на відео: токен прострочений', 'Глушіння LTE: резерв NB-IoT, запис локально'];
  return `<div class="warnbox" role="status"><b>Спроба доступу до камер</b><ol class="tl">${steps.map((l, i) => `<li class="${at >= i ? 'on' : ''}"><i>${at >= i ? 'блок' : '—'}</i>${l}</li>`).join('')}</ol></div>`;
}
function atkPacket(){
  const path = $('#sigX'), L = path.getTotalLength(), dot = document.createElementNS(NS, 'circle');
  dot.setAttribute('r', 6); dot.setAttribute('class', 'pkt atk'); $('#pkts').appendChild(dot);
  const t0 = performance.now(), D = 900;
  (function f(now){
    const p = Math.min(1, (now - t0)/D), pt = path.getPointAtLength(p*L);
    dot.setAttribute('cx', pt.x); dot.setAttribute('cy', pt.y);
    if(p < 1) requestAnimationFrame(f);
    else { dot.remove(); const sh = $('#shield'); sh.classList.add('on'); tone(520,0,.1,'square',.06); tone(390,.12,.14,'square',.06); setTimeout(() => sh.classList.remove('on'), 700); }
  })(t0);
}
function cStep(phase, cap){ S.cam = phase; stage(cap); if(S.screen === 'session') render(); trender(); }
function scheduleCam(ms){
  S.cam = 'scheduled';
  later(() => { if(S.cam === 'scheduled' && ['closed','thDone'].includes(S.stage) && S.slot != null && slots[S.slot].v) startCam(); }, ms);
}
function startCam(){
  const k = S.slot;
  $('#sigX').classList.add('on');
  cStep('scan', 'caScan'); atkPacket(); later(atkPacket, 700); later(atkPacket, 1400);
  log('cl', `Спроба підключення до камери слота №${k+1} з інтернету: відхилено, камери не мають публічної IP`);
  later(() => {
    cStep('token', 'caToken'); atkPacket();
    log('cl', 'Запит відео за старим посиланням: токен прострочений, доступ лише власнику активної сесії');
    later(() => {
      $('#sigX').classList.remove('on');
      cStep('jam', 'caJam'); $('#sig').classList.add('jam'); $('#sigNb').classList.add('on'); $('#nbLabel').classList.add('on');
      log('st', 'Основний канал LTE заглушено: тривоги йдуть резервним NB-IoT, відео пишеться в зашифроване сховище модуля');
      packet('up', 'station');
      push(`Спробу доступу до камери слота №${k+1} заблоковано. Відео захищене, транспорт на місці.`, 'warn'); $('#smsIc').textContent = '✓';
      later(() => {
        $('#sig').classList.remove('jam'); $('#sigNb').classList.remove('on'); $('#nbLabel').classList.remove('on');
        log('st', 'Зв’язок LTE відновлено, локальний запис синхронізовано з хмарою');
        cStep('done', 'caDone');
      }, 3600);
    }, 2800);
  }, 2600);
}

/* ================= break-in attempt simulation (a drunk with a bottle) ================= */
const theftLive = () => ['alarm','call','arrive'].includes(S.theft);
const theftBusy = () => !['none','scheduled','done'].includes(S.theft);
let siren = null;
function sirenOn(){
  const c = ctx(); if(!c || !S.sound || siren) return;
  const o = c.createOscillator(), l = c.createOscillator(), lg = c.createGain(), f = c.createBiquadFilter(), g = c.createGain();
  o.type = 'sawtooth'; o.frequency.value = 920; l.frequency.value = 1.7; lg.gain.value = 320;
  f.type = 'lowpass'; f.frequency.value = 2400; g.gain.value = .045;
  l.connect(lg); lg.connect(o.frequency); o.connect(f); f.connect(g); g.connect(c.destination);
  o.start(); l.start(); siren = {o, l, g};
}
function sirenOff(){
  if(!siren || !ac) { siren = null; return; }
  try{ const t = ac.currentTime; siren.g.gain.setTargetAtTime(0, t, .05); siren.o.stop(t + .3); siren.l.stop(t + .3); }catch(e){}
  siren = null;
}
const sPunch = () => noise(0, .08, .9, 520);
const sKick = () => { noise(0, .12, 1, 340); tone(85, 0, .16, 'sine', .25, 50); };
const sGulp = () => { tone(190,0,.12,'sine',.15,110); tone(175,.25,.12,'sine',.15,100); tone(165,.5,.14,'sine',.15,95); };
const sHic = () => tone(320, 0, .14, 'triangle', .14, 760);
const sGlass = () => { noise(0,.1,.8,5000); tone(2600,0,.16,'triangle',.08); tone(3400,.05,.2,'triangle',.06); tone(2900,.13,.25,'triangle',.05); tone(4100,.22,.2,'sine',.04); };
function actorTo(el, x, ms, flip, opacity){
  ms = REDUCED ? 1 : ms;
  el.classList.add('walking'); el.style.transitionDuration = ms + 'ms';
  el.style.transform = `translate(${x}px,0px)${flip ? ' scale(-1,1)' : ''}`;
  if(opacity != null) el.style.opacity = opacity;
  later(() => el.classList.remove('walking'), ms);
}
function place(el, x, flip, opacity){
  el.style.transitionDuration = '0ms'; el.style.transform = `translate(${x}px,0px)${flip ? ' scale(-1,1)' : ''}`;
  if(opacity != null) el.style.opacity = opacity; void el.getBBox();
}
let swearT = null, swearH = null;
function swear(x, lines, kind, ms){
  const g = $('#swear'); clearInterval(swearT); clearTimeout(swearH);
  g.style.transform = `translate(${x}px,0px)`; g.setAttribute('class', 'on' + (kind ? ' ' + kind : ''));
  let i = 0; $('#swearT').textContent = lines[0];
  if(lines.length > 1){ swearT = setInterval(() => { i = (i + 1) % lines.length; $('#swearT').textContent = lines[i]; }, 420); pending.push(swearT); }
  if(ms) swearH = later(() => { clearInterval(swearT); g.setAttribute('class', ''); }, ms);
}
const swearOff = () => { clearInterval(swearT); clearTimeout(swearH); $('#swear').setAttribute('class', ''); };
const CURSE = ['#@$%!', '*&%#!!', '@#$&*!', '%$#@!!', '★#@!*'];
const DRUNK_CLS = ['prying','drinking','punching','kicking','smashing','holding','walking'];
function resetActors(){
  sirenOff(); swearOff();
  ['sigX','sigNb','nbLabel','shield'].forEach(id => $('#'+id).classList.remove('on')); $('#sig').classList.remove('jam');
  $('#scene').classList.remove('blackout');
  const th = $('#thief'); if(!th) return;
  th.classList.remove(...DRUNK_CLS); place(th, -90, false, 1);
  $('#dBottle').style.display = ''; $('#dRose').style.display = 'none'; $('#droppedRose').style.display = 'none';
  $('#shards').classList.remove('on');
  ['guard1','guard2'].forEach(id => { const g = $('#'+id); g.classList.remove('walking'); place(g, 1100, false, 0); });
  place($('#car'), 1150, false, 1);
  $('#spkw').classList.remove('siren');
  for(let k = 0; k < 6; k++){ $('#al'+k).classList.remove('on'); $('#dr'+k).classList.remove('shaking'); const b = $('#bub'+k); b.setAttribute('class','bubble'); }
}
function scheduleTheft(ms){
  S.theft = 'scheduled';
  later(() => { if(S.theft === 'scheduled' && S.stage === 'closed' && S.slot != null && slots[S.slot].v) startTheft(); }, ms);
}
const T_ORDER = ['approach','drink','punch','kick','pry','smash','alarm','call','arrive','take'];
function theftBox(){
  if(S.theft === 'none' || S.theft === 'scheduled') return '';
  if(S.theft === 'done') return `<div class="note" role="status"><b>Інцидент закрито.</b> Охорона затримала порушника, слот цілий, ${VEH[S.transport].acc} на місці.</div>`;
  const at = T_ORDER.indexOf(S.theft);
  const steps = [['00:00','Удари, монтувалка, розбите скло: сирена', 6], ['00:01','Тривогу передано охороні й вам', 7], ['03:40','Охорона на місці', 8], ['04:30','Порушника затримано', 9]];
  return `<div class="crit" role="alert"><b>${at < 6 ? 'Рух і удари біля' : 'Спроба злому'} слота №${S.slot+1}</b>
    <ol class="tl">${steps.map(([t, l, i]) => `<li class="${at >= i ? 'on' : ''}"><i>${at >= i ? t : '—'}</i>${l}</li>`).join('')}</ol>
    <span style="color:var(--muted);font-size:.85em">${at < 6 ? 'Камера бачить людину біля дверей' : 'Час події в симуляції прискорено'}</span></div>`;
}
function tStep(phase, cap){ S.theft = phase; stage(cap); if(S.screen === 'session') render(); }
function startTheft(){
  const k = S.slot, dx = doorX(k), right = k % 2 === 0;
  const tx = right ? dx + DW + 18 : dx - 18, flip = !right, dir = right ? -1 : 1;
  const th = $('#thief'), dr = $('#dr'+k), cloudX = tx + dir*-6;
  scrollToSlot(k);
  tStep('approach', 'thApproach');
  log('st', `Камера слота №${k+1}: до станції підходить людина`);
  place(th, -90, false, 1);
  const walkMs = Math.abs(tx + 90)*5;
  actorTo(th, tx, walkMs, true);
  later(() => swear(Math.min(tx, 300), ['Гик!'], 'calm', 1100), walkMs*0.45);
  later(() => {
    place(th, tx, flip);
    // 1. drink
    tStep('drink', 'thDrink'); th.classList.add('drinking'); sGulp();
    later(() => { th.classList.remove('drinking'); sHic(); swear(cloudX, ['Гик!'], 'calm', 1000); }, 2050);
    // 2. punch
    later(() => {
      tStep('punch', 'thPunch'); th.classList.add('punching'); dr.classList.add('shaking');
      bubble(k, 'Зазор < 1 мм', 'info', 2400);
      log('st', `Датчик вібрації слота №${k+1}: удари по дверях, замок тримає`);
      swear(cloudX, CURSE, null);
      const hits = setInterval(sPunch, 400); pending.push(hits);
      // 3. kick
      later(() => {
        clearInterval(hits); th.classList.remove('punching'); th.classList.add('kicking');
        tStep('kick', 'thKick'); log('st', `Датчик вібрації слота №${k+1}: сильні удари ногами`);
        const kicks = setInterval(sKick, 640); pending.push(kicks);
        // 4. crowbar: nothing to grip, bolts hold, speaker warns
        later(() => {
          clearInterval(kicks); th.classList.remove('kicking');
          tStep('pry', 'thPry'); th.classList.add('prying');
          bubble(k, '3 ригелі · зазор < 1 мм', 'info', 2600);
          const bl = $('#bolts'+k); bl.classList.add('flash');
          tone(240,0,.5,'sawtooth',.03); tone(190,.7,.5,'sawtooth',.03); tone(880,1.2,.12,'square',.07); tone(880,1.4,.12,'square',.07);
          log('st', `Датчик дверей слота №${k+1}: спроба віджиму, ригелі тримають. Попередження з динаміка`);
          swear(cloudX, ['#@$%!', 'Шо за ...!', '*&%#!!'], null);
          say('Увага! Відійдіть від станції.');
          later(() => {
          th.classList.remove('prying'); bl.classList.remove('flash'); dr.classList.remove('shaking');
          tStep('smash', 'thSmash'); th.classList.add('smashing');
          later(() => {
            sGlass(); $('#dBottle').style.display = 'none'; $('#dRose').style.display = '';
            const sh = $('#shards'); sh.setAttribute('transform', `translate(${tx + dir*-26},${right ? 404 : 404})`); sh.classList.remove('on'); void sh.getBBox(); sh.classList.add('on');
            th.classList.remove('smashing'); th.classList.add('holding'); swear(cloudX, ['@#$%&*!!!', '#@!*%$!!'], null);
            log('st', `Датчик удару модуля №${Math.floor(k/2)+1}: розбите скло`);
            // 5. alarm
            later(() => {
              slots[k].st = 'alarm'; paintScene();
              $('#al'+k).classList.add('on'); $('#spkw').classList.add('siren'); sirenOn(); dr.classList.add('shaking');
              bubble(k, '⚠ ТРИВОГА', 'crit', 0);
              log('st', `ТРИВОГА: злам слота №${k+1}, сирена і стробоскоп`);
              packet('up', 'station'); $$('#pkts .pkt').forEach(d => d.classList.add('alarm'));
              tStep('alarm', 'thAlarm'); swear(cloudX, ['?!#@', '!!!#@?'], null);
              say('Увага! Спроба злому слота. Охорону викликано.');
              later(() => {
                dr.classList.remove('shaking');
                log('cl', 'КРИТИЧНО: тривогу передано службі охорони і власнику');
                packet('down', 'app'); $$('#pkts .pkt').forEach(d => d.classList.add('alarm'));
                push(`Спроба злому слота №${k+1}. Охорону викликано, екіпаж уже їде. Дивіться камеру в застосунку.`, 'crit');
                tStep('call', 'thCall'); swear(cloudX, CURSE, null);
                // 6. security arrives
                later(() => {
                  const car = $('#car'), carX = Math.max(120, Math.min(880, tx - dir*70));
                  actorTo(car, carX, 2600, false);
                  later(() => {
                    car.classList.remove('walking');
                    tStep('arrive', 'thArrive'); log('cl', 'Охорона на місці. Слот не зламано');
                    const g1 = $('#guard1'), g2 = $('#guard2');
                    place(g1, carX - 20, false, 1); place(g2, carX + 20, false, 1);
                    actorTo(g1, tx + dir*34, 1300, !right); actorTo(g2, tx - dir*34, 1300, right);
                    swear(cloudX, ['Шо?!', '#@?!'], null);
                    // 7. pack him
                    later(() => {
                      slots[k].st = 'mine'; paintScene();
                      sirenOff(); $('#spkw').classList.remove('siren'); $('#al'+k).classList.remove('on'); $('#bub'+k).setAttribute('class', 'bubble');
                      th.classList.remove('holding'); $('#dRose').style.display = 'none';
                      const drp = $('#droppedRose'); drp.setAttribute('transform', `translate(${tx - 18},0)`); drp.style.display = '';
                      swear(cloudX, ['✦ ★ ✦', '★ ✦ ★'], 'stars');
                      log('cl', 'Охорона затримала порушника, сирену вимкнено');
                      tStep('take', 'thTake'); say('Порушника затримано. Транспорт на місці.');
                      later(() => {
                        swearOff();
                        const back = carX < tx;
                        actorTo(th, carX, 1500, back); actorTo(g1, carX - 12, 1500, back); actorTo(g2, carX + 12, 1500, back);
                        later(() => {
                          [th, g1, g2].forEach(el => { el.style.transitionDuration = '300ms'; el.style.opacity = 0; });
                          later(() => {
                            actorTo(car, -260, 2600, false);
                            later(() => {
                              place(car, 1150, false, 1); place(th, -90, false, 1);
                              $('#dBottle').style.display = ''; $('#droppedRose').style.display = 'none'; $('#shards').classList.remove('on');
                              log('cl', 'Інцидент закрито, звіт і запис камери надіслано власнику');
                              push(`Інцидент закрито: слот №${k+1} цілий, транспорт на місці.`, 'warn');
                              $('#smsIc').textContent = '✓';
                              tStep('done', 'thDone');
                            }, 2600);
                          }, 350);
                        }, 1550);
                      }, 2200);
                    }, 1350);
                  }, 2650);
                }, 1500);
              }, 1300);
            }, 1300);
          }, 450);
          }, 2700);
        }, 2400);
      }, 2400);
    }, 2400);
  }, walkMs + 50);
}

/* ================= scenarios and the right-hand device ================= */
const SCN = {
  main:  'Оренда і забирання через застосунок. Після паркування можна підійти до слота й відчинити його поруч через Bluetooth, не завершуючи сесію.',
  term:  'У людини немає застосунку: вона обирає слот, задає PIN і платить карткою на терміналі станції, а потім забирає транспорт за номером слота і PIN.',
  dead:  'Оренда через застосунок, а поки транспорт у слоті, телефон розряджається. Забрати транспорт допомагає термінал: номер слота і резервний PIN.',
  power: 'Після паркування в місті зникає світло. Станція переходить на власний акумулятор і сонячну панель і працює далі.',
  bug:   'Під час видачі застосунок показує тимчасову помилку. Підтримка в чаті перевіряє власника і відчиняє слот дистанційно.',
  theft: 'Після паркування до станції підходить нетверезий «гість» і пробує зламати слот. Вмикається сигналізація, приїздить охорона.',
  cam:   'Після паркування хтось пробує дістатися до камер слота з інтернету і глушить зв’язок.',
};
function paintScn(){
  $$('[data-act="scn"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.s === S.scn));
  $('#scnDesc').textContent = SCN[S.scn];
}
function setDev(d){
  S.dev = d;
  $$('.dev button').forEach(b => b.setAttribute('aria-pressed', b.dataset.d === d));
  $('#phoneWrap').hidden = d !== 'app'; $('#kiosk').hidden = d !== 'term';
  const g = $('#termGlow'); if(g) g.classList.toggle('on', d === 'term');
}
function paintBat(){
  const f = $('#batFill'); if(!f) return;
  f.setAttribute('width', (16*S.phoneBat/100).toFixed(1)); f.setAttribute('fill', S.phoneBat < 15 ? '#E5322B' : 'currentColor');
}
function paintPhoneOff(){
  const el = $('#phoneOff');
  if(S.phoneDead){
    el.className = 'phone-off';
    el.innerHTML = '<svg viewBox="0 0 64 34" aria-hidden="true"><rect x="2" y="2" width="54" height="30" rx="6" fill="none" stroke="#9AA3AD" stroke-width="3"/><rect x="58" y="11" width="4" height="12" rx="2" fill="#9AA3AD"/><rect x="7" y="7" width="5" height="20" rx="2" fill="#E5322B"/></svg><b>Телефон розрядився</b><span>Застосунок і SMS недоступні</span>';
    el.hidden = false;
  } else if(S.scn === 'term'){
    el.className = 'phone-off noapp';
    el.innerHTML = '<b>Застосунку Anchor немає</b><span>У цьому сценарії людина користується лише терміналом на стійці станції</span><button class="btn" data-act="dev" data-d="term">Показати термінал</button>';
    el.hidden = false;
  } else { el.hidden = true; el.innerHTML = ''; }
}
const mmss = ms => { const s = Math.max(0, Math.ceil(ms/1000)); return Math.floor(s/60) + ':' + String(s%60).padStart(2,'0'); };
function openRules(){ const d = $('#rulesDlg'); try{ d.showModal(); }catch(e){ d.setAttribute('open', ''); } }
$('#rulesDlg').addEventListener('click', e => { if(e.target.id === 'rulesDlg') ACT.rulesClose(); });

/* ================= open / close the slot nearby over Bluetooth, without ending the session ================= */
const bleOk = () => ['main','power'].includes(S.scn) && S.chan === 'app' && !S.phoneDead;
const near = () => S.slot != null && Math.abs((S.px ?? HOME_P) - CX(S.slot)) <= 200;   /* 40 px ≈ 1 m, BLE range 5 m */
const distM = () => S.slot == null ? 0 : Math.max(1, Math.round(Math.abs((S.px ?? HOME_P) - CX(S.slot))/40));
function closedActs(){
  if(!bleOk() || !S.parked || S.doorOpen) return [];
  return near() ? [['Відійти від станції', walkAway]] : [[`Підійти до слота №${S.slot+1}`, walkNear]];
}
function walkNear(){
  const k = S.slot; if(k == null) return;
  $('#actions').innerHTML = '<span class="hint-none">Людина йде до слота…</span>';
  scrollToSlot(k); walkTo(CX(k) + 96, 1700); log('us', `Підходить до слота №${k+1}`);
  later(restStage, 1750);
}
function walkAway(){ $('#actions').innerHTML = '<span class="hint-none">Людина відходить…</span>'; walkTo(HOME_P, 1800); later(restStage, 1850); }
/* the caption while the vehicle sits locked in the slot */
function restStage(){
  if(!S.parked || S.doorOpen || S.phoneDead) return;
  const acts = closedActs();
  if(S.power === 'off') stage('pwOff', [['Світло повернулося', powerBack], ...acts]);
  else stage(acts.length && near() ? 'bleNear' : 'closed', acts);
  if(S.screen === 'session') render();
}
function accBox(){
  if(!S.pin) return '';
  let ble = '';
  if(bleOk() && !theftBusy() && !camBusy()){
    ble = `<div class="acc-r"><span>${IC.ble} Поруч через Bluetooth</span><b>${S.bleUntil ? 'відчинено' : '≈' + distM() + ' м'}</b></div>` + (
      S.bleUntil ? `<p class="sub">Слот відчинено поруч, сесія триває. Зачиниться сам через <b id="bleLeft">${mmss(S.bleUntil - Date.now())}</b></p><button class="btn dark" data-act="bleClose">Зачинити слот</button>`
      : near() ? `<button class="btn" data-act="bleOpen" ${S.bleBusy ? 'disabled' : ''}>${S.bleBusy ? '<span class="spin"></span> Отримуємо ключ' : 'Відчинити слот поруч'}</button><p class="fine">Сесія не завершиться: можна дістати шолом чи речі</p>`
      : '<p class="sub">Підійдіть до слота ближче ніж на 5 м, і його можна буде відчинити без коду, не завершуючи сесію.</p>');
  }
  return `<div class="acc">${ble}<div class="acc-r"><span>PIN для термінала</span><button class="linkbtn" data-act="pinShow" aria-label="${S.pinShow ? 'Сховати PIN' : 'Показати PIN'}">${S.pinShow ? `<span class="pinv">${S.pin}</span>` : '•••• показати'}</button></div></div>`;
}
function bleOpenNow(){
  if(!bleOk() || !S.parked || S.doorOpen || !near() || S.bleBusy) return;
  const k = S.slot; S.bleBusy = true; render();
  packet('up', 'app'); log('app', `Bluetooth: телефон за ${distM()} м від слота №${k+1}, запит на тимчасове відчинення`);
  later(() => { packet('down', 'app'); log('cl', 'Хмара видала одноразовий ключ Bluetooth на 30 с'); }, 500);
  later(() => {
    const b = $('#ble'); b.classList.remove('tx'); void b.getBBox(); b.classList.add('tx');
    S.bleBusy = false; slots[k].st = 'open'; S.doorOpen = true; S.bleUntil = Date.now() + 120000;
    paintScene(); sOpen(); bubble(k, 'Відкриття'); animDoor(k, true);
    log('st', `Слот №${k+1} відчинено поруч через Bluetooth, сесія триває`);
    say(`Слот ${k+1} відкрито.`);
    stage('bleOpen', [[`Зачинити двері слота №${k+1}`, bleCloseNow]]); render();
    S.bleT = later(() => { if(S.stage === 'bleOpen'){ log('st', 'Двері не зачинили за 2 хв: слот зачиняється сам'); bleCloseNow(); } }, 120000);
  }, 1100);
}
function bleCloseNow(){
  if(S.stage !== 'bleOpen') return;
  const k = S.slot; S.stage = 'bleClosing'; $('#actions').innerHTML = ''; clearTimeout(S.bleT);
  animDoor(k, false).then(() => {
    if(S.slot !== k) return;
    sClose(); bubble(k, 'Закриття'); slots[k].st = 'mine'; S.doorOpen = false; S.bleUntil = 0; paintScene();
    later(() => { const bl = $('#bolts'+k); bl.classList.add('flash'); click(0); click(.12); click(.24); later(() => bl.classList.remove('flash'), 1400); }, 400);
    log('st', `Слот №${k+1} зачинено, 3 ригелі замкнено`); packet('up', 'station');
    restStage(); render();
  });
}

/* ================= city power cut: the station runs on its own battery ================= */
function paintPwr(){ const t = $('#pwrT'); if(t) t.textContent = `⚡ Акумулятор ${Math.round(S.stBat)}% · ~${Math.max(1, Math.round(S.stBat/2.7))} год`; }
function blackout(){
  if(S.scn !== 'power' || !S.parked || S.power === 'off') return;
  S.power = 'off'; $('#scene').classList.add('blackout'); paintPwr();
  noise(0, .3, .5, 200); tone(110, 0, .5, 'sine', .12, 60);
  log('st', 'Зовнішнє живлення зникло: станція перейшла на акумулятор 96%, вистачить приблизно на 36 год');
  log('st', 'Замки, лампи, камери, термінал і зв’язок працюють. Зарядку транспорту призупинено');
  packet('up', 'station');
  later(() => { packet('down', 'app'); push('Біля станції зникло світло. Станція працює від власного акумулятора: ваш транспорт під замком і під камерою.', 'warn'); $('#smsIc').textContent = '⚡'; $('#smsFrom').textContent = 'Anchor · живлення'; }, 700);
  if(['closed','bleNear'].includes(S.stage)) restStage(); else if(S.screen === 'session') render();
  trender();
}
function powerBack(){
  if(S.power !== 'off') return;
  S.power = 'on'; $('#scene').classList.remove('blackout');
  log('st', `Зовнішнє живлення повернулося: акумулятор (${Math.round(S.stBat)}%) заряджається, зарядку транспорту відновлено`);
  packet('up', 'station'); toast('Світло повернулося');
  restStage(); trender();
}

/* ================= the phone dies while the vehicle is parked ================= */
function drainPhone(){
  if(S.scn !== 'dead' || !S.parked || S.phoneDead) return;
  S.phoneBat = 6; paintBat();
  push(`Заряд телефону 5%. Якщо телефон вимкнеться, заберіть транспорт на терміналі станції: слот №${S.slot+1} і резервний PIN.`, 'warn');
  $('#smsIc').textContent = '5%'; $('#smsFrom').textContent = 'Anchor · заряд телефону';
  stage('deadLow');
  later(() => { S.phoneBat = 2; paintBat(); }, 1800);
  later(() => {
    hideSms(); S.phoneBat = 0; S.phoneDead = true; paintBat(); paintPhoneOff();
    log('us', 'Телефон розрядився: застосунок і SMS недоступні');
    stage('deadPhone', [['Підійти до термінала станції', deadToTerm]]);
  }, 4200);
}
function deadToTerm(){
  if(S.stage !== 'deadPhone') return;
  S.chan = 'term'; TS = tfresh(); setDev('term'); trender();
  toTerm(false); log('us', 'Підходить до термінала на стійці модуля 1');
  stage('deadTerm');
}

/* ================= temporary app error at pickup, solved by support ================= */
function appError(){
  S.bugTries = 0; S.bugBusy = false;
  log('app', `Помилка ANC-503: сервіс видачі не відповів, слот №${S.slot+1} лишився зачиненим`);
  sBad(); say('Не вдалося відчинити слот.');
  stage('bugErr'); go('appErr');
}
function bugRetryNow(){
  if(S.bugBusy || S.screen !== 'appErr') return;
  S.bugBusy = true; render(); packet('up', 'app'); log('app', 'Повторна спроба видачі');
  later(() => { S.bugBusy = false; S.bugTries++; sBad(); log('app', 'Повторна спроба: знову ANC-503'); if(S.screen === 'appErr') render(); }, 1300);
}
const chatPaint = () => { if(S.screen === 'support') render(); };
function chatSay(who, t, ms){
  later(() => {
    if(who === 'op'){ S.chatTyping = true; chatPaint(); }
    later(() => { S.chatTyping = false; S.chat.push({who, t}); chatPaint(); sSms(); }, who === 'op' ? 1000 : 250);
  }, ms);
}
function startSupport(){
  if(S.screen === 'support') return;
  S.chat = [{who:'me', t:`Не відчиняється слот №${S.slot+1}: помилка ANC-503`}]; S.chatAsk = false; S.chatTyping = false;
  go('support'); stage('bugSup');
  packet('up', 'app'); log('app', `Звернення в підтримку: код ANC-503, слот №${S.slot+1} і сесію додано автоматично`);
  chatSay('bot', `Вітаємо! Бачимо помилку ANC-503 під час видачі зі слота №${S.slot+1}. Ваш транспорт у безпеці. З’єднуємо з оператором.`, 400);
  later(() => { S.chat.push({who:'sys', t:'Звернення #A-1042 · оператор Олена'}); chatPaint(); log('sup', 'Звернення #A-1042: оператор бачить сесію, слот і код помилки'); }, 1900);
  chatSay('op', 'Добрий день! Це тимчасовий збій на нашому боці, вже бачу ваше паркування. Щоб підтвердити, що транспорт ваш: останні 4 цифри картки, якою ви платили?', 2300);
  later(() => { S.chatAsk = true; chatPaint(); }, 3500);
}
function chatCardNow(){
  if(!S.chatAsk) return;
  S.chatAsk = false; S.chat.push({who:'me', t:`•••• ${S.card}`}); chatPaint();
  log('sup', `Власника підтверджено: картка •••• ${S.card} збігається з оплатою сесії`);
  chatSay('op', `Дякую, підтверджено. Відчиняю слот №${S.slot+1} дистанційно, двері відчиняться за кілька секунд.`, 300);
  later(() => { log('cl', `Команда з консолі підтримки: відчинити слот №${S.slot+1} (підписано, звернення #A-1042)`); S.bugFixed = true; S.bonus = 20; pickupConfirmed('sup'); }, 1700);
  chatSay('op', 'Готово. Доплату за час збою скасовано, на ваш рахунок нараховано 20 бонусних гривень. Вибачте за незручності!', 2600);
}

/* ================= station terminal: runs locally on the station (localhost) and syncs with the cloud ================= */
const tfresh = () => ({scr:'home', entry:'', pin1:null, phone:'', msg:'', msgCls:'', paying:false, payErr:false, checking:false, pickSlot:null, cardMode:false, extra:0, calling:false, called:false});
let TS = tfresh();
const KI = {
  rent:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M12 3v18M9 12h.01M15 12h.01"/></svg>',
  pick:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="M6 16l4-8h5l3 8M10 8l2 8"/></svg>',
  nfc:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 9.5a3.5 3.5 0 0 1 0 5M9.5 7a7 7 0 0 1 0 10M13 4.5a10.5 10.5 0 0 1 0 15M16.5 2a14 14 0 0 1 0 20"/></svg>',
};
const canPickup = () => S.parked && S.slot != null && !S.doorOpen && !theftBusy() && !camBusy() && !S.bleBusy;
function ttoast(t){ const e = $('#kToast'); e.textContent = t; e.classList.add('on'); clearTimeout(ttoast.h); ttoast.h = setTimeout(() => e.classList.remove('on'), 2400); }
const nfcWanted = () => !TS.paying && (TS.scr === 'pay' || TS.scr === 'extra' || (TS.scr === 'pickPin' && TS.cardMode));
const kTime = () => { const d = new Date(); return d.getHours() + ':' + String(d.getMinutes()).padStart(2,'0'); };
const kBar = () => `<span>Станція №14 · <span id="kClock">${kTime()}</span></span><span>${S.power === 'off' ? '⚡ акумулятор' : S.cam === 'jam' ? '● резерв NB-IoT' : '● онлайн'}</span>`;
const kFoot = () => `localhost:8080 · ${S.cam === 'jam' ? 'LTE заглушено, тривоги через NB-IoT' : 'синхронізовано з хмарою'} · ${S.power === 'off' ? 'акумулятор ' + Math.round(S.stBat) + '%' : 'живлення від мережі'}`;
const tCancelBtn = '<button class="k-cancel" data-act="tCancel">✕ Скасувати</button>';
const pinBoxes = n => `<div class="otpb" role="img" aria-label="Введено цифр: ${n} з 4">${[0,1,2,3].map(i => `<i class="${i === n ? 'f' : ''}">${i < n ? '•' : ''}</i>`).join('')}</div>`;
const tKeys = dis => `<div class="keypad">${['1','2','3','4','5','6','7','8','9','','0','⌫'].map(k => k === '' ? '<button class="ph" tabindex="-1" aria-hidden="true"></button>' : `<button data-act="tKey" data-k="${k}" ${dis ? 'disabled' : ''} aria-label="${k === '⌫' ? 'Стерти' : k}">${k}</button>`).join('')}</div>`;
const tTap = text => `<div class="k-tap">${KI.nfc}<span>${text}</span></div>`;
const TV = {
  home(){
    const free = slots.filter(x => x.st === 'free').length;
    return `<div class="pad">
      <div class="k-hello"><b>Станція Anchor №14</b><span class="sub">Без застосунку і без реєстрації. Оплата банківською карткою або телефоном.</span></div>
      <button class="kbtn" data-act="tRent"><span class="ki">${KI.rent}</span><span>Орендувати слот<small>Вільних: ${free} з 6</small></span></button>
      <button class="kbtn${canPickup() ? ' hot' : ''}" data-act="tPick"><span class="ki">${KI.pick}</span><span>Забрати транспорт<small>Номер слота і PIN</small></span></button>
      <div class="k-row"><button class="kbtn" data-act="rules">Правила</button><button class="kbtn" data-act="tSupport">Підтримка</button></div>
      <div class="spacer"></div>
      <p class="fine">Термінал працює локально на станції й передає в хмару статуси слотів, оплати й дані клієнта</p>
    </div>`;
  },
  station(){
    return `<div class="pad">${tCancelBtn}
      <p class="label">Ваш транспорт</p><div class="vchips">${vehChips('tVeh')}</div>
      <p class="label">Оберіть зелений слот</p><div class="mini">${miniGrid('tSlot')}</div>
      <div class="lg"><span><i class="dot g"></i>зелений — вільний</span><span><i class="dot b"></i>синій — бронь</span><span><i class="dot r"></i>червоний — зайнятий</span></div>
    </div>`;
  },
  tariff(){
    const t = T(S.tariff);
    return `<div class="pad">${tCancelBtn}
      <div><h2 class="vt">Тариф</h2><p class="sub">Слот №${S.slot+1} · ${VEH[S.transport].name}</p></div>
      <div class="tar">${TARIFFS.filter(x => !x.sub).map(x => { const off = x.id === 'night' && !nightOk();
        return `<button class="tr" data-act="tTariff" data-id="${x.id}" aria-pressed="${S.tariff===x.id}" ${off?'disabled aria-disabled="true"':''}><span><b>${x.name}</b><small>${off?'Доступний з 20:00 до 08:00':x.desc}</small></span><span class="pr">${x.price}<br><small>${x.unit}</small></span></button>`; }).join('')}</div>
      ${t.hours ? `<div class="stepper"><span>Кількість годин</span><div><button data-act="tHours" data-d="-1" aria-label="Менше годин">−</button><b>${S.hours}</b><button data-act="tHours" data-d="1" aria-label="Більше годин">+</button></div></div>` : ''}
      <p class="hint">Підписки Pro і Unlim оформлюються в застосунку</p>
      <div class="spacer"></div>
      <button class="btn" data-act="tToPhone">Далі · ${prepay()} грн</button>
    </div>`;
  },
  phone(){
    return `<div class="pad">${tCancelBtn}
      <div><h2 class="vt">Номер для чека</h2><p class="sub">Необов’язково. Надішлемо чек і нагадування за 30 хвилин до кінця тарифу. Реєстрація не потрібна.</p></div>
      <label class="label" for="tPhoneIn">Номер телефону</label>
      <input class="field" id="tPhoneIn" type="tel" inputmode="tel" value="${esc(TS.phone || '+380 67 123 45 67')}" autocomplete="off">
      <p class="msg err" id="tPhoneErr"></p>
      <div class="spacer"></div>
      <button class="btn" data-act="tPhoneNext">Далі</button>
      <button class="btn dark" data-act="tPhoneSkip">Без номера</button>
    </div>`;
  },
  pin(){
    return `<div class="pad center">${tCancelBtn}
      <h2 class="vt">${TS.pin1 != null ? 'Повторіть PIN' : 'Придумайте PIN'}</h2>
      <p class="sub">4 цифри. PIN і номер слота знадобляться, щоб забрати транспорт. Термінал зберігає лише хеш PIN.</p>
      ${pinBoxes(TS.entry.length)}
      <p class="msg ${TS.msgCls}" role="status" aria-live="polite">${TS.msg}</p>
      <div class="spacer"></div>
      ${tKeys(TS.checking)}
      <p class="fine">Демо: введіть будь-які 4 цифри двічі</p>
    </div>`;
  },
  pay(){
    return `<div class="pad">${TS.paying ? '' : tCancelBtn}
      <h2 class="vt">Оплата</h2>
      ${TS.payErr ? '<div class="banner" role="alert"><b>Картку відхилено</b>Банк не підтвердив платіж. Прикладіть картку ще раз або іншу картку.</div>' : ''}
      <div class="sum">${sumRows()}</div>
      <div class="spacer"></div>
      ${TS.paying ? `<button class="btn dark" disabled>${S.paid ? 'Оплачено · відчиняємо слот…' : '<span class="spin"></span> Зв’язок з банком'}</button>` : tTap('Прикладіть картку або телефон до зчитувача під екраном ↓')}
    </div>`;
  },
  opened(){
    return `<div class="pad center">
      <div class="okc b">${IC.door}</div>
      <h2 class="vt">Слот №${S.slot+1} відчинено</h2>
      <p class="sub">${howText()}</p>
      <p class="note">Якщо транспорт не заведено за 2 хвилини, слот зачиниться сам, а оплату буде повернуто.</p>
      <div class="spacer"></div><p class="fine">Дія відбувається на станції: кнопка під сценою</p>
    </div>`;
  },
  parked(){
    return `<div class="pad center">
      <div class="okc b">${IC.door}</div>
      <h2 class="vt">Транспорт у слоті</h2>
      <p class="sub">Зачиніть двері слота №${S.slot+1}. Запам’ятайте номер слота: разом із вашим PIN він знадобиться, щоб забрати транспорт.</p>
      <div class="spacer"></div><p class="fine">Дія відбувається на станції: кнопка під сценою</p>
    </div>`;
  },
  closed(){
    const t = T(S.tariff);
    return `<div class="pad">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center"><div class="okc g">${IC.check}</div><h2 class="vt">Слот №${S.slot+1} зачинено</h2><p class="sub">Транспорт під замком і під камерою</p></div>
      <div class="sum"><div><span>Слот</span><b>№${S.slot+1}</b></div><div><span>Тариф</span><b>${t.name}${t.hours?' · '+S.hours+' год':''}</b></div><div><span>Сплачено</span><b>${S.paid} грн</b></div><div><span>Чек</span><b>${S.termPhone ? 'SMS на ' + mask(S.termPhone) : 'на екрані'}</b></div></div>
      <p class="note">Щоб забрати: «Забрати транспорт» → слот №${S.slot+1} → ваш PIN</p>
      <div class="spacer"></div>
      <button class="btn" data-act="tHomeBtn">Готово</button>
    </div>`;
  },
  pickSlot(){
    return `<div class="pad">${tCancelBtn}
      <div><h2 class="vt">Номер слота</h2><p class="sub">Номер написаний на дверях вашого слота</p></div>
      <div class="k-slots">${[0,1,2,3,4,5].map(k => `<button data-act="tPickSlot" data-k="${k}">${k+1}</button>`).join('')}</div>
      <p class="msg ${TS.msgCls}" role="status" aria-live="polite">${TS.msg}</p>
    </div>`;
  },
  pickPin(){
    const k = TS.pickSlot, locked = Date.now() < S.pinLock;
    const dots = [0,1,2].map(i => `<i class="${i >= S.pinTries ? 'used' : ''}"></i>`).join('');
    let mid;
    if(TS.cardMode) mid = TS.paying ? '<p class="msg"><span class="spin"></span> Шукаємо сесію за карткою…</p>' : tTap('Прикладіть картку, якою оплачували паркування ↓');
    else if(locked) mid = `<div class="lock">Тричі введено хибний PIN. Введення заблоковано<b id="tLockClock">${mmss(S.pinLock - Date.now())}</b></div><button class="linkbtn" data-act="tSkipLock">Пропустити очікування (демо)</button>`;
    else mid = `${pinBoxes(TS.entry.length)}<p class="msg ${TS.msgCls}" role="status" aria-live="polite">${TS.msg}</p><div class="tries">${dots}<span>Залишилось спроб: ${S.pinTries}</span></div>`;
    return `<div class="pad center">${tCancelBtn}
      <h2 class="vt">Слот №${k+1}: ${TS.cardMode ? 'картка' : 'PIN'}</h2>
      ${mid}
      <div class="spacer"></div>
      ${TS.cardMode ? '<button class="linkbtn" data-act="tPinMode">Ввести PIN</button>' : tKeys(locked || TS.checking) + '<button class="linkbtn" data-act="tCardMode">Забули PIN? Прикладіть картку, якою платили</button>' + `<p class="fine">Демо: PIN ${S.pin}</p>`}
    </div>`;
  },
  extra(){
    return `<div class="pad">${TS.paying ? '' : tCancelBtn}
      <h2 class="vt">Доплата ${TS.extra} грн</h2>
      <div class="sum"><div><span>Слот</span><b>№${S.slot+1}</b></div><div><span>Час паркування</span><b>${fmt(S.elapsed)}</b></div><div><span>Тариф</span><b>${T(S.tariff).name}</b></div><div class="tot"><span>Доплата</span><b>${TS.extra} грн</b></div></div>
      <p class="sub">Час вийшов за тариф: кожна наступна година — 20 грн</p>
      <div class="spacer"></div>
      ${TS.paying ? '<button class="btn dark" disabled><span class="spin"></span> Зв’язок з банком</button>' : tTap('Прикладіть картку до зчитувача під екраном ↓')}
    </div>`;
  },
  pickupOpen(){
    return `<div class="pad center">
      <div class="okc g">${IC.door}</div>
      <h2 class="vt">Слот №${S.slot+1} відчинено</h2>
      <p class="sub">${S.transport === 'bike' ? 'Зніміть велосипед з гака й викотіть його.' : 'Викотіть ' + VEH[S.transport].acc + '.'} Двері зачиняться самі, коли слот спорожніє.</p>
      ${S.extra ? `<p class="note">Доплата ${S.extra} грн списана з картки •••• ${S.card}.</p>` : ''}
      <div class="spacer"></div><p class="fine">Дія відбувається на станції: кнопка під сценою</p>
    </div>`;
  },
  done(){
    const t = T(S.tariff);
    return `<div class="pad">
      <div style="display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center"><div class="okc g">${IC.check}</div><h2 class="vt">Гарної поїздки!</h2><p class="sub">Слот №${S.slot+1} знову вільний</p></div>
      <div class="sum"><div><span>Тариф</span><b>${t.name}${t.hours?' · '+S.hours+' год':''}</b></div><div><span>Час паркування</span><b>${fmt(S.elapsed)}</b></div><div><span>Сплачено</span><b>${S.paid} грн</b></div><div><span>Доплата</span><b>${S.extra} грн</b></div><div class="tot"><span>Разом</span><b>${S.paid + S.extra} грн</b></div></div>
      ${S.termPhone ? `<p class="note">Чек надіслано SMS на ${mask(S.termPhone)}</p>` : ''}
      <div class="spacer"></div>
      <a class="btn dark" href="${esc(GFORM)}" target="_blank" rel="noopener">Залишити відгук ↗</a>
      <button class="btn" data-act="tNew">На головну</button>
    </div>`;
  },
  support(){
    return `<div class="pad"><button class="k-cancel" data-act="tHomeBtn">← Назад</button>
      <div><h2 class="vt">Підтримка</h2><p class="sub">Оператор на зв’язку цілодобово: голосовий виклик через динамік і мікрофон термінала.</p></div>
      <div class="sum"><div><span>Оператор бачить</span><b>стан станції і слотів</b></div><div><span>Може</span><b>відчинити слот після перевірки</b></div><div><span>Перевірка</span><b>картка, якою платили</b></div></div>
      <div class="spacer"></div>
      <button class="btn" data-act="tCall" ${TS.calling ? 'disabled' : ''}>${TS.calling ? '<span class="spin"></span> З’єднуємо з оператором…' : 'Викликати оператора'}</button>
      ${TS.called ? '<p class="note">Оператор Олена на лінії. Розмову з підтримкою в цьому прототипі показано в сценарії «Збій застосунку».</p>' : ''}
    </div>`;
  },
};
function trender(){
  const v = $('#kView'); if(!v) return;
  const ae = document.activeElement, fk = ae && ae.closest && ae.closest('#kView') && ae.dataset.k;
  v.innerHTML = TV[TS.scr](); v.scrollTop = 0;
  $('#kBar').innerHTML = kBar(); $('#kFoot').textContent = kFoot();
  const n = $('#kNfc'), w = nfcWanted(); n.disabled = !w; n.classList.toggle('on', w);
  if(fk){ const nb = $(`#kView [data-act="tKey"][data-k="${fk}"]`); if(nb && !nb.disabled) nb.focus({preventScroll:true}); }
}
function tgo(scr){ TS.scr = scr; trender(); }
/* the person walks to the terminal; for a new rental the vehicle comes along */
function toTerm(withVeh){
  const d = Math.abs((S.px ?? HOME_P) - TERM_X); if(d < 4) return;
  const ms = Math.max(700, d*3.2);
  walkTo(TERM_X, ms);
  if(withVeh && !S.parked) moveUV(`translate(${TERM_X + 86}px,${GROUND}px) scale(.62)`, ms, 1);
}
/* caption to return to when a terminal flow is cancelled */
function tRest(){
  S.chan = S.scn === 'term' || S.phoneDead ? 'term' : 'app';
  if(S.parked){ if(S.phoneDead) stage('deadTerm'); else restStage(); }
  else if(S.scn === 'term') stage('tHome');
  else stage(['map','station'].includes(S.screen) ? S.screen : 'map');
}
function termKey(k){
  const scr = TS.scr;
  if(!['pin','pickPin'].includes(scr) || TS.checking || TS.paying) return;
  if(scr === 'pickPin' && (TS.cardMode || Date.now() < S.pinLock)) return;
  if(k !== '⌫' && TS.entry.length >= 4) return;
  sKey();
  if(TS.msgCls === 'err'){ TS.msg = ''; TS.msgCls = ''; }
  TS.entry = k === '⌫' ? TS.entry.slice(0, -1) : TS.entry + k;
  if(TS.entry.length === 4){ TS.checking = true; trender(); later(() => { TS.checking = false; scr === 'pin' ? pinSet() : pinCheck(); }, 260); return; }
  trender();
}
function pinSet(){
  if(TS.scr !== 'pin') return;
  if(TS.pin1 == null){ TS.pin1 = TS.entry; TS.entry = ''; trender(); return; }
  if(TS.entry !== TS.pin1){ TS.pin1 = null; TS.entry = ''; TS.msg = 'PIN не збігаються. Придумайте PIN ще раз'; TS.msgCls = 'err'; sBad(); trender(); return; }
  S.pin = TS.pin1; TS.entry = ''; sOk();
  log('term', 'PIN збережено лише як хеш (SHA-256 із сіллю), сам PIN ніде не зберігається');
  TS.payErr = false; TS.paying = false;
  stage('tPay', [['Прикласти картку до термінала', termNfc]]); tgo('pay');
}
function pinCheck(){
  if(TS.scr !== 'pickPin') return;
  const k = TS.pickSlot;
  if(TS.entry === S.pin){
    sOk(); S.pinTries = 3; TS.entry = ''; TS.msg = 'PIN вірний'; TS.msgCls = 'ok'; trender();
    log('term', `PIN для слота №${k+1} перевірено локально за хешем: вірний. POST /api/pickups → хмара`);
    later(tAfterAuth, 500); return;
  }
  sBad(); S.pinTries--; TS.entry = '';
  if(S.pinTries <= 0){
    S.pinTries = 3; S.pinLock = Date.now() + 5*60000;
    log('term', `3 хибні PIN для слота №${k+1}: введення заблоковано на 5 хв`);
    log('cl', 'Сповіщення власнику: на терміналі тричі введено хибний PIN');
    packet('up', 'station');
    later(() => push(`На терміналі станції тричі введено хибний PIN для слота №${k+1}. Введення заблоковано на 5 хв. Якщо це були не ви, напишіть у підтримку.`, 'warn'), 600);
    stage('tPinLock'); trender(); return;
  }
  TS.msg = `Невірний PIN. Залишилось спроб: ${S.pinTries}`; TS.msgCls = 'err';
  log('term', `Невірний PIN для слота №${k+1}, залишилось спроб: ${S.pinTries}`); trender();
}
function tAfterAuth(){
  const ex = Math.max(0, costNow() - S.paid);
  if(ex > 0){ TS.extra = ex; TS.paying = false; stage('tExtra', [['Прикласти картку до термінала', termNfc]]); tgo('extra'); return; }
  pickupConfirmed('term');
}
function termNfc(){
  if(!nfcWanted()) return;
  tone(1250, 0, .09, 'sine', .14);
  $('#actions').innerHTML = '<span class="hint-none">Термінал зчитує картку…</span>';
  if(TS.scr === 'pay') tPay(); else if(TS.scr === 'extra') tPayExtra(); else tCardId();
}
function tPay(){
  TS.paying = true; TS.payErr = false; trender();
  log('term', `Картку •••• ${S.card} зчитано через NFC: платіж ${prepay()} грн`);
  later(() => {
    const fail = S.failFirst && S.payTries === 0; S.payTries++;
    if(fail){
      TS.paying = false; TS.payErr = true; sBad(); say('Картку відхилено. Спробуйте ще раз.');
      log('term', 'Банк відхилив платіж. Слот лишається заброньованим');
      stage('tPayFail', [['Прикласти картку ще раз', termNfc]]); trender(); return;
    }
    S.paid = prepay(); S.termPhone = TS.phone; if(TS.phone) S.phone = TS.phone;
    clearTimeout(S.holdT); sOk(); packet('up', 'station');
    log('term', `POST /api/payments · ${S.paid} грн · •••• ${S.card} → банк і хмара: 200`);
    log('term', `POST /api/sessions · слот №${S.slot+1} · тел. ${TS.phone ? mask(TS.phone) : 'не вказано'} · PIN: лише хеш`);
    log('cl', `Оплату підтверджено. Команда станції: відчинити слот №${S.slot+1}`);
    trender(); later(openForRent, 900);
  }, 1300);
}
function tPayExtra(){
  TS.paying = true; trender();
  later(() => { sOk(); log('term', `POST /api/payments · доплата ${TS.extra} грн · •••• ${S.card} → хмара: 200`); pickupConfirmed('term'); }, 1300);
}
function tCardId(){
  TS.paying = true; trender();
  log('term', `Картку •••• ${S.card} зчитано: пошук сесії за карткою`);
  later(() => {
    sOk(); S.pinLock = 0; S.pinTries = 3;
    log('cl', `Картка збігається з оплатою слота №${TS.pickSlot+1}: власника підтверджено`);
    TS.paying = false; TS.cardMode = false; tAfterAuth();
  }, 1300);
}
Object.assign(ACT, {
  tRent(){
    if(TS.scr !== 'home') return;
    if(S.slot != null){ ttoast(S.parked ? 'У вас уже є активна сесія: «Забрати транспорт»' : `Слот №${S.slot+1} уже заброньовано в застосунку`); return; }
    S.chan = 'term'; TS = Object.assign(tfresh(), {scr:'station'});
    if(T(S.tariff).sub) S.tariff = 'once';
    toTerm(true);
    log('term', 'Нова оренда на терміналі: без застосунку і реєстрації');
    stage('tStation'); trender();
  },
  tVeh(b){ if(S.slot != null) return; S.transport = b.dataset.t; setUV(); trender(); },
  tSlot(b){
    if(TS.scr !== 'station' || S.slot != null) return;
    const k = +b.dataset.k, sl = slots[k];
    if(sl.st !== 'free' || !compatible(k)){
      b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); sBad();
      ttoast(sl.st !== 'free' ? `Слот ${k+1} недоступний` : 'Для адаптованого велосипеда потрібен широкий слот №6'); return;
    }
    S.slot = k; sl.st = 'hold'; paintScene(); scrollToSlot(k); sKey();
    packet('up', 'station'); log('term', `PUT /api/slots/${k+1} · стан «бронь» → хмара: 200`);
    S.holdT = later(() => { if(S.slot === k && slots[k].st === 'hold' && !TS.paying){ releaseHold(); TS = tfresh(); ttoast('Бронь скасовано: минуло 5 хвилин'); tRest(); trender(); } }, 300000);
    stage('tTariff'); tgo('tariff');
  },
  tTariff(b){ if(b.dataset.id === 'night' && !nightOk()){ ttoast('Нічний тариф доступний з 20:00 до 08:00'); return; } S.tariff = b.dataset.id; trender(); },
  tHours(b){ S.hours = Math.min(12, Math.max(1, S.hours + +b.dataset.d)); trender(); },
  tToPhone(){ stage('tPhone'); tgo('phone'); },
  tPhoneNext(){
    const v = $('#tPhoneIn').value.trim(), d = v.replace(/\D/g, '');
    if(d.length !== 12 || !d.startsWith('380')){ $('#tPhoneErr').textContent = 'Введіть номер у форматі +380 XX XXX XX XX'; return; }
    TS.phone = '+' + d.replace(/^(\d{3})(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4 $5'); toPin();
  },
  tPhoneSkip(){ TS.phone = ''; toPin(); },
  tKey(b){ termKey(b.dataset.k); },
  tNfc(){ termNfc(); },
  tCancel(){
    if(TS.paying) return;
    if(['station','tariff','phone','pin','pay'].includes(TS.scr)){ if(S.slot != null && slots[S.slot].st === 'hold') releaseHold(); log('term', 'Оренду на терміналі скасовано'); }
    TS = tfresh(); tRest(); trender();
  },
  tHomeBtn(){ TS = tfresh(); trender(); },
  tPick(){
    if(TS.scr !== 'home') return;
    TS = Object.assign(tfresh(), {scr:'pickSlot'}); toTerm(false);
    log('term', 'Запит на видачу на терміналі');
    stage('tPick'); trender();
  },
  tPickSlot(b){
    const k = +b.dataset.k;
    if(!(S.parked && S.slot === k)){ TS.msg = `Для слота №${k+1} немає активної сесії`; TS.msgCls = 'err'; sBad(); trender(); return; }
    if(!canPickup()){ TS.msg = S.doorOpen ? 'Слот зараз відчинений' : 'Зачекайте: на станції триває інцидент'; TS.msgCls = 'err'; trender(); return; }
    sKey(); S.chan = 'term'; TS.pickSlot = k; TS.entry = ''; TS.msg = ''; TS.msgCls = '';
    stage(Date.now() < S.pinLock ? 'tPinLock' : 'tPickPin'); tgo('pickPin');
  },
  tSkipLock(){ S.pinLock = Date.now(); },
  tCardMode(){ TS.cardMode = true; stage('tCard', [['Прикласти картку до термінала', termNfc]]); trender(); },
  tPinMode(){ TS.cardMode = false; stage(Date.now() < S.pinLock ? 'tPinLock' : 'tPickPin'); trender(); },
  tSupport(){ if(TS.scr !== 'home') return; TS = Object.assign(tfresh(), {scr:'support'}); trender(); },
  tCall(){
    if(TS.calling) return;
    TS.calling = true; trender(); log('term', 'Виклик оператора з термінала');
    later(() => { TS.calling = false; TS.called = true; log('sup', 'Оператор Олена на лінії: бачить станцію №14 і стан слотів'); if(TS.scr === 'support') trender(); }, 1600);
  },
  tNew(){ hardReset(true); },
});
function toPin(){ TS.entry = ''; TS.pin1 = null; TS.msg = ''; TS.msgCls = ''; stage('tPin'); tgo('pin'); }

/* ================= feedback: shared db ================= */
const esc = t => String(t).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let fbDocs = [], fbState = 'loading', fbFilter = 'all';
let fbLive = [], fbPub = [], fbPubAt = '', fbLiveOk = false, fbPubOk = false, fbPubDone = false, fbLiveDone = false;
/* developer replies: responses/<feedback id> = {done, reply, at}; editors write them, the hourly job copies them into the public file */
let fbDb = null, fbResp = {}, fbRespLive = false, canReply = false, devMode = false;
const respDraft = {}, respBusy = {}, respNote = {};
/* Google Form for participants without write access; entry ids read from the form itself */
const GFORM = 'https://docs.google.com/forms/d/e/1FAIpQLSf02mnbn_wbTDqBic_l6hHhxeMUKWfRogZVSFUC9ifKmqVwVw/viewform';
const GF_ENTRY = {rating:'1209524246', need:'477854847', wish:'225285479'};
function gformUrl(){
  const q = ['usp=pp_url', `entry.${GF_ENTRY.rating}=${S.fb.rating}`, `entry.${GF_ENTRY.need}=${encodeURIComponent(S.fb.need ? 'Так' : 'Ні')}`];
  const w = S.fb.wish.trim(); if(w) q.push(`entry.${GF_ENTRY.wish}=${encodeURIComponent(w)}`);
  return GFORM + '?' + q.join('&');
}
function showTab(name){
  $$('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === name));
  ['proto','plan','fb'].forEach(n => { $('#tab-' + n).hidden = n !== name; });
  if(name === 'fb') renderFb();
}
function submitFeedback(){
  const f = S.fb, err = {};
  if(!(f.rating >= 1 && f.rating <= 5)) err.rating = true;
  if(f.need !== true && f.need !== false) err.need = true;
  S.fbErr = err;
  if(Object.keys(err).length){ render(); const q = $('.q.err'); if(q) q.scrollIntoView({block:'nearest'}); return; }
  S.fbOpened = false; stage('handoff'); go('handoff');
}
function cleanFb(d){
  const r = Math.round(Number(d.rating));
  if(d.source !== 'gform' || !(r >= 1 && r <= 5) || typeof d.meetsNeed !== 'boolean') return null;
  return {id: d.id, rating: r, need: d.meetsNeed, wish: typeof d.wish === 'string' ? d.wish.slice(0, 500) : '',
    transport: VEH[d.transport] ? d.transport : null, tariff: T(d.tariff) ? d.tariff : null,
    minutes: Number.isFinite(d.minutes) ? d.minutes : null, at: typeof d.at === 'string' ? d.at : '', gform: d.source === 'gform',
    done: d.done === true, reply: typeof d.reply === 'string' ? d.reply.slice(0, 1000) : '', replyAt: typeof d.replyAt === 'string' ? d.replyAt : ''};
}
const fmtDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleString('uk-UA', {day:'numeric', month:'short', hour:'2-digit', minute:'2-digit'}); };
const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? b : c; };
const starsTxt = r => '★'.repeat(r) + '<s>' + '★'.repeat(5 - r) + '</s>';
function renderFb(){
  const badge = $('#fbBadge'); badge.hidden = !fbDocs.length; badge.textContent = fbDocs.length;
  const live = $('#fbLive'), body = $('#fbBody');
  live.innerHTML = fbLiveOk ? '<i></i>Оновлюється наживо' : fbPubOk ? `Публічний перегляд · оновлено ${esc(fmtDate(fbPubAt)) || 'щогодини'}` : fbState === 'loading' ? 'Завантаження…' : 'Дані недоступні';
  if($('#tab-fb').hidden) return;
  if(fbState === 'loading'){ body.innerHTML = '<div class="empty"><b>Завантажуємо відгуки…</b></div>'; return; }
  if(fbState === 'off'){ body.innerHTML = '<div class="empty"><b>Ще немає опублікованих відгуків</b>Дашборд оновлюється щогодини. Залишити відгук може кожен після сесії у вкладці «Прототип», без реєстрації.</div>'; return; }
  const all = fbDocs;
  if(!all.length){ body.innerHTML = '<div class="empty"><b>Ще немає жодного відгуку</b>Пройдіть сесію у вкладці «Прототип»: після чека застосунок запропонує анкету з трьох питань.<br><button class="btn" style="width:auto;display:inline-flex;padding:.7em 1.2em" data-tab="proto">До прототипу</button></div>'; return; }
  const n = all.length, avg = all.reduce((a, d) => a + d.rating, 0) / n;
  const yes = all.filter(d => d.need).length, no = n - yes, pY = Math.round(yes / n * 100);
  const dist = [5,4,3,2,1].map(r => ({r, c: all.filter(d => d.rating === r).length}));
  const maxC = Math.max(...dist.map(d => d.c));
  const withWish = all.filter(d => d.wish.trim());
  const flt = {all: () => true, low: d => d.rating <= 2, mid: d => d.rating === 3, high: d => d.rating >= 4, no: d => !d.need, done: d => respOf(d).done, open: d => !respOf(d).done && !respOf(d).reply};
  const shown = withWish.filter(flt[fbFilter] || flt.all);
  const fl = [['all','Усі'],['high','4–5 ★'],['mid','3 ★'],['low','1–2 ★'],['no','Потребу не виконано'],['done','Враховано'],['open','Без відповіді']];
  const doneN = withWish.filter(d => respOf(d).done).length, ae = document.activeElement, focusId = ae && ae.dataset && ae.dataset.rid, sel = focusId ? [ae.selectionStart, ae.selectionEnd] : null;
  body.innerHTML = `
    <div class="tiles">
      <div class="tile"><small>Відгуків</small><b>${n}</b><span>останній ${esc(fmtDate(all[0].at))}</span></div>
      <div class="tile"><small>Зручність інтерфейсу</small><b>${avg.toFixed(1).replace('.', ',')} <span style="font-size:16px">з 5</span></b><span class="wstars">${starsTxt(Math.round(avg))}</span></div>
      <div class="tile"><small>Станція виконує потребу</small><b>${pY}%</b><span>${yes} так · ${no} ні</span></div>
    </div>
    <div class="fb-grid">
      <div class="card2"><h3><span class="n">1</span>Наскільки зручний для вас інтерфейс застосунку?</h3><p class="cap">Розподіл оцінок, ${n} ${plural(n,'відповідь','відповіді','відповідей')}</p>
        <div class="dist">${dist.map(d => { const pct = Math.round(d.c / n * 100); return `<div class="drow" tabindex="0" data-tip="${d.r} ${plural(d.r,'зірка','зірки','зірок')}: ${d.c} ${plural(d.c,'відгук','відгуки','відгуків')} (${pct}%)"><span class="lab">${d.r} ★</span><span class="trk"><b style="width:${maxC ? d.c / maxC * 100 : 0}%"></b></span><span class="val">${d.c} · ${pct}%</span></div>`; }).join('')}</div>
      </div>
      <div class="card2"><h3><span class="n">2</span>Чи виконує станція вашу потребу в зберіганні?</h3><p class="cap">Частка відповідей «так» і «ні»</p>
        <div class="split">${yes ? `<b class="y" style="flex:${yes}" tabindex="0" data-tip="Так: ${yes} (${pY}%)"></b>` : ''}${no ? `<b class="n" style="flex:${no}" tabindex="0" data-tip="Ні: ${no} (${100 - pY}%)"></b>` : ''}</div>
        <div class="lgd"><span><i class="yi"></i>Так <b>${yes}</b> · ${pY}%</span><span><i class="ni"></i>Ні <b>${no}</b> · ${100 - pY}%</span></div>
      </div>
    </div>
    <div class="card2"><h3><span class="n">3</span>Які ваші побажання щодо покращення сервісу станції?</h3><p class="cap">${withWish.length} з ${n} ${plural(n,'відгуку','відгуків','відгуків')} містять побажання, нові зверху · враховано ${doneN} з ${withWish.length}</p>
      ${canReply ? `<div class="devbar"><label class="devsw"><input type="checkbox" data-act="devMode" ${devMode ? 'checked' : ''}>Режим розробника</label><span>${devMode ? 'Позначки й відповіді бачать усі відвідувачі дашборду. Публічно вони з’являються протягом години.' : 'Увімкніть, щоб позначати враховані відгуки й відповідати на них. Цей перемикач бачите лише ви.'}</span></div>` : ''}
      <div class="filt" role="group" aria-label="Фільтр побажань">${fl.map(([k, l]) => `<button data-act="fbFilter" data-f="${k}" aria-pressed="${fbFilter === k}">${l}</button>`).join('')}</div>
      ${shown.length ? `<ul class="wishes">${shown.map(wishItem).join('')}</ul>` : '<p class="sub">Немає побажань для цього фільтра.</p>'}
    </div>
    <div class="card2"><details class="raw"><summary>Усі відповіді таблицею (${n})</summary><div class="tblw"><table>
      <thead><tr><th>Дата</th><th>Оцінка</th><th>Потребу виконано</th><th>Побажання</th><th>Транспорт</th><th>Тариф</th><th>Хв</th><th>Джерело</th><th>Враховано</th></tr></thead>
      <tbody>${all.map(d => `<tr><td>${esc(fmtDate(d.at))}</td><td>${d.rating}</td><td>${d.need ? 'Так' : 'Ні'}</td><td>${esc(d.wish) || '—'}</td><td>${d.transport ? VEH[d.transport].name : '—'}</td><td>${d.tariff ? T(d.tariff).name : '—'}</td><td>${d.minutes ?? '—'}</td><td>${d.gform ? 'Google Форма' : 'Застосунок'}</td><td>${respOf(d).done ? 'Так' : '—'}</td></tr>`).join('')}</tbody>
    </table></div></details></div>`;
  if(focusId){ const ta = document.getElementById('rep-' + focusId); if(ta){ ta.focus({preventScroll:true}); try{ ta.setSelectionRange(sel[0], sel[1]); }catch(e){} } }
}
/* the live store wins for viewers who can read it; everyone else sees what the hourly job published */
const respOf = d => fbRespLive ? (fbResp[d.id] || {done:false, reply:'', at:''}) : {done:d.done, reply:d.reply, at:d.replyAt};
const RESP_ID = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;
function wishItem(d){
  const r = respOf(d), id = esc(d.id), draft = respDraft[d.id] ?? r.reply;
  return `<li class="wish${r.done ? ' done' : ''}"><p>${esc(d.wish)}</p>
    <div class="wmeta"><span class="wstars" aria-label="${d.rating} з 5">${starsTxt(d.rating)}</span><span class="${d.need ? 'chip-y' : 'chip-n'}">${d.need ? 'Потребу виконано' : 'Потребу не виконано'}</span>${r.done ? '<span class="chip-ok">✓ Відгук враховано</span>' : ''}${d.transport ? `<span>${VEH[d.transport].name}</span>` : ''}${d.tariff ? `<span>${T(d.tariff).name}</span>` : ''}${d.gform ? '<span>Google Форма</span>' : ''}<span>${esc(fmtDate(d.at))}</span></div>
    ${r.reply ? `<div class="reply"><b>Відповідь розробника</b><p>${esc(r.reply)}</p>${r.at ? `<small>${esc(fmtDate(r.at))}</small>` : ''}</div>` : ''}
    ${devMode && canReply && RESP_ID.test(d.id) ? `<div class="rep-ed">
      <label class="rep-done"><input type="checkbox" data-act="respDone" data-id="${id}" ${r.done ? 'checked' : ''} ${respBusy[d.id] ? 'disabled' : ''}>Відгук враховано</label>
      <label class="label" for="rep-${id}">Відповідь розробника</label>
      <textarea class="ta sm" id="rep-${id}" data-rid="${id}" maxlength="1000" placeholder="Що змінили завдяки відгуку або чому поки ні">${esc(draft)}</textarea>
      <div class="rep-row"><button class="btn dark" data-act="respSave" data-id="${id}" ${respBusy[d.id] ? 'disabled' : ''}>${r.reply ? 'Оновити відповідь' : 'Опублікувати відповідь'}</button><span class="rep-st${respNote[d.id] && respNote[d.id].err ? ' err' : ''}" role="status">${respNote[d.id] ? esc(respNote[d.id].t) : ''}</span></div>
    </div>` : ''}
  </li>`;
}
async function saveResp(id, patch){
  if(!fbDb || !canReply || !RESP_ID.test(id) || respBusy[id]) return;
  const cur = fbResp[id] || {done:false, reply:''};
  const next = {done: patch.done ?? cur.done === true, reply: (patch.reply ?? cur.reply ?? '').trim().slice(0, 1000), at: new Date().toISOString(), v: 1};
  respBusy[id] = true; respNote[id] = {t:'Зберігаємо…'}; renderFb();
  try{
    await fbDb.doc('responses/' + id).set(next);
    fbResp[id] = {done: next.done, reply: next.reply, at: next.at};
    if(patch.reply != null) delete respDraft[id];
    respNote[id] = {t:'Збережено'};
  }catch(e){
    respNote[id] = {t: e && e.code === 'invalid_argument' ? 'Немає права змінювати відповіді' : e && e.code === 'quota_exceeded' ? 'Сховище заповнене' : 'Не вдалося зберегти, спробуйте ще раз', err:true};
    if(e && e.code === 'invalid_argument') canReply = false;
  }finally{ respBusy[id] = false; renderFb(); }
}
ACT.devMode = b => { devMode = b.checked; renderFb(); };
ACT.respDone = b => saveResp(b.dataset.id, {done: b.checked});
ACT.respSave = b => saveResp(b.dataset.id, {reply: respDraft[b.dataset.id] ?? (fbResp[b.dataset.id] || {}).reply ?? ''});
ACT.fbFilter = b => { fbFilter = b.dataset.f; renderFb(); };
/* hover / focus tooltip for chart marks */
(function(){
  const tip = $('#tip');
  const show = (el, x, y) => { tip.textContent = el.dataset.tip; tip.classList.add('on'); const w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, x + 12)) + 'px'; tip.style.top = (y - tip.offsetHeight - 10) + 'px'; };
  document.addEventListener('pointermove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if(el) show(el, e.clientX, e.clientY); else tip.classList.remove('on'); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if(el){ const r = el.getBoundingClientRect(); show(el, r.left + r.width/2, r.top); } });
  document.addEventListener('focusout', () => tip.classList.remove('on'));
})();
function mergeFb(){
  const byId = new Map();
  fbPub.forEach(d => byId.set(d.id, d)); fbLive.forEach(d => byId.set(d.id, d));
  fbDocs = Array.from(byId.values()).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  fbState = fbLiveOk || fbPubOk ? 'ok' : !(fbPubDone && fbLiveDone) ? 'loading' : 'off';
  renderFb();
}
/* public snapshot: published next to the page and refreshed hourly, readable without signing in */
fetch('feedback-data.json', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(j => {
  if(j && Array.isArray(j.items)){ fbPub = j.items.map(cleanFb).filter(Boolean).slice(0, 2000); fbPubAt = typeof j.updated === 'string' ? j.updated : ''; fbPubOk = true; }
}).catch(() => {}).finally(() => { fbPubDone = true; mergeFb(); });
(async function initFeedback(){
  try{
    const c = window.claude;
    if(!c || !c.use) throw 0;
    const db = await c.use('db');
    if(!db) throw 0;
    db.collection('feedback').orderBy('at', 'desc').limit(1000).onSnapshot(snap => {
      fbLive = snap.docs.map(d => cleanFb(Object.assign({}, d.data(), {id: d.id}))).filter(Boolean);
      fbLiveOk = fbLiveDone = true; mergeFb();
    }, () => { fbLiveOk = false; fbLiveDone = true; mergeFb(); });
    fbDb = db;
    db.collection('responses').limit(1000).onSnapshot(snap => {
      const m = {};
      snap.docs.forEach(x => { const v = x.data() || {}; m[x.id] = {done: v.done === true, reply: typeof v.reply === 'string' ? v.reply.slice(0, 1000) : '', at: typeof v.at === 'string' ? v.at : ''}; });
      fbResp = m; fbRespLive = true; renderFb();
    }, () => { fbRespLive = false; renderFb(); });
    const u = await c.use('user');
    canReply = !!(u && await u.canEdit()); renderFb();
  }catch(e){ fbLiveDone = true; mergeFb(); }
})();

function boot(){
  hideSms();
  if(location.hash === '#feedback') showTab('fb');
  S.px = HOME_P; TS = tfresh();
  log('st', 'Станція №14 онлайн: 3 модулі, 6 слотів, зв’язок LTE');
  log('term', 'localhost:8080 запущено: локальна база сесій, синхронізація з хмарою');
  paintScn(); paintBat(); paintPhoneOff(); paintPwr();
  if(S.scn === 'term'){ S.chan = 'term'; setDev('term'); stage('tHome'); }
  else { S.chan = 'app'; setDev('app'); stage('map'); }
  render(); trender();
}
buildScene();
boot();
window.addEventListener('hashchange', () => { const h = (location.hash || '').slice(1); if(['main','term','dead','power','bug','theft','cam'].includes(h) && h !== S.scn){ S.scn = h; hardReset(false); } });
})();
