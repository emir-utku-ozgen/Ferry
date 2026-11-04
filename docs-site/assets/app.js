(() => {
  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // Theme ------------------------------------------------------------------
  $(".theme-toggle")?.addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    try { localStorage.setItem("ferry-docs-theme", next); } catch {}
  });

  // Mobile navigation ------------------------------------------------------
  const navToggle = $(".nav-toggle");
  const setNav = (open) => {
    document.body.classList.toggle("nav-open", open);
    navToggle?.setAttribute("aria-expanded", String(open));
  };
  navToggle?.addEventListener("click", () => setNav(!document.body.classList.contains("nav-open")));
  $$("[data-close-nav]").forEach((el) => el.addEventListener("click", () => setNav(false)));
  $(".sidebar .is-active")?.scrollIntoView({ block: "center" });

  // Copy buttons -----------------------------------------------------------
  $$(".copy-btn").forEach((btn) =>
    btn.addEventListener("click", async () => {
      const code = btn.parentElement.querySelector("code").innerText;
      try {
        await navigator.clipboard.writeText(code);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Failed";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1400);
    })
  );

  // Scroll spy for "On this page" -----------------------------------------
  const tocLinks = $$(".toc a[href^='#']").filter((a) => a.getAttribute("href").length > 1);
  if (tocLinks.length) {
    const byId = new Map(tocLinks.map((a) => [decodeURIComponent(a.hash.slice(1)), a]));
    const headings = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let ticking = false;
    const update = () => {
      ticking = false;
      const offset = 120;
      let active = headings[0];
      for (const h of headings) {
        if (h.getBoundingClientRect().top - offset <= 0) active = h;
        else break;
      }
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) active = headings[headings.length - 1];
      tocLinks.forEach((a) => a.classList.remove("is-active"));
      const link = active && byId.get(active.id);
      if (link) {
        link.classList.add("is-active");
        const box = link.closest(".toc");
        const r = link.getBoundingClientRect(), b = box.getBoundingClientRect();
        if (r.top < b.top + 40 || r.bottom > b.bottom - 40) box.scrollTop += r.top - b.top - b.height / 2;
      }
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  // Search -----------------------------------------------------------------
  const dialog = $(".search");
  const input = $(".search input");
  const list = $(".search-results");
  let selected = 0;
  let results = [];
  let lastFocus = null;

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const highlight = (text, terms) => {
    let out = esc(text);
    for (const t of terms) out = out.replace(new RegExp(`(${reEsc(esc(t))})`, "gi"), "<mark>$1</mark>");
    return out;
  };

  const snippet = (text, terms) => {
    const lower = text.toLowerCase();
    const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, at - 50);
    return (start > 0 ? "…" : "") + text.slice(start, start + 180);
  };

  const run = (q) => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const data = window.FERRY_SEARCH || [];
    if (!terms.length) {
      results = data.filter((d) => !d.url.includes("#")).map((d) => ({ ...d, score: 0 }));
    } else {
      results = data
        .map((d) => {
          const head = d.heading.toLowerCase();
          const page = d.page.toLowerCase();
          const body = d.text.toLowerCase();
          let score = 0;
          for (const t of terms) {
            if (head.includes(t)) score += head.startsWith(t) ? 12 : 8;
            else if (page.includes(t)) score += 4;
            else if (body.includes(t)) score += 2;
            else return null;
          }
          return { ...d, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
    }
    selected = 0;
    if (!results.length) {
      list.innerHTML = `<li class="search-empty">No results for “${esc(q)}”</li>`;
      return;
    }
    list.innerHTML = results
      .map(
        (r, i) => `<li role="option" aria-selected="${i === 0}"><a href="${r.url}">
          <div class="sr-page">${esc(r.group)} › ${esc(r.page)}</div>
          <div class="sr-head">${highlight(r.heading, terms)}</div>
          ${r.text ? `<div class="sr-text">${highlight(snippet(r.text, terms), terms)}</div>` : ""}
        </a></li>`
      )
      .join("");
  };

  const select = (i) => {
    const items = $$("li[role=option]", list);
    if (!items.length) return;
    selected = (i + items.length) % items.length;
    items.forEach((li, j) => li.setAttribute("aria-selected", String(j === selected)));
    items[selected].scrollIntoView({ block: "nearest" });
  };

  const open = () => {
    lastFocus = document.activeElement;
    dialog.hidden = false;
    document.body.style.overflow = "hidden";
    input.value = "";
    run("");
    input.focus();
  };
  const close = () => {
    dialog.hidden = true;
    document.body.style.overflow = "";
    lastFocus?.focus?.();
  };

  $$("[data-open-search]").forEach((b) => b.addEventListener("click", open));
  $$("[data-close-search]").forEach((b) => b.addEventListener("click", close));
  list.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  input.addEventListener("input", () => run(input.value.trim()));
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); select(selected + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); select(selected - 1); }
    else if (e.key === "Enter") {
      const a = $$("li[role=option] a", list)[selected];
      if (a) { close(); location.href = a.href; }
    }
  });

  addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dialog.hidden ? open() : close(); }
    else if (e.key === "/" && !typing && dialog.hidden) { e.preventDefault(); open(); }
    else if (e.key === "Escape") { if (!dialog.hidden) close(); else setNav(false); }
  });

  // Show the platform's shortcut on the search button.
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$(".search-btn kbd").forEach((k) => (k.textContent = "Ctrl K"));
})();
