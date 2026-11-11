// Meerstraat Boodschappen: shared family shopping list on Supabase.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const AISLES = [
  ["produce", "Groenten & fruit", "apple appel banana banaan tomato tomaat potato aardappel patat onion ui lettuce sla carrot wortel cucumber komkommer pepper paprika lemon citroen orange appelsien sinaas grape druif berry bes strawberry aardbei avocado garlic look leek prei spinach spinazie broccoli courgette zucchini mushroom champignon herbs kruiden pear peer kiwi melon meloen salad"],
  ["bakery", "Brood & bakkerij", "bread brood baguette pistolet croissant roll bun wraps tortilla cake taart koffiekoek cookies koekjes beschuit"],
  ["dairy", "Zuivel & eieren", "milk melk cheese kaas butter boter yoghurt yogurt egg eieren ei cream room skyr kwark platte mascarpone mozzarella"],
  ["meat", "Vlees & vis", "chicken kip beef rund pork varken mince gehakt ham bacon spek sausage worst fish vis salmon zalm tuna tonijn shrimp garnaal steak filet"],
  ["pantry", "Voorraadkast", "pasta rice rijst flour bloem sugar suiker oil olie vinegar azijn salt zout sauce saus tomatoes cereal granola muesli peanut choco jam honey honing coffee koffie tea thee soup soep spices beans bonen nuts noten crisps chips chocolate"],
  ["frozen", "Diepvries", "frozen diepvries ice ijs fries frietjes pizza peas erwten"],
  ["drinks", "Dranken", "water juice sap beer bier wine wijn soda cola lemonade limonade"],
  ["household", "Huishouden & verzorging", "toilet wc paper papier soap zeep detergent wasmiddel dish afwas shampoo toothpaste tandpasta sponge spons bags zakken foil folie tissues zakdoeken batteries batterijen nappies luiers deodorant"],
  ["other", "Overige", ""]
];
const SHOPS = [["colruyt", "Colruyt"], ["aldi", "Aldi"], ["hema", "Hema"], ["kruidvat", "Kruidvat"]];
const SHOP_NAME = Object.fromEntries(SHOPS);
const AISLE_NAME = Object.fromEntries(AISLES.map(a => [a[0], a[1]]));
const FAMILY = ["Eline", "Maarten", "Erin", "Mil"];
const STARTERS = [["Melk", "dairy", []], ["Brood", "bakery", []], ["Eieren", "dairy", []], ["Kaas in plakjes", "dairy", []], ["Bananen", "produce", []],
  ["Appels", "produce", []], ["Yoghurt", "dairy", []], ["Koffie", "pantry", []], ["Wc-papier", "household", ["kruidvat", "colruyt"]], ["Tandpasta", "household", ["kruidvat", "colruyt"]]];
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
const SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';

const $ = id => document.getElementById(id);
const key = s => String(s || "").trim().toLowerCase();
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function btn(cls, text, onClick, aria) { const b = el("button", cls, text); b.type = "button"; if (aria) b.setAttribute("aria-label", aria); if (onClick) b.addEventListener("click", onClick); return b; }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (_) { return null; } }
function fmtDate(ms) { return new Date(ms).toLocaleDateString("nl-BE", { day: "numeric", month: "short" }); }
function guessAisle(name) {
  const words = name.toLowerCase().split(/[^a-zà-ÿ]+/).filter(Boolean);
  for (const [k, , kw] of AISLES) {
    const list = kw.split(" ");
    if (words.some(w => list.some(x => x && (w === x || w.startsWith(x) || (x.length > 4 && w.includes(x)))))) return k;
  }
  return "other";
}
function shopsOf(x) { const a = Array.isArray(x.shops) ? x.shops : (x.shop ? [x.shop] : []); return a.filter(k => SHOP_NAME[k]); }
function shopTags(list) { const w = document.createDocumentFragment(); list.forEach(k => w.appendChild(el("span", "shop " + k, SHOP_NAME[k]))); return w; }
function boughtShop(i) { if (i.doneShop) return i.doneShop; const a = shopsOf(i); return a.length === 1 ? a[0] : ""; }

/* State */
let session = null, me = null, household = null, members = [], canWrite = true;
let items = [], staples = [], weeks = {}, current = null, loaded = false;
let gifts = [], claims = {}, giftsReady = true; // claims: gift id → user id (never includes your own wishes)
let recipes = [], meals = {}, menuReady = true; // meals: "YYYY-MM-DD" → { recipe, note }
let menuOffset = 0, mealQ = "", recipeQ = "", confirmIngredients = false;
let tab = store("tab") || "list"; if (!["list", "menu", "staples", "gifts", "history", "stats", "more"].includes(tab)) tab = "list";
const UNDER_MORE = ["gifts", "stats"]; // reached through the Meer tab
let shopFilter = store("shop") || "all"; if (shopFilter !== "all" && !SHOP_NAME[shopFilter]) shopFilter = "all";
let giftFor = store("giftFor") || "", giftQ = "";
let omniQ = "", staplesQ = "", editing = null, confirmFinish = false, whoOpen = false, showAllQuick = false;
let screen = "loading"; // loading | auth | onboard | app
const names = {};
const db = true; // the view code checks `db` to know the list is connected

const curWeek = () => current && current.week;
const isCurrent = i => !i.week || i.week === curWeek();
const thisWeek = () => items.filter(isCurrent);
const onListByName = n => thisWeek().find(i => key(i.name) === key(n));
const stapleByName = n => staples.find(s => key(s.name) === key(n));
const writable = () => canWrite && !!household;
function person(id) { return id && names[id] ? names[id] : ""; }

function showStatus(text, warn) { const s = $("status"); s.textContent = text; s.className = "status" + (warn ? " warn" : ""); s.hidden = !text; }
function writeFailed(e) {
  console.error(e);
  showStatus("Die wijziging is niet bewaard" + (e && e.message ? " (" + e.message + ")" : "") + ". Controleer je verbinding en probeer opnieuw.", true);
}
function must({ data, error }) { if (error) throw error; return data; }

/* Database rows → the shape the views use */
const ms = t => (t ? new Date(t).getTime() : 0);
const toItem = r => ({ id: r.id, name: r.name, qty: r.qty, cat: r.cat, shops: r.shops || [], done: r.done, doneShop: r.done_shop, by: r.added_by, doneBy: r.done_by, at: ms(r.created_at), doneAt: ms(r.done_at), week: r.week_id });
const toStaple = r => ({ id: r.id, name: r.name, cat: r.cat, shops: r.shops || [], description: r.description || "", photo: r.photo_path || "" });

/* Product photos: private storage, shown through signed links that last a day. */
const PHOTO_BUCKET = "product-photos";
const photoUrls = {};
async function refreshPhotoUrls() {
  const need = [...new Set(staples.map(s => s.photo).filter(p => p && !photoUrls[p]))];
  if (!need.length) return;
  const { data } = await sb.storage.from(PHOTO_BUCKET).createSignedUrls(need, 60 * 60 * 24);
  (data || []).forEach(x => { if (x.signedUrl) photoUrls[x.path] = x.signedUrl; });
  render();
}
function photoOf(name) { const s = stapleByName(name); return s && s.photo ? photoUrls[s.photo] || "" : ""; }
function thumb(url, cls) { const i = el("img", cls || "thumb"); i.src = url; i.alt = ""; i.loading = "lazy"; return i; }
/* Shrink a camera photo to at most 900px before upload so it stays small and fast. */
async function shrinkImage(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(res => c.toBlob(b => res(b || file), "image/jpeg", 0.82));
}
async function uploadPhoto(blob) {
  const path = household.id + "/" + crypto.randomUUID() + ".jpg";
  must(await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false }));
  photoUrls[path] = URL.createObjectURL(blob);
  return path;
}
async function deletePhoto(path) { if (path) await sb.storage.from(PHOTO_BUCKET).remove([path]); }

async function loadAll() {
  const h = household.id;
  const [hh, mem, wk, st, it] = await Promise.all([
    sb.from("households").select("*").eq("id", h).single(),
    sb.from("members").select("user_id, display_name").eq("household_id", h),
    sb.from("weeks").select("*").eq("household_id", h),
    sb.from("staples").select("*").eq("household_id", h),
    sb.from("items").select("*").eq("household_id", h).order("created_at").limit(5000),
  ]);
  household = must(hh); members = must(mem); staples = must(st).map(toStaple); items = must(it).map(toItem);
  await Promise.all([loadGifts(), loadMenu()]);
  refreshPhotoUrls().catch(() => {});
  weeks = {}; must(wk).forEach(w => { weeks[w.id] = { startedAt: ms(w.started_at), closedAt: ms(w.closed_at) }; });
  current = household.current_week ? { week: household.current_week, startedAt: (weeks[household.current_week] || {}).startedAt } : null;
  members.forEach(m => { names[m.user_id] = m.display_name; });
  loaded = true;
}
/* Gift wishlists: optional, so the rest of the app keeps working if 003_gifts.sql is not run yet. */
const toGift = r => ({ id: r.id, owner: r.owner_id, title: r.title, note: r.note || "", link: r.link || "", price: r.price || "", fav: !!r.favourite, at: ms(r.created_at) });
async function loadGifts() {
  const h = household.id;
  const [g, c] = await Promise.all([
    sb.from("gifts").select("*").eq("household_id", h).order("created_at"),
    sb.from("gift_claims").select("gift_id, claimed_by").eq("household_id", h),
  ]);
  if (g.error || c.error) { giftsReady = false; gifts = []; claims = {}; return; }
  giftsReady = true; gifts = g.data.map(toGift);
  claims = {}; c.data.forEach(x => { claims[x.gift_id] = x.claimed_by; });
}
async function addGift(title) {
  try { const r = must(await sb.from("gifts").insert({ household_id: household.id, owner_id: me, title }).select().single()); gifts.push(toGift(r)); render(); } catch (e) { writeFailed(e); }
}
async function updateGift(id, patch) {
  const g = gifts.find(x => x.id === id); if (g) Object.assign(g, patch);
  const row = { ...patch }; if ("fav" in row) { row.favourite = row.fav; delete row.fav; }
  must(await sb.from("gifts").update(row).eq("id", id));
}
async function removeGift(g) {
  gifts = gifts.filter(x => x.id !== g.id); render();
  try { must(await sb.from("gifts").delete().eq("id", g.id)); } catch (e) { writeFailed(e); scheduleReload(); }
}
async function claimGift(g) {
  const was = claims[g.id];
  if (was && was !== me) return;
  if (was) delete claims[g.id]; else claims[g.id] = me;
  render();
  try {
    if (was) must(await sb.from("gift_claims").delete().eq("gift_id", g.id));
    else must(await sb.from("gift_claims").insert({ gift_id: g.id, household_id: household.id, claimed_by: me }));
  } catch (e) { writeFailed(e); scheduleReload(); }
}

