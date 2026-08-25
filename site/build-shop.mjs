// Bakes packages/vendor/shop.json into site/shop.html — run with: node site/build-shop.mjs
// Generated file, never hand-edited (docs/SHOP.md, docs/WEBSITE.md policy).
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const shop = JSON.parse(await readFile(join(root, "packages", "vendor", "shop.json"), "utf8"));
const candidates = JSON.parse(await readFile(join(root, "packages", "vendor", "shop-candidates.json"), "utf8"));
const candidateCount = candidates.entries.length;

const CATS = [
  ["example", "🧪", "Examples"],
  ["kit", "🧰", "Kits"],
  ["template", "📐", "Templates"],
  ["game", "🎮", "Games"],
];

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function licenseBadge(l, aiGenerated) {
  let cls = "lic-none", txt = "No license declared";
  if (l?.spdx) {
    if (l.verifiedBy === "human") { cls = "lic-ok"; txt = `${l.spdx} ✓ verified`; }
    else { cls = "lic-decl"; txt = `${l.spdx} — as declared`; }
  }
  const ai = aiGenerated ? '<span class="chip chip-ai">AI</span>' : "";
  return `<span class="chip ${cls}">${txt}</span>${ai}`;
}

function card(e) {
  const [icon] = CATS.find(([c]) => c === e.category) ?? ["🔗"];
  const src = e.source ?? {};
  const links = [];
  if (src.liveDemo) links.push(`<a class="shop-link live" href="${esc(src.liveDemo)}" target="_blank" rel="noopener">▶ Live demo</a>`);
  if (src.homepage) links.push(`<a class="shop-link" href="${esc(src.homepage)}" target="_blank" rel="noopener">Homepage ↗</a>`);
  else if (src.repo) links.push(`<a class="shop-link" href="${esc("https://github.com/" + src.repo)}" target="_blank" rel="noopener">Source ↗</a>`);
  if (src.signal) links.push(`<a class="shop-link sig" href="${esc(src.signal.url)}" target="_blank" rel="noopener">✕ ${esc(src.signal.author.split("/").pop())}</a>`);
  if (e.registryId) links.push(`<span class="shop-link reg" title="Installable in the editor via the Open Source panel">⬇ Registry</span>`);
  else links.push(`<a class="shop-link open" href="3jse://open?entry=${esc(e.id)}" title="Opens in the 3JSE editor once the protocol is live (docs/SHOP.md)">Open in 3JSE</a>`);
  const stars = e.stars ? `<span class="stars">★ ${e.stars.toLocaleString()}</span>` : "";
  const tags = (e.tags ?? []).map((t) => `<span class="tag">${esc(t)}</span>`).join("");
  const note = e.notes ? `<p class="note">${esc(e.notes)}</p>` : "";
  const licenseNote = e.license?.note ? `<p class="lic-note">${esc(e.license.note)}</p>` : "";
  return `<article class="shop-card" data-cat="${esc(e.category)}" data-search="${esc((e.title + " " + e.author + " " + (e.tags ?? []).join(" ")).toLowerCase())}">
    <div class="shop-card-head"><span class="cat-icon">${icon}</span><span class="shop-title">${esc(e.title)}</span>${stars}</div>
    <div class="shop-meta">${esc(e.author)} ${licenseBadge(e.license, e.aiGenerated)}</div>
    ${tags ? `<div class="shop-tags">${tags}</div>` : ""}
    ${note}${licenseNote}
    <div class="shop-actions">${links.join("")}</div>
  </article>`;
}

function shelfCard(s) {
  return `<article class="shop-card shelf" data-cat="${esc(s.category)}" data-search="${esc(s.title.toLowerCase())}">
    <div class="shop-card-head"><span class="cat-icon">📚</span><span class="shop-title">${esc(s.title)}</span><span class="stars">${s.count} items</span></div>
    <div class="shop-meta">${esc(s.author)} ${licenseBadge(s.license, false)}</div>
    <p class="note">${esc(s.note)}</p>
    <div class="shop-actions"><a class="shop-link live" href="${esc(s.source.liveDemo)}" target="_blank" rel="noopener">▶ Browse shelf</a></div>
  </article>`;
}

