/**
 * reverie.js — Shared Reverie Language Technologies Utility
 * Fasal Bazaar · Translation, Transliteration, Speech-to-Text
 */
/**
 * reverie.js — Shared Reverie Language Technologies Utility
 */
const Reverie = (() => {
  // Update these to point to your FLASK BACKEND (usually port 5000)
  // This prevents the 501 error from the simple http.server
  const BASE_URL = "/api/translate/";
  const BASE_URL_STT = "/api/translate/stt";
  const BASE_URL_TRANSLIT = "/api/translate/transliterate";

  // ... rest of the file stays exactly the same ...

  const SUPPORTED_LANGUAGES = {
    en: { label: "English", nativeName: "English" },
    hi: { label: "Hindi", nativeName: "हिन्दी" },
    ta: { label: "Tamil", nativeName: "தமிழ்" },
    te: { label: "Telugu", nativeName: "తెలుగు" },
    kn: { label: "Kannada", nativeName: "ಕನ್ನಡ" },
    ml: { label: "Malayalam", nativeName: "മലയാളം" },
    bn: { label: "Bengali", nativeName: "বাংলা" },
    gu: { label: "Gujarati", nativeName: "ગુજરાતી" },
    mr: { label: "Marathi", nativeName: "मराठी" },
    pa: { label: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
    or: { label: "Odia", nativeName: "ଓଡ଼ିଆ" },
    as: { label: "Assamese", nativeName: "অসমীয়া" },
    ne: { label: "Nepali", nativeName: "नेपाली" },
    ur: { label: "Urdu", nativeName: "اردو" },
    kok: { label: "Konkani", nativeName: "कोंकणी" },
    mai: { label: "Maithili", nativeName: "मैथिली" },
  };

  async function translate(texts, srcLang, tgtLang, cropNames = []) {
    if (!texts || texts.length === 0) return [];
    if (srcLang === tgtLang) return texts;

    const body = {
      data: texts,
      enableNmt: true,
      enableLookup: true,
    };

    if (cropNames.length > 0) {
      body.nmtMask = true;
      body.nmtMaskTerms = cropNames;
    }

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (localStorage.getItem("fb_token") || ""),
        "src_lang": srcLang,
        "tgt_lang": tgtLang,
      },
      body: JSON.stringify({ ...body, src_lang: srcLang, tgt_lang: tgtLang }),
    });

    if (!res.ok) throw new Error(`Reverie translate error: ${res.status}`);
    const json = await res.json();
    return (json.responseList || []).map((r) => r.outString || r.inString);
  }

  async function transliterate(text, srcLang, tgtLang) {
    if (!text) return "";
    if (srcLang === tgtLang) return text;

    const res = await fetch(BASE_URL_TRANSLIT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (localStorage.getItem("fb_token") || ""),
      },
      body: JSON.stringify({ data: [text], src_lang: srcLang, tgt_lang: tgtLang }),
    });

    if (!res.ok) throw new Error(`Reverie transliterate error: ${res.status}`);
    const json = await res.json();
    const first = (json.responseList || [])[0];
    return first ? first.outString || text : text;
  }

  // ── Speech-to-Text ──────────────────────────────────────────────────────

  let _sttSocket = null;

  async function startSTT(lang, callbacks = {}) {
    const { onPartial, onFinal, onError, onClose } = callbacks;
    stopSTT(); // Close existing

    let token;
    try {
      const res = await fetch('/api/translate/stt-token', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('fb_token') || ''}`,
        }
      });
      if (!res.ok) throw new Error(`Token fetch failed: ${res.status}`);
      token = await res.json();
    } catch (err) {
      if (onError) onError(err);
      return;
    }

    const wsUrl = `wss://revapi.reverieinc.com/stream`
      + `?api_key=${token.api_key}`
      + `&appid=${token.app_id}`
      + `&lang=${lang}`
      + `&domain=ecommerce`;

    _sttSocket = new WebSocket(wsUrl);

    _sttSocket.onopen = () => console.log('[Reverie STT] WebSocket connected');

    _sttSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.final && onFinal) onFinal(data.final);
        else if (data.partial && onPartial) onPartial(data.partial);
      } catch (e) {
        console.warn('[Reverie STT] message parse error', e);
      }
    };

    _sttSocket.onerror = (err) => {
      console.error('[Reverie STT] WebSocket error', err);
      if (onError) onError(err);
    };

    _sttSocket.onclose = () => {
      console.log('[Reverie STT] WebSocket closed');
      if (onClose) onClose();
    };
  }

  function sendAudioChunk(audioChunk) {
    if (_sttSocket && _sttSocket.readyState === WebSocket.OPEN) {
      _sttSocket.send(audioChunk);
    }
  }

  function stopSTT() {
    if (_sttSocket) {
      _sttSocket.close();
      _sttSocket = null;
    }
  }

  async function transcribeFile(audioBlob, lang) {
    const formData = new FormData();
    formData.append("audio_file", audioBlob, "recording.wav");
    formData.append("lang", lang);
    formData.append("domain", "ecommerce");

    const res = await fetch(BASE_URL_STT, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + (localStorage.getItem("fb_token") || ""),
      },
      body: formData,
    });

    if (!res.ok) throw new Error(`Reverie STT file error: ${res.status}`);
    const json = await res.json();
    console.log('[Reverie STT] response:', json);
    // Reverie STT can return text in different fields depending on version
    return json.text || json.transcript || json.result || json.display_text || "";
  }

  // ── MediaRecorder helpers ────────────────────────────────────────────────

  let _mediaRecorder = null;
  let _audioChunks = [];
  let _recordingStream = null;

  async function startRecording({ onChunk, onStop } = {}) {
    _recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks = [];

    _mediaRecorder = new MediaRecorder(_recordingStream, {
      mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg",
    });

    _mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        _audioChunks.push(e.data);
        if (onChunk) {
          e.data.arrayBuffer().then(sendAudioChunk);
        }
      }
    };

    _mediaRecorder.onstop = () => {
      const blob = new Blob(_audioChunks, { type: _mediaRecorder.mimeType });
      _recordingStream.getTracks().forEach((t) => t.stop());
      if (onStop) onStop(blob);
    };

    // Always use 250ms timeslice so short recordings are captured correctly.
    // A 10s timeslice meant audio chunks never fired for short utterances.
    _mediaRecorder.start(250);
  }

  function stopRecording() {
    if (_mediaRecorder && _mediaRecorder.state !== "inactive") {
      _mediaRecorder.stop();
    }
  }

  return {
    SUPPORTED_LANGUAGES,
    translate,
    transliterate,
    startSTT,
    sendAudioChunk,
    stopSTT,
    transcribeFile,
    startRecording,
    stopRecording,
  };
})();

window.Reverie = Reverie;