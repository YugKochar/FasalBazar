/**
 * site-translate.js — Fasal Bazaar Site-Wide Translation Engine
 * ─────────────────────────────────────────────────────────────────
 * Include on EVERY page AFTER api.js and reverie.js.
 *
 * HOW IT WORKS:
 *  1. On page load, reads fb_lang from localStorage.
 *  2. If lang !== "en", collects all translatable text nodes
 *     (elements marked with [data-t] or generic text containers).
 *  3. Batches them into a single Reverie translate() call.
 *  4. Swaps text in-place; caches results in localStorage keyed by
 *     page + lang so subsequent visits (even across tab closes) are instant.
 *  5. Exposes SiteTranslate.translateDynamic(el) for newly injected DOM.
 *  6. Shows a floating language-switcher pill on every page.
 *
 * MARKUP CONTRACT:
 *  • Add  data-t  attribute to any element whose text content should
 *    be translated.  Example:  <h2 data-t>Fresh Produce</h2>
 *  • Add  data-t-placeholder  on <input>/<textarea> to translate
 *    their placeholder attribute.
 *  • Add  data-t-skip  to exclude an element and its children.
 *  • Crop names / brand names: wrap in <span data-t-mask> so they
 *    are passed via nmtMaskTerms and protected from mutation.
 * ─────────────────────────────────────────────────────────────────
 */