/* Weekmenu: optional too, so the app keeps working until 004_menu.sql is run. */
const toRecipe = r => ({ id: r.id, name: r.name, ingredients: r.ingredients || [], note: r.note || "", link: r.link || "", at: ms(r.created_at) });
async function loadMenu() {
  const h = household.id;
  const [r, m] = await Promise.all([
    sb.from("recipes").select("*").eq("household_id", h).order("name"),
    sb.from("meals").select("day, recipe_id, note").eq("household_id", h).order("day").limit(5000),
  ]);
  if (r.error || m.error) { menuReady = false; recipes = []; meals = {}; return; }
  menuReady = true; recipes = r.data.map(toRecipe);
  meals = {}; m.data.forEach(x => { meals[x.day] = { recipe: x.recipe_id, note: x.note || "" }; });
}
async function addRecipe(name) {
  if (recipes.some(r => key(r.name) === key(name))) return null;
  try { const r = toRecipe(must(await sb.from("recipes").insert({ household_id: household.id, name, created_by: me }).select().single())); recipes.push(r); render(); return r; } catch (e) { writeFailed(e); return null; }
}
async function updateRecipe(id, patch) {
  const r = recipes.find(x => x.id === id); if (r) Object.assign(r, patch);
  must(await sb.from("recipes").update(patch).eq("id", id));
}
async function removeRecipe(r) {
  recipes = recipes.filter(x => x.id !== r.id);
  Object.values(meals).forEach(m => { if (m.recipe === r.id) m.recipe = null; });
  render();
  try { must(await sb.from("recipes").delete().eq("id", r.id)); } catch (e) { writeFailed(e); scheduleReload(); }
}
/* Set what we eat on a day: a recipe id, a free text, or nothing (clears the day). */
async function setMeal(day, recipe, note) {
  note = (note || "").trim().slice(0, 80);
  try {
    if (!recipe && !note) { delete meals[day]; render(); must(await sb.from("meals").delete().eq("household_id", household.id).eq("day", day)); return; }
    meals[day] = { recipe: recipe || null, note }; render();
    must(await sb.from("meals").upsert({ household_id: household.id, day, recipe_id: recipe || null, note, updated_by: me, updated_at: new Date().toISOString() }, { onConflict: "household_id,day" }));
  } catch (e) { writeFailed(e); scheduleReload(); }
}

let reloadTimer = null;
function scheduleReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(async () => { try { await loadAll(); render(); } catch (e) { writeFailed(e); } }, 250); }
let channel = null;
function subscribe() {
  if (channel) sb.removeChannel(channel);
  const f = "household_id=eq." + household.id;
  channel = sb.channel("hh-" + household.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "staples", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "members", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "gifts", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "gift_claims", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "recipes", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "meals", filter: f }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "households", filter: "id=eq." + household.id }, scheduleReload)
    .subscribe();
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && household) scheduleReload(); });

/* Every product the family ever had: staples plus anything from past or current lists. */
function known() {
  const m = new Map();
  staples.forEach(s => m.set(key(s.name), { name: s.name, cat: s.cat, shops: shopsOf(s), staple: s, times: 0, last: 0 }));
  items.forEach(i => {
    const k = key(i.name); if (!k) return;
    const o = m.get(k) || { name: i.name, cat: i.cat, shops: shopsOf(i), staple: null, times: 0, last: 0 };
    if (!o.shops.length) o.shops = shopsOf(i);
    if (i.done) o.times++; o.last = Math.max(o.last, i.at || 0); m.set(k, o);
  });
  return m;
}

/* Writes. Each one updates local state right away so the screen reacts instantly, then saves. */
async function addItem({ name, qty = "", cat, shops = [] }) {
  if (onListByName(name) || !curWeek()) return;
  const row = { household_id: household.id, week_id: curWeek(), name, qty, cat: cat || guessAisle(name), shops, added_by: me };
  try { const r = must(await sb.from("items").insert(row).select().single()); items.push(toItem(r)); render(); } catch (e) { writeFailed(e); }
}
function addKnown(name) { const k = known().get(key(name)); addItem(k ? { name: k.name, cat: k.cat, shops: k.shops } : { name }); }
async function updateItem(id, patch) {
  const row = {};
  for (const [k, v] of Object.entries(patch)) row[{ doneShop: "done_shop", doneBy: "done_by", doneAt: "done_at" }[k] || k] = k === "doneAt" ? (v ? new Date(v).toISOString() : null) : v;
  const it = items.find(i => i.id === id); if (it) Object.assign(it, patch);
  must(await sb.from("items").update(row).eq("id", id));
}
async function toggle(it) {
  const sh = shopsOf(it);
  const doneShop = shopFilter !== "all" && sh.includes(shopFilter) ? shopFilter : (sh.length === 1 ? sh[0] : "");
  const p = it.done ? { done: false, doneAt: 0, doneBy: null, doneShop: "" } : { done: true, doneAt: Date.now(), doneBy: me, doneShop };
  try { const u = updateItem(it.id, p); render(); await u; } catch (e) { writeFailed(e); scheduleReload(); }
}
async function removeItem(it) {
  items = items.filter(i => i.id !== it.id); render();
  try { must(await sb.from("items").delete().eq("id", it.id)); } catch (e) { writeFailed(e); scheduleReload(); }
}
async function addStaple(name, cat, shops) {
  if (stapleByName(name)) return;
  try { const r = must(await sb.from("staples").insert({ household_id: household.id, name, cat: cat || guessAisle(name), shops: shops || [], created_by: me }).select().single()); staples.push(toStaple(r)); render(); } catch (e) { writeFailed(e); }
}
async function updateStaple(id, patch) {
  const s = staples.find(x => x.id === id); if (s) Object.assign(s, patch);
  const row = { ...patch }; if ("photo" in row) { row.photo_path = row.photo || null; delete row.photo; }
  must(await sb.from("staples").update(row).eq("id", id));
}
async function removeStaple(s) {
  staples = staples.filter(x => x.id !== s.id); render();
  try { must(await sb.from("staples").delete().eq("id", s.id)); deletePhoto(s.photo).catch(() => {}); } catch (e) { writeFailed(e); scheduleReload(); }
}
async function finishWeek() {
  try { must(await sb.rpc("finish_week", { h: household.id })); await loadAll(); } catch (e) { writeFailed(e); }
}

/* Shared pieces */
function shopPicker(selected) {
  const box = el("div", "picker"); box.setAttribute("role", "group"); box.setAttribute("aria-label", "Winkels");
  SHOPS.forEach(([k, n]) => {
    const b = btn("pick " + k, n, () => {
      const i = selected.indexOf(k); if (i >= 0) selected.splice(i, 1); else selected.push(k);
      b.setAttribute("aria-pressed", selected.includes(k) ? "true" : "false");
    });
    b.setAttribute("aria-pressed", selected.includes(k) ? "true" : "false"); box.appendChild(b);
  });
  return box;
}
function aisleSelect(id, value, onChange) {
  const s = el("select", "txt"); s.id = id;
  AISLES.forEach(([k, n]) => { const o = el("option", null, n); o.value = k; s.appendChild(o); });
  s.value = AISLE_NAME[value] ? value : "other"; s.addEventListener("change", () => onChange(s.value)); return s;
}
function field(labelText, control, asDiv) { const l = el(asDiv ? "div" : "label", "f"); l.append(el("span", null, labelText), control); return l; }

/* One editor for list items and staples. The draft lives in `editing`, so live updates from others don't wipe it. */
function editorFor(kind, obj) {
  if (!editing || editing.id !== obj.id || editing.kind !== kind) return null;
  const d = editing.draft;
  const box = el("div", "editor");
  const nameIn = el("input", "txt"); nameIn.id = "ed-name"; nameIn.value = d.name; nameIn.maxLength = 80; nameIn.addEventListener("input", () => { d.name = nameIn.value; });
  if (kind === "item") {
    const qtyIn = el("input", "txt"); qtyIn.id = "ed-qty"; qtyIn.value = d.qty; qtyIn.maxLength = 12; qtyIn.placeholder = "bv. 2"; qtyIn.addEventListener("input", () => { d.qty = qtyIn.value; });
    const two = el("div", "two"); two.append(field("Naam", nameIn), field("Aantal", qtyIn)); box.appendChild(two);
  } else box.appendChild(field("Naam", nameIn));
  box.appendChild(field("Waar te koop", shopPicker(d.shops), true));
  box.appendChild(field("Afdeling", aisleSelect("ed-cat", d.cat, v => { d.cat = v; })));
  if (kind === "staple") {
    const desc = el("textarea", "txt"); desc.id = "ed-desc"; desc.rows = 2; desc.maxLength = 300; desc.value = d.description;
    desc.placeholder = "bv. halfvolle, groene dop · merk Boni · 1 liter";
    desc.addEventListener("input", () => { d.description = desc.value; });
    box.appendChild(field("Beschrijving (optioneel)", desc));
    const ph = el("div", "photo-edit");
    const shown = d.previewUrl || (!d.removePhoto && d.photo ? photoUrls[d.photo] : "");
    if (shown) ph.appendChild(thumb(shown, "photo-big"));
    const file = el("input"); file.type = "file"; file.accept = "image/*"; file.id = "ed-photo"; file.hidden = true;
    file.addEventListener("change", async () => {
      const f = file.files && file.files[0]; if (!f) return;
      d.newBlob = await shrinkImage(f); d.previewUrl = URL.createObjectURL(d.newBlob); d.removePhoto = false; render();
    });
    const pick = btn("btn", shown ? "Andere foto" : "Foto toevoegen", () => file.click());
    const btns = el("div", "acts"); btns.style.justifyContent = "flex-start"; btns.append(pick);
    if (shown) btns.appendChild(btn("btn ghost-danger", "Foto verwijderen", () => { d.newBlob = null; d.previewUrl = ""; d.removePhoto = true; render(); }));
    ph.append(file, btns);
    box.appendChild(field("Foto (optioneel)", ph, true));
  }
  if (kind === "item") {
    const t = el("label", "toggle"); const cb = el("input"); cb.type = "checkbox"; cb.id = "ed-staple"; cb.checked = d.staple;
    cb.addEventListener("change", () => { d.staple = cb.checked; });
    t.append(cb, el("span", null, "Vast item ★")); box.appendChild(t);
  }
  const acts = el("div", "acts");
  const del = btn("btn ghost-danger", kind === "item" ? "Van de lijst halen" : "Verwijderen", async () => { editing = null; if (kind === "item") await removeItem(obj); else await removeStaple(obj); render(); });
  const right = el("div", "acts");
  right.append(btn("btn", "Annuleren", () => { editing = null; render(); }), btn("btn primary", "Bewaren", async e => {
    e.currentTarget.disabled = true;
    const name = d.name.trim() || obj.name, oldKey = key(obj.name);
    try {
      if (kind === "item") {
        await updateItem(obj.id, { name, qty: d.qty.trim(), shops: d.shops, cat: d.cat });
        const st = stapleByName(obj.name) || stapleByName(name);
        if (d.staple && !st) await addStaple(name, d.cat, d.shops);
        else if (d.staple && st) await updateStaple(st.id, { name, shops: d.shops, cat: d.cat });
        else if (!d.staple && st) await removeStaple(st);
      } else {
        const patch = { name, shops: d.shops, cat: d.cat, description: d.description.trim() };
        const oldPhoto = obj.photo;
        if (d.newBlob) patch.photo = await uploadPhoto(d.newBlob);
        else if (d.removePhoto) patch.photo = "";
        await updateStaple(obj.id, patch);
        if ((d.newBlob || d.removePhoto) && oldPhoto) deletePhoto(oldPhoto).catch(() => {});
        for (const it of thisWeek().filter(i => !i.done && key(i.name) === oldKey)) await updateItem(it.id, { name, shops: d.shops, cat: d.cat });
      }
    } catch (err) { writeFailed(err); }
    editing = null; render();
  }));
  acts.append(del, right); box.appendChild(acts);
  return box;
}
function openEditor(kind, obj) {
  if (editing && editing.id === obj.id) { editing = null; render(); return; }
  editing = { kind, id: obj.id, draft: { name: obj.name, qty: obj.qty || "", shops: [...shopsOf(obj)], cat: obj.cat || "other", staple: !!stapleByName(obj.name), description: obj.description || "", photo: obj.photo || "", newBlob: null, previewUrl: "", removePhoto: false } };
  render();
}

