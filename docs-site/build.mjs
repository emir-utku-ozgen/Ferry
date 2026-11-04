// Builds Ferry's documentation site from the Markdown files in ../docs.
//
//   npm run build      -> writes the static site to docs-site/dist
//
// The output is plain HTML/CSS/JS with relative links only, so it can be
// served from any sub-path (GitHub Pages project sites, Vercel, a local file).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const SITE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SITE_DIR, "..");
const OUT_DIR = path.join(SITE_DIR, "dist");

const REPO_URL = "https://github.com/emir-utku-ozgen/Ferry";
const BRANCH = "main";
const EXPLORER = "https://stellar.expert/explorer/testnet";

// Order here is the order in the sidebar and on the landing page.
const PAGES = [
  {
    slug: "runbook",
    source: "docs/RUNBOOK.md",
    group: "Operations",
    nav: "Operations Runbook",
    description:
      "Configuration reference, Testnet → Mainnet switching, deployment, structured logging and alerting.",
  },
  {
    slug: "go-live-checklist",
    source: "docs/GO_LIVE_CHECKLIST.md",
    group: "Operations",
    nav: "Go-Live Checklist",
    description:
      "The ten-point go-live gate, with application, business/legal and demo readiness tracked item by item.",
  },
  {
    slug: "refund-and-incident-procedures",
    source: "docs/REFUND_AND_INCIDENT_PROCEDURES.md",
    group: "Operations",
    nav: "Refund & Incident Procedures",
    description:
      "Failure matrix for the four SOW scenarios, refund ownership, and the escalation rule for incidents.",
  },
  {
    slug: "key-management",
    source: "docs/KEY_MANAGEMENT.md",
    group: "Security",
    nav: "Key Management",
    description:
      "Why Ferry holds no signing keys today, how existing secrets are handled, and the target custody design.",
  },
  {
    slug: "demo-script",
    source: "docs/DEMO_SCRIPT.md",
    group: "Delivery",
    nav: "Demo Script",
    description:
      "A timed, second-by-second script for recording the end-to-end transfer demo in under ten minutes.",
  },
  {
    slug: "gap-analysis",
    source: "GAP_ANALYSIS.md",
    group: "Reference",
    nav: "SOW Compliance & Gap Analysis",
    description:
      "Requirement-by-requirement SOW compliance assessment, with the technical rationale behind every open gap.",
  },
  {
    slug: "corridor-verification",
    source: "CORRIDOR_VERIFICATION.md",
    group: "Reference",
    nav: "Corridor Verification Log",
    description:
      "Anchor outreach record, EURC issuer verification and the sourced, dated incumbent cost comparison.",
  },
  {
    slug: "testnet-hashes",
    source: "TESTNET_HASHES.md",
    group: "Evidence",
    nav: "Testnet Transaction Evidence",
    description:
      "Every live Testnet run, with transaction hashes linked to the public Stellar explorer for independent checking.",
  },
  {
    slug: "corridor-verification-report",
    source: "docs/evidence/corridor-verification/report.md",
    group: "Evidence",
    nav: "Corridor Verification Report",
    description:
      "Anchor confirmations, proposed pilot terms, cost baseline and verifiable Testnet transfer evidence.",
    download: {
      source: "docs/evidence/corridor-verification/corridor-verification-report.pdf",
      label: "Download PDF",
    },
  },
];

const DOC_BY_BASENAME = new Map(PAGES.map((p) => [path.basename(p.source), p]));

// ---------------------------------------------------------------------------
// Helpers

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function slugify(text, used) {
  let base =
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
  let slug = base;
  for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
  used.add(slug);
  return slug;
}

function lastUpdated(file) {
  try {
    const out = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (out) return out;
  } catch {
    /* not a git checkout */
  }
  // Shallow clones (e.g. CI) may not contain the file's last commit; show no
  // date rather than a misleading one.
  return null;
}

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

