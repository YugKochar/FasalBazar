"""
translate.py — Google Cloud Translation (main) + Reverie proxy (transliteration/STT)
Registers blueprint: translate_bp
"""

import os
import requests as http_requests
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required

translate_bp = Blueprint("translate", __name__)

# ── Google Cloud Translation ────────────────────────────────────
GOOGLE_TRANSLATE_API_KEY = os.getenv("GOOGLE_TRANSLATE_API_KEY")
GOOGLE_TRANSLATE_URL     = "https://translation.googleapis.com/language/translate/v2"

# Languages Google Translate does NOT support that Reverie did.
# Requests for these will currently just echo the original text back.
UNSUPPORTED_BY_GOOGLE = {"kok", "mai"}

# ── Reverie (kept for transliteration + STT only) ───────────────
REVERIE_API_KEY = os.getenv("REVERIE_API_KEY")
REVERIE_APP_ID  = os.getenv("REVERIE_APP_ID")

def _reverie_headers(src_lang: str = "en", tgt_lang: str = "hi") -> dict:
    return {
        "REV-API-KEY":    REVERIE_API_KEY,
        "REV-APP-ID":     REVERIE_APP_ID,
        "REV-APPNAME":    "localization",
        "REV-APPVERSION": "3.0",
        "domain":         "ecommerce",
        "Content-Type":   "application/json",
        "src_lang":       src_lang,
        "tgt_lang":       tgt_lang
    }

# ─────────────────────────────────────────────
# Translation — NO @jwt_required
# Now backed by Google Cloud Translation API
# ─────────────────────────────────────────────

@translate_bp.route("/", methods=["POST"])
def translate():
    data = request.get_json(force=True)

    src_lang = data.get("src_lang") or request.headers.get("src_lang") or "en"
    tgt_lang = data.get("tgt_lang") or request.headers.get("tgt_lang") or "hi"

    texts = data.get("data", [])

    # Echo-chamber check: same language, nothing to translate
    if src_lang == tgt_lang or not texts:
        return jsonify({
            "responseList": [{"inString": t, "outString": t} for t in texts]
        })

    # Languages Google can't handle — echo back untranslated rather than error
    if tgt_lang in UNSUPPORTED_BY_GOOGLE:
        print(f"Google Translate does not support '{tgt_lang}', returning originals")
        return jsonify({
            "responseList": [{"inString": t, "outString": t} for t in texts]
        })

    if not GOOGLE_TRANSLATE_API_KEY:
        print("GOOGLE_TRANSLATE_API_KEY is not set")
        return jsonify({"error": "Translation service not configured"}), 502

    try:
        resp = http_requests.post(
            GOOGLE_TRANSLATE_URL,
            params={"key": GOOGLE_TRANSLATE_API_KEY},
            json={
                "q": texts,
                "source": src_lang,
                "target": tgt_lang,
                "format": "text",
            },
            timeout=20,
        )
        resp.raise_for_status()
        result = resp.json()

        translations = result.get("data", {}).get("translations", [])
        response_list = [
            {"inString": orig, "outString": t.get("translatedText", orig)}
            for orig, t in zip(texts, translations)
        ]
        return jsonify({"responseList": response_list}), 200

    except http_requests.RequestException as e:
        print(f"Google Translate API Error: {e}")
        return jsonify({"error": str(e)}), 502

# ─────────────────────────────────────────────
# Transliteration — still via Reverie
# (Google Translate has no direct transliteration API)
# ─────────────────────────────────────────────

@translate_bp.route("/transliterate", methods=["POST"])
def transliterate():
    data = request.get_json(force=True)
    src_lang = data.get("src_lang") or request.headers.get("src_lang") or "en"
    tgt_lang = data.get("tgt_lang") or request.headers.get("tgt_lang") or "hi"

    body = {"data": data.get("data", []), "isBulk": True, "ignoreTaggedEntities": True}

    try:
        resp = http_requests.post(
            "https://revapi.reverieinc.com/transliterate",
            json=body,
            headers=_reverie_headers(src_lang, tgt_lang),
            timeout=20,
        )
        resp.raise_for_status()
        return jsonify(resp.json()), resp.status_code
    except http_requests.RequestException as e:
        return jsonify({"error": str(e)}), 502

# ─────────────────────────────────────────────
# STT token & File-based STT — still via Reverie, Requires Auth
# ─────────────────────────────────────────────

@translate_bp.route("/stt-token", methods=["GET"])
@jwt_required()
def stt_token():
    return jsonify({
        "api_key": REVERIE_API_KEY,
        "app_id":  REVERIE_APP_ID,
    })

@translate_bp.route("/stt", methods=["POST"])
@jwt_required()
def stt_file():
    audio = request.files.get("audio_file")
    lang  = request.form.get("lang", "hi")
    domain = request.form.get("domain", "ecommerce")

    if not audio:
        return jsonify({"error": "audio_file is required"}), 400

    try:
        resp = http_requests.post(
            "https://revapi.reverieinc.com/stt",
            files={"audio_file": (audio.filename, audio.stream, audio.content_type)},
            data={"lang": lang, "domain": domain},
            headers={
                "REV-API-KEY": REVERIE_API_KEY,
                "REV-APP-ID":  REVERIE_APP_ID,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return jsonify(resp.json()), resp.status_code
    except http_requests.RequestException as e:
        return jsonify({"error": str(e)}), 502