function itemRow(it) {
  const li = el("li"); if (it.done) li.className = "done";
  const main = el("div", "row-main");
  const b = btn("check", null, () => toggle(it)); b.disabled = !writable();
  b.setAttribute("aria-pressed", it.done ? "true" : "false");
  b.innerHTML = '<span class="box">' + CHECK + '</span>';
  const pu = photoOf(it.name); if (pu) b.appendChild(thumb(pu));
  const lab = el("span", "label"); lab.appendChild(el("span", "name", it.name));
  const st0 = stapleByName(it.name); if (st0 && st0.description && !it.done) lab.appendChild(el("span", "desc", st0.description));
  const meta = el("span", "meta");
  if (stapleByName(it.name)) meta.appendChild(el("span", "fav", "★"));
  meta.appendChild(shopTags(it.done && it.doneShop ? [it.doneShop] : shopsOf(it)));
  const pd = person(it.doneBy, it.doneByName), pa = person(it.by, it.byName);
  const who = it.done ? (pd ? "In de mand · " + pd : "In de mand") : pa;
  if (who) meta.appendChild(el("span", null, who));
  mealsForItem(it.name).forEach(t => meta.appendChild(el("span", "menu-tag", "🍴 " + t)));
  if (meta.childNodes.length) lab.appendChild(meta);
  b.appendChild(lab);
  if (it.qty) b.appendChild(el("span", "qty", it.qty));
  const more = btn("more", "⋯", () => openEditor("item", it), "Details van " + it.name); more.disabled = !writable();
  more.setAttribute("aria-expanded", editing && editing.id === it.id ? "true" : "false");
  main.append(b, more); li.appendChild(main);
  const ed = editorFor("item", it); if (ed) li.appendChild(ed);
  return li;
}

function stapleRow(s) {
  const onList = onListByName(s.name);
  const li = el("li"); if (onList) li.className = "on";
  const main = el("div", "row-main");
  const b = btn("check", null, () => { if (!onList) addItem({ name: s.name, cat: s.cat, shops: shopsOf(s) }); else if (!onList.done) removeItem(onList); });
  b.disabled = !writable(); b.setAttribute("aria-pressed", onList ? "true" : "false");
  b.innerHTML = '<span class="box">' + CHECK + '</span>';
  if (s.photo && photoUrls[s.photo]) b.appendChild(thumb(photoUrls[s.photo]));
  const lab = el("span", "label"); lab.appendChild(el("span", "name", s.name));
  if (s.description) lab.appendChild(el("span", "desc", s.description));
  const meta = el("span", "meta"); meta.appendChild(shopTags(shopsOf(s)));
  meta.appendChild(el("span", null, onList ? (onList.done ? "In de mand" : "Op de lijst") : AISLE_NAME[s.cat] || "Overige"));
  lab.appendChild(meta); b.appendChild(lab);
  const more = btn("more", "⋯", () => openEditor("staple", s), "Bewerk " + s.name); more.disabled = !writable();
  more.setAttribute("aria-expanded", editing && editing.id === s.id ? "true" : "false");
  main.append(b, more); li.appendChild(main);
  const ed = editorFor("staple", s); if (ed) li.appendChild(ed);
  return li;
}

/* Search-or-add field */
function omni(placeholder, value, onInput, onEnter) {
  const wrap = el("div", "omni");
  const f = el("div", "field"); f.innerHTML = SEARCH;
  const inp = el("input"); inp.type = "text"; inp.id = "omni-" + tab; inp.placeholder = placeholder; inp.value = value; inp.autocomplete = "off"; inp.enterKeyHint = "done";
  inp.setAttribute("aria-label", placeholder);
  inp.addEventListener("input", () => onInput(inp.value));
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); onEnter(inp.value); } if (e.key === "Escape") onInput(""); });
  f.appendChild(inp);
  if (value) f.appendChild(btn("clear", "×", () => onInput(""), "Wissen"));
  wrap.appendChild(f);
  return wrap;
}
function matches(q) {
  const t = key(q); if (!t) return [];
  return [...known().values()].filter(o => key(o.name).includes(t))
    .sort((a, b) => (key(a.name).startsWith(t) ? 0 : 1) - (key(b.name).startsWith(t) ? 0 : 1) || (!!b.staple - !!a.staple) || b.times - a.times || a.name.localeCompare(b.name)).slice(0, 7);
}
function knownRow(o, onPick, icon, extra) {
  const r = btn("res" + (extra || ""), null, onPick);
  const lab = el("span", "label"); lab.appendChild(el("span", "name", o.name));
  const meta = el("span", "meta"); if (o.staple) meta.appendChild(el("span", "fav", "★ vast item"));
  meta.appendChild(shopTags(o.shops || []));
  if (!o.staple && o.times) meta.appendChild(el("span", null, o.times + "× gekocht" + (o.last ? " · laatst " + fmtDate(o.last) : "")));
  if (meta.childNodes.length) lab.appendChild(meta);
  r.append(lab, el("span", "plus", icon));
  return r;
}
function newRow(text, sub, onPick) {
  const r = btn("res new", null, onPick); r.disabled = !writable();
  const lab = el("span", "label"); lab.append(el("span", "name", text), el("span", "meta", sub));
  r.append(lab, el("span", "plus", "+")); return r;
}

/* Views */
function viewList(v) {
  const week = thisWeek(), open = week.filter(i => !i.done).length;
  const q = omniQ.trim();
  const om = omni("Zoek of voeg iets toe…", omniQ, val => { omniQ = val; render(); }, val => {
    const n = val.trim(); if (!n) return;
    const exact = known().get(key(n)); omniQ = "";
    if (exact) addKnown(exact.name); else addItem({ name: n });
    render();
  });
  v.appendChild(om);
  if (q) {
    const res = el("div", "results");
    const hits = matches(q);
    hits.forEach(o => {
      const onList = onListByName(o.name);
      const r = knownRow(o, () => { if (!onList) addKnown(o.name); omniQ = ""; render(); }, onList ? "✓" : "+", onList ? " onlist" : "");
      if (onList) r.querySelector(".meta") ? r.querySelector(".meta").appendChild(el("span", null, "staat al op de lijst")) : null;
      r.disabled = !writable() && !onList; res.appendChild(r);
    });
    if (!hits.some(o => key(o.name) === key(q))) res.appendChild(newRow("“" + q + "” toevoegen", "Nieuw product · " + AISLE_NAME[guessAisle(q)], () => { addItem({ name: q }); omniQ = ""; render(); }));
    om.appendChild(res);
    return;
  }

  if (week.length) {
    const p = el("div", "progress");
    const row = el("div", "row"); const l = el("span"); l.append(el("b", null, String(week.length - open)), document.createTextNode(" van " + week.length + " in de mand"));
    row.append(l, el("span", null, open ? open + " te halen" : "Alles in de mand"));
    const bar = el("div", "bar"); const fill = el("i"); fill.style.width = ((week.length - open) / week.length * 100) + "%"; bar.appendChild(fill);
    p.append(row, bar); v.appendChild(p);
  }

  const missing = staples.filter(s => !onListByName(s.name)).sort((a, b) => a.name.localeCompare(b.name));
  if (missing.length && writable()) {
    const qk = el("div", "quick");
    const head = el("div", "quick-head"); head.appendChild(el("h2", null, "Vaste items toevoegen"));
    head.appendChild(btn("link", "Alle " + missing.length + " toevoegen", async e => { e.currentTarget.disabled = true; for (const s of missing) await addItem({ name: s.name, cat: s.cat, shops: shopsOf(s) }); }));
    qk.appendChild(head);
    const chips = el("div", "quick-chips");
    (showAllQuick ? missing : missing.slice(0, 8)).forEach(s => chips.appendChild(btn("qchip", s.name, () => addItem({ name: s.name, cat: s.cat, shops: shopsOf(s) }), s.name + " toevoegen")));
    if (missing.length > 8) chips.appendChild(btn("link", showAllQuick ? "Minder tonen" : "+" + (missing.length - 8) + " meer", () => { showAllQuick = !showAllQuick; render(); }));
    qk.appendChild(chips); v.appendChild(qk);
  }

  if (!week.length) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "De lijst van deze week is leeg"));
    e.appendChild(el("span", null, staples.length ? "Tik hierboven op je vaste items, of zoek en voeg iets toe." : "Typ hierboven wat je nodig hebt. Wat je elke week koopt, bewaar je als vast item."));
    if (!staples.length) e.appendChild(btn("btn primary", "Vaste items instellen", () => setTab("staples")));
    v.appendChild(e); return;
  }

  const counts = {}; week.filter(i => !i.done).forEach(i => shopsOf(i).forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
  const chips = el("div", "chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Winkel");
  [["all", "Alle winkels", open], ...SHOPS.map(([k, n]) => [k, n, counts[k] || 0])].forEach(([k, n, c]) => {
    const ch = btn("chip", null, () => { shopFilter = k; store("shop", k); render(); });
    ch.setAttribute("aria-pressed", shopFilter === k ? "true" : "false");
    ch.append(el("span", null, n), el("span", "n", String(c))); chips.appendChild(ch);
  });
  v.appendChild(chips);
  if (shopFilter !== "all") v.appendChild(el("p", "hint", "Je ziet wat je bij " + SHOP_NAME[shopFilter] + " kunt halen, plus producten zonder winkel."));

  const shown = week.filter(i => shopFilter === "all" || !shopsOf(i).length || shopsOf(i).includes(shopFilter));
  const todo = shown.filter(i => !i.done), done = shown.filter(i => i.done);
  for (const [k, label] of AISLES) {
    const group = todo.filter(i => (AISLE_NAME[i.cat] ? i.cat : "other") === k).sort((a, b) => a.name.localeCompare(b.name));
    if (!group.length) continue;
    const sec = el("section", "section"); const h = el("h2", null, label); h.appendChild(el("span", null, String(group.length)));
    const ul = el("ul", "rows"); group.forEach(it => ul.appendChild(itemRow(it)));
    sec.append(h, ul); v.appendChild(sec);
  }
  if (!todo.length && shown.length) v.appendChild(el("p", "hint center", shopFilter === "all" ? "Alles zit in de mand. Goed gedaan!" : "Niets meer te halen bij " + SHOP_NAME[shopFilter] + "."));
  if (done.length) {
    const sec = el("section", "section"); const h = el("h2", null, "In de mand"); h.appendChild(el("span", null, String(done.length)));
    const ul = el("ul", "rows"); [...done].sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).forEach(it => ul.appendChild(itemRow(it)));
    sec.append(h, ul); v.appendChild(sec);
  }

  const foot = el("div", "weekfoot");
  foot.appendChild(el("span", null, "Klaar met winkelen? Sluit de week af."));
  const fin = btn("btn", "Week afsluiten", () => { confirmFinish = true; render(); }); fin.disabled = !writable();
  foot.appendChild(fin); v.appendChild(foot);
  if (confirmFinish) {
    const doneN = week.length - open;
    const c = el("div", "confirm");
    c.appendChild(el("span", null, `Deze week gaat naar de historiek (${doneN} gekocht) en je start met een lege lijst.` + (open ? ` ${open} niet-afgevinkt${open === 1 ? " product gaat" : "e producten gaan"} mee naar volgende week.` : "")));
    const a = el("div", "acts"); a.style.justifyContent = "flex-end";
    a.append(btn("btn", "Annuleren", () => { confirmFinish = false; render(); }), btn("btn primary", "Week afsluiten", async e => { e.currentTarget.disabled = true; await finishWeek(); confirmFinish = false; render(); }));
    c.appendChild(a); v.appendChild(c);
  }
}

