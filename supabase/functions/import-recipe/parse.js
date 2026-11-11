// Reads a recipe out of a web page's HTML. Pure JavaScript so it runs in the Edge Function and in tests.
// Order: schema.org JSON-LD (most recipe sites), then microdata, then a best guess from headings and lists.

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", eacute: "é", euml: "ë", egrave: "è", ecirc: "ê", iuml: "ï", ouml: "ö", uuml: "ü", agrave: "à", ccedil: "ç", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—" };
export function decode(s) {
  return String(s ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
    return ENT[e.toLowerCase()] ?? m;
  });
}
export function clean(s) { return decode(String(s ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim(); }
const line = s => clean(s).replace(/\s+/g, " ").trim();

/* "PT1H30M" → 90 */
export function minutes(iso) {
  if (typeof iso === "number") return Math.round(iso);
  const m = String(iso || "").match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m || !m[0] || m[0] === "P" || m[0] === "PT") return null;
  const t = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return t > 0 ? t : null;
}
/* "4 personen", ["4", "4 porties"], 4 → 4 */
export function servings(y) {
  const v = Array.isArray(y) ? y.find(x => /\d/.test(String(x))) ?? y[0] : y;
  const m = String(v ?? "").match(/\d+/);
  const n = m ? parseInt(m[0], 10) : null;
  return n && n > 0 && n < 100 ? n : null;
}
function imageOf(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  if (Array.isArray(img)) { for (const x of img) { const u = imageOf(x); if (u) return u; } return ""; }
  return img.url || img.contentUrl || img["@id"] || "";
}
/* Instructions come as a string, strings, HowToStep objects or HowToSection objects. */
export function steps(ins) {
  const out = [];
  const walk = x => {
    if (!x) return;
    if (typeof x === "string") { clean(x).split(/\n+/).map(s => s.trim()).filter(Boolean).forEach(s => out.push(s)); return; }
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (x.itemListElement) { if (x.name && /section/i.test(String(x["@type"]))) out.push("— " + line(x.name) + " —"); walk(x.itemListElement); return; }
    if (x.text) walk(x.text); else if (x.name) walk(x.name);
  };
  walk(ins);
  return out.map(s => s.replace(/^\d+[.)]\s+/, "")).filter(s => s.length > 1).slice(0, 60);
}
const isRecipe = o => o && typeof o === "object" && [].concat(o["@type"] || []).some(t => /(^|\/)Recipe$/i.test(String(t)));
function findRecipe(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return null;
  if (Array.isArray(node)) { for (const x of node) { const r = findRecipe(x, depth + 1); if (r) return r; } return null; }
  if (isRecipe(node)) return node;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) { const r = findRecipe(node[k], depth + 1); if (r) return r; }
  return null;
}
function parseJson(txt) {
  const t = decode(txt.trim().replace(/^<!\[CDATA\[|\]\]>$/g, "").replace(/^\s*\/\/.*$/gm, ""));
  try { return JSON.parse(t); } catch (_) {}
  try { return JSON.parse(t.replace(/[\u0000-\u001f]+/g, " ")); } catch (_) { return null; }
}

function fromJsonLd(html) {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const r = findRecipe(parseJson(m[1]));
    if (!r) continue;
    return {
      name: line(r.name || r.headline || ""),
      image: imageOf(r.image || r.thumbnailUrl),
      ingredients: [].concat(r.recipeIngredient || r.ingredients || []).map(line).filter(Boolean),
      steps: steps(r.recipeInstructions),
      servings: servings(r.recipeYield),
      minutes: minutes(r.totalTime) || ((minutes(r.prepTime) || 0) + (minutes(r.cookTime) || 0)) || null,
      via: "json-ld",
    };
  }
  return null;
}

/* itemprop="recipeIngredient" … (older sites) */
function fromMicrodata(html) {
  if (!/itemtype\s*=\s*["'][^"']*schema\.org\/Recipe/i.test(html)) return null;
  const props = name => {
    const out = [], re = new RegExp('<([a-z0-9]+)[^>]*itemprop\\s*=\\s*["\'][^"\']*\\b' + name + '\\b[^"\']*["\'][^>]*>', "gi");
    let m;
    while ((m = re.exec(html))) {
      const tag = m[0], content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i) || tag.match(/\b(?:src|href)\s*=\s*["']([^"']*)["']/i);
      if (content && !/^(ul|ol|div|section)$/i.test(m[1])) { out.push(decode(content[1])); continue; }
      const end = html.indexOf("</" + m[1], re.lastIndex);
      out.push(clean(html.slice(re.lastIndex, end < 0 ? re.lastIndex + 2000 : end)));
    }
    return out.filter(Boolean);
  };
  const ing = props("recipeIngredient").concat(props("ingredients"));
  const ins = props("recipeInstructions");
  return {
    name: line(props("name")[0] || ""), image: props("image")[0] || "",
    ingredients: ing.map(line), steps: steps(ins.join("\n")),
    servings: servings(props("recipeYield")[0]), minutes: minutes(props("totalTime")[0]), via: "microdata",
  };
}

function meta(html, prop) {
  const re = new RegExp('<meta[^>]+(?:property|name)\\s*=\\s*["\']' + prop + '["\'][^>]*>', "i"), m = html.match(re);
  const c = m && m[0].match(/content\s*=\s*["']([^"']*)["']/i);
  return c ? decode(c[1]) : "";
}
/* Last resort: the list after a heading that says ingrediënten / bereiding. */
function listAfter(html, words) {
  const re = new RegExp("<(h[1-6]|strong|b|p|div|span)[^>]*>\\s*(?:<[^>]+>\\s*)*(?:" + words + ")[^<]{0,30}<", "gi");
  const m = re.exec(html); if (!m) return [];
  const rest = html.slice(re.lastIndex, re.lastIndex + 20000);
  const list = rest.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i);
  if (!list) return [];
  return [...list[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(x => line(x[1])).filter(Boolean);
}
function fromPage(html) {
  const title = meta(html, "og:title") || line((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  return {
    name: title.replace(/\s*[|–-]\s*[^|–-]+$/, "").replace(/\s+recept$/i, "").trim(),
    image: meta(html, "og:image"),
    ingredients: listAfter(html, "ingredi[eë]nten|ingredients|benodigdheden|je hebt nodig"),
    steps: steps(listAfter(html, "bereiding|bereidingswijze|werkwijze|instructies|zo maak je het|preparation").join("\n")),
    servings: null, minutes: null, via: "page",
  };
}

export function parseRecipe(html, url) {
  const r = fromJsonLd(html) || fromMicrodata(html) || fromPage(html);
  const fallback = fromPage(html);
  if (!r.name) r.name = fallback.name;
  if (!r.image) r.image = fallback.image;
  try { if (r.image) r.image = new URL(r.image, url).href; } catch (_) { r.image = ""; }
  if (!/^https?:/i.test(r.image)) r.image = "";
  r.name = r.name.slice(0, 80);
  r.ingredients = [...new Set(r.ingredients)].slice(0, 60).map(s => s.slice(0, 120));
  r.steps = r.steps.slice(0, 60).map(s => s.slice(0, 1000));
  r.url = url;
  r.complete = !!(r.name && r.ingredients.length && r.steps.length);
  return r;
}
