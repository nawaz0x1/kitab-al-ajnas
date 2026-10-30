/* ==========================================================================
   Kitāb al-Ajnās — reader application
   ========================================================================== */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const html = document.documentElement;
  const BOOK = window.KITAB || { meta: {}, parts: [] };
  const NAMES = window.NAMES || [];

  const state = {
    view: localStorage.getItem("kitab-view") || "both",
    theme: localStorage.getItem("kitab-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
    size: parseFloat(localStorage.getItem("kitab-size") || "1.15"),
    bookmarks: JSON.parse(localStorage.getItem("kitab-bookmarks") || "[]"),
    activeSection: null,
    currentName: null,
    nameFilter: "all",
    searchIndex: [],
    sections: [],
  };

  const nameById = new Map();
  const nameByAlias = new Map();
  const nameByArabic = new Map();

  function normalize(s) {
    return (s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[ʿʾ'’ʻ]/g, "")
      .replace(/[āáà]/g, "a")
      .replace(/[īíì]/g, "i")
      .replace(/[ūúù]/g, "u")
      .replace(/[ḥ]/g, "h")
      .replace(/[ṣ]/g, "s")
      .replace(/[ḍ]/g, "d")
      .replace(/[ṭ]/g, "t")
      .replace(/[ẓ]/g, "z")
      .replace(/[ṅ]/g, "n")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeArabic(s) {
    return (s || "")
      .replace(/[\u064B-\u065F\u0670]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[ؤئ]/g, "ء")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function loadPreferences() {
    html.dataset.theme = state.theme;
    html.dataset.view = state.view;
    html.style.setProperty("--reading-size", state.size + "rem");
    $$(".segmented button").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  }

  function save() {
    localStorage.setItem("kitab-view", state.view);
    localStorage.setItem("kitab-theme", state.theme);
    localStorage.setItem("kitab-size", state.size);
    localStorage.setItem("kitab-bookmarks", JSON.stringify(state.bookmarks));
  }

  /* ----------------------------------------------------------------------
     Names
     ---------------------------------------------------------------------- */
  function buildNameMaps() {
    NAMES.forEach((n) => {
      if (n.id) nameById.set(n.id, n);
      const aliases = new Set([n.en, n.ar, ...(n.aliases || [])].filter(Boolean));
      aliases.forEach((a) => {
        nameByAlias.set(normalize(a), n.id);
        if (/[\u0600-\u06FF]/.test(a)) nameByArabic.set(normalizeArabic(a), n.id);
      });
    });
  }

  function nameFor(id) { return nameById.get(id); }

  function findNameFromEnglish(term) {
    return nameById.get(nameByAlias.get(normalize(term)));
  }

  function findNameFromArabic(term) {
    return nameById.get(nameByArabic.get(normalizeArabic(term)));
  }

  // Rough but readable transliteration for names that are not in the
  // curated catalogue. It is used only for the name panels, and is marked
  // as approximate in the popover.
  function transliterateArabic(ar) {
    const cons = {
      "ا": "a", "أ": "a", "إ": "i", "آ": "ā", "ب": "b", "ت": "t", "ث": "th",
      "ج": "j", "ح": "ḥ", "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z",
      "س": "s", "ش": "sh", "ص": "ṣ", "ض": "ḍ", "ط": "ṭ", "ظ": "ẓ", "ع": "ʿ",
      "غ": "gh", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n",
      "ه": "h", "و": "w", "ي": "y", "ى": "ā", "ة": "a", "ء": "ʾ", "ؤ": "u", "ئ": "i",
    };
    const longs = { "ا": "ā", "و": "ū", "ي": "ī", "ى": "ā" };
    const diacritics = { "َ": "a", "ُ": "u", "ِ": "i", "ً": "an", "ٌ": "un", "ٍ": "in", "ْ": "", "ّ": "", "ٰ": "ā" };
    let out = "";
    for (let i = 0; i < ar.length; i++) {
      const ch = ar[i];
      if (diacritics[ch] !== undefined) { out += diacritics[ch]; continue; }
      if (ch === " " || /[.,،؛:()\[\]«»…\-]/.test(ch)) { out += ch; continue; }
      if (cons[ch]) {
        const next = ar[i + 1];
        if (longs[next] && i > 0) {
          out += cons[ch] + longs[next];
          i++;
        } else {
          out += cons[ch];
          if (next && cons[next] && !longs[next]) out += "a";
        }
      }
    }
    out = out.replace(/\s+/g, " ").trim();
    if (!out) return ar;
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  function bengaliFromArabic(ar) {
    const map = {
      "ا": "আ", "أ": "আ", "إ": "ই", "آ": "আ", "ب": "ব", "ت": "ত", "ث": "স",
      "ج": "জ", "ح": "হ", "خ": "খ", "د": "দ", "ذ": "য", "ر": "র", "ز": "য",
      "س": "স", "ش": "শ", "ص": "স", "ض": "দ", "ط": "ত", "ظ": "য", "ع": "আ",
      "غ": "গ", "ف": "ফ", "ق": "ক", "ك": "ক", "ل": "ল", "م": "ম", "ن": "ন",
      "ه": "হ", "و": "ও", "ي": "ই", "ى": "আ", "ة": "আ", "ء": "", "ؤ": "উ", "ئ": "ই",
      "َ": "া", "ُ": "ু", "ِ": "ি", "ً": "ান", "ٌ": "ুন", "ٍ": "িন", "ْ": "", "ّ": "", "ٰ": "া",
    };
    let out = "";
    for (const ch of ar) out += map[ch] !== undefined ? map[ch] : ch;
    return out.trim() || ar;
  }

  function resolveName(term) {
    if (!term) return null;
    if (typeof term === "object" && term.id) return nameById.get(term.id) || term;
    const found = findNameFromEnglish(term) || findNameFromArabic(term);
    if (found) return found;
    if (!/[\u0600-\u06FF]/.test(term)) return null;
    const key = normalizeArabic(term);
    if (!key) return null;
    const id = "preserved-" + key.replace(/[^\u0600-\u06FFa-z0-9]+/gi, "-").slice(0, 60);
    if (nameById.has(id)) return nameById.get(id);
    const en = transliterateArabic(term);
    const bn = bengaliFromArabic(term);
    const entry = {
      id, ar: term, en, bn,
      meaning: "A name preserved in the Arabic text.",
      category: "foreign",
      note: "Approximate transliteration",
      synthetic: true,
    };
    nameById.set(id, entry);
    nameByArabic.set(key, id);
    return entry;
  }

  function nameChipHTML(name, inline) {
    if (!name) return escapeHtml(inline);
    const cls = inline ? "name-term" : "name-reference";
    return `<span class="${cls}" data-name-id="${escapeHtml(name.id)}" tabindex="0" role="button" aria-label="${escapeHtml(name.en)} — ${escapeHtml(name.bn)}">${escapeHtml(inline)}</span>`;
  }

  // Wrap known Latin name aliases in already-escaped prose in a single pass.
  function linkEnglishNames(out) {
    if (!out) return "";
    const map = new Map();
    NAMES.forEach((n) => {
      [n.en, ...(n.aliases || [])].filter(Boolean).forEach((a) => {
        if (a.length >= 3 && !/[\u0600-\u06FF]/.test(a)) {
          const key = a.toLowerCase();
          if (!map.has(key)) map.set(key, n);
        }
      });
    });
    if (!map.size) return out;
    const aliases = Array.from(map.keys()).sort((a, b) => b.length - a.length);
    const rx = new RegExp(`(?<![\\w>])(${aliases.map(escapeRegExp).join("|")})(?![\\w<])`, "gi");
    return out.replace(rx, (m) => {
      const n = map.get(m.toLowerCase());
      if (!n) return m;
      return `<span class="name-term" data-name-id="${escapeHtml(n.id)}" tabindex="0" role="button">${m}</span>`;
    });
  }

  // Link Arabic names in Arabic prose. Keep it conservative: whole-word-ish.
  function linkArabicNames(text) {
    if (!text) return "";
    let out = escapeHtml(text);
    const entries = [];
    NAMES.forEach((n) => {
      if (n.ar) entries.push({ a: n.ar, n });
    });
    entries.sort((x, y) => y.a.length - x.a.length);
    const seen = new Set();
    entries.forEach(({ a, n }) => {
      if (seen.has(a) || a.length < 3) return;
      seen.add(a);
      const esc = escapeRegExp(a);
      const rx = new RegExp(`(?<![\\u0600-\\u06FF])(${esc})(?![\\u0600-\\u06FF])`, "g");
      out = out.replace(rx, (m) => `<span class="ar-name" data-name-id="${escapeHtml(n.id)}" tabindex="0" role="button">${m}</span>`);
    });
    return out;
  }

  function renderInlineText(text) {
    if (!text) return "";
    let out = escapeHtml(text);
    // Link Latin names first, while the string has no attributes to corrupt.
    out = linkEnglishNames(out);
    // Then wrap Arabic runs — including a surrounding parenthesis. The Arabic
    // character class cannot cross an HTML tag, so this is safe after linking.
    out = out.replace(/(\(?[\u0600-\u06FF][\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\u064B-\u065F\u0670.,،؛:«»…\-]*\)?)/g, (run) => {
      const trimmed = run.trim();
      if (!trimmed) return run;
      const bare = trimmed.replace(/[().,،؛:«»…\-]/g, "").trim();
      const n = nameById.get(nameByArabic.get(normalizeArabic(bare)));
      if (n) {
        return `<span class="ar-inline ar-name" data-name-id="${escapeHtml(n.id)}" tabindex="0" role="button" dir="rtl" lang="ar">${run}</span>`;
      }
      return `<span class="ar-inline" dir="rtl" lang="ar">${run}</span>`;
    });
    return out;
  }

  /* ----------------------------------------------------------------------
     Render book
     ---------------------------------------------------------------------- */
  function pageRange(pages) {
    if (!pages || !pages.length) return "";
    const a = Math.min(...pages), b = Math.max(...pages);
    return a === b ? `p. ${a}` : `pp. ${a}–${b}`;
  }

  function renderTOC() {
    const toc = $("#toc");
    if (!BOOK.parts || !BOOK.parts.length) {
      toc.innerHTML = `<p class="toc-part-title" style="padding:14px 4px">Translation in progress</p>`;
      return;
    }
    let out = "";
    const front = [
      { id: "edition", title: "About this edition", part: "Front matter" },
      { id: "world", title: "The book and its world", part: "Front matter" },
      { id: "contents", title: "Contents", part: "Front matter" },
    ];
    out += `<div class="toc-part"><p class="toc-part-title"><span>Front matter</span></p>`;
    front.forEach((s) => out += `<a class="toc-section" href="#${s.id}">${s.title}</a>`);
    out += `</div>`;

    BOOK.parts.forEach((part, i) => {
      out += `<div class="toc-part"><p class="toc-part-title"><span class="num">${roman(i + 1)}</span><span>${escapeHtml(part.title)}</span></p>`;
      (part.sections || []).forEach((s) => {
        out += `<a class="toc-section" href="#${escapeHtml(s.id)}" data-section="${escapeHtml(s.id)}">${escapeHtml(s.title)}</a>`;
      });
      out += `</div>`;
    });
    out += `<div class="toc-part"><p class="toc-part-title"><span>Appendices</span></p>
      <a class="toc-section" href="#names">Catalogue of holy names</a>
      <a class="toc-section" href="#colophon">Colophon</a></div>`;
    toc.innerHTML = out;
  }

  function roman(n) {
    const map = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
    return map[n] || String(n);
  }

  function renderBook() {
    const root = $("#book-content");
    if (!BOOK.parts || !BOOK.parts.length) {
      root.innerHTML = `<section class="editorial"><p class="lede">The translation is being prepared. The reader will appear here as the chapters are completed.</p></section>`;
      return;
    }
    let out = "";
    BOOK.parts.forEach((part, pi) => {
      const pages = part.sections.flatMap((s) => s.pages || []);
      out += `<section class="part" id="${escapeHtml(part.id || "part-" + (pi + 1))}" data-part="${roman(pi + 1)}" data-label="${escapeHtml(part.title)}">
        <header class="part-head">
          <div class="part-number">Part ${roman(pi + 1)}</div>
          <h2 class="part-title">${escapeHtml(part.title)}</h2>
          ${part.title_ar ? `<p class="part-title-ar" dir="rtl">${escapeHtml(part.title_ar)}</p>` : ""}
          ${part.intro ? `<p class="part-intro">${renderInlineText(part.intro)}</p>` : ""}
          <div class="part-meta">
            <span>${part.sections.length} chapter${part.sections.length === 1 ? "" : "s"}</span>
            <span>${pageRange(pages)}</span>
            ${part.subtitle ? `<span>${escapeHtml(part.subtitle)}</span>` : ""}
          </div>
        </header>
      </section>`;
      part.sections.forEach((section, si) => {
        out += renderSection(part, section, pi, si);
      });
    });
    root.innerHTML = out;
    // Apply the decorative drop cap only when the chapter begins with a
    // normal word. Ellipses, brackets and quotations would break the layout.
    $$(".reading-en").forEach((col) => {
      const first = col.querySelector("p.block");
      if (first && /^[A-Za-z]/.test((first.textContent || "").trim())) first.classList.add("dropcap");
    });
    state.sections = $$(".chapter");
    state.sections.forEach((chapter, i, all) => {
      const prev = all[i - 1];
      const next = all[i + 1];
      const nav = document.createElement("nav");
      nav.className = "chapter-pager";
      nav.setAttribute("aria-label", "Chapter navigation");
      nav.innerHTML = `
        ${prev ? `<a class="pager-link prev" href="#${escapeHtml(prev.id)}"><span>Previous</span><strong>${escapeHtml(prev.dataset.label)}</strong></a>` : `<span></span>`}
        ${next ? `<a class="pager-link next" href="#${escapeHtml(next.id)}"><span>Next</span><strong>${escapeHtml(next.dataset.label)}</strong></a>` : `<span></span>`}
      `;
      chapter.appendChild(nav);
    });
    buildSearchIndex();
    observeSections();
    applyBookmarkStates();
  }

  function renderContentsPage() {
    const root = $("#contents-list");
    if (!root) return;
    if (!BOOK.parts || !BOOK.parts.length) {
      root.innerHTML = `<p class="empty-state">The contents will appear as the translation is completed.</p>`;
      return;
    }
    root.innerHTML = BOOK.parts.map((part, pi) => `<div class="contents-part">
      <div class="contents-part-head">
        <span class="contents-num">${roman(pi + 1)}</span>
        <h3 class="contents-part-title">${escapeHtml(part.title)}</h3>
        ${part.title_ar ? `<span class="contents-part-ar" dir="rtl">${escapeHtml(part.title_ar)}</span>` : ""}
      </div>
      <div class="contents-chapters">
        ${(part.sections || []).map((s, si) => `<a class="contents-chapter" href="#${escapeHtml(s.id)}">
          <span class="ch-num">${String(si + 1).padStart(2, "0")}</span>
          <span class="ch-title">${escapeHtml(s.title)}</span>
          <span class="ch-pages">${pageRange(s.pages)}</span>
        </a>`).join("")}
      </div>
    </div>`).join("");
  }

  function renderSection(part, section, pi, si) {
    const pages = section.pages || [];
    const working = String(section._source || "").includes("fallback");
    const names = (section.names || []).map(resolveName).filter(Boolean);
    const uniqueNames = [];
    const seen = new Set();
    names.forEach((n) => { if (n && !seen.has(n.id)) { seen.add(n.id); uniqueNames.push(n); } });

    let en = "", ar = "", arCount = 0;
    (section.blocks || []).forEach((b) => {
      if (b.type === "h3") {
        en += `<h3 class="block h3">${renderInlineText(b.en)}</h3>`;
        if (b.ar) { ar += `<h3 class="block h3" dir="rtl">${linkArabicNames(b.ar)}</h3>`; arCount++; }
      } else if (b.type === "quote") {
        en += `<blockquote class="block quote">${renderInlineText(b.en)}</blockquote>`;
        if (b.ar) { ar += `<blockquote class="block quote" dir="rtl">${linkArabicNames(b.ar)}</blockquote>`; arCount++; }
      } else if (b.type === "note") {
        en += `<p class="block note">${renderInlineText(b.en)}</p>`;
        if (b.ar) { ar += `<p class="block note" dir="rtl">${linkArabicNames(b.ar)}</p>`; arCount++; }
      } else if (b.type === "list") {
        const items = Array.isArray(b.en) ? b.en : String(b.en || "").split("\n");
        en += `<ul class="block list">${items.map((x) => `<li>${renderInlineText(x)}</li>`).join("")}</ul>`;
        if (b.ar) { ar += `<ul class="block list" dir="rtl">${String(b.ar).split("\n").map((x) => `<li>${linkArabicNames(x)}</li>`).join("")}</ul>`; arCount++; }
      } else {
        en += `<p class="block">${renderInlineText(b.en)}</p>`;
        if (b.ar) { ar += `<p class="block" dir="rtl">${linkArabicNames(b.ar)}</p>`; arCount++; }
      }
    });

    if (!arCount) {
      ar = `<div class="arabic-missing">The Arabic text of this passage is not available in this edition.</div>`;
    }

    const namesHTML = uniqueNames.length ? `<details class="section-names">
      <summary>Holy names in this chapter · ${uniqueNames.length}</summary>
      <div class="section-names-grid">
        ${uniqueNames.map((n) => `<button class="name-tile" data-name-id="${escapeHtml(n.id)}">
          <div class="tile-ar" dir="rtl" lang="ar">${escapeHtml(n.ar)}</div>
          <div class="tile-en">${escapeHtml(n.en)}</div>
          <div class="tile-bn bn" lang="bn">${escapeHtml(n.bn || "")}</div>
        </button>`).join("")}
      </div>
    </details>` : "";

    return `<article class="chapter" id="${escapeHtml(section.id)}" data-label="${escapeHtml(section.title)}" data-pages="${escapeHtml(pages.join(","))}">
      <header class="chapter-head">
        <div class="chapter-kicker">
          <span>${escapeHtml(part.title)}</span><span class="dot"></span><span>Chapter ${si + 1}</span><span class="dot"></span><span>${pageRange(pages)}</span>
          ${working ? `<span class="dot"></span><span class="working-chip" title="Machine-assisted draft; the Arabic text remains authoritative.">Working translation</span>` : ""}
        </div>
        <h2>${escapeHtml(section.title)}${section.title_ar ? `<span class="ar-title" dir="rtl">${escapeHtml(section.title_ar)}</span>` : ""}</h2>
        <div class="chapter-actions">
          <button class="chip-btn bookmark-btn" data-section-id="${escapeHtml(section.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg><span>Save</span>
          </button>
        </div>
      </header>
      <div class="text-grid">
        <div class="reading-en">${en}</div>
        <div class="reading-ar" dir="rtl">${ar}</div>
      </div>
      ${namesHTML}
    </article>`;
  }

  /* ----------------------------------------------------------------------
     Observer, progress, current label
     ---------------------------------------------------------------------- */
  let observer;
  function observeSections() {
    if (observer) observer.disconnect();
    const targets = $$(".chapter, .part, .editorial, #contents, #names, #colophon");
    observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (visible.length) {
        const el = visible[0].target;
        if (el.classList.contains("chapter")) setActive(el.id, el.dataset.label, el.dataset.pages);
        else if (el.id) setActive(el.id, el.dataset.label || el.querySelector("h2")?.textContent, null);
      }
    }, { rootMargin: "-15% 0px -55% 0px", threshold: [0, 0.15, 0.5] });
    targets.forEach((t) => observer.observe(t));
  }

  function setActive(id, label, pages) {
    if (state.activeSection === id) return;
    state.activeSection = id;
    $$(".toc-section").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + id));
    if (label) $("#current-label").textContent = label;
    if (pages) {
      const arr = String(pages).split(",").filter(Boolean).map(Number);
      if (arr.length) $("#page-label").textContent = "Page " + Math.min(...arr);
    }
  }

  let ticking = false;
  function updateProgress() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? Math.min(100, Math.max(0, (h.scrollTop / max) * 100)) : 0;
      $("#progress-bar").style.width = pct + "%";
      $("#sidebar-progress").style.width = pct + "%";
      $("#progress-label").textContent = Math.round(pct) + "% read";
      ticking = false;
    });
  }

  /* ----------------------------------------------------------------------
     Names appendix
     ---------------------------------------------------------------------- */
  function renderNameCatalogue() {
    const grid = $("#name-grid");
    if (!NAMES.length) {
      grid.innerHTML = `<p class="empty-state">The catalogue will be completed with the translation.</p>`;
      return;
    }
    grid.innerHTML = NAMES.map((n) => `<article class="name-card" data-name-id="${escapeHtml(n.id)}" data-cat="${escapeHtml(n.category || "other")}" tabindex="0" role="button">
      <span class="cat">${escapeHtml(catLabel(n.category))}</span>
      <div class="card-ar" dir="rtl" lang="ar">${escapeHtml(n.ar)}</div>
      <div class="card-en">${escapeHtml(n.en)}</div>
      <div class="card-bn bn" lang="bn">${escapeHtml(n.bn || "")}</div>
      ${n.meaning ? `<div class="card-meaning">${escapeHtml(n.meaning)}</div>` : ""}
    </article>`).join("");
    applyNameFilter();
  }

  function catLabel(c) {
    return ({ divine: "Divine name", foreign: "Holy name", angel: "Angel", jinn: "Jinn king", other: "Figure" })[c] || "Name";
  }

  function applyNameFilter() {
    const q = normalize($("#names-filter")?.value || "");
    let visible = 0;
    $$(".name-card").forEach((card) => {
      const n = nameById.get(card.dataset.nameId);
      if (!n) return;
      const catOK = state.nameFilter === "all" || n.category === state.nameFilter;
      const hay = normalize([n.ar, n.en, n.bn, n.meaning, ...(n.aliases || [])].join(" "));
      const qOK = !q || hay.includes(q);
      const show = catOK && qOK;
      card.style.display = show ? "" : "none";
      if (show) visible++;
    });
    $("#names-empty").hidden = visible > 0;
  }

  /* ----------------------------------------------------------------------
     Search
     ---------------------------------------------------------------------- */
  function buildSearchIndex() {
    const idx = [];
    BOOK.parts.forEach((p) => {
      p.sections.forEach((s) => {
        const textEn = (s.blocks || []).map((b) => typeof b.en === "string" ? b.en : Array.isArray(b.en) ? b.en.join(" ") : "").join(" ");
        const textAr = (s.blocks || []).map((b) => b.ar || "").join(" ");
        idx.push({ type: "chapter", id: s.id, title: s.title, part: p.title, text: textEn + " " + textAr });
      });
    });
    NAMES.forEach((n) => idx.push({ type: "name", id: "names", title: n.en, part: catLabel(n.category), text: [n.ar, n.en, n.bn, n.meaning].join(" "), name: n }));
    state.searchIndex = idx;
  }

  function snippet(text, q) {
    const t = text.replace(/\s+/g, " ");
    const n = normalize(t);
    const i = n.indexOf(q);
    if (i < 0) return t.slice(0, 150) + (t.length > 150 ? "…" : "");
    const start = Math.max(0, i - 50);
    return (start > 0 ? "…" : "") + t.slice(start, start + 180) + (t.length > start + 180 ? "…" : "");
  }

  function highlight(text, q) {
    if (!q) return escapeHtml(text);
    const i = normalize(text).indexOf(q);
    if (i < 0) return escapeHtml(text);
    // Approximate mapping back to original.
    return escapeHtml(text.slice(0, i)) + "<mark>" + escapeHtml(text.slice(i, i + q.length)) + "</mark>" + escapeHtml(text.slice(i + q.length));
  }

  function runSearch(q) {
    const results = $("#search-results");
    const query = normalize(q);
    if (!query) {
      results.innerHTML = `<div class="search-empty">Search the translation, the Arabic text, and the catalogue of names.</div>`;
      return;
    }
    const hits = [];
    state.searchIndex.forEach((item) => {
      const hay = normalize(item.title + " " + item.part + " " + item.text);
      if (hay.includes(query)) hits.push(item);
    });
    if (!hits.length) {
      results.innerHTML = `<div class="search-empty">No results for “${escapeHtml(q)}”.</div>`;
      return;
    }
    results.innerHTML = hits.slice(0, 40).map((h) => `<button class="search-result" data-target="${escapeHtml(h.id)}" data-name-id="${h.name ? escapeHtml(h.name.id) : ""}">
      <span class="sr-kicker">${escapeHtml(h.part)}</span>
      <span class="sr-title">${highlight(h.title, query)}</span>
      <span class="sr-snippet">${highlight(snippet(h.text, query), query)}</span>
    </button>`).join("");
  }

  function openSearch() {
    const d = $("#search-modal");
    if (!d.open) d.showModal();
    $("#search-input").value = "";
    runSearch("");
    setTimeout(() => $("#search-input").focus(), 40);
  }

  /* ----------------------------------------------------------------------
     Popover
     ---------------------------------------------------------------------- */
  function openName(id, anchor) {
    const n = nameById.get(id);
    if (!n) return;
    state.currentName = n;
    $("#popover-ar").textContent = n.ar;
    $("#popover-en").textContent = n.en;
    $("#popover-bn").textContent = n.bn || "";
    $("#popover-meaning").textContent = n.meaning || "";
    $("#popover-meta").textContent = [catLabel(n.category), n.note].filter(Boolean).join(" · ");
    const pop = $("#name-popover");
    pop.hidden = false;

    // Add actions if not already present
    let actions = $(".popover-actions", pop);
    if (!actions) {
      actions = document.createElement("div");
      actions.className = "popover-actions";
      actions.innerHTML = `<button data-speak="ar">Listen Arabic</button><button data-speak="en">Listen English</button><button data-copy>Copy</button>`;
      pop.appendChild(actions);
    }

    const rect = anchor ? anchor.getBoundingClientRect() : null;
    pop.style.left = "0px";
    pop.style.top = "0px";
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left, top;
    if (window.innerWidth <= 640 || !rect) {
      left = Math.max(14, (window.innerWidth - pw) / 2);
      top = Math.max(80, window.innerHeight - ph - 24);
    } else {
      left = Math.min(window.innerWidth - pw - 16, Math.max(16, rect.left + rect.width / 2 - pw / 2));
      top = rect.bottom + 10 + ph > window.innerHeight ? rect.top - ph - 10 : rect.bottom + 10;
      top = Math.max(76, top);
    }
    pop.style.left = left + "px";
    pop.style.top = top + "px";

    if (!pop.dataset.bound) {
      pop.dataset.bound = "1";
      pop.addEventListener("click", (e) => {
        const speak = e.target.closest("[data-speak]");
        if (speak && state.currentName) {
          speakText(state.currentName[speak.dataset.speak] || state.currentName.en, speak.dataset.speak === "ar" ? "ar-SA" : "en-US");
        }
        if (e.target.closest("[data-copy]") && state.currentName) {
          navigator.clipboard?.writeText(`${state.currentName.ar} — ${state.currentName.en} — ${state.currentName.bn || ""}`);
        }
      });
    }
  }

  function speakText(text, lang) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }

  function closePopover() {
    $("#name-popover").hidden = true;
    state.currentName = null;
  }

  /* ----------------------------------------------------------------------
     Bookmarks
     ---------------------------------------------------------------------- */
  function applyBookmarkStates() {
    $$(".bookmark-btn").forEach((b) => {
      const saved = state.bookmarks.includes(b.dataset.sectionId);
      b.classList.toggle("saved", saved);
      const span = b.querySelector("span");
      if (span) span.textContent = saved ? "Saved" : "Save";
    });
  }

  function toggleBookmark(id) {
    const i = state.bookmarks.indexOf(id);
    if (i >= 0) state.bookmarks.splice(i, 1);
    else state.bookmarks.push(id);
    save();
    applyBookmarkStates();
  }

  function openBookmarks() {
    const q = $("#search-input");
    const modal = $("#search-modal");
    if (!modal.open) modal.showModal();
    q.value = "";
    const sections = state.bookmarks.map((id) => state.searchIndex.find((x) => x.id === id)).filter(Boolean);
    $("#search-results").innerHTML = sections.length ? sections.map((h) => `<button class="search-result" data-target="${escapeHtml(h.id)}">
      <span class="sr-kicker">${escapeHtml(h.part)}</span>
      <span class="sr-title">${escapeHtml(h.title)}</span>
      <span class="sr-snippet">${escapeHtml((h.text || "").slice(0, 140))}…</span>
    </button>`).join("") : `<div class="bookmark-empty">No saved chapters yet. Use the “Save” button on any chapter.</div>`;
    $(".search-hint span:first-child").textContent = "Saved chapters";
  }

  /* ----------------------------------------------------------------------
     Sidebar / mobile
     ---------------------------------------------------------------------- */
  function setSidebar(open) {
    $("#sidebar").classList.toggle("open", open);
    $("#sidebar-scrim").hidden = !open;
    $("#menu-btn").setAttribute("aria-expanded", String(open));
  }

  /* ----------------------------------------------------------------------
     Events
     ---------------------------------------------------------------------- */
  function bind() {
    $("#menu-btn").addEventListener("click", () => setSidebar(!$("#sidebar").classList.contains("open")));
    $("#sidebar-scrim").addEventListener("click", () => setSidebar(false));

    $$(".segmented button").forEach((b) => b.addEventListener("click", () => {
      state.view = b.dataset.view;
      html.dataset.view = state.view;
      $$(".segmented button").forEach((x) => x.classList.toggle("active", x === b));
      save();
    }));

    $$("[data-font]").forEach((btn) => btn.addEventListener("click", () => {
      const delta = btn.dataset.font === "up" ? 0.05 : -0.05;
      state.size = Math.min(1.55, Math.max(0.95, state.size + delta));
      html.style.setProperty("--reading-size", state.size + "rem");
      save();
    }));

    $("#theme-btn").addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      html.dataset.theme = state.theme;
      save();
    });

    $("#search-btn").addEventListener("click", openSearch);
    $("#search-pill").addEventListener("click", openSearch);
    $("#search-close").addEventListener("click", () => $("#search-modal").close());
    $("#search-input").addEventListener("input", (e) => runSearch(e.target.value));
    $("#search-modal").addEventListener("close", () => {
      $(".search-hint span:first-child").textContent = "Try “Metatron”, “الرحمن”, “seal”, “Maymun”";
    });

    $("#search-results").addEventListener("click", (e) => {
      const btn = e.target.closest(".search-result");
      if (!btn) return;
      $("#search-modal").close();
      if (btn.dataset.nameId) {
        setTimeout(() => openName(btn.dataset.nameId, null), 60);
        return;
      }
      const target = document.getElementById(btn.dataset.target);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("flash");
        setTimeout(() => target.classList.remove("flash"), 1600);
      }
    });

    document.addEventListener("click", (e) => {
      const term = e.target.closest(".name-term, .ar-name, .name-tile, .name-card");
      if (term) {
        const id = term.dataset.nameId;
        if (id) openName(id, term);
        return;
      }
      if (!e.target.closest("#name-popover")) closePopover();
      const bookmark = e.target.closest(".bookmark-btn");
      if (bookmark) toggleBookmark(bookmark.dataset.sectionId);
      const tocLink = e.target.closest(".toc-section");
      if (tocLink && window.innerWidth <= 860) setSidebar(false);
    });

    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openSearch(); }
      if (e.key === "Escape") {
        if ($("#search-modal").open) $("#search-modal").close();
        if ($("#name-popover").hidden === false) closePopover();
        if ($("#sidebar").classList.contains("open")) setSidebar(false);
      }
      if (e.key === "Enter" && document.activeElement?.matches(".name-term, .ar-name, .name-card")) {
        openName(document.activeElement.dataset.nameId, document.activeElement);
      }
    });

    $("#popover-close").addEventListener("click", closePopover);

    $("#bookmarks-btn").addEventListener("click", openBookmarks);
    $("#about-btn").addEventListener("click", () => {
      document.getElementById("edition").scrollIntoView({ behavior: "smooth" });
      if (window.innerWidth <= 860) setSidebar(false);
    });

    $("#names-filter").addEventListener("input", applyNameFilter);
    $("#name-filters").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-filter]");
      if (!b) return;
      state.nameFilter = b.dataset.filter;
      $$("#name-filters button").forEach((x) => x.classList.toggle("active", x === b));
      applyNameFilter();
    });

    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
  }

  /* ----------------------------------------------------------------------
     Init
     ---------------------------------------------------------------------- */
  function init() {
    loadPreferences();
    buildNameMaps();
    renderTOC();
    renderContentsPage();
    renderBook();
    renderNameCatalogue();
    bind();
    updateProgress();
    if (BOOK.meta?.title) document.title = `${BOOK.meta.title} — ${BOOK.meta.subtitle || "Reader"}`;
    // Open the first chapter on first visit if the URL has no hash.
    if (!location.hash && window.innerWidth > 860) {
      // stay on cover
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
