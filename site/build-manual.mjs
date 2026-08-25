// Bakes docs/*.md into site/manual.html — run with: node site/build-manual.mjs
import { readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// DOCS_DIR lets CI/tooling bake the manual from a specific set of docs
// (e.g. committed HEAD versions only) without touching the working tree.
const docsDir = process.env.DOCS_DIR || join(root, "docs");

const GROUPS = [
  ["Core", ["VISION","ARCHITECTURE","RUNTIME","ENTITY_COMPONENT_MODEL","WORLD_SYSTEM","GAMEPLAY_IR","VISUAL_SCRIPTING","EDITOR","GAMEPLAY_FRAMEWORK"]],
  ["Systems", ["PHYSICS","ANIMATION","AUDIO","RENDERING","NETWORKING","PERFORMANCE"]],
  ["Pipeline & Distribution", ["ASSET_PIPELINE","PROJECT_FORMAT","BUILD_DEPLOYMENT","TEMPLATES"]],
  ["Platform", ["AI_AGENT_API","PLUGIN_ARCHITECTURE","VENDOR_INTEGRATIONS","VENDOR_PROJECT_MODULES","VERSE_COMPATIBILITY"]],
  ["Planning", ["ROADMAP"]],
  ["Project", ["WEBSITE"]],
];

const anchor = (file) => file.toLowerCase().replace(/_/g, "-");
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

function inline(text) {
  let out = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // auto-link FILE.md references (both inside code spans and parenthetical)
  const fileAnchor = (name) => anchor(name.replace(/\.md$/, ""));
  out = out.replace(/<code>([A-Z][A-Z0-9_]+\.md)<\/code>/g, (m, name) => `<a href="#${fileAnchor(name)}" class="xref"><code>${name}</code></a>`);
  out = out.replace(/\(([A-Z][A-Z0-9_]+\.md)\)/g, (m, name) => `(<a href="#${fileAnchor(name)}" class="xref">${name}</a>)`);
  return out;
}

function convert(md) {
  const lines = md.split("\n");
  let html = "", i = 0;
  let inFence = false, fenceLang = "", fenceBuf = [];
  let inTable = false, tableBuf = [];
  let inQuote = false, quoteBuf = [];
  let inList = false, listType = "", listBuf = [];

  const flushTable = () => {
    if (!inTable) return;
    const rows = tableBuf.map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
    const head = rows[0];
    let t = "<table><thead><tr>" + head.map((c) => `<th>${inline(c)}</th>`).join("") + "</tr></thead><tbody>";
    for (const row of rows.slice(2)) t += "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
    html += t + "</tbody></table>";
    tableBuf = []; inTable = false;
  };
  const flushQuote = () => {
    if (!inQuote) return;
    const body = quoteBuf.map((l) => l.replace(/^>\s?/, "")).join("\n");
    const paras = body.split(/\n\s*\n/).map((p) => `<p>${inline(p.replace(/\n/g, " "))}</p>`).join("");
    html += `<blockquote>${paras}</blockquote>`;
    quoteBuf = []; inQuote = false;
  };
  const flushList = () => {
    if (!inList) return;
    const items = listBuf.map((l) => {
      const m = l.match(/^(?:\d+\.\s+|[-*]\s+)(.*)$/);
      return `<li>${inline(m ? m[1] : l)}</li>`;
    });
    html += `<${listType}>${items.join("")}</${listType}>`;
    listBuf = []; inList = false;
  };

  const isTableRow = (l) => /^\|.+\|$/.test(l.trim());
  const isTableSep = (l) => /^\|[\s:|-]+\|$/.test(l.trim());

  while (i < lines.length) {
    const raw = lines[i];
    const l = raw.trimEnd();

    if (inFence) {
      if (/^```/.test(l)) { html += `<pre><code class="lang-${fenceLang}">${fenceBuf.map((s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")).join("\n")}</code></pre>`; inFence = false; fenceBuf = []; fenceLang = ""; }
      else fenceBuf.push(l);
      i++; continue;
    }
    if (/^```/.test(l)) { inFence = true; fenceLang = l.slice(3).trim(); i++; continue; }

    if (isTableRow(l) && (isTableSep(lines[i + 1] || "") || inTable)) {
      if (!inTable) { inTable = true; tableBuf = []; }
      tableBuf.push(l.trim());
      i++; continue;
    }
    if (inTable && !isTableRow(l)) flushTable();

    if (/^>\s?/.test(l)) { if (!inQuote) inQuote = true; quoteBuf.push(l); i++; continue; }
    if (inQuote) flushQuote();

    const listMatch = l.match(/^(?:(\d+)\.\s+|([-*])\s+)/);
    if (listMatch) {
      const t = listMatch[1] ? "ol" : "ul";
      if (inList && listType !== t) flushList();
      if (!inList) { inList = true; listType = t; }
      listBuf.push(l); i++; continue;
    }
    if (inList) flushList();

    if (/^\s{4}\S/.test(l)) {
      const buf = [];
      while (i < lines.length && (/^\s{4}\S/.test(lines[i].trimEnd()) || /^\s*$/.test(lines[i]))) { buf.push(lines[i].replace(/^\s{4}/, "")); i++; }
      html += `<pre class="indent"><code>${buf.map((s) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")).join("\n")}</code></pre>`;
      continue;
    }

    if (l === "---") { html += '<hr class="doc-hr"/>'; i++; continue; }

    const h = l.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + 1, 5); // # → h2 (doc title), ## → h3 …
      const text = h[2];
      html += `<h${level} id="${slugify(text)}">${inline(text)}</h${level}>`;
      i++; continue;
    }

    if (l.trim() === "") { i++; continue; }

    // paragraph — collect until blank or a block starter
    const buf = [];
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,4}\s|```|\| |>|[-*]\s|\d+\.\s|---)/.test(lines[i].trimEnd())) {
      buf.push(lines[i]); i++;
    }
    html += `<p>${inline(buf.join(" "))}</p>`;
  }
  if (inFence) html += `<pre><code>${fenceBuf.join("\n")}</code></pre>`;
  if (inTable) flushTable();
  if (inQuote) flushQuote();
  if (inList) flushList();
  return html;
}

async function main() {
  const files = await readdir(docsDir);
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  const sidebar = [], sections = [];
  const existing = new Set();

  for (const [group, names] of GROUPS) {
    const links = [];
    for (const name of names) {
      const fname = mdFiles.find((f) => f.toUpperCase() === name + ".MD") || `${name}.md`;
      const md = await readFile(join(docsDir, fname), "utf8");
      const firstH1 = md.match(/^#\s+(.+)$/m);
      const title = firstH1 ? firstH1[1].replace(/^3JSE\s*[—–-]\s*/, "") : name;
      const body = md.replace(/^#\s+.*$/m, "");
      const a = anchor(name);
      existing.add(a);
      links.push(`<a href="#${a}">${title}</a>`);
      sections.push(`<section class="doc" id="${a}"><h2 class="doc-title">${title}<span class="doc-file">${fname}</span></h2>${convert(body)}</section>`);
    }
    sidebar.push(`<div class="side-group"><h3>${group}</h3>${links.join("")}</div>`);
  }

  const manualHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>3JSE — The Design Manual</title>
<meta name="description" content="The complete 3JSE design manual — vision, architecture, gameplay IR, editor, systems, and roadmap.">
<link rel="icon" type="image/svg+xml" href="assets/img/3jse-logo.svg">
<link rel="stylesheet" href="assets/css/site.css">
</head>
<body class="manual">
<header class="site-header">
  <div class="hdr">
    <a class="brand" href="index.html">
      <span class="brand-mark"><svg viewBox="0 0 512 512" width="26" height="26" aria-hidden="true"><polygon points="256,134 142,200 256,266 370,200" fill="#22d3ee"/><polygon points="142,200 256,266 256,398 142,332" fill="#818cf8"/><polygon points="370,200 256,266 256,398 370,332" fill="#e879f9"/></svg></span>
      <span class="brand-name">3JSE</span>
      <span class="brand-tag">design manual</span>
    </a>
    <nav class="nav">
      <a href="index.html">Site</a>
      <a href="#vision">Vision</a>
      <a href="#architecture">Architecture</a>
      <a href="#editor">Editor</a>
      <a href="#ai-agent-api">AI Agent API</a>
      <a href="#roadmap">Roadmap</a>
      <a class="nav-cta" href="https://github.com/xirtus/3JSE" target="_blank" rel="noopener">GitHub ↗</a>
    </nav>
  </div>
</header>

<div class="manual-layout">
  <aside class="manual-side">
    <input id="doc-search" class="doc-search" type="search" placeholder="Filter docs…" aria-label="Filter docs">
    <nav id="doc-nav">
      ${sidebar.join("\n      ")}
    </nav>
  </aside>
  <main class="manual-main">
    <p class="manual-lede">The complete design manual for 3JSE — every system, every decision, every bet. Written to be read by humans <em>and</em> by the AI agents that will help build it.</p>
    ${sections.join("\n    ")}
  </main>
</div>

<footer class="site-footer">
  <div class="foot-inner">
    <p><strong>3JSE</strong> — the WebGPU-native game engine. The official website of the 3JSE project · GPL-3.0 · © 2026.</p>
    <nav><a href="index.html">Back to the site</a> · <a href="https://github.com/xirtus/3JSE" target="_blank" rel="noopener">GitHub</a></nav>
  </div>
</footer>

<script>
  const search = document.getElementById("doc-search");
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    document.querySelectorAll("#doc-nav .side-group a").forEach((a) => {
      a.style.display = !q || a.textContent.toLowerCase().includes(q) ? "" : "none";
    });
  });
  document.querySelectorAll('.manual-main a[href^="#"]').forEach((a) => {
    a.addEventListener("click", () => document.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" }));
  });
</script>
</body>
</html>`;

  await writeFile(join(root, "site", "manual.html"), manualHtml);
  console.log(`manual.html written: ${(manualHtml.length / 1024).toFixed(0)} KB, ${sections.length} docs baked`);
}

main().catch((e) => { console.error(e); process.exit(1); });