function viewStaples(v) {
  const q = staplesQ.trim();
  const om = omni("Zoek of maak een vast item…", staplesQ, val => { staplesQ = val; render(); }, val => {
    const n = val.trim(); if (!n) return;
    if (!stapleByName(n)) { const k = known().get(key(n)); addStaple(k ? k.name : n, k ? k.cat : guessAisle(n), k ? k.shops : []); }
    staplesQ = ""; render();
  });
  v.appendChild(om);
  if (q) {
    const t = key(q);
    const hitsS = staples.filter(s => key(s.name).includes(t)).sort((a, b) => a.name.localeCompare(b.name));
    const others = matches(q).filter(o => !o.staple);
    if (hitsS.length) { const sec = el("section", "section"); sec.appendChild(el("h2", null, "Vaste items")); const ul = el("ul", "rows"); hitsS.forEach(s => ul.appendChild(stapleRow(s))); sec.appendChild(ul); v.appendChild(sec); }
    const res = el("div", "results flat");
    others.forEach(o => { const r = knownRow(o, () => { addStaple(o.name, o.cat, o.shops); staplesQ = ""; render(); }, "★"); r.disabled = !writable(); res.appendChild(r); });
    if (!stapleByName(q) && !others.some(o => key(o.name) === t)) res.appendChild(newRow("“" + q + "” als vast item bewaren", AISLE_NAME[guessAisle(q)], () => { addStaple(q, guessAisle(q), []); staplesQ = ""; render(); }));
    if (res.childNodes.length) { const sec2 = el("section", "section"); sec2.append(el("h2", null, "Als vast item bewaren"), res); v.appendChild(sec2); }
    return;
  }
  if (!staples.length) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Nog geen vaste items"));
    e.appendChild(el("span", null, "Vaste items koop je bijna elke week. Typ hierboven om er een te maken, of start met een basisset en pas die aan."));
    if (writable()) e.appendChild(btn("btn primary", "Start met 10 basisproducten", async ev => { ev.currentTarget.disabled = true; for (const [n, c, s] of STARTERS) await addStaple(n, c, s); }));
    v.appendChild(e);
  } else {
    const onCount = staples.filter(s => onListByName(s.name)).length;
    const sec = el("section", "section");
    const h = el("h2", null, "Jouw vaste items"); h.appendChild(el("span", null, onCount + " van " + staples.length + " op de lijst"));
    sec.appendChild(h);
    sec.appendChild(el("p", "hint", "Vink aan om op de lijst van deze week te zetten. Met ⋯ pas je naam, winkels, afdeling, beschrijving en foto aan."));
    const ul = el("ul", "rows");
    AISLES.forEach(([k]) => staples.filter(s => (AISLE_NAME[s.cat] ? s.cat : "other") === k).sort((a, b) => a.name.localeCompare(b.name)).forEach(s => ul.appendChild(stapleRow(s))));
    sec.appendChild(ul); v.appendChild(sec);
  }
  const by = {};
  items.filter(i => i.done && !isCurrent(i)).forEach(i => { const k = key(i.name); (by[k] = by[k] || { name: i.name, cat: i.cat, shops: shopsOf(i), weeks: new Set() }).weeks.add(i.week); });
  const often = Object.values(by).filter(o => o.weeks.size >= 2 && !stapleByName(o.name)).sort((a, b) => b.weeks.size - a.weeks.size).slice(0, 8);
  const s2 = el("section", "section"); s2.appendChild(el("h2", null, "Vaak gekocht, nog geen vast item"));
  if (often.length) {
    const res = el("div", "results flat");
    often.forEach(o => { const r = knownRow({ name: o.name, shops: o.shops }, () => addStaple(o.name, o.cat, o.shops), "★"); r.querySelector(".label").appendChild(el("span", "meta", o.weeks.size + " weken gekocht")); r.disabled = !writable(); res.appendChild(r); });
    s2.appendChild(res);
  } else s2.appendChild(el("p", "hint", "Na een paar afgesloten weken stellen we hier voor wat je telkens opnieuw koopt."));
  v.appendChild(s2);
}

function viewHistory(v) {
  const groups = {};
  items.filter(i => !isCurrent(i)).forEach(i => { (groups[i.week] = groups[i.week] || []).push(i); });
  const past = Object.entries(groups).map(([id, list]) => ({ id, list, start: (weeks[id] && weeks[id].startedAt) || Math.min(...list.map(i => i.at || 0)) })).sort((a, b) => b.start - a.start);
  if (!past.length) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Nog geen afgesloten weken"));
    e.appendChild(el("span", null, "Tik onderaan Deze week op Week afsluiten. Die lijst komt dan hier terecht."));
    v.appendChild(e); return;
  }
  v.appendChild(el("p", "hint", "Tik op + om iets opnieuw op de lijst van deze week te zetten."));
  past.forEach((w, idx) => {
    const d = el("details", "week"); if (idx === 0) d.open = true;
    const bought = w.list.filter(i => i.done).length;
    const sum = el("summary", null, "Week van " + fmtDate(w.start));
    sum.appendChild(el("span", null, bought + " gekocht" + (w.list.length - bought ? " · " + (w.list.length - bought) + " overgeslagen" : "")));
    d.appendChild(sum);
    const ul = el("ul");
    [...w.list].sort((a, b) => (b.done - a.done) || a.name.localeCompare(b.name)).forEach(i => {
      const li = el("li", i.done ? "" : "missed");
      const lab = el("span", "label"); lab.appendChild(el("span", "name", (i.done ? "✓ " : "– ") + i.name + (i.qty ? " (" + i.qty + ")" : "")));
      const meta = el("span", "meta"); meta.appendChild(shopTags(i.done && boughtShop(i) ? [boughtShop(i)] : shopsOf(i)));
      const p = i.done ? person(i.doneBy, i.doneByName) : person(i.by, i.byName); if (p) meta.appendChild(el("span", null, p));
      lab.appendChild(meta); li.appendChild(lab);
      const onList = onListByName(i.name);
      const add = btn("addone", onList ? "✓" : "+", () => { if (!onList) addItem({ name: i.name, cat: i.cat, shops: shopsOf(i), qty: i.qty || "" }); }, onList ? i.name + " staat al op de lijst" : i.name + " opnieuw toevoegen");
      add.disabled = !writable() || !!onList; li.appendChild(add);
      ul.appendChild(li);
    });
    d.appendChild(ul); v.appendChild(d);
  });
}

