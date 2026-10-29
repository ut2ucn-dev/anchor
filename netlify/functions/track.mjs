/* POST /.netlify/functions/track
   Приймає одну подію або масив до 50 подій: {t, event, props, session_id, exp}.
   Перевіряє розмір і формат, IP та заголовки не зберігає. Пише партію в Netlify Blobs (сховище "anchor-events"). */
import { getStore } from "@netlify/blobs";

const MAX_BYTES = 32 * 1024;
const MAX_EVENTS = 50;
const EVENT_RE = /^[a-z][a-z0-9_]{1,39}$/;
const SID_RE = /^[a-z0-9]{6,32}$/;
const AB = v => (v === "A" || v === "B" ? v : "-");
/* never keep anything that identifies a person, even if a client sends it */
const DENY = /^(ip|ip_address|email|mail|phone|tel|contact|name|user|user_id|lat|lng|lon|latitude|longitude|address)$/;

function cleanProps(p) {
  const out = {};
  if (!p || typeof p !== "object" || Array.isArray(p)) return out;
  for (const k of Object.keys(p).slice(0, 15)) {
    if (!/^[a-z][a-z0-9_]{0,29}$/.test(k) || DENY.test(k)) continue;
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 80);
  }
  return out;
}

function cleanEvent(e) {
  if (!e || typeof e !== "object") return null;
  if (!EVENT_RE.test(e.event || "") || !SID_RE.test(e.session_id || "")) return null;
  const t = Number(e.t);
  const now = Date.now();
  if (!Number.isFinite(t) || t < now - 7 * 864e5 || t > now + 3600e3) return null;
  const exp = e.exp || {};
  return { t, event: e.event, session_id: e.session_id, exp: { offer: AB(exp.offer), mascot: AB(exp.mascot), price: AB(exp.price), msg: AB(exp.msg), cta: AB(exp.cta) }, props: cleanProps(e.props) };
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  const text = await req.text();
  if (text.length > MAX_BYTES) return new Response("Payload Too Large", { status: 413 });
  let body;
  try { body = JSON.parse(text); } catch { return new Response("Bad JSON", { status: 400 }); }
  const list = Array.isArray(body) ? body : [body];
  if (list.length > MAX_EVENTS) return new Response("Too many events", { status: 413 });
  const events = list.map(cleanEvent).filter(Boolean);
  if (!events.length) return new Response("No valid events", { status: 400 });

  /* one blob per batch, keyed by day so export can filter by date */
  const day = new Date().toISOString().slice(0, 10);
  const key = `${day}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await getStore("anchor-events").setJSON(key, events);
  return new Response(null, { status: 204 });
};