const cards = shop.entries.map(card).join("\n      ");
const shelves = shop.shelves.map(shelfCard).join("\n      ");
const portals = shop.portals.map((p) => `<a class="portal" href="${esc(p.url)}" target="_blank" rel="noopener"><strong>${esc(p.label)}</strong><span>${esc(p.note)}</span></a>`).join("\n      ");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3JSE Shop — examples, kits, templates &amp; community games</title>
<meta name="description" content="The 3JSE Shop — a link-first marketplace of examples, kits, templates, and community games for the WebGPU-native game engine. Licensed as declared; curated by humans.">
<link rel="icon" type="image/svg+xml" href="assets/img/3jse-logo.svg">
<link rel="stylesheet" href="assets/css/site.css">
</head>
<body>
<header class="site-header">
  <div class="hdr">
    <a class="brand" href="index.html">
      <span class="brand-mark"><svg viewBox="0 0 512 512" width="26" height="26" aria-hidden="true"><polygon points="256,134 142,200 256,266 370,200" fill="#22d3ee"/><polygon points="142,200 256,266 256,398 142,332" fill="#818cf8"/><polygon points="370,200 256,266 256,398 370,332" fill="#e879f9"/></svg></span>
      <span class="brand-name">3JSE</span>
      <span class="brand-tag">the shop</span>
    </a>
    <nav class="nav">
      <a href="index.html">Site</a>
      <a href="manual.html">Manual</a>
      <a class="active" href="shop.html">Shop</a>
      <a class="nav-cta" href="https://github.com/xirtus/3JSE" target="_blank" rel="noopener">GitHub ↗</a>
    </nav>
  </div>
</header>

<div class="wrap">
<section class="section shop-hero" id="top">
  <div class="section-head">
    <div class="section-kicker">The Shop</div>
    <h2>Examples. Kits. Templates. <span class="grad-text">The games people are dropping every day.</span></h2>
    <p><strong>Link-first:</strong> the Shop ships pointers, never content — the editor stays lightweight and pulls what you choose, when you choose it. Every entry states the license <em>as declared by its creator</em>. ${candidateCount.toLocaleString()} candidates are in the curation queue, including the entire official Three.js examples shelf.</p>
  </div>
</section>

<div class="shop-toolbar">
  <div class="cat-tabs" id="cat-tabs">
    <button class="tab-btn active" data-cat="all">All</button>
    ${CATS.map(([c, i, l]) => `<button class="tab-btn" data-cat="${c}">${i} ${l}</button>`).join("\n    ")}
  </div>
  <input id="shop-search" class="doc-search shop-search" type="search" placeholder="Search the shop…" aria-label="Search the shop">
</div>

<div class="shop-grid" id="shop-grid">
  ${shelves}
  ${cards}
  <article class="shop-card empty" id="shop-empty" style="display:none"><p>Nothing matches — try another search.</p></article>
</div>

<section class="section">
  <div class="panel">
    <div class="panel-head"><span class="dot"></span><span class="pname">Console — shop.log</span><span class="pchip">3 portals</span></div>
    <div class="panel-body portals">
      ${portals}
    </div>
  </div>
</section>

<section class="section">
  <div class="cta-band">
    <h3>Licenses are stated, never judged.</h3>
    <p>The Shop discloses what each creator declared. What you build with their work is <strong>your responsibility</strong> — read each entry's license before you ship, credit the humans, and be ethical. That's the deal: we make great software, you use it well. The full terms live in our <a href="terms.html">Terms of Use</a>.</p>
    <p style="font-size:13.5px;color:#6d7686">Creators: your work is linked, never re-hosted. To have anything removed from the Shop, open an issue or email — taken down promptly, no questions asked.</p>
    <a class="btn btn-ghost" href="terms.html">Read the Terms of Use</a>
  </div>
</section>
</div>

<footer class="site-footer">
  <div class="foot-inner">
    <p><strong>3JSE</strong> — the WebGPU-native game engine. The official website of the 3JSE project · GPL-3.0 · © 2026</p>
    <nav>
      <a href="manual.html">Manual</a>
      <a href="shop.html">Shop</a>
      <a href="terms.html">Terms</a>
      <a href="https://github.com/xirtus/3JSE" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </div>
</footer>

<script>
  const grid = document.getElementById("shop-grid");
  const search = document.getElementById("shop-search");
  let cat = "all";
  const apply = () => {
    const q = search.value.trim().toLowerCase();
    let visible = 0;
    grid.querySelectorAll(".shop-card:not(.empty)").forEach((c) => {
      const okCat = cat === "all" || c.dataset.cat === cat;
      const okQ = !q || c.dataset.search.includes(q);
      const show = okCat && okQ;
      c.style.display = show ? "" : "none";
      if (show) visible++;
    });
    grid.querySelector(".empty").style.display = visible ? "none" : "";
  };
  document.querySelectorAll(".tab-btn").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    cat = b.dataset.cat;
    apply();
  }));
  search.addEventListener("input", apply);
</script>
</body>
</html>`;

await writeFile(join(root, "site", "shop.html"), html);
console.log(`shop.html written: ${shop.entries.length} entries, ${shop.shelves.length} shelves, ${candidateCount} candidates queued`);