/* Cadeaus: one wishlist per family member. You fill in your own; the others can say "ik koop dit". */
function safeLink(u) {
  const t = String(u || "").trim(); if (!t) return "";
  const full = /^https?:\/\//i.test(t) ? t : "https://" + t;
  try { const x = new URL(full); return x.protocol === "http:" || x.protocol === "https:" ? x.href : ""; } catch (_) { return ""; }
}
function linkHost(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (_) { return "link"; } }
function giftEditor(g) {
  if (!editing || editing.kind !== "gift" || editing.id !== g.id) return null;
  const d = editing.draft, box = el("div", "editor");
  const t = el("input", "txt"); t.id = "ed-gtitle"; t.value = d.title; t.maxLength = 120; t.addEventListener("input", () => { d.title = t.value; });
  const pr = el("input", "txt"); pr.id = "ed-gprice"; pr.value = d.price; pr.maxLength = 30; pr.placeholder = "bv. € 25"; pr.addEventListener("input", () => { d.price = pr.value; });
  const two = el("div", "two"); two.append(field("Wat", t), field("Prijs (ongeveer)", pr)); box.appendChild(two);
  const ln = el("input", "txt"); ln.id = "ed-glink"; ln.type = "url"; ln.inputMode = "url"; ln.value = d.link; ln.maxLength = 1000; ln.placeholder = "https://…"; ln.addEventListener("input", () => { d.link = ln.value; });
  box.appendChild(field("Link naar de winkel (optioneel)", ln));
  const n = el("textarea", "txt"); n.id = "ed-gnote"; n.rows = 2; n.maxLength = 500; n.value = d.note; n.placeholder = "bv. maat M, in het blauw, mag ook tweedehands";
  n.addEventListener("input", () => { d.note = n.value; });
  box.appendChild(field("Uitleg (optioneel)", n));
  const tg = el("label", "toggle"); const cb = el("input"); cb.type = "checkbox"; cb.id = "ed-gfav"; cb.checked = d.fav;
  cb.addEventListener("change", () => { d.fav = cb.checked; }); tg.append(cb, el("span", null, "Heel graag ♥")); box.appendChild(tg);
  const acts = el("div", "acts"), right = el("div", "acts");
  right.append(btn("btn", "Annuleren", () => { editing = null; render(); }), btn("btn primary", "Bewaren", async e => {
    e.currentTarget.disabled = true;
    try { await updateGift(g.id, { title: d.title.trim() || g.title, price: d.price.trim(), link: d.link.trim() ? safeLink(d.link) || d.link.trim() : "", note: d.note.trim(), fav: d.fav }); } catch (err) { writeFailed(err); }
    editing = null; render();
  }));
  acts.append(btn("btn ghost-danger", "Verwijderen", async () => { editing = null; await removeGift(g); }), right);
  box.appendChild(acts);
  return box;
}
function giftRow(g, mine) {
  const by = claims[g.id], li = el("li", "gift" + (!mine && by ? " claimed" : ""));
  const main = el("div", "row-main");
  const lab = el("div", "label");
  const nm = el("span", "name", g.title); if (g.fav) nm.prepend(el("span", "heart", "♥ ")); lab.appendChild(nm);
  if (g.note) lab.appendChild(el("span", "desc", g.note));
  const meta = el("span", "meta");
  if (g.price) meta.appendChild(el("span", "price", g.price));
  const href = safeLink(g.link);
  if (href) { const a = el("a", "glink", linkHost(href) + " ↗"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.appendChild(a); }
  if (!mine && by) meta.appendChild(el("span", "who-buys", by === me ? "Jij koopt dit" : "Wordt gekocht door " + (person(by) || "iemand")));
  if (meta.childNodes.length) lab.appendChild(meta);
  main.appendChild(lab);
  if (mine) {
    const more = btn("more", "⋯", () => {
      if (editing && editing.id === g.id) { editing = null; render(); return; }
      editing = { kind: "gift", id: g.id, draft: { title: g.title, price: g.price, link: g.link, note: g.note, fav: g.fav } }; render();
    }, "Bewerk " + g.title);
    more.setAttribute("aria-expanded", editing && editing.id === g.id ? "true" : "false"); main.appendChild(more);
  } else {
    const c = btn("btn claim" + (by === me ? " primary" : ""), by === me ? "✓ Ik koop dit" : by ? "Al genomen" : "Ik koop dit", () => claimGift(g));
    c.setAttribute("aria-pressed", by === me ? "true" : "false"); c.disabled = !!by && by !== me; main.appendChild(c);
  }
  li.appendChild(main);
  const ed = mine ? giftEditor(g) : null; if (ed) li.appendChild(ed);
  return li;
}
function viewGifts(v) {
  if (!giftsReady) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Cadeaulijstjes zijn nog niet geactiveerd"));
    e.appendChild(el("span", null, "Voer eenmalig supabase/003_gifts.sql uit in de Supabase SQL Editor. Daarna verschijnen de lijstjes hier."));
    v.appendChild(e); return;
  }
  const ppl = [...members].sort((a, b) => (a.user_id === me ? -1 : b.user_id === me ? 1 : a.display_name.localeCompare(b.display_name)));
  if (!ppl.some(m => m.user_id === giftFor)) giftFor = me;
  const chips = el("div", "chips"); chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Wiens lijstje");
  ppl.forEach(m => {
    const n = gifts.filter(g => g.owner === m.user_id).length;
    const ch = btn("chip", null, () => { giftFor = m.user_id; store("giftFor", giftFor); editing = null; giftQ = ""; render(); });
    ch.setAttribute("aria-pressed", giftFor === m.user_id ? "true" : "false");
    ch.append(el("span", null, m.user_id === me ? "Mijn lijstje" : m.display_name), el("span", "n", String(n))); chips.appendChild(ch);
  });
  v.appendChild(chips);
  const mine = giftFor === me, list = gifts.filter(g => g.owner === giftFor);
  if (mine) {
    const om = omni("Wat wens je? Typ en druk op Enter…", giftQ, val => { giftQ = val; render(); }, val => { const t = val.trim(); if (!t) return; giftQ = ""; addGift(t); });
    if (giftQ.trim()) { const res = el("div", "results"); res.appendChild(newRow("“" + giftQ.trim() + "” op mijn lijstje zetten", "Met ⋯ voeg je daarna een link, prijs of uitleg toe", () => { const t = giftQ.trim(); giftQ = ""; addGift(t); })); om.appendChild(res); }
    v.appendChild(om);
    v.appendChild(el("p", "hint", "Jouw lijstje is zichtbaar voor het hele gezin. Wie iets koopt, zie jij niet: zo blijft het een verrassing."));
  } else {
    const who = person(giftFor) || "dit gezinslid";
    v.appendChild(el("p", "hint", "Tik op Ik koop dit, dan weet de rest dat het geregeld is. " + who + " ziet dat niet."));
  }
  if (!list.length) {
    const e = el("div", "empty");
    e.appendChild(el("b", null, mine ? "Je lijstje is nog leeg" : (person(giftFor) || "Dit gezinslid") + " heeft nog niets op het lijstje gezet"));
    e.appendChild(el("span", null, mine ? "Typ hierboven wat je graag zou krijgen." : "Vraag of ze hun lijstje willen invullen via het tabblad Cadeaus."));
    v.appendChild(e); return;
  }
  const order = (a, b) => (b.fav - a.fav) || a.at - b.at;
  const open = list.filter(g => mine || !claims[g.id]).sort(order), taken = mine ? [] : list.filter(g => claims[g.id]).sort(order);
  if (open.length) {
    const sec = el("section", "section"); const h = el("h2", null, mine ? "Mijn wensen" : "Nog te kopen"); h.appendChild(el("span", null, String(open.length)));
    const ul = el("ul", "rows"); open.forEach(g => ul.appendChild(giftRow(g, mine))); sec.append(h, ul); v.appendChild(sec);
  }
  if (taken.length) {
    const sec = el("section", "section"); const h = el("h2", null, "Al geregeld"); h.appendChild(el("span", null, String(taken.length)));
    const ul = el("ul", "rows"); taken.forEach(g => ul.appendChild(giftRow(g, false))); sec.append(h, ul); v.appendChild(sec);
  }
}

/* Weekmenu: per day what we eat, picked from the family's list of favourite recipes. */
const DAY_SHORT = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const DAY_LONG = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];
function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function weekDays(offset) {
  const t = new Date(); t.setHours(12, 0, 0, 0);
  const mon = new Date(t); mon.setDate(t.getDate() - ((t.getDay() + 6) % 7) + 7 * offset);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
}
const recipeById = id => recipes.find(r => r.id === id);
function mealTitle(m) { if (!m) return ""; const r = m.recipe && recipeById(m.recipe); return r ? r.name : m.note; }
/* How often and when a recipe was eaten (up to today), so the picker can suggest what you haven't had in a while. */
function recipeStats() {
  const today = dayKey(new Date()), s = {};
  for (const [day, m] of Object.entries(meals)) {
    if (!m.recipe || day > today) continue;
    const o = s[m.recipe] = s[m.recipe] || { times: 0, last: "" };
    o.times++; if (day > o.last) o.last = day;
  }
  return s;
}
const dayMs = k => new Date(k + "T12:00:00").getTime();
/* "500 g gehakt" → qty "500 g", name "Gehakt". Lines without an amount are kept whole. */
function parseIngredient(line) {
  const t = String(line || "").trim().replace(/^[-•*]\s*/, ""); if (!t) return null;
  const m = t.match(/^(\d+(?:[.,/]\d+)?\s*(?:kg|g|gr|gram|l|liter|dl|cl|ml|el|tl|st|stuks?|blikjes?|blik|potjes?|pot|pakjes?|pak|zakjes?|zak|bosjes?|bos|teentjes?|plakjes?|x)?\.?)\s+(.+)$/i);
  const name = (m ? m[2] : t).trim(), qty = m ? m[1].replace(/\.$/, "").trim() : "";
  return { name: name.charAt(0).toUpperCase() + name.slice(1), qty: qty.slice(0, 12) };
}
/* "500 g" + "500 g" → "1000 g"; different units stay side by side ("1 + 200 g"). */
function addQty(a, b) {
  if (!a || !b) return a || b;
  const pa = a.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/), pb = b.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (pa && pb && pa[2].toLowerCase() === pb[2].toLowerCase()) {
    const n = parseFloat(pa[1].replace(",", ".")) + parseFloat(pb[1].replace(",", "."));
    return (String(Math.round(n * 100) / 100).replace(".", ",") + (pa[2] ? " " + pa[2] : "")).trim();
  }
  return a + " + " + b;
}
/* Ingredients of several recipes as one list: the same product once, with the amounts added up. */
function ingredientsOf(recipeList) {
  const seen = new Map();
  recipeList.forEach(r => r.ingredients.forEach(l => {
    const p = parseIngredient(l); if (!p || p.name.length > 80) return;
    const k = key(p.name), hk = [...seen.keys()].find(x => sameProduct(x, k)), had = hk && seen.get(hk);
    if (had) had.qty = addQty(had.qty, p.qty); else seen.set(k, { ...p });
  }));
  return [...seen.values()];
}
/* Which upcoming meals (today and the next 6 days) need this product, e.g. "Spaghetti bolognese · do". */
function sameProduct(a, b) {
  if (a === b) return true;
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  return s.length >= 2 && l.startsWith(s) && l.length - s.length <= 2; // ui / uien, wortel / wortels
}
const onListLike = n => thisWeek().find(i => sameProduct(key(i.name), key(n)));
function mealsForItem(name) {
  if (!menuReady || !recipes.length) return [];
  const k = key(name), out = [], start = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const m = meals[dayKey(d)], r = m && m.recipe && recipeById(m.recipe);
    if (!r || !r.ingredients.some(l => { const p = parseIngredient(l); return p && sameProduct(key(p.name), k); })) continue;
    const label = r.name + " · " + (i === 0 ? "vandaag" : i === 1 ? "morgen" : DAY_SHORT[(d.getDay() + 6) % 7].toLowerCase());
    if (!out.some(x => x.startsWith(r.name + " · "))) out.push(label);
  }
  return out;
}
async function addIngredients(list) {
  for (const p of list) {
    if (onListLike(p.name)) continue;
    const k = known().get(key(p.name));
    await addItem(k ? { name: k.name, qty: p.qty, cat: k.cat, shops: k.shops } : { name: p.name, qty: p.qty });
  }
}

