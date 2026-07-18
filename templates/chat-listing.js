/**
 * chat-listing.js — Guided Conversational Listing Flow
 * Fasal Bazaar · Step-by-step crop listing/request via chat UI
 *
 * Depends on: api.js, reverie.js
 */

const ChatListing = (() => {
  // ── State ──────────────────────────────────────────────────────────────
  let state = {
    lang: "hi",          // farmer's chosen language
    mode: "seller",      // "seller" | "buyer"
    step: -1,            // current step index (-1 = lang select)
    data: {},            // collected listing/request data
    profile: null,       // loaded from Auth
    recording: false,
    mediaRecorder: null,
    audioChunks: [],
    stream: null,
  };

  // ── UI element refs (set in init()) ────────────────────────────────────
  let ui = {};

  // ── Seller Steps ───────────────────────────────────────────────────────
  const SELLER_STEPS = [
    {
      key: "crop_name",
      questionEn: "What crop are you selling? (e.g. Wheat, Tomato, Rice)",
      inputType: "text",
      validate: (v) => v.trim().length >= 2 || "Please enter a valid crop name.",
    },
    {
      key: "amount",
      questionEn: "How much quantity do you have? (Enter a number)",
      inputType: "number",
      validate: (v) => (!isNaN(v) && Number(v) > 0) || "Please enter a valid quantity.",
    },
    {
      key: "unit",
      questionEn: "What is the unit of measurement?",
      inputType: "options",
      options: [
        { value: "kg", labelEn: "Kilogram (kg)" },
        { value: "quintal", labelEn: "Quintal" },
        { value: "ton", labelEn: "Ton" },
        { value: "litre", labelEn: "Litre" },
        { value: "dozen", labelEn: "Dozen" },
        { value: "piece", labelEn: "Piece" },
      ],
    },
    {
      key: "price",
      questionEn: "What is your price per unit (in ₹)?",
      inputType: "number",
      validate: (v) => (!isNaN(v) && Number(v) > 0) || "Please enter a valid price.",
    },
    {
      key: "description",
      questionEn: "Describe the quality of your crop in a few words. (Optional — press Skip to skip)",
      inputType: "text",
      optional: true,
    },
    {
      key: "features",
      questionEn:
        "List any special highlights, one per message. When done, type 'done' or press Done.",
      inputType: "list",
    },
    {
      key: "delivery_cost",
      questionEn: "What is the delivery charge (in ₹)? Enter 0 if you offer free delivery.",
      inputType: "number",
      validate: (v) => !isNaN(v) || "Please enter a number.",
    },
    {
      key: "location",
      questionEn: "Your location has been auto-filled. Is this correct?",
      inputType: "location_confirm",
    },
    {
      key: "images",
      questionEn:
        "Upload photos of your crop (up to 5). Tap the camera icon or skip.",
      inputType: "images",
      optional: true,
    },
  ];

  // ── Buyer Steps ────────────────────────────────────────────────────────
  const BUYER_STEPS = [
    {
      key: "crop_name",
      questionEn: "What crop are you looking to buy? (e.g. Wheat, Tomato, Rice)",
      inputType: "text",
      validate: (v) => v.trim().length >= 2 || "Please enter a valid crop name.",
    },
    {
      key: "amount_required",
      questionEn: "How much quantity do you need? (Enter a number)",
      inputType: "number",
      validate: (v) => (!isNaN(v) && Number(v) > 0) || "Please enter a valid quantity.",
    },
    {
      key: "unit",
      questionEn: "What is the unit of measurement?",
      inputType: "options",
      options: [
        { value: "kg", labelEn: "Kilogram (kg)" },
        { value: "quintal", labelEn: "Quintal" },
        { value: "ton", labelEn: "Ton" },
        { value: "litre", labelEn: "Litre" },
        { value: "dozen", labelEn: "Dozen" },
        { value: "piece", labelEn: "Piece" },
      ],
    },
    {
      key: "budget",
      questionEn: "What is your maximum budget per unit (in ₹)?",
      inputType: "number",
      validate: (v) => (!isNaN(v) && Number(v) > 0) || "Please enter a valid budget.",
    },
    {
      key: "delivery_preference",
      questionEn: "How would you like to receive the crop?",
      inputType: "options",
      options: [
        { value: "Seller Must Deliver", labelEn: "Home Delivery (Seller Delivers)" },
        { value: "Buyer Arranges Transport", labelEn: "I will arrange transport / pick up" },
        { value: "Negotiable", labelEn: "Either is fine / Negotiable" },
      ],
    },
    {
      key: "requirements",
      questionEn: "Any special requirements or notes for the seller? (Optional — press Skip to skip)",
      inputType: "text",
      optional: true,
    },
    {
      key: "location",
      questionEn: "Your delivery location has been auto-filled. Is this correct?",
      inputType: "location_confirm",
    },
  ];

  // Returns the active step list based on current mode
  function activeSteps() {
    return state.mode === "buyer" ? BUYER_STEPS : SELLER_STEPS;
  }

  // Cache of translated question strings — cleared on mode/lang change
  const translatedQuestions = {};

  // ── Translation helpers ────────────────────────────────────────────────

  async function t(text, cropName) {
    if (state.lang === "en") return text;
    try {
      // Only pass cropName as mask term if it looks like a real English/native word
      // (not Hinglish/romanized — those confuse Reverie's masking)
      const isLikelyRomanized = cropName && /^[a-zA-Z\s]+$/.test(cropName) && state.lang !== "en";
      const crop = (cropName && !isLikelyRomanized) ? [cropName] : [];
      const [out] = await Reverie.translate([text], "en", state.lang, crop);
      return out || text;
    } catch {
      // Silent fallback — return original English rather than crashing
      return text;
    }
  }

  async function getQuestion(stepIdx) {
    const step = activeSteps()[stepIdx];
    const cacheKey = `${state.mode}_${state.lang}_${stepIdx}`;
    if (translatedQuestions[cacheKey]) {
      return translatedQuestions[cacheKey];
    }
    const q = await t(step.questionEn, state.data.crop_name);
    translatedQuestions[cacheKey] = q;
    return q;
  }

  // ── Message rendering ──────────────────────────────────────────────────

  function renderBotMessage(text, opts = {}) {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg bot";
    wrap.innerHTML = `
      <div class="avatar bot-avatar">🌾</div>
      <div class="bubble bot-bubble">${escHtml(text)}</div>
    `;
    ui.messages.appendChild(wrap);
    scrollBottom();

    if (opts.options) {
      renderOptions(opts.options);
    }
    if (opts.locationCard) {
      renderLocationCard();
    }
    if (opts.imageUpload) {
      renderImageUpload();
    }
  }

  function renderUserMessage(text) {
    const wrap = document.createElement("div");
    wrap.className = "chat-msg user";
    wrap.innerHTML = `
      <div class="bubble user-bubble">${escHtml(text)}</div>
    `;
    ui.messages.appendChild(wrap);
    scrollBottom();
  }

  function renderOptions(options) {
    const row = document.createElement("div");
    row.className = "option-chips";
    options.forEach(({ value, label }) => {
      const btn = document.createElement("button");
      btn.className = "chip-btn";
      btn.textContent = label;
      btn.onclick = () => handleOptionSelect(value, label, row);
      row.appendChild(btn);
    });
    ui.messages.appendChild(row);
    scrollBottom();
  }

  async function renderLocationCard() {
    const p = state.profile;

    // If profile has no lat/lng, try pulling from localStorage GPS
    if (!p.lat || !p.lng) {
      const gpsLat = parseFloat(localStorage.getItem('fb_lat'));
      const gpsLng = parseFloat(localStorage.getItem('fb_lng'));
      if (!isNaN(gpsLat) && !isNaN(gpsLng)) {
        p.lat = gpsLat;
        p.lng = gpsLng;
      }
    }

    // Build display text — show GPS coords if city is unknown
    let locText;
    if (p.city || p.state || p.pincode) {
      locText = `${p.city || ""}, ${p.state || ""} — ${p.pincode || ""}`;
    } else if (p.lat && p.lng) {
      locText = `${parseFloat(p.lat).toFixed(4)}, ${parseFloat(p.lng).toFixed(4)} (GPS)`;
    } else {
      locText = await t("Location not available — please enter manually");
    }
    const yesLabel = await t("Yes, this is correct", state.data.crop_name);
    const noLabel = await t("No, let me enter manually", state.data.crop_name);

    const card = document.createElement("div");
    card.className = "location-card";
    card.innerHTML = `
      <div class="loc-text">📍 ${escHtml(locText)}</div>
      <div class="option-chips">
        <button class="chip-btn yes-btn">${escHtml(yesLabel)}</button>
        <button class="chip-btn no-btn">${escHtml(noLabel)}</button>
      </div>
    `;

    card.querySelector(".yes-btn").onclick = async () => {
      card.remove();
      state.data.pincode = p.pincode || "";
      state.data.city = p.city || "Local Area"; // Prevents null constraint DB error
      state.data.state = p.state || "";
      state.data.country = p.country || "India";
      state.data.lat = p.lat || null;
      state.data.lng = p.lng || null;
      renderUserMessage(yesLabel);
      await advanceStep();
    };

    card.querySelector(".no-btn").onclick = async () => {
      card.remove();
      renderUserMessage(noLabel);
      // Still save GPS coords even if user overrides city/pincode manually
      const gpsLat = parseFloat(localStorage.getItem('fb_lat'));
      const gpsLng = parseFloat(localStorage.getItem('fb_lng'));
      if (!isNaN(gpsLat) && !isNaN(gpsLng)) {
        state.data.lat = gpsLat;
        state.data.lng = gpsLng;
      }
      const prmpt = await t(
        "Please enter your pincode:",
        state.data.crop_name
      );
      renderBotMessage(prmpt);
      setInputMode("pincode");
    };

    ui.messages.appendChild(card);
    scrollBottom();
  }

  function renderImageUpload() {
    const wrap = document.createElement("div");
    wrap.className = "image-upload-area";

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.capture = "environment";
    input.style.display = "none";
    input.id = "chat-img-input";

    const camBtn = document.createElement("button");
    camBtn.className = "chip-btn";
    camBtn.textContent = "📷 " + "Add Photos";
    camBtn.onclick = () => input.click();

    const skipBtn = document.createElement("button");
    skipBtn.className = "chip-btn skip-btn";
    skipBtn.textContent = "⏭ Skip";
    skipBtn.onclick = async () => {
      wrap.remove();
      state.data.images = [];
      renderUserMessage("Skipped photos");
      await advanceStep();
    };

    input.onchange = async () => {
      const files = Array.from(input.files).slice(0, 5);
      if (files.length === 0) return;
      const b64s = await Promise.all(files.map(fileToBase64));
      state.data.images = b64s;
      wrap.remove();
      renderUserMessage(`📷 ${files.length} photo(s) added`);
      await advanceStep();
    };

    wrap.appendChild(input);
    wrap.appendChild(camBtn);
    wrap.appendChild(skipBtn);
    ui.messages.appendChild(wrap);
    scrollBottom();
  }

  // ── Input mode ─────────────────────────────────────────────────────────

  let _currentInputMode = "text";

  function setInputMode(mode) {
    _currentInputMode = mode;
    const step = activeSteps()[state.step];

    ui.skipBtn.style.display = (step && step.optional) ? "" : "none";
    ui.doneBtn.style.display = (step && step.inputType === "list") ? "" : "none";

    if (mode === "options" || mode === "location" || mode === "images") {
      ui.inputRow.style.display = "none";
    } else {
      ui.inputRow.style.display = "";
      ui.textInput.type = (mode === "number" || mode === "pincode") ? "number" : "text";
      ui.textInput.placeholder = "";
      ui.textInput.value = "";
      ui.textInput.focus();
    }
  }

  // ── Option select ──────────────────────────────────────────────────────

  async function handleOptionSelect(value, label, container) {
    container.remove();
    state.data[activeSteps()[state.step].key] = value;
    renderUserMessage(label);
    await advanceStep();
  }

  // ── Step advancement ───────────────────────────────────────────────────

  async function advanceStep() {
    state.step++;
    if (state.step >= activeSteps().length) {
      await showSummary();
      return;
    }
    await showStep(state.step);
  }

  async function showStep(idx) {
    const step = activeSteps()[idx];
    setLoading(true);
    const q = await getQuestion(idx);
    setLoading(false);

    if (step.inputType === "options") {
      const translated = await Promise.all(
        step.options.map(async (o) => ({
          value: o.value,
          label: await t(o.labelEn),
        }))
      );
      renderBotMessage(q, { options: translated });
      setInputMode("options");
    } else if (step.inputType === "location_confirm") {
      renderBotMessage(q, { locationCard: true });
      setInputMode("location");
    } else if (step.inputType === "images") {
      renderBotMessage(q, { imageUpload: true });
      setInputMode("images");
    } else if (step.inputType === "list") {
      renderBotMessage(q);
      state.data[step.key] = [];
      setInputMode("text");
    } else {
      renderBotMessage(q);
      setInputMode(step.inputType || "text");
    }
  }

  // ── Handle user text submit ────────────────────────────────────────────

  async function handleSubmit() {
    const raw = ui.textInput.value.trim();
    const step = activeSteps()[state.step];

    if (!raw) return;

    // 1. FIX: Intercept "done" to break the infinite highlights loop
    if (step.inputType === "list") {
      if (raw.toLowerCase() === "done" || raw === "Done ✓" || raw.toLowerCase() === "डन") {
        await handleDone();
        ui.textInput.value = "";
        return;
      }
      renderUserMessage(raw);
      ui.textInput.value = "";
      state.data[step.key] = state.data[step.key] || [];
      state.data[step.key].push(raw);
      const ackMsg = await t(
        `Got it! Add another highlight or type 'done' when finished.`,
        state.data.crop_name
      );
      renderBotMessage(ackMsg);
      return;
    }

    // 2. FIX: Prevent database crash by providing a default city 
    if (_currentInputMode === "pincode") {
      renderUserMessage(raw);
      ui.textInput.value = "";
      state.data.pincode = raw;
      state.data.city = state.profile?.city || "Local Area"; // Prevents null constraint DB error
      state.data.state = state.profile?.state || "";
      state.data.country = "India";
      // Note: lat/lng are preserved from the "No" button click
      await advanceStep();
      return;
    }

    // Allow typing "skip" for optional steps
    if (step.optional && (raw.toLowerCase() === "skip" || raw.toLowerCase() === "skipped")) {
      await handleSkip();
      ui.textInput.value = "";
      return;
    }

    if (step.validate) {
      const valid = step.validate(raw);
      if (valid !== true) {
        const errMsg = await t(valid);
        renderBotMessage(errMsg);
        return;
      }
    }

    renderUserMessage(raw);
    ui.textInput.value = "";
    state.data[step.key] = step.inputType === "number" ? Number(raw) : raw;
    await advanceStep();
  }

  async function handleSkip() {
    const step = activeSteps()[state.step];
    if (!step || !step.optional) return;
    const skipLabel = await t("Skipped");
    renderUserMessage(skipLabel);
    state.data[step.key] = step.inputType === "list" ? [] : "";
    await advanceStep();
  }

  async function handleDone() {
    const step = activeSteps()[state.step];
    if (!step || step.inputType !== "list") return;
    const doneLabel = await t("Done ✓");
    renderUserMessage(doneLabel);
    await advanceStep();
  }

  // ── Summary ────────────────────────────────────────────────────────────

  async function showSummary() {
    setLoading(true);
    const summaryHeader = await t("Here is a summary. Does everything look correct?");
    const d = state.data;

    let lines;
    if (state.mode === "seller") {
      lines = [
        `🌾 ${await t("Crop")}: ${d.crop_name}`,
        `📦 ${await t("Quantity")}: ${d.amount} ${d.unit}`,
        `💰 ${await t("Price")}: ₹${d.price}/${d.unit}`,
        `📝 ${await t("Description")}: ${d.description || await t("Not provided")}`,
        `✨ ${await t("Highlights")}: ${(d.features || []).join(", ") || await t("None")}`,
        `🚚 ${await t("Delivery Cost")}: ₹${d.delivery_cost}`,
        `📍 ${await t("Location")}: ${d.city || ""}, ${d.state || ""} — ${d.pincode || ""}`,
        `🖼️ ${await t("Photos")}: ${(d.images || []).length} added`,
      ];
    } else {
      const deliveryMap = { delivery: "Home Delivery", pickup: "I will pick it up", any: "Either is fine" };
      lines = [
        `🌾 ${await t("Crop")}: ${d.crop_name}`,
        `📦 ${await t("Quantity Needed")}: ${d.amount_required} ${d.unit}`,
        `💰 ${await t("Budget")}: ₹${d.budget}/${d.unit}`,
        `🚚 ${await t("Delivery Preference")}: ${await t(deliveryMap[d.delivery_preference] || d.delivery_preference)}`,
        `📝 ${await t("Requirements")}: ${d.requirements || await t("None")}`,
        `📍 ${await t("Location")}: ${d.city || ""}, ${d.state || ""} — ${d.pincode || ""}`,
      ];
    }

    setLoading(false);
    renderBotMessage(summaryHeader);

    const summaryCard = document.createElement("div");
    summaryCard.className = "summary-card";
    summaryCard.innerHTML = lines
      .map((l) => `<div class="summary-line">${escHtml(l)}</div>`)
      .join("");
    ui.messages.appendChild(summaryCard);

    const confirmLabel = state.mode === "seller"
      ? await t("✅ Confirm & Post Listing")
      : await t("✅ Confirm & Post Request");
    const editBtn = await t("✏️ Start Over");

    const row = document.createElement("div");
    row.className = "option-chips summary-actions";
    row.innerHTML = `
      <button class="chip-btn confirm-btn">${escHtml(confirmLabel)}</button>
      <button class="chip-btn restart-btn">${escHtml(editBtn)}</button>
    `;
    ui.messages.appendChild(row);

    row.querySelector(".confirm-btn").onclick = () => submitForm(row);
    row.querySelector(".restart-btn").onclick = () => restartFlow();

    setInputMode("options");
    scrollBottom();
  }

  // ── Submit to API ──────────────────────────────────────────────────────

  async function submitForm(actionsEl) {
    // ── Auth gate — prompt login if not logged in ──────────────────────────
    if (!Auth.isLoggedIn()) {
      const loginMsg = await t(
        'You need to log in to post. Please sign in or create an account on the Homepage.'
      );
      renderBotMessage(loginMsg);
      const loginRow = document.createElement('div');
      loginRow.className = 'option-chips';
      const loginBtn = document.createElement('button');
      loginBtn.className = 'chip-btn';
      loginBtn.textContent = '🔑 Go to Login';
      loginBtn.onclick = () => { window.location.href = 'Homepage.html'; };
      loginRow.appendChild(loginBtn);
      ui.messages.appendChild(loginRow);
      scrollBottom();
      return;
    }

    actionsEl.remove();
    const postingMsg = await t(
      state.mode === "seller"
        ? "Posting your listing… please wait."
        : "Posting your request… please wait."
    );
    renderBotMessage(postingMsg);
    setLoading(true);

    let endpoint, payload;

    if (state.mode === "seller") {
      endpoint = "/listings/";
      payload = {
        crop_name: state.data.crop_name,
        amount: state.data.amount,
        unit: state.data.unit,
        price: state.data.price,
        description: state.data.description || "",
        features: state.data.features || [],
        delivery_cost: state.data.delivery_cost,
        pincode: state.data.pincode || "",
        city: state.data.city || "",
        state: state.data.state || "",
        country: state.data.country || "India",
        lat: state.data.lat || null,
        lng: state.data.lng || null,
        images: state.data.images || [],
        original_lang: state.lang,
      };
    } else {
      endpoint = "/requests/";
      // Combine amount + unit into a single string (matches DB schema VARCHAR)
      const amtUnit = state.data.unit
        ? `${state.data.amount_required} ${state.data.unit}`
        : String(state.data.amount_required);

      payload = {
        crop_name: state.data.crop_name,
        amount_required: amtUnit,
        budget: state.data.budget,
        delivery_preference: state.data.delivery_preference,
        requirements: state.data.requirements || "",
        pincode: state.data.pincode || "",
        city: state.data.city || "",
        state: state.data.state || "",
        country: state.data.country || "India",
        lat: state.data.lat || null,
        lng: state.data.lng || null,
        original_lang: state.lang,
      };
    }

    try {
      const res = await apiFetch(endpoint, {
        method: "POST",
        body: payload,
        auth: true,
      });

      setLoading(false);
      const successMsg = await t(
        state.mode === "seller"
          ? "🎉 Your listing has been posted successfully! Redirecting…"
          : "🎉 Your request has been posted! Sellers will contact you. Redirecting…"
      );
      renderBotMessage(successMsg);

      setTimeout(() => {
        window.location.href = state.mode === "seller" ? "index.html" : "buying.html";
      }, 2500);
    } catch (err) {
      setLoading(false);
      const errMsg = await t(
        state.mode === "seller"
          ? "Something went wrong while posting your listing. Please try again."
          : "Something went wrong while posting your request. Please try again."
      );
      renderBotMessage(errMsg);
      showSummary();
    }
  }

  function restartFlow() {
    state.step = -1;  // must be -1 so advanceStep() after lang select lands on step 0
    state.data = {};
    ui.messages.innerHTML = "";
    // Clear translated question cache for current mode/lang combo
    Object.keys(translatedQuestions).forEach(k => {
      if (k.startsWith(`${state.mode}_`)) delete translatedQuestions[k];
    });
    startLanguageSelection();
  }

  // ── Mode switching (called by HTML buttons) ────────────────────────────

  function setMode(newMode) {
    if (state.mode === newMode) return;
    state.mode = newMode;

    // Update button UI
    const sellerBtn = document.getElementById("modeSeller");
    const buyerBtn = document.getElementById("modeBuyer");
    if (sellerBtn) sellerBtn.classList.toggle("active", newMode === "seller");
    if (buyerBtn) buyerBtn.classList.toggle("active", newMode === "buyer");

    // Update topbar title
    const titleEl = document.getElementById("topbar-title-text");
    if (titleEl) titleEl.textContent = newMode === "seller" ? "List Your Crop" : "Post Buy Request";

    // Reset and restart from beginning
    state.step = -1;
    state.data = {};
    ui.messages.innerHTML = "";
    startLanguageSelection();
  }

  // ── Language selection (step -1) ───────────────────────────────────────

  // Pre-translate all step questions in the background after lang is selected
  // so they're ready in cache when showStep() needs them
  async function prewarmQuestions() {
    if (state.lang === 'en') return;
    const steps = activeSteps();
    const texts = steps.map(s => s.questionEn);
    try {
      const translated = await Reverie.translate(texts, 'en', state.lang);
      steps.forEach((step, i) => {
        const key = `${state.mode}_${state.lang}_${i}`;
        if (translated[i]) translatedQuestions[key] = translated[i];
      });
    } catch (e) {
      console.warn('[ChatListing] prewarm translation failed:', e);
    }
  }

  async function startLanguageSelection() {
    const user = Auth.getUser();
    if (user && user.preferred_language) {
      state.lang = user.preferred_language;
    }

    const greeting = state.mode === "seller"
      ? "Welcome to Fasal Bazaar! Select your language to list your crop:"
      : "Welcome to Fasal Bazaar! Select your language to post a buy request:";
    renderBotMessage(greeting);

    const grid = document.createElement("div");
    grid.className = "lang-grid";

    Object.entries(Reverie.SUPPORTED_LANGUAGES).forEach(([code, info]) => {
      const btn = document.createElement("button");
      btn.className = `lang-btn ${code === state.lang ? "selected" : ""}`;
      btn.innerHTML = `<span class="native">${escHtml(info.nativeName)}</span><span class="english">${escHtml(info.label)}</span>`;
      btn.onclick = async () => {
        grid.querySelectorAll(".lang-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        state.lang = code;

        grid.remove();
        renderUserMessage(`${info.nativeName} (${info.label})`);

        await loadProfile();
        // Pre-translate all questions in background so they're cached before shown
        prewarmQuestions();
        await advanceStep();
      };
      grid.appendChild(btn);
    });

    ui.messages.appendChild(grid);
    scrollBottom();
    setInputMode("options");
  }

  // Request GPS permission and save coordinates to localStorage
  function requestGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localStorage.setItem('fb_lat', pos.coords.latitude);
        localStorage.setItem('fb_lng', pos.coords.longitude);
      },
      (err) => console.warn('[ChatListing] GPS denied:', err.message)
    );
  }

  async function loadProfile() {
    // Kick off GPS request immediately (non-blocking)
    requestGPS();

    if (!Auth.isLoggedIn()) {
      state.profile = {};
      return;
    }
    try {
      const res = await apiFetch("/auth/profile", { auth: true });
      state.profile = res.user || res;

      // If profile has no lat/lng stored, fill in from localStorage GPS
      if (!state.profile.lat || !state.profile.lng) {
        const gpsLat = parseFloat(localStorage.getItem('fb_lat'));
        const gpsLng = parseFloat(localStorage.getItem('fb_lng'));
        if (!isNaN(gpsLat) && !isNaN(gpsLng)) {
          state.profile.lat = gpsLat;
          state.profile.lng = gpsLng;
        }
      }
    } catch {
      state.profile = {};
    }
  }

  // ── Voice input ────────────────────────────────────────────────────────

  async function toggleVoice() {
    if (state.recording) {
      state.recording = false;
      ui.micBtn.classList.remove("recording");
      ui.micBtn.textContent = "🎙️";
      Reverie.stopRecording();
    } else {
      state.recording = true;
      ui.micBtn.classList.add("recording");
      ui.micBtn.textContent = "⏹️";

      try {
        await Reverie.startRecording({
          onStop: async (blob) => {
            state.recording = false;
            ui.micBtn.classList.remove("recording");
            ui.micBtn.textContent = "🎙️";
            const text = await Reverie.transcribeFile(blob, state.lang);
            if (text) {
              ui.textInput.value = text;
            }
          },
        });
      } catch (e) {
        state.recording = false;
        ui.micBtn.classList.remove("recording");
        ui.micBtn.textContent = "🎙️";
        const errMsg = await t("Microphone access denied. Please type instead.");
        renderBotMessage(errMsg);
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────

  function scrollBottom() {
    ui.messages.scrollTop = ui.messages.scrollHeight;
  }

  function setLoading(on) {
    ui.loadingDot.style.display = on ? "" : "none";
  }

  function escHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = rej;
      reader.readAsDataURL(file);
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────

  function init() {
    ui = {
      messages: document.getElementById("chat-messages"),
      textInput: document.getElementById("chat-input"),
      sendBtn: document.getElementById("chat-send"),
      micBtn: document.getElementById("chat-mic"),
      skipBtn: document.getElementById("chat-skip"),
      doneBtn: document.getElementById("chat-done"),
      inputRow: document.getElementById("chat-input-row"),
      loadingDot: document.getElementById("chat-loading"),
    };

    ui.sendBtn.addEventListener("click", handleSubmit);
    ui.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleSubmit();
    });
    ui.micBtn.addEventListener("click", toggleVoice);
    ui.skipBtn.addEventListener("click", handleSkip);
    ui.doneBtn.addEventListener("click", handleDone);

    // Don't redirect — let unauthenticated users browse freely.
    // Login is enforced only at the final submit step.

    // Pick up mode from URL param if present: chat-listing.html?mode=buyer
    const urlMode = new URLSearchParams(window.location.search).get("mode");
    if (urlMode === "buyer" || urlMode === "seller") {
      state.mode = urlMode;
    }

    // Always sync button active states and title on init
    const sellerBtn = document.getElementById("modeSeller");
    const buyerBtn = document.getElementById("modeBuyer");
    if (sellerBtn) sellerBtn.classList.toggle("active", state.mode === "seller");
    if (buyerBtn) buyerBtn.classList.toggle("active", state.mode === "buyer");
    const titleEl = document.getElementById("topbar-title-text");
    if (titleEl) titleEl.textContent = state.mode === "seller" ? "List Your Crop" : "Post Buy Request";

    startLanguageSelection();
  }

  return { init, setMode };
})();

document.addEventListener("DOMContentLoaded", ChatListing.init);