// Pandoc-only syntax in report.md (fenced divs, heading attributes) has no
// meaning on the web; drop it so the Markdown renders cleanly.
function normalizeMarkdown(md) {
  return md
    .split("\n")
    .filter((line) => !/^:::/.test(line))
    .map((line) => (/^#{1,6}\s/.test(line) ? line.replace(/\s*\{[.#][^}]*\}\s*$/, "") : line))
    .join("\n");
}

// Turns `inline code` that names something real into a link: Stellar hashes
// and accounts go to the Testnet explorer, other docs go to their page, and
// repository paths go to GitHub.
function linkifyCode(inner, fromSlug) {
  const raw = stripTags(inner).trim();
  if (/^[0-9a-f]{64}$/.test(raw)) {
    return { href: `${EXPLORER}/tx/${raw}`, external: true, title: "View transaction on Stellar Expert" };
  }
  if (/^G[A-Z2-7]{55}$/.test(raw)) {
    return { href: `${EXPLORER}/account/${raw}`, external: true, title: "View account on Stellar Expert" };
  }
  if (/^https?:\/\/[^\s<>]+$/.test(raw) && !raw.includes("<")) {
    return { href: raw, external: true };
  }
  const doc = DOC_BY_BASENAME.get(path.basename(raw));
  if (doc && /\.md$/.test(raw) && doc.slug !== fromSlug) {
    return { href: `${doc.slug}.html`, external: false };
  }
  if (/^[\w./[\]-]+$/.test(raw) && (raw.includes("/") || /\.\w+$/.test(raw))) {
    const candidates = [raw, `docs/${raw}`];
    for (const rel of candidates) {
      const abs = path.join(REPO_ROOT, rel.replace(/\/$/, ""));
      if (!abs.startsWith(REPO_ROOT) || !fs.existsSync(abs)) continue;
      const kind = fs.statSync(abs).isDirectory() ? "tree" : "blob";
      return {
        href: `${REPO_URL}/${kind}/${BRANCH}/${rel.replace(/\/$/, "")}`,
        external: true,
        title: "Open in GitHub",
      };
    }
  }
  return null;
}

// In log excerpts, a 64-hex value on a line that says "hash" is a Stellar
// transaction hash: make it clickable without altering the log text.
function linkLogHashes(html) {
  return html
    .split("\n")
    .map((line) =>
      /hash/i.test(line)
        ? line.replace(/(?<![\w/])([0-9a-f]{64})(?![\w])/g, `<a class="log-link" href="${EXPLORER}/tx/$1" target="_blank" rel="noopener">$1</a>`)
        : line
    )
    .join("\n");
}

// ---------------------------------------------------------------------------
// Markdown -> page model

function renderPage(page) {
  const md = normalizeMarkdown(fs.readFileSync(path.join(REPO_ROOT, page.source), "utf8"));
  const marked = new Marked({ gfm: true });
  const tokens = marked.lexer(md);

  // Title = first H1. Lead = everything after it up to the first rule/heading.
  let title = page.nav;
  const h1Index = tokens.findIndex((t) => t.type === "heading" && t.depth === 1);
  if (h1Index !== -1) {
    title = tokens[h1Index].text.replace(/^Ferry\s+[—–-]\s+/, "");
    tokens.splice(h1Index, 1);
  }
  const leadTokens = [];
  while (tokens.length) {
    const t = tokens[0];
    if (t.type === "heading") break;
    tokens.shift();
    if (t.type === "hr") break;
    leadTokens.push(t);
  }

  // Lead paragraphs shaped like "**Label:** value" become a metadata card.
  const meta = [];
  const leadRest = [];
  for (const t of leadTokens) {
    if (t.type !== "paragraph") {
      if (t.type !== "space") leadRest.push(t);
      continue;
    }
    for (const line of t.raw.trim().split("\n")) {
      const m = line.match(/^\*\*([^*]+?):\*\*\s*(.+)$/);
      if (m) meta.push({ label: m[1], html: marked.parseInline(m[2]) });
      else if (line.trim()) leadRest.push(...marked.lexer(line));
    }
  }

  const usedIds = new Set();
  const toc = [];
  const sections = [];
  let current = { heading: title, id: "", text: [] };
  sections.push(current);

  const renderer = {
    heading({ tokens: inline, depth }) {
      const html = this.parser.parseInline(inline);
      const text = stripTags(html).trim();
      const id = slugify(text, usedIds);
      if (depth === 2 || depth === 3) toc.push({ depth, id, text });
      current = { heading: text, id, text: [] };
      sections.push(current);
      return `<h${depth} id="${id}" class="doc-h"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${html}</h${depth}>\n`;
    },
    paragraph(token) {
      const html = this.parser.parseInline(token.tokens);
      current.text.push(stripTags(html));
      return `<p>${html}</p>\n`;
    },
    listitem(token) {
      current.text.push(stripTags(this.parser.parse(token.tokens, !!token.loose)));
      return false; // fall back to the default renderer
    },
    code({ text, lang }) {
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : "";
      return `<div class="code-block">${label}<button class="copy-btn" type="button" aria-label="Copy code">Copy</button><pre><code${
        lang ? ` class="language-${escapeHtml(lang)}"` : ""
      }>${linkLogHashes(escapeHtml(text))}</code></pre></div>\n`;
    },
    html({ text }) {
      // Build markers such as <!-- COST_TABLE_START --> are not content.
      return /^\s*<!--[\s\S]*-->\s*$/.test(text) ? "" : text;
    },
  };
  marked.use({ renderer });

  let body = marked
    .parser(tokens)
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
  const leadHtml = leadRest.length ? new Marked({ gfm: true }).parser(leadRest) : "";

  // Allow long paths/identifiers to wrap at natural separators only.
  const wbr = (inner) => inner.replace(/([/_.])(?=[^/_.])/g, "$1<wbr>");
  const linkCode = (html) =>
    html.replace(/<code>([^<]*)<\/code>/g, (whole, inner) => {
      const link = linkifyCode(inner, page.slug);
      if (!link) return inner.length > 24 ? `<code>${wbr(inner)}</code>` : whole;
      const attrs = link.external ? ' target="_blank" rel="noopener"' : "";
      const title = link.title ? ` title="${link.title}"` : "";
      const raw = stripTags(inner);
      // Long Stellar identifiers: show head…tail, keep the full value in the tooltip.
      if (/^[0-9a-f]{64}$|^G[A-Z2-7]{55}$/.test(raw)) {
        return `<a class="code-link hash" href="${escapeHtml(link.href)}"${attrs} title="${raw}"><code>${raw.slice(0, 8)}…${raw.slice(-8)}</code></a>`;
      }
      return `<a class="code-link" href="${escapeHtml(link.href)}"${attrs}${title}><code>${wbr(inner)}</code></a>`;
    });
  body = linkCode(body);
  for (const m of meta) m.html = linkCode(m.html);

  // Task-list progress (GO_LIVE_CHECKLIST, DEMO_SCRIPT, ...).
  const done = (md.match(/^\s*[-*] \[[xX]\]/gm) || []).length;
  const open = (md.match(/^\s*[-*] \[ \]/gm) || []).length;
  body = body.replace(/<li><input (checked="" )?disabled="" type="checkbox">/g, (_, checked) =>
    `<li class="task${checked ? " is-done" : ""}"><span class="check" aria-hidden="true"></span><span class="sr-only">${
      checked ? "Done: " : "Open: "
    }</span>`
  );

  const words = stripTags(body).split(/\s+/).filter(Boolean).length;

  return {
    ...page,
    title,
    meta,
    leadHtml: linkCode(leadHtml),
    body,
    toc,
    sections: sections
      .map((s) => ({ heading: s.heading, id: s.id, text: s.text.join(" ").replace(/\s+/g, " ").slice(0, 600) }))
      .filter((s) => s.text || s.id),
    tasks: done + open ? { done, total: done + open } : null,
    minutes: Math.max(1, Math.round(words / 220)),
    updated: lastUpdated(page.source),
  };
}

// ---------------------------------------------------------------------------
// Templates

const ICONS = {
  logo: `<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="var(--signal)"/><path d="M7 19.5c2.2 0 2.2 1.5 4.5 1.5s2.3-1.5 4.5-1.5 2.3 1.5 4.5 1.5 2.3-1.5 4.5-1.5" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/><path d="M9.5 16.5h13l-1.6-4H11.1z" fill="var(--ink)"/><path d="M15 12.5V8.5h3.5" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  github: `<svg viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>`,
  search: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m14 14 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  sun: `<svg class="i-sun" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  moon: `<svg class="i-moon" viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.3A7 7 0 0 1 7.7 3.5a7 7 0 1 0 8.8 8.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  menu: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  arrow: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  download: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m-4-4 4 4 4-4M4 16.5h12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  edit: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 3.5l3 3L7 16H4v-3z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
};

const GROUP_ICONS = {
  Operations: `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2M4.7 4.7l1.6 1.6M13.7 13.7l1.6 1.6M4.7 15.3l1.6-1.6M13.7 6.3l1.6-1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  Security: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 4 5v4.5c0 3.8 2.6 6.6 6 8 3.4-1.4 6-4.2 6-8V5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="m7.5 10 1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  Delivery: `<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m13.5 8.5 4-2.5v8l-4-2.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  Reference: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 3.5h9.5a2 2 0 0 1 2 2v11H6a2 2 0 0 1-2-2z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14.5a2 2 0 0 1 2-2h9.5M7.5 7h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  Evidence: `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 2.5h7l3.5 3.5v11.5H5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 11l1.6 1.6L13 9.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

const groups = () => {
  const map = new Map();
  for (const p of PAGES) {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group).push(p);
  }
  return map;
};

function sidebar(activeSlug) {
  let html = `<a class="nav-home${activeSlug === "index" ? " is-active" : ""}" href="index.html">Overview</a>`;
  for (const [group, pages] of groups()) {
    html += `<div class="nav-group"><div class="nav-group-title">${GROUP_ICONS[group] || ""}<span>${group}</span></div><ul>`;
    for (const p of pages) {
      html += `<li><a href="${p.slug}.html"${p.slug === activeSlug ? ' class="is-active" aria-current="page"' : ""}>${escapeHtml(p.nav)}</a></li>`;
    }
    html += `</ul></div>`;
  }
  html += `<div class="nav-foot">
    <a href="${REPO_URL}/tree/${BRANCH}/docs" target="_blank" rel="noopener">${ICONS.github}<span>Source on GitHub</span></a>
  </div>`;
  return html;
}

function layout({ slug, title, description, main, toc = "" }) {
  const fullTitle = slug === "index" ? "Ferry Documentation" : `${title} · Ferry Docs`;
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#071420">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=swap" rel="stylesheet">
<script>try{var t=localStorage.getItem("ferry-docs-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}</script>
<link rel="stylesheet" href="assets/style.css">
</head>
<body class="page-${slug === "index" ? "home" : "doc"}">
<a class="skip" href="#content">Skip to content</a>
<header class="topbar">
  <div class="topbar-inner">
    <button class="icon-btn nav-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="sidebar">${ICONS.menu}</button>
    <a class="brand" href="index.html">${ICONS.logo}<span class="brand-name">Ferry</span><span class="brand-tag">Docs</span></a>
    <span class="net-badge" title="All flows run on the Stellar test network"><span class="dot"></span>Testnet</span>
    <button class="search-btn" type="button" data-open-search>${ICONS.search}<span>Search docs</span><kbd>⌘K</kbd></button>
    <div class="topbar-actions">
      <button class="icon-btn search-btn-sm" type="button" data-open-search aria-label="Search">${ICONS.search}</button>
      <a class="icon-btn" href="${REPO_URL}" target="_blank" rel="noopener" aria-label="GitHub repository">${ICONS.github}</a>
      <button class="icon-btn theme-toggle" type="button" aria-label="Toggle colour theme">${ICONS.sun}${ICONS.moon}</button>
    </div>
  </div>
</header>
<div class="shell">
  <nav class="sidebar" id="sidebar" aria-label="Documentation">${sidebar(slug)}</nav>
  <div class="scrim" data-close-nav></div>
  <main id="content" class="main">${main}</main>
  ${toc}
</div>
<div class="search" role="dialog" aria-modal="true" aria-label="Search documentation" hidden>
  <div class="search-backdrop" data-close-search></div>
  <div class="search-panel">
    <div class="search-field">${ICONS.search}<input type="search" placeholder="Search runbooks, procedures, evidence…" autocomplete="off" spellcheck="false" aria-label="Search"><kbd data-close-search>Esc</kbd></div>
    <ul class="search-results" role="listbox"></ul>
    <div class="search-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div>
</div>
<script src="assets/search-index.js" defer></script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

function progress(tasks, compact = false) {
  if (!tasks) return "";
  const pct = Math.round((tasks.done / tasks.total) * 100);
  return `<div class="progress${compact ? " is-compact" : ""}" role="img" aria-label="${tasks.done} of ${tasks.total} items complete">
    <div class="progress-row"><span>${compact ? "Checklist" : "Checklist progress"}</span><span class="progress-num">${tasks.done}<span>/${tasks.total}</span></span></div>
    <div class="progress-bar"><span style="width:${pct}%"></span></div>
  </div>`;
}

function docPage(p, prev, next) {
  const metaHtml = p.meta.length
    ? `<dl class="doc-meta">${p.meta
        .map((m) => `<div><dt>${escapeHtml(m.label)}</dt><dd>${m.html}</dd></div>`)
        .join("")}</dl>`
    : "";
  const download = p.download
    ? `<a class="btn btn-primary" href="${path.basename(p.download.source)}" download>${ICONS.download}<span>${p.download.label}</span></a>`
    : "";
  const pager = `<nav class="pager" aria-label="Pagination">
    ${prev ? `<a class="pager-prev" href="${prev.slug}.html"><span>Previous</span><strong>${escapeHtml(prev.nav)}</strong></a>` : "<span></span>"}
    ${next ? `<a class="pager-next" href="${next.slug}.html"><span>Next</span><strong>${escapeHtml(next.nav)}</strong></a>` : "<span></span>"}
  </nav>`;

  const main = `
<article class="doc">
  <div class="crumbs"><a href="index.html">Docs</a><span>/</span><span>${p.group}</span></div>
  <h1 class="doc-title">${escapeHtml(p.title)}</h1>
  <div class="doc-byline">
    ${p.updated ? `<span>Updated ${formatDate(p.updated)}</span><span class="sep">·</span>` : ""}<span>${p.minutes} min read</span>
    <span class="byline-actions">
      ${download}
      <a class="btn" href="${REPO_URL}/blob/${BRANCH}/${p.source}" target="_blank" rel="noopener">${ICONS.edit}<span>View source</span></a>
    </span>
  </div>
  ${metaHtml}
  ${p.leadHtml ? `<div class="doc-lead">${p.leadHtml}</div>` : ""}
  ${progress(p.tasks)}
  <div class="prose">${p.body}</div>
  ${pager}
</article>`;

  const toc = p.toc.length
    ? `<aside class="toc" aria-label="On this page"><div class="toc-inner"><div class="toc-title">On this page</div><ul>${p.toc
        .map((t) => `<li class="toc-d${t.depth}"><a href="#${t.id}">${escapeHtml(t.text)}</a></li>`)
        .join("")}</ul><a class="toc-top" href="#content">Back to top ↑</a></div></aside>`
    : "";

  return layout({ slug: p.slug, title: p.title, description: p.description, main, toc });
}

function homePage(pages) {
  const cards = [];
  for (const [group] of groups()) {
    for (const p of pages.filter((x) => x.group === group)) {
      cards.push(`<a class="card" href="${p.slug}.html">
        <div class="card-top"><span class="card-icon">${GROUP_ICONS[group] || ""}</span><span class="card-group">${group}</span></div>
        <h3>${escapeHtml(p.nav)}</h3>
        <p>${escapeHtml(p.description)}</p>
        ${progress(p.tasks, true)}
        <div class="card-foot"><span>${p.minutes} min read</span><span class="card-arrow">${ICONS.arrow}</span></div>
      </a>`);
    }
  }
  const report = pages.find((p) => p.slug === "corridor-verification-report");

  const main = `
<section class="hero">
  <div class="hero-waves" aria-hidden="true"></div>
  <p class="eyebrow"><span class="dot"></span>EUR → TRY remittance on Stellar</p>
  <h1>Ferry documentation</h1>
  <p class="hero-sub">Operational runbooks, security posture, incident procedures and verifiable Testnet evidence for Ferry — a strictly non-custodial remittance orchestrator built on Stellar anchor protocols.</p>
  <div class="hero-cta">
    <a class="btn btn-primary btn-lg" href="${PAGES[0].slug}.html"><span>Read the runbook</span>${ICONS.arrow}</a>
    ${report ? `<a class="btn btn-lg" href="${report.slug}.html"><span>View Testnet evidence</span></a>` : ""}
  </div>
  <ul class="chips" aria-label="Stellar protocols">
    <li><strong>SEP-10</strong> Web Auth</li>
    <li><strong>SEP-12</strong> KYC</li>
    <li><strong>SEP-24</strong> Hosted deposit/withdrawal</li>
    <li><strong>SEP-31</strong> Cross-border payments</li>
    <li><strong>SEP-38</strong> Anchor quotes</li>
  </ul>
</section>

<section class="facts" aria-label="Key facts">
  <div class="fact"><span class="fact-k">Custody</span><span class="fact-v">Non-custodial</span><span class="fact-n">Funds and identity documents stay with licensed anchors</span></div>
  <div class="fact"><span class="fact-k">Ferry fee</span><span class="fact-v">0%</span><span class="fact-n">No fee and no exchange-rate margin added</span></div>
  <div class="fact"><span class="fact-k">Stellar leg</span><span class="fact-v">~9 s</span><span class="fact-n">Payment to <code>completed</code> in Testnet runs</span></div>
  <div class="fact"><span class="fact-k">Network</span><span class="fact-v">Testnet</span><span class="fact-n">Every transaction verifiable on a public explorer</span></div>
</section>

<section class="docs-index">
  <div class="section-head"><h2>Browse the documentation</h2><p>${pages.length} documents, generated directly from the <a href="${REPO_URL}" target="_blank" rel="noopener">Ferry repository</a>.</p></div>
  <div class="cards">${cards.join("")}</div>
</section>

<footer class="home-foot">
  <span>Ferry · Stellar remittance orchestration</span>
  <a href="${REPO_URL}" target="_blank" rel="noopener">${ICONS.github}<span>emir-utku-ozgen/Ferry</span></a>
</footer>`;

  return layout({
    slug: "index",
    title: "Ferry Documentation",
    description:
      "Runbooks, security, incident procedures and Testnet evidence for Ferry, a non-custodial EUR → TRY remittance orchestrator on Stellar.",
    main,
  });
}

// ---------------------------------------------------------------------------
// Build

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT_DIR, "assets"), { recursive: true });

const rendered = PAGES.map(renderPage);

rendered.forEach((p, i) => {
  fs.writeFileSync(path.join(OUT_DIR, `${p.slug}.html`), docPage(p, rendered[i - 1], rendered[i + 1]));
  if (p.download) {
    fs.copyFileSync(path.join(REPO_ROOT, p.download.source), path.join(OUT_DIR, path.basename(p.download.source)));
  }
});
fs.writeFileSync(path.join(OUT_DIR, "index.html"), homePage(rendered));

const index = rendered.flatMap((p) =>
  p.sections.map((s) => ({ page: p.nav, group: p.group, url: `${p.slug}.html${s.id ? `#${s.id}` : ""}`, heading: s.heading, text: s.text }))
);
fs.writeFileSync(path.join(OUT_DIR, "assets", "search-index.js"), `window.FERRY_SEARCH=${JSON.stringify(index)};\n`);

for (const f of fs.readdirSync(path.join(SITE_DIR, "assets"))) {
  fs.copyFileSync(path.join(SITE_DIR, "assets", f), path.join(OUT_DIR, "assets", f));
}
fs.writeFileSync(path.join(OUT_DIR, ".nojekyll"), "");

console.log(`Built ${rendered.length + 1} pages → ${path.relative(process.cwd(), OUT_DIR) || "."}`);
