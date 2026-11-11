// Run with: node supabase/functions/import-recipe/parse.test.mjs
import { parseRecipe, minutes, servings } from "./parse.js";
const assert = (c, m) => { if (!c) { console.log("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };
// 1. JSON-LD in @graph, HowToStep + HowToSection, ImageObject, entities
const h1 = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":["Recipe"],"name":"Vol-au-vent met kip &amp; balletjes","image":{"@type":"ImageObject","url":"/img/vav.jpg"},"recipeYield":["4","4 personen"],"prepTime":"PT20M","cookTime":"PT1H","recipeIngredient":["600 g kipfilet","200 g kippengehakt","250 g champignons"],"recipeInstructions":[{"@type":"HowToSection","name":"Saus","itemListElement":[{"@type":"HowToStep","text":"Smelt de boter."},{"@type":"HowToStep","text":"Voeg de bloem toe."}]},{"@type":"HowToStep","text":"Serveer met frietjes."}]}]}</script></head></html>`;
const r1 = parseRecipe(h1, "https://www.15gram.be/recepten/vol-au-vent");
console.log(JSON.stringify(r1));
assert(r1.name === "Vol-au-vent met kip & balletjes", "name with entity");
assert(r1.image === "https://www.15gram.be/img/vav.jpg", "relative ImageObject");
assert(r1.servings === 4 && r1.minutes === 80, "servings + prep+cook");
assert(r1.steps.length === 4 && r1.steps[0] === "— Saus —", "sections");
assert(r1.complete, "complete");
// 2. plain array, string instructions with numbering and <br>
const h2 = `<script type='application/ld+json'>[{"@type":"Recipe","name":"Spaghetti","image":["https://x.be/a.jpg"],"recipeYield":4,"totalTime":"PT45M","recipeIngredient":["500 gr gehakt"],"recipeInstructions":"1. Bak het gehakt.<br>2. Voeg de saus toe."}]</script>`;
const r2 = parseRecipe(h2, "https://x.be/s");
assert(r2.steps.join("|") === "Bak het gehakt.|Voeg de saus toe.", "string steps split + numbering removed");
assert(r2.minutes === 45 && r2.servings === 4, "totalTime");
// 3. no structured data: headings + lists
const h3 = `<html><head><meta property="og:title" content="Stoofvlees met frietjes | Lekker Koken"><meta property="og:image" content="https://y.be/st.jpg"></head><body><h2>Ingrediënten</h2><ul><li>1 kg stoofvlees</li><li>2 uien</li></ul><h2>Bereiding</h2><ol><li>Bak het vlees aan.</li><li>Stoof 2 uur.</li></ol></body></html>`;
const r3 = parseRecipe(h3, "https://y.be/st");
console.log(JSON.stringify(r3));
assert(r3.name === "Stoofvlees met frietjes" && r3.ingredients.length === 2 && r3.steps.length === 2 && r3.image, "fallback from headings");
// 4. microdata
const h4 = `<div itemscope itemtype="http://schema.org/Recipe"><h1 itemprop="name">Witloof</h1><meta itemprop="totalTime" content="PT35M"><span itemprop="recipeIngredient">4 stronken witloof</span><span itemprop="recipeIngredient">ham</span><div itemprop="recipeInstructions"><p>Kook het witloof.</p></div></div>`;
const r4 = parseRecipe(h4, "https://z.be/w");
console.log(JSON.stringify(r4));
assert(r4.name === "Witloof" && r4.ingredients.length === 2 && r4.minutes === 35 && r4.steps.length === 1, "microdata");
// 5. broken JSON-LD falls back
const r5 = parseRecipe(`<script type="application/ld+json">{bad json</script><title>Soep - Site</title>`, "https://q.be/");
assert(r5.name === "Soep" && !r5.complete, "broken json-ld → title");
assert(minutes("PT1H") === 60 && servings("6-8 personen") === 6, "helpers");
