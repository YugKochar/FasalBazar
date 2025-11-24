from flask import Blueprint, request, jsonify
import os
import requests
import threading
from datetime import date, datetime, timezone, timedelta

mandi_bp = Blueprint('mandi', __name__)

MANDI_RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070'
MANDI_API_BASE = 'https://api.data.gov.in/resource'

# ── Per-query cache ────────────────────────────────────────────────────────────
# key: "crop|state"  →  { 'date': 'YYYY-MM-DD', 'records': [...] }
_cache = {}
_lock  = threading.Lock()

IST = timezone(timedelta(hours=5, minutes=30))


def _ist_now():
    return datetime.now(IST)


# ── Record normaliser ──────────────────────────────────────────────────────────
def _normalise(r):
    return {
        'market':      (r.get('market')       or r.get('Market',      '')).strip(),
        'commodity':   (r.get('commodity')    or r.get('Commodity',   '')).strip(),
        'state':       (r.get('state')        or r.get('State',       '')).strip(),
        'district':    (r.get('district')     or r.get('District',    '')).strip(),
        'min_price':   float(r.get('min_price')   or r.get('Min_x0020_Price',   0) or 0),
        'max_price':   float(r.get('max_price')   or r.get('Max_x0020_Price',   0) or 0),
        'modal_price': float(r.get('modal_price') or r.get('Modal_x0020_Price', 0) or 0),
        'date':        (r.get('arrival_date') or r.get('Arrival_Date', '')).strip(),
    }


# ============================================================
# GET /api/mandi/prices
# Query params: crop, state, district, limit
# ============================================================
@mandi_bp.route('/prices', methods=['GET'])
def get_mandi_prices():
    api_key = os.getenv('MANDI_API_KEY')
    if not api_key:
        return jsonify({'error': 'Mandi API key not configured on server.'}), 500

    crop     = request.args.get('crop',     '').strip()
    state    = request.args.get('state',    '').strip()
    district = request.args.get('district', '').strip()
    limit    = min(int(request.args.get('limit', 200)), 5000)

    # Normalise crop name to Title Case so "wheat", "WHEAT", "Wheat" all work
    if crop:
        crop = crop.title()

    cache_key = f"{crop.lower()}|{state.lower()}"
    today     = date.today().isoformat()

    # ── Cache hit ──────────────────────────────────────────────────────────────
    with _lock:
        entry = _cache.get(cache_key)
        if entry and entry['date'] == today:
            records = entry['records']
            if district:
                records = [r for r in records if district.lower() in r['district'].lower()]
            return jsonify({
                'total': len(records),
                'records': records[:limit],
                'cached': True
            }), 200

    # ── Cache miss — single request to Agmarknet ───────────────────────────────
    params = {
        'api-key': api_key,
        'format':  'json',
        'limit':   1000,
        'offset':  0,
    }
    if crop:  params['filters[commodity]'] = crop
    if state: params['filters[state]']     = state

    try:
        # Single request only — Agmarknet already filters by crop/state,
        # so one page (up to 1000 records) is more than enough to satisfy
        # any reasonable `limit`. Looping through multiple pages risked
        # exceeding Vercel's serverless function timeout, which is why
        # this worked fine on localhost (no timeout) but hung/504'd in
        # production.
        try:
            res = requests.get(
                f'{MANDI_API_BASE}/{MANDI_RESOURCE}',
                params=params,
                timeout=8
            )
            res.raise_for_status()
        except requests.exceptions.Timeout:
            return jsonify({
                'error': 'Mandi API timed out. Try again later.'
            }), 504

        data = res.json()

        if 'records' not in data:
            print(f"🚨 AGMARKNET API RESPONSE: {data}")

        batch = data.get('records') or []
        fetched = [_normalise(r) for r in batch]

        # ── Only cache non-empty results ───────────────────────────────────────
        # If Agmarknet returned nothing (e.g. data not yet published for today),
        # do NOT cache — let the next request try the live API again.
        if fetched:
            with _lock:
                _cache[cache_key] = {'date': today, 'records': fetched}
        else:
            # Check if Agmarknet is alive at all by fetching any 1 record
            try:
                test_res = requests.get(
                    f'{MANDI_API_BASE}/{MANDI_RESOURCE}',
                    params={'api-key': api_key, 'format': 'json', 'limit': 1},
                    timeout=8
                )
                api_alive = bool(test_res.json().get('records'))
            except Exception:
                api_alive = False

            ist_now  = _ist_now()
            ist_hour = ist_now.hour

            if not api_alive:
                hint = (
                    'Agmarknet appears to be down right now. '
                    'Please try again in a few minutes.'
                )
            elif ist_hour < 12:
                hint = (
                    f'No data yet for "{crop}" today. '
                    f'Agmarknet publishes prices after 12 PM IST — '
                    f'it is currently {ist_now.strftime("%I:%M %p")} IST. '
                    f'Please try again later.'
                )
            else:
                hint = (
                    f'No prices found for "{crop}"'
                    + (f' in {state}' if state else '')
                    + '. Try a different crop name or state.'
                )

            return jsonify({
                'total': 0,
                'records': [],
                'cached': False,
                'hint': hint
            }), 200

        if district:
            fetched = [r for r in fetched if district.lower() in r['district'].lower()]

        return jsonify({
            'total': len(fetched),
            'records': fetched[:limit],
            'cached': False
        }), 200

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Mandi API timed out. Try again.'}), 504
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================================
# POST /api/mandi/clear-cache
# Dev utility — flushes the in-memory cache so the next
# request hits Agmarknet fresh. Safe to call anytime.
# ============================================================
@mandi_bp.route('/clear-cache', methods=['POST'])
def clear_cache():
    with _lock:
        count = len(_cache)
        _cache.clear()
    return jsonify({'cleared': True, 'entries_removed': count}), 200