function mealPicker(day) {
  if (!editing || editing.kind !== "meal" || editing.id !== day) return null;
  const box = el("div", "editor picker-box"), cur = meals[day], stats = recipeStats();
  const chosen = cur && cur.recipe && recipeById(cur.recipe);
  if (chosen) {
    const card = el("div", "recipe-card");
    card.appendChild(el("b", null, chosen.name));
    if (chosen.note) card.appendChild(el("span", "desc", chosen.note));
    if (chosen.ingredients.length) { const ul = el("ul", "ing-list"); chosen.ingredients.forEach(x => ul.appendChild(el("li", null, x))); card.appendChild(ul); }
    const row = el("div", "acts"); row.style.justifyContent = "flex-start";
    const href = safeLink(chosen.link);
    if (href) { const a = el("a", "btn", "Recept openen ↗"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; row.appendChild(a); }
    row.appendChild(btn("link", chosen.ingredients.length || chosen.link ? "Recept aanpassen" : "Ingrediënten of link toevoegen", () => { mealQ = ""; openRecipeFromDay(chosen); }));
    card.appendChild(row); box.appendChild(card);
    box.appendChild(el("p", "hint", "Iets anders eten? Kies hieronder een ander recept."));
  }
  const f = el("div", "field mini"); f.innerHTML = SEARCH;
  const inp = el("input"); inp.type = "text"; inp.id = "meal-q"; inp.placeholder = recipes.length ? "Zoek een recept of typ iets anders…" : "Wat eten jullie? bv. Spaghetti bolognese"; inp.value = mealQ; inp.autocomplete = "off"; inp.enterKeyHint = "done";
  inp.setAttribute("aria-label", "Zoek een recept");
  const q = mealQ.trim(), t = key(q);
  const hits = recipes.filter(r => !t || key(r.name).includes(t))
    .sort((a, b) => t ? (key(a.name).startsWith(t) ? 0 : 1) - (key(b.name).startsWith(t) ? 0 : 1) || a.name.localeCompare(b.name)
      : ((stats[a.id] || {}).last || "").localeCompare((stats[b.id] || {}).last || "") || a.name.localeCompare(b.name));
  inp.addEventListener("input", () => { mealQ = inp.value; render(); });
  inp.addEventListener("keydown", async e => {
    if (e.key === "Escape") { editing = null; mealQ = ""; render(); }
    if (e.key !== "Enter") return; e.preventDefault();
    const exact = recipes.find(r => key(r.name) === t);
    if (exact || (q && hits.length === 1)) { editing = null; mealQ = ""; await setMeal(day, (exact || hits[0]).id, ""); }
    else if (q) { editing = null; mealQ = ""; await setMeal(day, null, q); }
  });
  f.appendChild(inp); box.appendChild(f);

  const res = el("div", "results flat pick-list");
  hits.forEach(r => {
    const s = stats[r.id], chosen = cur && cur.recipe === r.id;
    const row = btn("res" + (chosen ? " onlist" : ""), null, async () => { editing = null; mealQ = ""; await setMeal(day, r.id, ""); });
    const lab = el("span", "label"); lab.appendChild(el("span", "name", r.name));
    lab.appendChild(el("span", "meta", s ? s.times + "× gegeten · laatst " + fmtDate(dayMs(s.last)) : "Nog niet op het menu gezet"));
    row.append(lab, el("span", "plus", chosen ? "✓" : "+")); row.disabled = !writable(); res.appendChild(row);
  });
  if (q && !recipes.some(r => key(r.name) === t)) {
    res.appendChild(newRow("“" + q + "” als recept bewaren", "Komt in jullie receptenlijst en staat meteen op " + DAY_LONG[(new Date(day + "T12:00:00").getDay() + 6) % 7].toLowerCase(), async () => {
      const name = q; editing = null; mealQ = ""; const r = await addRecipe(name); if (r) await setMeal(day, r.id, "");
    }));
    res.appendChild(newRow("“" + q + "” enkel voor deze dag", "Zonder recept, bv. restjes of uit eten", async () => { const n = q; editing = null; mealQ = ""; await setMeal(day, null, n); }));
  }
  if (res.childNodes.length) box.appendChild(res);
  else if (!recipes.length) box.appendChild(el("p", "hint", "Nog geen recepten. Typ hierboven een gerecht, dan bewaren we het meteen in jullie lijst."));

  const acts = el("div", "acts"), right = el("div", "acts");
  if (recipes.length > 1 && !q) {
    acts.appendChild(btn("btn", "🎲 Verras me", async () => {
      const near = new Set(Object.entries(meals).filter(([k, m]) => m.recipe && k !== day && Math.abs(dayMs(k) - dayMs(day)) < 7 * 864e5).map(([, m]) => m.recipe));
      const notRecent = recipes.filter(r => !near.has(r.id)).sort((a, b) => ((stats[a.id] || {}).last || "").localeCompare((stats[b.id] || {}).last || ""));
      const pool = notRecent.slice(0, Math.max(1, Math.ceil(notRecent.length / 2))).filter(r => !cur || r.id !== cur.recipe);
      const from = pool.length ? pool : notRecent.length ? notRecent : recipes;
      const pick = from[Math.floor(Math.random() * from.length)];
      editing = null; await setMeal(day, pick.id, "");
    }));
  } else acts.appendChild(el("span"));
  if (cur) right.appendChild(btn("btn ghost-danger", "Leegmaken", async () => { editing = null; mealQ = ""; await setMeal(day, null, ""); }));
  right.appendChild(btn("btn", "Sluiten", () => { editing = null; mealQ = ""; render(); }));
  acts.appendChild(right); box.appendChild(acts);
  return box;
}

function recipeEditor(r) {
  if (!editing || editing.kind !== "recipe" || editing.id !== r.id) return null;
  const d = editing.draft, box = el("div", "editor");
  const nm = el("input", "txt"); nm.id = "ed-rname"; nm.value = d.name; nm.maxLength = 80; nm.addEventListener("input", () => { d.name = nm.value; });
  box.appendChild(field("Naam", nm));
  const ing = el("textarea", "txt"); ing.id = "ed-ring"; ing.rows = 5; ing.value = d.ingredients; ing.placeholder = "Eén per regel, bv.\n500 g gehakt\n1 ui\nSpaghetti\nTomatensaus";
  ing.addEventListener("input", () => { d.ingredients = ing.value; });
  box.appendChild(field("Ingrediënten (optioneel)", ing));
  const ln = el("input", "txt"); ln.id = "ed-rlink"; ln.type = "url"; ln.inputMode = "url"; ln.value = d.link; ln.maxLength = 1000; ln.placeholder = "https://… (bv. Dagelijkse Kost)"; ln.addEventListener("input", () => { d.link = ln.value; });
  box.appendChild(field("Link naar het recept (optioneel)", ln));
  const n = el("textarea", "txt"); n.id = "ed-rnote"; n.rows = 2; n.maxLength = 1000; n.value = d.note; n.placeholder = "bv. dubbele portie maken, Mil zonder ui";
  n.addEventListener("input", () => { d.note = n.value; });
  box.appendChild(field("Uitleg (optioneel)", n));
  const ingList = ingredientsOf([r]);
  if (ingList.length) {
    const missing = ingList.filter(p => !onListLike(p.name));
    const b = btn("btn", missing.length ? "🛒 " + missing.length + " ingrediënt" + (missing.length === 1 ? "" : "en") + " op de boodschappenlijst" : "✓ Alles staat al op de lijst", async e => { e.currentTarget.disabled = true; await addIngredients(missing); render(); });
    b.disabled = !missing.length || !writable(); b.style.alignSelf = "flex-start"; box.appendChild(b);
  }
  const acts = el("div", "acts"), right = el("div", "acts");
  right.append(btn("btn", "Annuleren", () => { editing = null; render(); }), btn("btn primary", "Bewaren", async e => {
    e.currentTarget.disabled = true;
    const lines = d.ingredients.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 60).map(x => x.slice(0, 120));
    try { await updateRecipe(r.id, { name: d.name.trim().slice(0, 80) || r.name, ingredients: lines, link: d.link.trim() ? safeLink(d.link) || d.link.trim() : "", note: d.note.trim() }); } catch (err) { writeFailed(err); }
    editing = null; render();
  }));
  if (d.confirmDelete) {
    const planned = Object.entries(meals).filter(([k, m]) => m.recipe === r.id && k >= dayKey(new Date())).length;
    const c = el("div", "confirm");
    c.appendChild(el("span", null, "“" + r.name + "” uit jullie recepten verwijderen?" + (planned ? " Het staat nog " + planned + "× op het menu; die dag" + (planned === 1 ? " wordt" : "en worden") + " dan leeg." : "")));
    const a = el("div", "acts"); a.style.justifyContent = "flex-end";
    a.append(btn("btn", "Toch niet", () => { d.confirmDelete = false; render(); }), btn("btn primary danger", "Verwijderen", async () => { editing = null; await removeRecipe(r); }));
    c.appendChild(a); box.appendChild(c);
  } else {
    acts.append(btn("btn ghost-danger", "Verwijderen", () => { d.confirmDelete = true; render(); }), right);
    box.appendChild(acts);
  }
  return box;
}
function openRecipe(r) {
  if (editing && editing.id === r.id) { editing = null; render(); return; }
  editing = { kind: "recipe", id: r.id, draft: { name: r.name, ingredients: r.ingredients.join("\n"), link: r.link, note: r.note } }; render();
}
function openRecipeFromDay(r) {
  editing = null; recipeQ = ""; openRecipe(r);
  const li = document.querySelector('[data-recipe="' + r.id + '"]'); if (li) li.scrollIntoView({ block: "center", behavior: "smooth" });
}
function recipeRow(r, stats) {
  const li = el("li", "recipe"), main = el("div", "row-main"), lab = el("div", "label"); li.dataset.recipe = r.id;
  lab.appendChild(el("span", "name", r.name));
  if (r.note) lab.appendChild(el("span", "desc", r.note));
  const meta = el("span", "meta"), s = stats[r.id];
  const bits = []; if (r.ingredients.length) bits.push(r.ingredients.length + " ingrediënt" + (r.ingredients.length === 1 ? "" : "en"));
  bits.push(s ? s.times + "× gegeten · laatst " + fmtDate(dayMs(s.last)) : "Nog niet gegeten");
  meta.appendChild(el("span", null, bits.join(" · ")));
  const href = safeLink(r.link);
  if (href) { const a = el("a", "glink", linkHost(href) + " ↗"); a.href = href; a.target = "_blank"; a.rel = "noopener noreferrer"; meta.appendChild(a); }
  lab.appendChild(meta); main.appendChild(lab);
  const more = btn("more", "⋯", () => openRecipe(r), "Bewerk " + r.name); more.disabled = !writable();
  more.setAttribute("aria-expanded", editing && editing.id === r.id ? "true" : "false"); main.appendChild(more);
  li.appendChild(main);
  const ed = recipeEditor(r); if (ed) li.appendChild(ed);
  return li;
}

