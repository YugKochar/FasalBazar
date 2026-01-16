// voice-listing.js — AI-powered voice listing using Reverie STT + Gemini API (via Flask)
// Tap mic to start recording, tap again to stop. Gemini collects listing fields
// conversationally, then submits to /api/listings/ on confirmation.

const VoiceListing = (() => {

  // ── State ──────────────────────────────────────────────────────────────────
  let lang = localStorage.getItem('fb_lang') || 'hi';
  let recording = false;
  let conversationHistory = [];  // full history sent to Gemini each turn
  let collectedData = {};        // form fields being built up
  let listingComplete = false;

  // ── DOM refs ───────────────────────────────────────────────────────────────
  const chatArea      = document.getElementById('chatArea');
  const micBtn        = document.getElementById('micBtn');
  const statusEl      = document.getElementById('status');
  const confirmBox    = document.getElementById('confirmBox');
  const confirmFields = document.getElementById('confirmFields');

  // ── Language selector chips ────────────────────────────────────────────────
  document.querySelectorAll('.lang-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.lang-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      lang = chip.dataset.code;
      localStorage.setItem('fb_lang', lang);
      resetConversation();
    });
  });

  // ── Gemini API (via Flask backend) ─────────────────────────────────────────
  // Sends full conversation history to /api/chat/. The backend calls Gemini
  // and returns the assistant reply. History is tracked locally so every
  // request includes the full context.
  async function askGemini(userMessage) {
    setStatus('thinking', lang === 'hi' ? 'सोच रहा हूँ...' : 'Thinking...');

    try {
      const response = await apiFetch('/chat/', {
        method: 'POST',
        body: {
          message: userMessage,
          history: conversationHistory,
          lang: lang,
          mode: 'seller'   // voice-listing is always seller mode
        },
        auth: false
      });

      const reply = response?.reply || '';

      // Append to history AFTER we get the reply
      conversationHistory.push({ role: 'user',      content: userMessage });
      conversationHistory.push({ role: 'assistant', content: reply });

      return reply;
    } catch (err) {
      console.error('[VoiceListing] Gemini error:', err);
      return lang === 'hi'
        ? 'माफ करें, कुछ गड़बड़ हो गई। फिर से कोशिश करें।'
        : 'Sorry, something went wrong. Please try again.';
    }
  }

  // ── Process Gemini's reply ─────────────────────────────────────────────────
  // Checks for the LISTING_COMPLETE marker. If found, parses the JSON,
  // sets listingComplete = true, and returns only the display text.
  function processReply(reply) {
    const match = reply.match(/LISTING_COMPLETE:(\{[\s\S]*?\})/);
    if (match) {
      try {
        collectedData = JSON.parse(match[1]);
        listingComplete = true;
        const displayText = reply.replace(/LISTING_COMPLETE:\{[\s\S]*?\}/, '').trim();
        return displayText || getCompletionMessage();
      } catch (e) {
        console.warn('[VoiceListing] Failed to parse LISTING_COMPLETE JSON:', e);
      }
    }
    return reply;
  }

  function getCompletionMessage() {
    const msgs = {
      hi: '✅ बढ़िया! सारी जानकारी मिल गई। नीचे देखकर कन्फर्म करें।',
      mr: '✅ छान! सर्व माहिती मिळाली. खाली तपासा आणि पुष्टी करा.',
      pa: '✅ ਵਧੀਆ! ਸਾਰੀ ਜਾਣਕਾਰੀ ਮਿਲ ਗਈ। ਹੇਠਾਂ ਦੇਖ ਕੇ ਪੁਸ਼ਟੀ ਕਰੋ।',
      gu: '✅ સરસ! બધી માહિતી મળી ગઈ. નીચે તપાસો અને પુષ્ટિ કરો.',
      en: '✅ Great! I have all the details. Please review and confirm below.'
    };
    return msgs[lang] || msgs.en;
  }

  // ── Browser TTS ────────────────────────────────────────────────────────────
  function speak(text) {
    if (!window.speechSynthesis) return;
    const utter = new SpeechSynthesisUtterance(text);
    const bcp47 = {
      hi: 'hi-IN', mr: 'mr-IN', pa: 'pa-IN', gu: 'gu-IN', en: 'en-IN',
      ta: 'ta-IN', te: 'te-IN', kn: 'kn-IN', bn: 'bn-IN', ml: 'ml-IN'
    };
    utter.lang  = bcp47[lang] || 'hi-IN';
    utter.rate  = 0.9;
    speechSynthesis.cancel(); // stop any ongoing speech first
    speechSynthesis.speak(utter);
  }

  // ── Chat UI helpers ────────────────────────────────────────────────────────
  function appendMessage(text, role) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `
      <div class="avatar">${role === 'bot' ? '🤖' : '👨‍🌾'}</div>
      <div class="bubble">${text}</div>`;
    chatArea.appendChild(div);
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  function setStatus(type, text) {
    statusEl.textContent = text;
    statusEl.className   = `status ${type}`;
  }

  // ── Confirmation box ───────────────────────────────────────────────────────
  function showConfirmation() {
    const labels = {
      crop_name:   lang === 'hi' ? 'फसल'      : 'Crop',
      amount:      lang === 'hi' ? 'मात्रा'     : 'Amount',
      unit:        lang === 'hi' ? 'इकाई'      : 'Unit',
      price:       lang === 'hi' ? 'मूल्य (₹)'  : 'Price (₹)',
      city:        lang === 'hi' ? 'शहर'       : 'City',
      description: lang === 'hi' ? 'विवरण'     : 'Description'
    };

    confirmFields.innerHTML = '';
    Object.entries(collectedData).forEach(([k, v]) => {
      if (v === '' || v === null || v === undefined) return;
      const row = document.createElement('div');
      row.className = 'field';
      row.innerHTML = `<label>${labels[k] || k}</label><span>${v}</span>`;
      confirmFields.appendChild(row);
    });

    confirmBox.style.display = 'block';
    confirmBox.scrollIntoView({ behavior: 'smooth' });
  }

  // ── Submit listing to backend ──────────────────────────────────────────────
  async function submitListing() {
    const user = Auth.getUser();
    if (!user) {
      alert('Please log in first.');
      window.location.href = 'Homepage.html';
      return;
    }

    try {
      setStatus('thinking', lang === 'hi' ? 'Submit हो रहा है...' : 'Submitting...');

      // Pull location from localStorage (set when user granted GPS)
      const savedLat  = parseFloat(localStorage.getItem('fb_lat'))  || null;
      const savedLng  = parseFloat(localStorage.getItem('fb_lng'))  || null;
      const savedUser = Auth.getUser() || {};

      const payload = {
        ...collectedData,
        original_lang: lang,
        seller_id: user.id,
        // Location — from GPS localStorage, fallback to user profile fields
        lat:     isNaN(savedLat)  ? null : savedLat,
        lng:     isNaN(savedLng)  ? null : savedLng,
        city:    collectedData.city || savedUser.city    || null,
        state:   savedUser.state   || null,
        country: savedUser.country || 'India',
        pincode: savedUser.pincode || null,
      };

      const result = await apiFetch('/listings/', { method: 'POST', body: payload, auth: true });

      // Backend returns "listing_id", not "id"
      if (result && (result.listing_id || result.id)) {
        const successMsg = lang === 'hi'
          ? '🎉 आपकी लिस्टिंग सफलतापूर्वक जोड़ी गई!'
          : '🎉 Your listing was posted successfully!';
        appendMessage(successMsg, 'bot');
        speak(lang === 'hi' ? 'बढ़िया! आपकी फसल की लिस्टिंग हो गई।' : 'Great! Your crop has been listed.');
        confirmBox.style.display = 'none';
        setStatus('', '');
        setTimeout(() => window.location.href = 'index.html', 2500);
      } else {
        throw new Error('No listing ID returned');
      }
    } catch (err) {
      console.error('[VoiceListing] Submit error:', err);
      const errMsg = lang === 'hi'
        ? '❌ Submit नहीं हो सका। फिर से कोशिश करें।'
        : '❌ Could not submit. Please try again.';
      appendMessage(errMsg, 'bot');
      setStatus('', '');
    }
  }

  // ── Microphone button (tap to start, tap to stop) ──────────────────────────
  micBtn.addEventListener('click', async () => {

    // ── STOP recording ─────────────────────────────────────────────────────
    if (recording) {
      recording = false;
      micBtn.classList.remove('recording');
      micBtn.textContent = '🎙️';
      setStatus('', lang === 'hi' ? 'समझ रहा हूँ...' : 'Processing...');
      Reverie.stopRecording(); // triggers onstop → onStop(blob) below
      return;
    }

    // ── START recording ────────────────────────────────────────────────────
    recording = true;
    micBtn.classList.add('recording');
    micBtn.textContent = '⏹️';
    setStatus('listening', lang === 'hi' ? '🔴 सुन रहा हूँ...' : '🔴 Listening...');

    await Reverie.startRecording({
      onStop: async (blob) => {
        recording = false;
        micBtn.classList.remove('recording');
        micBtn.textContent = '🎙️';
        setStatus('thinking', lang === 'hi' ? 'समझ रहा हूँ...' : 'Understanding...');

        // ── STT: blob → text ─────────────────────────────────────────────
        let transcript = '';
        try {
          transcript = await Reverie.transcribeFile(blob, lang);
        } catch (e) {
          console.error('[VoiceListing] transcribeFile error:', e);
        }

        if (!transcript || transcript.trim().length < 2) {
          const retryMsg = lang === 'hi'
            ? 'कुछ सुनाई नहीं दिया, फिर से कोशिश करें।'
            : 'Could not hear you, please try again.';
          setStatus('', retryMsg);
          return;
        }

        // Show what user said
        appendMessage(transcript, 'user');

        // ── Gemini: text → reply ─────────────────────────────────────────
        const rawReply     = await askGemini(transcript);
        const displayReply = processReply(rawReply);

        appendMessage(displayReply, 'bot');
        speak(displayReply);
        setStatus('', lang === 'hi' ? 'माइक दबाएं और बोलें' : 'Press mic to speak');

        if (listingComplete) {
          showConfirmation();
        }
      }
    });
  });

  // ── Confirm / Redo buttons ─────────────────────────────────────────────────
  document.getElementById('btnSubmit').addEventListener('click', submitListing);

  document.getElementById('btnRedo').addEventListener('click', () => {
    confirmBox.style.display = 'none';
    listingComplete = false;
    collectedData   = {};
    const redoMsg = lang === 'hi' ? 'ठीक है, फिर से बताइए। क्या बदलना है?' : 'Okay, please tell me again. What would you like to change?';
    appendMessage(redoMsg, 'bot');
    speak(redoMsg);
  });

  // ── Reset full conversation ────────────────────────────────────────────────
  function resetConversation() {
    conversationHistory = [];
    collectedData       = {};
    listingComplete     = false;
    recording           = false;
    chatArea.innerHTML  = '';
    confirmBox.style.display = 'none';
    micBtn.classList.remove('recording');
    micBtn.textContent = '🎙️';
    setStatus('', '');
    speechSynthesis.cancel();
    startGreeting();
  }

  // ── Initial greeting ───────────────────────────────────────────────────────
  function startGreeting() {
    const greetings = {
      hi: 'नमस्ते! मैं आपकी फसल की लिस्टिंग करने में मदद करूँगा। माइक दबाएं और बताएं — कौन सी फसल बेचनी है?',
      mr: 'नमस्कार! मी तुमची फसल यादी करण्यास मदत करेन. माईक दाबा आणि सांगा — कोणती फसल विकायची आहे?',
      pa: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਫ਼ਸਲ ਲਿਸਟ ਕਰਨ ਵਿੱਚ ਮਦਦ ਕਰਾਂਗਾ। ਮਾਈਕ ਦਬਾਓ ਅਤੇ ਦੱਸੋ।',
      gu: 'નમસ્તે! હું તમારો પાક લિસ્ટ કરવામાં મદદ કરીશ. માઈક દબાવો અને કહો — કયો પાક વેચવો છે?',
      en: 'Hello! I will help you list your crop for sale. Press the mic and tell me — what crop do you want to sell?'
    };
    const greeting = greetings[lang] || greetings.hi;
    setTimeout(() => {
      appendMessage(greeting, 'bot');
      speak(greeting);
    }, 500);
  }

  // ── GPS: request location on load, save to localStorage ──────────────────
  // Ensures lat/lng are available when the listing is submitted.
  function requestLocation() {
    if (!navigator.geolocation) return;
    if (localStorage.getItem('fb_lat') && localStorage.getItem('fb_lng')) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        localStorage.setItem('fb_lat', pos.coords.latitude);
        localStorage.setItem('fb_lng', pos.coords.longitude);
      },
      (err) => console.warn('[VoiceListing] GPS denied:', err.message)
    );
  }

  // ── Auto-init ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { requestLocation(); startGreeting(); });
  } else {
    requestLocation();
    startGreeting();
  }

  return { reset: resetConversation };
})();
