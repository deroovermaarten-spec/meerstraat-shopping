// Edge Function: fetch a recipe page and return its name, photo, ingredients, steps, servings and time.
// Called by the app with the signed-in user's token (verify_jwt stays on), so only family members can use it.
import { parseRecipe } from "./parse.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

/* Only public web pages: no local or private network addresses. */
function allowed(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") return false;
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(":")) return false; // bare IP addresses
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Gebruik POST" }, 405);
  let url: URL;
  try { url = new URL(String((await req.json()).url || "").trim()); } catch (_) { return json({ error: "Dat is geen geldige link." }, 400); }
  if (!allowed(url)) return json({ error: "Deze link kan ik niet openen." }, 400);

  let html = "";
  try {
    const res = await fetch(url.href, {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MeerstraatRecepten/1.0)", "Accept": "text/html,application/xhtml+xml", "Accept-Language": "nl-BE,nl;q=0.9,en;q=0.5" },
    });
    if (!res.ok) return json({ error: "De website antwoordde niet (code " + res.status + ")." }, 502);
    if (!allowed(new URL(res.url))) return json({ error: "Deze link kan ik niet openen." }, 400);
    const reader = res.body!.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); size += value.length; if (size > 4_000_000) { reader.cancel(); break; } }
    const all = new Uint8Array(size); let at = 0;
    for (const c of chunks) { all.set(c.subarray(0, Math.max(0, size - at)), at); at += c.length; }
    html = new TextDecoder().decode(all.subarray(0, Math.min(at, size)));
  } catch (_) {
    return json({ error: "De website kon niet geladen worden." }, 502);
  }
  return json(parseRecipe(html, url.href));
});
