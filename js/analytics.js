/* Anchor MVP: згода, A/B-призначення, журнал подій і відправка в обраного провайдера.
   Правило: до «Прийняти» нічого не зберігається й не відправляється. Єдиний запис у localStorage до цього —
   сам вибір користувача, і лише після натискання однієї з кнопок банера. */
(function(){
  'use strict';
  const C = window.CONFIG;
  const CONSENT_KEY = 'anchor-consent';      // 'accepted' | 'necessary'
  const AB_KEY = 'anchor-ab';
  const lsGet = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const lsSet = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const lsDel = k => { try{ localStorage.removeItem(k); }catch(e){} };
  const rid = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => (b % 36).toString(36)).join('');

  let consent = lsGet(CONSENT_KEY);           // null until the visitor chooses
  if(consent !== 'accepted' && consent !== 'necessary') consent = null;

  /* ---------- A/B assignment ---------- */
  /* offer: bonus offer · mascot: logo animation · price: price level · msg: welcome message · cta: welcome call to action */
  const EXPS = ['offer', 'mascot', 'price', 'msg', 'cta'];
  const LETTER = {offer: 'o', mascot: 'm', price: 'p', msg: 's', cta: 'c'};
  const BY_LETTER = {o: 'offer', m: 'mascot', p: 'price', s: 'msg', c: 'cta'};
  const CHANNELS = ['threads', 'instagram', 'kpi-a', 'kpi-b', 'qr', 'students', 'couriers', 'direct'];
  /* #oA_mB, #threads_sB_cA, #test: letters, digits, underscore, dot, dash only */
  const hashTokens = () => { const h = (location.hash || '').slice(1); return /^[A-Za-z0-9_.-]{1,60}$/.test(h) ? h.split(/[_.]/) : []; };
  function parseHash(){
    const out = {};
    hashTokens().forEach(part => {
      const m = /^([ompsc])([AB])$/.exec(part);
      if(m) out[BY_LETTER[m[1]]] = m[2];
    });
    return out;
  }
  const channel = hashTokens().find(t => CHANNELS.includes(t.toLowerCase())) || 'direct';
  const forced = parseHash();
  let stored = {};
  if(consent === 'accepted'){ try{ stored = JSON.parse(lsGet(AB_KEY)) || {}; }catch(e){ stored = {}; } }
  const ab = {};
  EXPS.forEach(k => {
    if(!C.EXPERIMENTS[k]){ ab[k] = 'A'; return; }                  // switched-off experiment: everyone sees A (current)
    ab[k] = forced[k] || (stored[k] === 'A' || stored[k] === 'B' ? stored[k] : (crypto.getRandomValues(new Uint8Array(1))[0] < 128 ? 'A' : 'B'));
  });
  function persistAb(){ if(consent === 'accepted') lsSet(AB_KEY, JSON.stringify(ab)); }
  const expLabel = () => EXPS.filter(k => C.EXPERIMENTS[k]).map(k => LETTER[k] + ab[k]).join(' ');
  const expParams = () => { const o = {}; EXPS.forEach(k => { o['exp_' + k] = C.EXPERIMENTS[k] ? ab[k] : '-'; }); o.channel = channel; return o; };
  /* tester menu: force a variant for this browser */
  function setAb(k, v){ if(EXPS.includes(k) && (v === 'A' || v === 'B')){ ab[k] = v; persistAb(); } }

  /* ---------- journal + counters for the session code ---------- */
  const sessionId = rid(12);
  const startedAt = Date.now();
  let activeMs = 0, activeSince = document.hidden ? 0 : Date.now();
  const journal = [];
  const counters = {booked: 0, referral: 0, facts: 0};
  function seconds(){ return Math.round((activeMs + (activeSince ? Date.now() - activeSince : 0))/1000); }
  document.addEventListener('visibilitychange', () => {
    if(document.hidden){ if(activeSince){ activeMs += Date.now() - activeSince; activeSince = 0; } track('session_seconds', {s: seconds()}); flush(true); }
    else activeSince = Date.now();
  });
  window.addEventListener('pagehide', () => { track('session_seconds', {s: seconds()}); flush(true); });
  setInterval(() => { if(consent === 'accepted' && !document.hidden) track('session_seconds', {s: seconds()}); }, 60000);

  /* ---------- providers ---------- */
  let gaReady = false, queue = [];
  function loadGa4(){
    if(gaReady || !C.GA4_ID || !/^G-[A-Z0-9]{4,20}$/.test(C.GA4_ID)) return;
    gaReady = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', C.GA4_ID, {allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: true});
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(C.GA4_ID);
    document.head.appendChild(s);
  }
  function sendGa4(ev){ if(window.gtag) window.gtag('event', ev.event, Object.assign({}, ev.props, ev.exp_params)); }
  function flush(final){
    if(C.ANALYTICS_PROVIDER !== 'own' || consent !== 'accepted' || !queue.length) return;
    const batch = queue.splice(0, 50).map(e => ({t: e.t, event: e.event, props: e.props, session_id: sessionId, exp: e.exp}));
    const body = JSON.stringify(batch);
    if(final && navigator.sendBeacon){ navigator.sendBeacon(C.OWN_ENDPOINT, new Blob([body], {type: 'text/plain'})); }
    else { fetch(C.OWN_ENDPOINT, {method: 'POST', headers: {'Content-Type': 'application/json'}, body, keepalive: true}).catch(() => {}); }
    if(queue.length) flush(final);
  }
  setInterval(() => flush(false), 8000);

  /* ---------- the one tracking function ---------- */
  function cleanProps(p){
    const out = {};
    Object.keys(p || {}).slice(0, 15).forEach(k => {
      const v = p[k];
      if(typeof v === 'number' && isFinite(v)) out[k] = Math.round(v*100)/100;
      else if(typeof v === 'boolean') out[k] = v;
      else if(typeof v === 'string') out[k] = v.slice(0, 80);
    });
    return out;
  }
  function track(event, props){
    if(consent !== 'accepted') return;                                  // nothing is kept or sent without consent
    if(event === 'booking_confirmed') counters.booked = (props && props.min) || counters.booked;
    if(/^referral_/.test(event)) counters.referral++;
    if(event === 'mascot_fact_shown') counters.facts++;
    const ev = {t: Date.now(), event, props: cleanProps(props), exp: Object.assign({}, ab), exp_params: expParams()};
    journal.push({t: ev.t, event, props: ev.props});
    if(journal.length > 500) journal.shift();
    if(C.ANALYTICS_PROVIDER === 'ga4') sendGa4(ev);
    else if(C.ANALYTICS_PROVIDER === 'own'){ queue.push(ev); if(queue.length >= 20) flush(false); }
  }
  function device(){
    const ua = navigator.userAgent;
    return {device: /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : /iPad|Tablet/i.test(ua) ? 'tablet' : 'desktop',
      browser: /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'firefox' : /Chrome\//.test(ua) ? 'chrome' : /Safari\//.test(ua) ? 'safari' : 'other',
      width: Math.round(window.innerWidth), lang: (navigator.language || '').slice(0, 5)};
  }
  function startCollecting(){
    persistAb();
    if(C.ANALYTICS_PROVIDER === 'ga4') loadGa4();
    track('session_start', Object.assign({channel}, device()));
  }
  function setConsent(v){
    const was = consent;
    consent = v; lsSet(CONSENT_KEY, v);
    if(v === 'accepted' && was !== 'accepted'){ startCollecting(); track('consent_given', {}); }
    if(v === 'necessary'){
      if(was === 'accepted'){ flush(true); }
      lsDel(AB_KEY); journal.length = 0; queue.length = 0;
    }
  }
  function sessionCode(){
    if(consent !== 'accepted') return '';
    const exp = EXPS.filter(k => C.EXPERIMENTS[k]).map(k => LETTER[k] + ab[k]).join('-');
    return `${exp}|t${seconds()}|b${counters.booked}|r${counters.referral}|f${counters.facts}`;
  }
  if(consent === 'accepted') startCollecting();

  window.Anchor = window.Anchor || {};
  Object.assign(window.Anchor, {
    ab, setAb, channel, expLabel, expParams, track, sessionCode, sessionId, seconds,
    consent: () => consent, setConsent, journal: () => journal.slice(),
    forgetAll(){ ['anchor-consent', AB_KEY, 'anchor-app'].forEach(lsDel); consent = null; journal.length = 0; queue.length = 0; },
  });
})();
