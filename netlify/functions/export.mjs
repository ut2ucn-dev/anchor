/* GET /.netlify/functions/export?token=…&format=json|csv&days=7
   Віддає зібрані події лише за секретним токеном зі змінної середовища EXPORT_TOKEN.
   Токен можна передати і заголовком: Authorization: Bearer … */
import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

const COLS = ["t", "time", "session_id", "event", "exp_offer", "exp_mascot", "exp_price", "props"];
const cell = v => { const s = v == null ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default async (req) => {
  const secret = Netlify.env.get("EXPORT_TOKEN");
  if (!secret || secret.length < 16) return new Response("EXPORT_TOKEN is not set (min 16 chars)", { status: 503 });
  const url = new URL(req.url);
  const given = url.searchParams.get("token") || (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!given || !same(given, secret)) return new Response("Forbidden", { status: 403 });

  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - (days - 1) * 864e5).toISOString().slice(0, 10);
  const store = getStore("anchor-events");
  const { blobs } = await store.list();
  const keys = blobs.map(b => b.key).filter(k => k.slice(0, 10) >= since).sort();
  const events = [];
  for (const key of keys) {
    const batch = await store.get(key, { type: "json" });
    if (Array.isArray(batch)) events.push(...batch);
  }

  if (url.searchParams.get("format") === "csv") {
    const rows = events.map(e => [e.t, new Date(e.t).toISOString(), e.session_id, e.event, e.exp?.offer, e.exp?.mascot, e.exp?.price, JSON.stringify(e.props || {})].map(cell).join(","));
    return new Response("﻿" + [COLS.join(","), ...rows].join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="anchor-events-${since}.csv"`, "Cache-Control": "no-store" },
    });
  }
  /* small summary on top helps the homework: sessions and events per variant */
  const summary = {};
  for (const e of events) {
    const k = `offer ${e.exp?.offer} · mascot ${e.exp?.mascot}`;
    summary[k] = summary[k] || { sessions: new Set(), events: 0 };
    summary[k].sessions.add(e.session_id); summary[k].events++;
  }
  const bySegment = Object.fromEntries(Object.entries(summary).map(([k, v]) => [k, { sessions: v.sessions.size, events: v.events }]));
  return Response.json({ since, total_events: events.length, total_sessions: new Set(events.map(e => e.session_id)).size, by_variant: bySegment, events }, { headers: { "Cache-Control": "no-store" } });
};