const SiteTranslate = (() => {
  // ── Config ────────────────────────────────────────────────────
  const SOURCE_LANG = "en";   // website is authored in English
  const CACHE_PREFIX = "fbt_"; // sessionStorage key prefix

  let currentLang = "en";
  let _initialized = false;

  // In-flight dedup: if translatePage() is already running for a lang,
  // subsequent callers await the same Promise instead of firing a second API call.
  const _inFlight = new Map(); // lang → Promise<void>

  // ── Helpers ───────────────────────────────────────────────────

  function getLang() {
    return localStorage.getItem("fb_lang") || "en";
  }

  function setLang(code) {
    localStorage.setItem("fb_lang", code);
    currentLang = code;

    // Update logged-in user profile (best-effort)
    const token = localStorage.getItem("fb_token");
    if (token) {
      fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify({ preferred_language: code }),
      }).catch(() => { });
    }
  }

  function cacheKey() {
    const page = location.pathname.split("/").pop() || "index";
    return `${CACHE_PREFIX}${page}_${currentLang}`;
  }

  function saveCache(map) {
    try {
      // FIX: use localStorage instead of sessionStorage so cache survives
      // tab closes — returning users get instant translation on revisit.
      localStorage.setItem(cacheKey(), JSON.stringify(map));
    } catch (_) { }
  }

  function loadCache() {
    try {
      // FIX: read from localStorage to match saveCache
      const raw = localStorage.getItem(cacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  // ── Collect translatable nodes ─────────────────────────────────
  // ── Collect translatable nodes ─────────────────────────────────

  function autoTagElements(root) {
    // Tag standard text containers
    const elements = root.querySelectorAll('h1, h2, h3, h4, h5, p, label, button, th, td');
    elements.forEach(el => {
      if (el.textContent.trim().length > 0 && !el.hasAttribute('data-t-skip')) {
        el.setAttribute('data-t', '');
      }
    });

    // Tag placeholders
    const inputs = root.querySelectorAll('input[placeholder], textarea[placeholder]');
    inputs.forEach(input => {
      if (!input.hasAttribute('data-t-skip')) {
        input.setAttribute('data-t-placeholder', '');
      }
    });
  }
  /**
   * Returns an array of descriptor objects for every translatable
   * text node / placeholder on the page.
   * Each descriptor: { el, type, original }
   *   type: "text" | "placeholder" | "title" | "alt"
   */
  function collect(root = document.body) {
    autoTagElements(root);
    const items = [];
    const seen = new Set();

    // 1. Explicit [data-t] elements
    root.querySelectorAll("[data-t]").forEach((el) => {
      if (el.closest("[data-t-skip]")) return;
      // FIX: snapshot the English original on first visit; never overwrite it.
      // This ensures subsequent language switches always translate from English,
      // not from whatever translated text is currently sitting in the DOM.
      if (!el.dataset.original) {
        el.dataset.original = el.textContent.trim();
      }
      const text = el.dataset.original;
      if (!text || seen.has(el)) return;
      seen.add(el);
      items.push({ el, type: "text", original: text });
    });

    // 2. [data-t-placeholder] inputs
    root.querySelectorAll("[data-t-placeholder]").forEach((el) => {
      // FIX: same snapshot pattern for placeholders
      if (!el.dataset.originalPh) {
        el.dataset.originalPh = el.getAttribute("placeholder") || "";
      }
      const ph = el.dataset.originalPh;
      if (!ph || seen.has(el + "_ph")) return;
      seen.add(el + "_ph");
      items.push({ el, type: "placeholder", original: ph });
    });

    // 3. Page <title>
    if (!seen.has("__title__")) {
      seen.add("__title__");
      // FIX: snapshot original title too
      if (!document._originalTitle) {
        document._originalTitle = document.title;
      }
      items.push({ el: document, type: "title", original: document._originalTitle });
    }

    return items;
  }

  // Collect all mask terms (crop names etc.) to protect
  function collectMaskTerms() {
    return Array.from(
      document.querySelectorAll("[data-t-mask]")
    ).map((el) => el.textContent.trim()).filter(Boolean);
  }

  // ── Apply translations ─────────────────────────────────────────

  function apply(items, translations) {
    items.forEach((item, i) => {
      const translated = translations[i];
      if (!translated) return;
      switch (item.type) {
        case "text":
          // Preserve child elements — only swap text nodes
          setTextContent(item.el, translated);
          break;
        case "placeholder":
          item.el.setAttribute("placeholder", translated);
          break;
        case "title":
          document.title = translated;
          break;
        case "alt":
          item.el.setAttribute("alt", translated);
          break;
      }
    });
  }

  /**
   * Replaces an element's *text* nodes only, leaving child elements intact.
   * This prevents wiping out <span>, <strong>, <a> children.
   */
  function setTextContent(el, newText) {
    // If element has only one text node and no child elements — fast path
    if (el.childElementCount === 0) {
      el.textContent = newText;
      return;
    }
    // Otherwise replace only the first direct text node
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        node.textContent = newText;
        return;
      }
    }
  }

  // ── Main translate routine ─────────────────────────────────────

  async function translatePage() {
    currentLang = getLang();

    // ── Restore English originals when switching back to English ──
    if (currentLang === SOURCE_LANG) {
      document.querySelectorAll('[data-t]').forEach(el => {
        if (el.dataset.original) el.textContent = el.dataset.original;
      });
      document.querySelectorAll('[data-t-placeholder]').forEach(el => {
        if (el.dataset.originalPh) el.setAttribute('placeholder', el.dataset.originalPh);
      });
      if (document._originalTitle) document.title = document._originalTitle;
      return;
    }
    // ─────────────────────────────────────────────────────────────

    // If a translate call for this lang is already in flight, await it
    // instead of firing a duplicate API request.
    if (_inFlight.has(currentLang)) {
      await _inFlight.get(currentLang);
      return;
    }

    // Show loading overlay
    showLoadingOverlay();

    // Check cache first — serve instantly if warm
    const cached = loadCache();
    const items = collect();

    if (cached && items.length <= Object.keys(cached).length) {
      const translations = items.map((_, i) => cached[i] || null);
      apply(items, translations);
      hideLoadingOverlay();
      return;
    }

    const maskTerms = collectMaskTerms();
    const originals = items.map((d) => d.original);

    const promise = Reverie.translate(originals, SOURCE_LANG, currentLang, maskTerms)
      .then((translated) => {
        apply(items, translated);
        const cacheMap = {};
        translated.forEach((t, i) => { cacheMap[i] = t; });
        saveCache(cacheMap);
      })
      .catch((err) => {
        console.warn("[SiteTranslate] Translation failed:", err);
      })
      .finally(() => {
        _inFlight.delete(currentLang);
        hideLoadingOverlay();
      });

    _inFlight.set(currentLang, promise);
    await promise;
  }

  /**
   * Translate a dynamically injected element (e.g. modal, card).
   * Call after inserting new DOM.
   *
   * @param {HTMLElement} el
   */
  async function translateDynamic(el) {
    if (currentLang === SOURCE_LANG) return;
    const items = collect(el);
    if (!items.length) return;

    // Load existing page cache so we can skip strings already translated
    const existingCache = (() => {
      try { return JSON.parse(localStorage.getItem(cacheKey()) || '{}'); } catch { return {}; }
    })();

    // Split into cached vs. uncached by index
    const needed = [];    // { item, origIdx } — only those missing from cache
    const result = new Array(items.length).fill(null);

    items.forEach((item, i) => {
      // Cache is keyed by numeric index (matches translatePage format),
      // but for dynamic content we key by the original text string instead.
      const dynKey = `dyn_${item.original}`;
      if (existingCache[dynKey]) {
        result[i] = existingCache[dynKey];
      } else {
        needed.push({ item, origIdx: i });
      }
    });

    // Apply cached hits immediately (zero latency)
    apply(items, result);

    // Fetch only the uncached strings
    if (needed.length) {
      const maskTerms = collectMaskTerms();
      const texts = needed.map(({ item }) => item.original);
      try {
        const translated = await Reverie.translate(texts, SOURCE_LANG, currentLang, maskTerms);
        needed.forEach(({ item, origIdx }, i) => {
          if (translated[i]) {
            result[origIdx] = translated[i];
            existingCache[`dyn_${item.original}`] = translated[i];
          }
        });
        // Write new translations back into the page cache
        localStorage.setItem(cacheKey(), JSON.stringify(existingCache));
        apply(items, result);
      } catch (err) {
        console.warn("[SiteTranslate] Dynamic translation failed:", err);
      }
    }
  }

  // ── Loading overlay ───────────────────────────────────────────

  function showLoadingOverlay() {
    if (document.getElementById("st-overlay")) return;
    const div = document.createElement("div");
    div.id = "st-overlay";
    div.innerHTML = `
      <div class="st-overlay-inner">
        <div class="st-spinner"></div>
        <div class="st-label">Translating…</div>
      </div>
    `;
    div.style.cssText = `
      position:fixed; inset:0; background:rgba(15,32,6,.72);
      backdrop-filter:blur(4px); z-index:99999;
      display:flex; align-items:center; justify-content:center;
      font-family:Segoe UI,sans-serif;
      animation:stFadeIn .2s ease;
    `;
    document.head.insertAdjacentHTML("beforeend", `
      <style>
        @keyframes stFadeIn { from{opacity:0} to{opacity:1} }
        @keyframes stFadeOut { from{opacity:1} to{opacity:0} }
        .st-overlay-inner { text-align:center; color:#e8f5d8; }
        .st-spinner {
          width:36px; height:36px; border-radius:50%;
          border:3px solid rgba(90,140,46,.3);
          border-top-color:#7ab340;
          animation:spin .7s linear infinite;
          margin:0 auto 12px;
        }
        @keyframes spin { to{transform:rotate(360deg)} }
        .st-label { font-size:14px; opacity:.8; letter-spacing:.5px; }
      </style>
    `);
    document.body.appendChild(div);
  }

  function hideLoadingOverlay() {
    const el = document.getElementById("st-overlay");
    if (!el) return;
    el.style.animation = "stFadeOut .3s ease forwards";
    setTimeout(() => el.remove(), 320);
  }

  // ── Language switcher pill ────────────────────────────────────

  function injectSwitcher() {
    const LANGUAGES = Reverie.SUPPORTED_LANGUAGES;
    const current = getLang();

    const pill = document.createElement("div");
    pill.id = "lang-switcher";

    const currentInfo = LANGUAGES[current] || LANGUAGES.en;
    pill.innerHTML = `
      <button class="ls-trigger" id="ls-trigger" aria-haspopup="true" aria-expanded="false">
        <span class="ls-globe">🌐</span>
        <span class="ls-current">${currentInfo.nativeName}</span>
        <span class="ls-chevron">▾</span>
      </button>
      <div class="ls-dropdown" id="ls-dropdown" hidden>
        <div class="ls-grid">
          ${Object.entries(LANGUAGES).map(([code, info]) => `
            <button class="ls-option ${code === current ? "ls-active" : ""}"
                    data-code="${code}">
              <span class="ls-native">${info.nativeName}</span>
              <span class="ls-en">${info.label}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #lang-switcher {
        position: fixed;
        bottom: 20px;
        right: 20px;
        z-index: 9000;
        font-family: 'Segoe UI', sans-serif;
      }

      .ls-trigger {
        display: flex;
        align-items: center;
        gap: 6px;
        background: #2d5016;
        color: #e8f5d8;
        border: none;
        border-radius: 24px;
        padding: 9px 16px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        box-shadow: 0 4px 20px rgba(0,0,0,.35);
        transition: background .2s, transform .15s;
        white-space: nowrap;
      }
      .ls-trigger:hover { background: #1e3d0a; transform: translateY(-1px); }
      .ls-globe { font-size: 15px; }
      .ls-current { max-width: 80px; overflow: hidden; text-overflow: ellipsis; }
      .ls-chevron { opacity: .7; font-size: 11px; transition: transform .2s; }
      .ls-trigger[aria-expanded="true"] .ls-chevron { transform: rotate(180deg); }

      .ls-dropdown {
        position: absolute;
        bottom: calc(100% + 10px);
        right: 0;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 12px 48px rgba(0,0,0,.22), 0 2px 8px rgba(0,0,0,.1);
        padding: 12px;
        width: 280px;
        animation: lsSlideUp .2s cubic-bezier(.22,1,.36,1);
      }
      @keyframes lsSlideUp {
        from { opacity:0; transform:translateY(10px) scale(.97); }
        to   { opacity:1; transform:translateY(0)    scale(1); }
      }
      .ls-dropdown[hidden] { display: none !important; }

      .ls-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 6px;
        max-height: 260px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: #c8c8c0 transparent;
      }

      .ls-option {
        background: #f5f5f0;
        border: 1.5px solid transparent;
        border-radius: 10px;
        padding: 8px 4px;
        cursor: pointer;
        text-align: center;
        transition: background .15s, border-color .15s;
      }
      .ls-option:hover {
        background: #e8f5d8;
        border-color: #7ab340;
      }
      .ls-option.ls-active {
        background: #e8f5d8;
        border-color: #5a8c2e;
      }
      .ls-native {
        display: block;
        font-size: 14px;
        font-weight: 700;
        color: #1c1c18;
      }
      .ls-en {
        display: block;
        font-size: 9.5px;
        color: #888;
        margin-top: 1px;
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(pill);

    // Toggle dropdown
    const trigger = document.getElementById("ls-trigger");
    const dropdown = document.getElementById("ls-dropdown");

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = !dropdown.hidden;
      dropdown.hidden = open;
      trigger.setAttribute("aria-expanded", String(!open));
    });

    // Close on outside click
    document.addEventListener("click", () => {
      dropdown.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    });

    // Handle option selection
    dropdown.addEventListener("click", async (e) => {
      const btn = e.target.closest(".ls-option");
      if (!btn) return;

      const code = btn.getAttribute("data-code");
      if (!code || code === getLang()) {
        dropdown.hidden = true;
        return;
      }

      // FIX: removed clearTranslationCache() here. Each language already has
      // its own cache key (includes lang code), so switching hi→mr→hi correctly
      // reuses the cached Hindi translations on the way back. Clearing everything
      // was throwing away valid caches and forcing unnecessary API round-trips.
      setLang(code);

      // Update pill label
      const info = Reverie.SUPPORTED_LANGUAGES[code] || Reverie.SUPPORTED_LANGUAGES.en;
      pill.querySelector(".ls-current").textContent = info.nativeName;

      // Update active state
      dropdown.querySelectorAll(".ls-option").forEach((o) =>
        o.classList.toggle("ls-active", o.getAttribute("data-code") === code)
      );

      dropdown.hidden = true;
      trigger.setAttribute("aria-expanded", "false");

      // Re-translate the current page
      await translatePage();
    });
  }

  function clearTranslationCache() {
    // FIX: scan localStorage (not sessionStorage) to match saveCache
    const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  }

  /**
   * Pre-warm the translation cache for a given language + list of strings.
   * Call from language-select.html before navigating to the next page so the
   * first real page load is served from cache and needs no API call.
   *
   * @param {string}   lang      Target language code (e.g. "hi")
   * @param {string[]} texts     English strings to pre-translate
   * @param {string}   [page]    Pathname to warm (defaults to "/Homepage.html")
   */
  async function prewarm(lang, texts, page = "/Homepage.html") {
    if (!lang || lang === SOURCE_LANG || !texts || !texts.length) return;
    const key = `${CACHE_PREFIX}${page.split("/").pop() || "index"}_${lang}`;
    if (localStorage.getItem(key)) return; // already warm — skip API call
    try {
      const translated = await Reverie.translate(texts, SOURCE_LANG, lang);
      const cacheMap = {};
      texts.forEach((t, i) => {
        if (translated[i]) cacheMap[`dyn_${t}`] = translated[i];
      });
      localStorage.setItem(key, JSON.stringify(cacheMap));
    } catch (e) {
      // Silently fail — page will translate normally on first load
    }
  }

  // ── Boot ──────────────────────────────────────────────────────

  async function init() {
    if (_initialized) return;
    _initialized = true;

    injectSwitcher();

    // Translate on load
    await translatePage();
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    /** Manually re-translate the page (after lang change) */
    translatePage,
    /** Translate newly injected DOM fragment */
    translateDynamic,
    /** Get the currently active language code */
    getLang,
    /** Switch language programmatically */
    setLang,
    /** Pre-warm cache from language-select screen before navigating */
    prewarm,
  };
})();

window.SiteTranslate = SiteTranslate;