function viewMenu(v) {
  if (!menuReady) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Het weekmenu is nog niet geactiveerd"));
    e.appendChild(el("span", null, "Voer eenmalig supabase/004_menu.sql uit in de Supabase SQL Editor. Daarna kun je hier recepten bewaren en per dag kiezen wat jullie eten."));
    v.appendChild(e); return;
  }
  const days = weekDays(menuOffset), today = dayKey(new Date()), stats = recipeStats();
  const nav = el("div", "weeknav");
  const prev = btn("navbtn", "‹", () => { menuOffset--; editing = null; confirmIngredients = false; render(); }, "Vorige week");
  const next = btn("navbtn", "›", () => { menuOffset++; editing = null; confirmIngredients = false; render(); }, "Volgende week");
  const mid = el("div", "navmid");
  mid.appendChild(el("b", null, { "-1": "Vorige week", "0": "Deze week", "1": "Volgende week" }[menuOffset] || "Week van " + fmtDate(days[0])));
  const range = el("span", null, fmtDate(days[0]) + " – " + fmtDate(days[6]));
  mid.appendChild(range);
  if (menuOffset) mid.appendChild(btn("link", "Naar deze week", () => { menuOffset = 0; editing = null; render(); }));
  nav.append(prev, mid, next); v.appendChild(nav);

  const ul = el("ul", "rows days");
  days.forEach((d, i) => {
    const k = dayKey(d), m = meals[k], title = mealTitle(m), r = m && m.recipe && recipeById(m.recipe);
    const li = el("li", "day" + (k === today ? " today" : "") + (k < today ? " past" : ""));
    const main = el("div", "row-main");
    const b = btn("check dayrow", null, () => {
      if (editing && editing.kind === "meal" && editing.id === k) { editing = null; mealQ = ""; } else { editing = { kind: "meal", id: k }; mealQ = ""; }
      render(); const q = $("meal-q"); if (q && !("ontouchstart" in window)) q.focus();
    });
    b.disabled = !writable(); b.setAttribute("aria-expanded", editing && editing.id === k ? "true" : "false");
    b.setAttribute("aria-label", DAY_LONG[i] + " " + fmtDate(d) + ": " + (title || "nog niets gekozen"));
    const cal = el("span", "cal"); cal.append(el("span", "dn", DAY_SHORT[i]), el("span", "dd", String(d.getDate())));
    const lab = el("span", "label");
    lab.appendChild(el("span", "name" + (title ? "" : " none"), title || (k < today ? "–" : "Kies wat we eten")));
    const meta = el("span", "meta");
    if (k === today) meta.appendChild(el("span", "tag", "Vandaag"));
    if (r && r.ingredients.length) meta.appendChild(el("span", null, r.ingredients.length + " ingrediënt" + (r.ingredients.length === 1 ? "" : "en")));
    if (m && !m.recipe && m.note) meta.appendChild(el("span", null, "Zonder recept"));
    if (meta.childNodes.length) lab.appendChild(meta);
    b.append(cal, lab); main.appendChild(b);
    li.appendChild(main);
    const p = mealPicker(k); if (p) li.appendChild(p);
    ul.appendChild(li);
  });
  v.appendChild(ul);

  // Ingredients of what's still coming this week → shopping list.
  const upcoming = days.map(dayKey).filter(k => k >= today).map(k => meals[k] && meals[k].recipe && recipeById(meals[k].recipe)).filter(Boolean);
  if (upcoming.length && writable()) {
    const ing = ingredientsOf(upcoming), missing = ing.filter(p => !onListLike(p.name));
    const foot = el("div", "weekfoot");
    if (!ing.length) foot.appendChild(el("span", null, "Tip: zet bij een recept de ingrediënten, dan zet je ze met één tik op de boodschappenlijst."));
    else if (!missing.length) foot.appendChild(el("span", null, "✓ Alle ingrediënten van " + (menuOffset ? "die" : "deze") + " week staan op de boodschappenlijst."));
    else {
      foot.appendChild(el("span", null, missing.length + " ingrediënt" + (missing.length === 1 ? "" : "en") + " nog niet op de boodschappenlijst."));
      foot.appendChild(btn("btn", "🛒 Op de lijst zetten", () => { confirmIngredients = !confirmIngredients; render(); }));
    }
    v.appendChild(foot);
    if (confirmIngredients && missing.length) {
      const c = el("div", "confirm");
      c.appendChild(el("span", null, "Deze komen op de boodschappenlijst van deze week. Wat je al in huis hebt, haal je er daarna gewoon af."));
      const chips = el("div", "quick-chips"); missing.forEach(p => chips.appendChild(el("span", "ingchip", p.name + (p.qty ? " · " + p.qty : "")))); c.appendChild(chips);
      const a = el("div", "acts"); a.style.justifyContent = "flex-end";
      a.append(btn("btn", "Annuleren", () => { confirmIngredients = false; render(); }), btn("btn primary", "Toevoegen", async e => { e.currentTarget.disabled = true; await addIngredients(missing); confirmIngredients = false; showStatus(missing.length + " ingrediënten staan op de lijst van Deze week."); setTimeout(() => showStatus(""), 4000); render(); }));
      c.appendChild(a); v.appendChild(c);
    }
  }

  // The family's favourite recipes.
  const sec = el("section", "section");
  const h = el("h2", null, "Onze recepten"); if (recipes.length) h.appendChild(el("span", null, String(recipes.length))); sec.appendChild(h);
  const rq = recipeQ.trim(), rt = key(rq);
  const om = omni("Zoek of voeg een recept toe…", recipeQ, val => { recipeQ = val; render(); }, async val => {
    const n = val.trim(); if (!n) return; recipeQ = "";
    const ex = recipes.find(r => key(r.name) === key(n));
    if (ex) { openRecipe(ex); return; }
    const r = await addRecipe(n); if (r) openRecipe(r);
  });
  om.classList.add("static"); sec.appendChild(om);
  const list = recipes.filter(r => !rt || key(r.name).includes(rt)).sort((a, b) => a.name.localeCompare(b.name));
  if (rq && !recipes.some(r => key(r.name) === rt)) {
    const res = el("div", "results flat"); res.appendChild(newRow("“" + rq + "” als recept bewaren", "Daarna kun je ingrediënten en een link toevoegen", async () => { const n = rq; recipeQ = ""; const r = await addRecipe(n); if (r) openRecipe(r); }));
    sec.appendChild(res);
  }
  if (list.length) { const ul2 = el("ul", "rows"); list.forEach(r => ul2.appendChild(recipeRow(r, stats))); sec.appendChild(ul2); }
  else if (!rq) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Nog geen recepten"));
    e.appendChild(el("span", null, "Typ hierboven wat jullie graag eten, bv. Spaghetti bolognese of Stoofvlees met frietjes. Tik daarna op een dag om te kiezen."));
    sec.appendChild(e);
  }
  if (recipes.length) sec.appendChild(el("p", "hint", "Met ⋯ voeg je ingrediënten, een link of uitleg toe."));
  v.appendChild(sec);
}

/* Meer: the less-used parts of the app, one tap away. */
const GIFT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 21V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
const STATS_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>';
const GEAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>';
function viewMore(v) {
  const mine = gifts.filter(g => g.owner === me).length, others = gifts.filter(g => g.owner !== me && !claims[g.id]).length;
  const rows = [
    [GIFT_ICON, "Cadeaus", giftsReady ? (mine ? mine + " op jouw lijstje" : "Jouw lijstje is nog leeg") + (others ? " · " + others + (others === 1 ? " wens" : " wensen") + " van de anderen open" : "") : "Verlanglijstjes van het gezin", () => setTab("gifts")],
    [STATS_ICON, "Cijfers", "Wat jullie het meest kopen, waar en door wie", () => setTab("stats")],
    [GEAR_ICON, "Instellingen", "Kleur, licht of donker, gezinscode en afmelden", () => { whoOpen = true; drawWho(); window.scrollTo(0, 0); }],
  ];
  const ul = el("ul", "rows morelist");
  rows.forEach(([icon, name, sub, go]) => {
    const li = el("li"), b = btn("moreitem", null, go);
    const ic = el("span", "ic"); ic.innerHTML = icon;
    const lab = el("span", "label"); lab.append(el("span", "name", name), el("span", "meta", sub));
    b.append(ic, lab, el("span", "chev", "›")); li.appendChild(b); ul.appendChild(li);
  });
  v.appendChild(ul);
}

function bars(rows) {
  const ul = el("ul", "bars"); const max = Math.max(1, ...rows.map(r => r[1]));
  rows.forEach(([label, n, c]) => {
    const li = el("li"); li.appendChild(el("span", "bn", label));
    const tr = el("span", "track"); const f = el("span", "fill" + (c ? " " + c : "")); f.style.width = (n / max * 100) + "%"; tr.appendChild(f);
    li.append(tr, el("span", "bv", String(n))); ul.appendChild(li);
  });
  return ul;
}
function viewStats(v) {
  const bought = items.filter(i => i.done);
  const weekIds = new Set(items.filter(i => !isCurrent(i)).map(i => i.week));
  if (!bought.length) {
    const e = el("div", "empty"); e.appendChild(el("b", null, "Nog geen statistieken"));
    e.appendChild(el("span", null, "Vink producten af tijdens het winkelen. Na een week of twee zie je wat je het meest koopt, waar, en wie de boodschappen doet."));
    v.appendChild(e); return;
  }
  const tiles = el("div", "tiles");
  const avg = weekIds.size ? Math.round(items.filter(i => i.done && !isCurrent(i)).length / weekIds.size) : bought.length;
  [[bought.length, "producten gekocht"], [weekIds.size, "weken afgesloten"], [avg, "producten per week"]].forEach(([n, l]) => { const t = el("div", "tile"); t.append(el("b", null, String(n)), el("span", null, l)); tiles.appendChild(t); });
  v.appendChild(tiles);
  const prod = {}; bought.forEach(i => { const k = key(i.name); (prod[k] = prod[k] || [i.name, 0])[1]++; });
  const s1 = el("section", "section"); s1.append(el("h2", null, "Meest gekocht"), bars(Object.values(prod).sort((a, b) => b[1] - a[1]).slice(0, 10))); v.appendChild(s1);
  const shops = {}; bought.forEach(i => { const s = boughtShop(i); shops[s] = (shops[s] || 0) + 1; });
  const shopRows = [...SHOPS, ["", "Winkel onbekend"]].map(([k, n]) => [n, shops[k] || 0, k]).filter(r => r[1]).sort((a, b) => b[1] - a[1]);
  const s2 = el("section", "section"); s2.append(el("h2", null, "Per winkel"), bars(shopRows)); v.appendChild(s2);
  const ppl = {}; bought.forEach(i => { const p = person(i.doneBy, i.doneByName) || "Iemand"; ppl[p] = (ppl[p] || 0) + 1; });
  const s3 = el("section", "section"); s3.append(el("h2", null, "Wie legde het in de mand"), bars(Object.entries(ppl).sort((a, b) => b[1] - a[1]))); v.appendChild(s3);
}

