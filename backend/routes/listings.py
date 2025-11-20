"""
listings.py — /api/listings/* routes
Changes in Week 1:
  - create_listing: accepts original_lang, stores original_text + translations
  - get_listings:   accepts ?lang= param, returns content in buyer's language
  - Bug fix #6:     HAVING clause replaced with subquery for geo-distance filter
"""
 
import json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from backend.db import query
from .utils import (
    translate_via_reverie,
    build_translations_for_listing,
    cache_listing_translation_async,
)
 
listings_bp = Blueprint("listings", __name__)
 
# ─────────────────────────────────────────────────────────────────────────────
# POST /api/listings/ — Create listing
# ─────────────────────────────────────────────────────────────────────────────
 
@listings_bp.route("/", methods=["POST"])
@jwt_required()
def create_listing():
    identity = get_jwt_identity()
    seller_id = identity.get("id") if isinstance(identity, dict) else identity
    data = request.get_json(force=True)
    # ── Required fields validation ──
    required = ["crop_name", "amount", "unit", "price"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400
 
    # ── Language handling ──
    original_lang  = data.get("original_lang", "en")
    original_crop  = data.get("crop_name", "").strip()
    original_desc  = data.get("description", "").strip()
 
    # If not English, translate to English for search indexing
    if original_lang != "en":
        en_texts    = translate_via_reverie(
            [original_crop, original_desc],
            src=original_lang,
            tgt="en",
        )
        english_crop = en_texts[0]
        english_desc = en_texts[1] if len(en_texts) > 1 else ""
    else:
        english_crop = original_crop
        english_desc = original_desc
 
    # Store original farmer text
    original_text_json = json.dumps({
        "crop_name":   original_crop,
        "description": original_desc,
        "lang":        original_lang,
    })
 
    # Pre-translate to common languages (sync during save)
    # This ensures buyers immediately get translations without on-the-fly API calls
    translations = build_translations_for_listing(
        crop_name=english_crop,      # translate from English as the canonical source
        description=english_desc,
        source_lang="en",
    )
    # Also store the original if it's not English
    if original_lang != "en":
        translations[original_lang] = {
            "crop_name":   original_crop,
            "description": original_desc,
        }
 
    translations_json = json.dumps(translations)
 
    # ── Insert into DB ──
# ── Insert into DB ──
    try:
        # FIX 1: Explicitly set the status to 'active'
        result = query(
            """
            INSERT INTO listings (
                seller_id, crop_name, amount, unit, price,
                description, features, delivery_cost,
                pincode, city, state, country, lat, lng,
                original_lang, original_text, translations, status
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, %s::jsonb, %s::jsonb, 'active'
            )
            RETURNING id
            """,
            (
                seller_id,
                english_crop,                   
                data.get("amount"),
                data.get("unit"),
                data.get("price"),
                english_desc,                   
                json.dumps(data.get("features", {})),
                data.get("delivery_cost", 0),
                data.get("pincode"),
                data.get("city"),
                data.get("state"),
                data.get("country"),
                data.get("lat"),
                data.get("lng"),
                original_lang,
                original_text_json,
                translations_json,
            ),
            commit=True,
        )
        new_id = result["id"] if result else None
 
        # FIX 2: Save the uploaded images to the listing_images table
        images = data.get("images", [])
        if new_id and images:
            for idx, img_data in enumerate(images):
                is_primary = (idx == 0) # The first image is always the primary cover photo
                query(
                    "INSERT INTO listing_images (listing_id, image_data, is_primary) VALUES (%s, %s, %s)",
                    (new_id, img_data, is_primary),
                    commit=True
                )
 
        return jsonify({"success": True, "id": new_id, "listing_id": new_id}), 201
 
    except Exception as e:
        print(f"[listings] create error: {e}")
        return jsonify({"error": "Failed to create listing"}), 500
 
 
# ─────────────────────────────────────────────────────────────────────────────
# GET /api/listings/ — List/search listings
# Bug fix: replaced HAVING with subquery for distance filtering
# New:     accepts ?lang= to return content in buyer's preferred language
# ─────────────────────────────────────────────────────────────────────────────
 
@listings_bp.route("/", methods=["GET"])
def get_listings():
    target_lang = request.args.get('lang', 'en')
    # ── Query params ──
    city        = request.args.get("city")
    crop        = request.args.get("crop")
    lat         = request.args.get("lat",    type=float)
    lng         = request.args.get("lng",    type=float)
    radius      = request.args.get("radius", type=float, default=50)
 
    filters      = ""
    filter_vals  = []
    params       = []
 
    if city:
        filters += " AND LOWER(city) = LOWER(%s)"
        filter_vals.append(city)
 
    if crop:
        filters += " AND LOWER(crop_name) ILIKE %s"
        filter_vals.append(f"%{crop.lower()}%")
 
# ── Geo-distance query: Show all, prioritize closer ones ──
    if lat is not None and lng is not None:
        sql = f"""
            SELECT
                id, seller_id, seller_name, seller_phone, seller_email,
                crop_name, amount, unit, price, description, features,
                delivery_cost, pincode, city, state, country,
                lat, lng, status, original_lang, original_text, translations,
                created_at, updated_at, image, avg_rating, review_count,
                (6371 * acos(LEAST(1.0,
                    cos(radians(%s)) * cos(radians(lat)) *
                    cos(radians(lng) - radians(%s)) +
                    sin(radians(%s)) * sin(radians(lat))
                ))) AS distance_km
            FROM v_active_listings
            WHERE lat IS NOT NULL AND lng IS NOT NULL {filters}
            ORDER BY distance_km ASC NULLS LAST
            LIMIT 100
        """
        params = [lat, lng, lat] + filter_vals
    else:
        # Standard fallback if no user location is provided
        sql = f"""
            SELECT * FROM v_active_listings
            WHERE 1=1 {filters}
            ORDER BY created_at DESC
            LIMIT 100
        """
        params = filter_vals
 
    try:
        rows = query(sql, params, fetchall=True)
        listings = [dict(row) for row in rows] if rows else []
 
        # ── Language swap ──
        if target_lang != "en":
            listings = _apply_language(listings, target_lang)
 
        return jsonify(listings), 200
 
    except Exception as e:
        print(f"[listings] get error: {e}")
        return jsonify({"error": "Failed to fetch listings"}), 500
 
 
# ─────────────────────────────────────────────────────────────────────────────
# GET /api/listings/<id> — Single listing
# ─────────────────────────────────────────────────────────────────────────────
 
@listings_bp.route("/<int:listing_id>", methods=["GET"])
def get_listing(listing_id):
    target_lang = request.args.get("lang", "en")
 
    rows = query(
        "SELECT * FROM v_active_listings WHERE id = %s",
        (listing_id,),
        fetchall=True,
    )
    if not rows:
        return jsonify({"error": "Listing not found"}), 404
 
    listing = dict(rows[0])
 
    # Normalize image column (view may use primary_image or image depending on schema version)
    if "image" not in listing and "primary_image" in listing:
        listing["image"] = listing.get("primary_image")
 
    # Fetch all images for the gallery — Product_Page.js needs product.images[]
    # each item in the list must have image_data key
    img_rows = query(
        "SELECT image_data, is_primary FROM listing_images WHERE listing_id = %s ORDER BY is_primary DESC, id ASC",
        (listing_id,),
        fetchall=True,
    )
    listing["images"] = [dict(r) for r in img_rows] if img_rows else []
 
    if target_lang != "en":
        listing = _apply_language([listing], target_lang)[0]
 
    return jsonify(listing), 200
 
 
# ─────────────────────────────────────────────────────────────────────────────
# PUT /api/listings/<id> — Update listing
# ─────────────────────────────────────────────────────────────────────────────
 
@listings_bp.route("/<int:listing_id>", methods=["PUT"])
@jwt_required()
def update_listing(listing_id):
    identity = get_jwt_identity()
    seller_id = identity.get("id") if isinstance(identity, dict) else identity
    data = request.get_json(force=True)
 
    # Verify ownership
    rows = query(
        "SELECT seller_id FROM listings WHERE id = %s", (listing_id,), fetchall=True
    )
    if not rows or rows[0]["seller_id"] != seller_id:
        return jsonify({"error": "Not authorized"}), 403
 
    # Handle language for updates same as create
    original_lang = data.get("original_lang", "en")
    original_crop = data.get("crop_name", "").strip()
    original_desc = data.get("description", "").strip()
 
    if original_lang != "en" and original_crop:
        en_texts     = translate_via_reverie(
            [original_crop, original_desc], src=original_lang, tgt="en"
        )
        english_crop = en_texts[0]
        english_desc = en_texts[1] if len(en_texts) > 1 else ""
    else:
        english_crop = original_crop
        english_desc = original_desc
 
    # Rebuild translations
    if english_crop:
        translations = build_translations_for_listing(english_crop, english_desc, "en")
        if original_lang != "en":
            translations[original_lang] = {
                "crop_name": original_crop,
                "description": original_desc,
            }
        translations_json = json.dumps(translations)
    else:
        translations_json = None
 
    try:
        update_fields = []
        update_vals   = []
 
        if english_crop:
            update_fields.append("crop_name = %s")
            update_vals.append(english_crop)
        if english_desc is not None:
            update_fields.append("description = %s")
            update_vals.append(english_desc)
        if data.get("amount") is not None:
            update_fields.append("amount = %s")
            update_vals.append(data["amount"])
        if data.get("price") is not None:
            update_fields.append("price = %s")
            update_vals.append(data["price"])
        if data.get("status"):
            update_fields.append("status = %s")
            update_vals.append(data["status"])
        if translations_json:
            update_fields.append("translations = %s::jsonb")
            update_vals.append(translations_json)
            update_fields.append("original_lang = %s")
            update_vals.append(original_lang)
 
        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400
 
        sql = f"UPDATE listings SET {', '.join(update_fields)} WHERE id = %s"
        update_vals.append(listing_id)
        query(sql, update_vals, commit=True)
 
        return jsonify({"success": True}), 200
 
    except Exception as e:
        print(f"[listings] update error: {e}")
        return jsonify({"error": "Failed to update listing"}), 500
 
 
# ─────────────────────────────────────────────────────────────────────────────
# DELETE /api/listings/<id>
# ─────────────────────────────────────────────────────────────────────────────
 
@listings_bp.route("/<int:listing_id>", methods=["DELETE"])
@jwt_required()
def delete_listing(listing_id):
    identity = get_jwt_identity()
    seller_id = identity.get("id") if isinstance(identity, dict) else identity
    
    rows = query(
        "SELECT seller_id FROM listings WHERE id = %s", (listing_id,), fetchall=True
    )
    if not rows or rows[0]["seller_id"] != seller_id:
        return jsonify({"error": "Not authorized"}), 403
 
    query(
        "UPDATE listings SET status = 'deleted' WHERE id = %s",
        (listing_id,),
        commit=True,
    )
    return jsonify({"success": True}), 200
 
 
# ─────────────────────────────────────────────────────────────────────────────
# Internal helper: swap crop_name/description with translated versions
# ─────────────────────────────────────────────────────────────────────────────
 
def _apply_language(listings: list[dict], target_lang: str) -> list[dict]:
    """
    For each listing, try to use a pre-stored translation.
    If not found, translate on-the-fly and cache it asynchronously.
    """
    ids_needing_translation = []
 
    for listing in listings:
        trans = listing.get("translations") or {}
 
        # translations may come from DB as a string (psycopg2 JSONB)
        if isinstance(trans, str):
            try:
                trans = json.loads(trans)
            except Exception:
                trans = {}
 
        if target_lang in trans:
            listing["crop_name"]   = trans[target_lang].get("crop_name",   listing["crop_name"])
            listing["description"] = trans[target_lang].get("description", listing.get("description", ""))
        else:
            ids_needing_translation.append(listing)
 
    # Translate missing ones on-the-fly
    if ids_needing_translation:
        crop_names   = [l["crop_name"] for l in ids_needing_translation]
        descriptions = [l.get("description", "") for l in ids_needing_translation]
 
        all_texts       = crop_names + descriptions
        translated_all  = translate_via_reverie(all_texts, src="en", tgt=target_lang)
        half            = len(ids_needing_translation)
 
        for i, listing in enumerate(ids_needing_translation):
            t_crop = translated_all[i] if i < len(translated_all) else listing.get("crop_name", "")
            t_desc = translated_all[half + i] if (half + i) < len(translated_all) else listing.get("description", "")
 
            listing["crop_name"]   = t_crop
            listing["description"] = t_desc
 
            # Cache back to DB (non-blocking)
            cache_listing_translation_async(
                listing["id"],
                target_lang,
                {"crop_name": t_crop, "description": t_desc},
            )
 
    return listings
 