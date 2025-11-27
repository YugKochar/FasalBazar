"""
utils.py — Fasal Bazaar shared utilities
Server-side Reverie API helpers used by listings.py, requests.py, etc.
"""

import os
import json
import threading
import requests as http_requests
from backend.db import query  # your existing db helper


# ─────────────────────────────────────────────
# Reverie server-side translation
# ─────────────────────────────────────────────

REVERIE_API_KEY = os.getenv("REVERIE_API_KEY")
REVERIE_APP_ID  = os.getenv("REVERIE_APP_ID")
REVERIE_BASE    = "https://revapi.reverieinc.com/"

# Languages to pre-translate when a listing is saved
# (covers the most common regional languages)
PRE_TRANSLATE_LANGS = ["en", "hi", "ta", "te", "kn", "ml", "bn", "gu", "mr", "pa"]


def translate_via_reverie(
    texts: list[str],
    src: str,
    tgt: str,
    mask_terms: list[str] = None,
) -> list[str]:
    """
    Translate a list of strings from `src` to `tgt` using Reverie API.
    Returns translated strings in the same order.
    Falls back to original text on any error.
    """
    if src == tgt:
        return texts

    # Filter out empty strings to avoid wasting API calls
    non_empty = [(i, t) for i, t in enumerate(texts) if t and t.strip()]
    if not non_empty:
        return texts

    indices, to_translate = zip(*non_empty)

    body = {
        "data": list(to_translate),
        "enableNmt": True,
        "enableLookup": True,
    }
    if mask_terms:
        body["nmtMask"] = True
        body["nmtMaskTerms"] = mask_terms

    headers = {
        "REV-API-KEY":    REVERIE_API_KEY,
        "REV-APP-ID":     REVERIE_APP_ID,
        "REV-APPNAME":    "localization",
        "REV-APPVERSION": "3.0",
        "src_lang":       src,
        "tgt_lang":       tgt,
        "domain":         "ecommerce",
        "Content-Type":   "application/json",
    }

    try:
        resp = http_requests.post(
            REVERIE_BASE, json=body, headers=headers, timeout=20
        )
        resp.raise_for_status()
        result = resp.json()
        response_list = result.get("responseList", [])

        # Map translated results back to original positions
        output = list(texts)  # copy
        for pos, (orig_idx, orig_text) in enumerate(zip(indices, to_translate)):
            if pos < len(response_list):
                translated = response_list[pos].get("outString") or orig_text
                output[orig_idx] = translated
        return output

    except Exception as e:
        print(f"[Reverie] Translation error ({src}→{tgt}): {e}")
        return list(texts)  # fall back to originals


# ─────────────────────────────────────────────
# Pre-translate listing to common languages
# ─────────────────────────────────────────────

def build_translations_for_listing(
    crop_name: str,
    description: str,
    source_lang: str,
) -> dict:
    """
    Translate crop_name + description from source_lang into all PRE_TRANSLATE_LANGS.
    Returns a dict keyed by language code:
      {
        "hi": {"crop_name": "...", "description": "..."},
        "ta": {"crop_name": "...", "description": "..."},
        ...
      }
    Always includes the source language entry with the original text.
    """
    translations = {}

    # Store the source language text as-is
    translations[source_lang] = {
        "crop_name": crop_name,
        "description": description,
    }

    for lang in PRE_TRANSLATE_LANGS:
        if lang == source_lang:
            continue  # already stored above
        try:
            result = translate_via_reverie(
                [crop_name, description],
                src=source_lang,
                tgt=lang,
            )
            translations[lang] = {
                "crop_name": result[0],
                "description": result[1] if len(result) > 1 else "",
            }
        except Exception as e:
            print(f"[Reverie] Pre-translate to {lang} failed: {e}")

    return translations


# ─────────────────────────────────────────────
# Async cache helper — write translation to DB
# in background so the API response isn't blocked
# ─────────────────────────────────────────────

def cache_listing_translation_async(listing_id: int, lang: str, trans_data: dict):
    """
    Saves a new language entry into listings.translations JSONB in the background.
    Uses jsonb_set so it merges with any existing translations, not overwrites.
    """
    def _do_cache():
        try:
            query(
                """
                UPDATE listings
                SET translations = jsonb_set(
                    COALESCE(translations, '{}'::jsonb),
                    ARRAY[%s]::text[],
                    %s::jsonb
                )
                WHERE id = %s
                """,
                (lang, json.dumps(trans_data), listing_id),
                commit=True,
            )
        except Exception as e:
            print(f"[cache_translation] Failed for listing {listing_id} lang {lang}: {e}")

    threading.Thread(target=_do_cache, daemon=True).start()