/* Sign in, sign up, and joining a household */
function formField(label, input) { const l = el("label", "f"); l.append(el("span", null, label), input); return l; }
function textInput(id, type, placeholder, autocomplete) { const i = el("input", "txt"); i.id = id; i.type = type; i.placeholder = placeholder || ""; if (autocomplete) i.autocomplete = autocomplete; i.required = true; return i; }
let authMode = "in";
function viewAuth(v) {
  const card = el("form", "editor card");
  const seg = el("div", "chips");
  [["in", "Aanmelden"], ["up", "Account maken"]].forEach(([k, n]) => { const c = btn("chip", n, () => { authMode = k; render(); }); c.setAttribute("aria-pressed", authMode === k ? "true" : "false"); seg.appendChild(c); });
  const email = textInput("auth-email", "email", "naam@voorbeeld.be", "email");
  const pw = textInput("auth-pw", "password", authMode === "up" ? "Minstens 6 tekens" : "", authMode === "up" ? "new-password" : "current-password");
  const go = el("button", "btn primary", authMode === "up" ? "Account maken" : "Aanmelden"); go.type = "submit";
  card.append(seg, formField("E-mail", email), formField("Wachtwoord", pw), go);
  card.addEventListener("submit", async e => {
    e.preventDefault(); go.disabled = true; showStatus("");
    const creds = { email: email.value.trim(), password: pw.value };
    const { data, error } = authMode === "up" ? await sb.auth.signUp(creds) : await sb.auth.signInWithPassword(creds);
    go.disabled = false;
    if (error) { showStatus(error.message === "Invalid login credentials" ? "E-mail of wachtwoord klopt niet." : error.message, true); return; }
    if (authMode === "up" && !data.session) showStatus("Bijna klaar: open de bevestigingsmail en meld je daarna hier aan.", false);
  });
  v.appendChild(el("p", "hint", "Elk gezinslid heeft een eigen account. Op een gedeelde gsm meld je af en meld je de volgende persoon aan."));
  v.appendChild(card);
}
let onboardMode = "join";
function viewOnboard(v) {
  const card = el("form", "editor card");
  const seg = el("div", "chips");
  [["join", "Aansluiten bij gezin"], ["new", "Nieuw gezin"]].forEach(([k, n]) => { const c = btn("chip", n, () => { onboardMode = k; render(); }); c.setAttribute("aria-pressed", onboardMode === k ? "true" : "false"); seg.appendChild(c); });
  const myName = textInput("ob-name", "text", "bv. Maarten", "given-name"); myName.maxLength = 40;
  const other = onboardMode === "join" ? textInput("ob-code", "text", "8 tekens, bv. 3FA9C21B") : textInput("ob-house", "text", "bv. Meerstraat");
  const go = el("button", "btn primary", onboardMode === "join" ? "Aansluiten" : "Gezin aanmaken"); go.type = "submit";
  card.append(seg, formField("Jouw naam", myName), formField(onboardMode === "join" ? "Gezinscode" : "Naam van het gezin", other), go);
  card.addEventListener("submit", async e => {
    e.preventDefault(); go.disabled = true; showStatus("");
    const { error } = onboardMode === "join"
      ? await sb.rpc("join_household", { code: other.value, my_name: myName.value })
      : await sb.rpc("create_household", { household_name: other.value, my_name: myName.value });
    go.disabled = false;
    if (error) { showStatus(error.message.includes("Onbekende") ? "Die gezinscode kennen we niet. Vraag de code aan iemand van je gezin." : error.message, true); return; }
    await boot();
  });
  v.appendChild(el("p", "hint", "Heeft iemand van je gezin de app al? Vraag de gezinscode (te vinden onder hun naam rechtsboven)."));
  v.appendChild(card);
}

/* Header: settings panel (colour, light/dark, household, sign out) */
const GEAR = '<svg class="gear" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
function section(label) { const s = el("div", "set-sec"); s.appendChild(el("span", "lbl", label)); return s; }
function drawWho() {
  const b = $("me-btn"); b.hidden = screen !== "app"; b.textContent = ""; b.setAttribute("aria-expanded", whoOpen ? "true" : "false");
  b.setAttribute("aria-label", "Instellingen");
  const myName = person(me) || "Ik";
  b.append(el("span", "av", myName[0].toUpperCase()), el("span", null, myName));
  b.insertAdjacentHTML("beforeend", GEAR);
  const p = $("whopanel"); p.textContent = ""; p.hidden = !whoOpen || screen !== "app"; p.className = whoOpen ? "whopanel" : "";
  if (p.hidden) return;
  p.appendChild(el("h2", "set-h", "Instellingen"));

  const T = window.THEME;
  const col = section("Kleur"), sw = el("div", "swatches");
  const curA = T.get("accent", "indigo");
  Object.entries(T.accents).forEach(([k, [n, light, dark]]) => {
    const isDark = getComputedStyle(document.documentElement).colorScheme === "dark";
    const s = btn("swatch", "", () => { T.set("accent", k); T.apply(); drawWho(); render(); });
    s.style.setProperty("--sw", isDark ? dark : light);
    s.setAttribute("aria-pressed", k === curA ? "true" : "false");
    s.append(el("i"), el("span", null, n)); sw.appendChild(s);
  });
  col.appendChild(sw); p.appendChild(col);

  const look = section("Weergave"), seg = el("div", "seg");
  const curM = T.get("mode", "system");
  [["system", "Systeem"], ["light", "Licht"], ["dark", "Donker"]].forEach(([k, n]) => {
    const s = btn(null, n, () => { T.set("mode", k); T.apply(); drawWho(); render(); });
    s.setAttribute("aria-pressed", k === curM ? "true" : "false"); seg.appendChild(s);
  });
  look.appendChild(seg); look.appendChild(el("p", null, "Deze keuze geldt voor dit toestel."));
  p.appendChild(look);

  const fam = section("Gezin");
  const g = el("div", "whogrid");
  members.forEach(m => { const x = el("div"); x.className = "whocell"; x.append(el("span", "av", m.display_name[0].toUpperCase()), el("span", null, m.display_name)); g.appendChild(x); });
  fam.appendChild(g);
  const code = el("div", "acts");
  const c = el("span", null); c.append(document.createTextNode("Gezinscode: "), el("b", "code", household.invite_code));
  const copy = btn("link", "Kopieer", async () => { try { await navigator.clipboard.writeText(household.invite_code); copy.textContent = "Gekopieerd"; } catch (_) {} });
  code.append(c, copy); fam.appendChild(code);
  fam.appendChild(el("p", null, "Nieuwe gezinsleden maken een account en vullen deze code in."));
  p.appendChild(fam);

  const acc = section("Account");
  acc.appendChild(el("p", null, "Aangemeld als " + myName + " (" + (session.user.email || "") + ")."));
  const out = btn("btn", "Afmelden / andere gebruiker", async () => { whoOpen = false; await sb.auth.signOut(); });
  acc.appendChild(out); p.appendChild(acc);
}
$("me-btn").addEventListener("click", () => { whoOpen = !whoOpen; drawWho(); });

function setTab(t) { tab = t; store("tab", t); editing = null; confirmFinish = false; confirmIngredients = false; mealQ = ""; render(); window.scrollTo(0, 0); }
document.querySelectorAll("nav.tabbar button").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

function render() {
  drawWho();
  $("tabbar").hidden = screen !== "app";
  const v = $("view");
  if (screen !== "app") {
    $("eyebrow").textContent = "Meerstraat"; $("title").textContent = screen === "onboard" ? "Welkom" : "Boodschappen";
    v.textContent = "";
    if (screen === "auth") viewAuth(v); else if (screen === "onboard") viewOnboard(v); else v.appendChild(Object.assign(el("div", "empty"), { innerHTML: "<b>Laden…</b>" }));
    return;
  }
  document.querySelectorAll("nav.tabbar button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === tab || (b.dataset.tab === "more" && UNDER_MORE.includes(tab)) ? "true" : "false"));
  $("title").textContent = { list: "Deze week", menu: "Weekmenu", staples: "Vaste items", gifts: "Cadeaus", history: "Historiek", stats: "Cijfers", more: "Meer" }[tab];
  $("eyebrow").textContent = tab === "list" && current && current.startedAt ? household.name + " · sinds " + fmtDate(current.startedAt) : household.name;
  const open = thisWeek().filter(i => !i.done).length;
  $("badge").hidden = !open; $("badge").textContent = String(open);
  const act = document.activeElement, keepId = act && act.id, sel = act && typeof act.selectionStart === "number" ? act.selectionStart : null;
  v.textContent = "";
  if (UNDER_MORE.includes(tab)) v.appendChild(btn("link backlink", "‹ Meer", () => setTab("more")));
  ({ list: viewList, menu: viewMenu, staples: viewStaples, gifts: viewGifts, history: viewHistory, stats: viewStats, more: viewMore })[tab](v);
  if (keepId && $(keepId) && $(keepId) !== act) { const n = $(keepId); n.focus(); if (sel != null && n.setSelectionRange) { const p = Math.min(sel, n.value.length); n.setSelectionRange(p, p); } }
}

async function boot() {
  const { data } = await sb.auth.getSession();
  session = data.session; me = session ? session.user.id : null;
  household = null; loaded = false;
  if (!session) { screen = "auth"; onboardMode = "join"; whoOpen = false; render(); return; }
  const { data: mem, error } = await sb.from("members").select("household_id, households(*)").eq("user_id", me).limit(1);
  if (error) { showStatus("De database is niet bereikbaar: " + error.message, true); screen = "auth"; render(); return; }
  if (!mem || !mem.length) { screen = "onboard"; render(); return; }
  household = mem[0].households;
  try { await loadAll(); } catch (e) { writeFailed(e); }
  screen = "app"; showStatus(""); subscribe(); render();
}
sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT") boot(); });
render();
boot();
