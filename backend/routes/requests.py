from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from backend.db import query

requests_bp = Blueprint('requests', __name__)

# ============================================================
# GET /api/requests
# ============================================================
@requests_bp.route('/', methods=['GET'])
def get_requests():
    city   = request.args.get('city')
    crop   = request.args.get('crop')

    sql = 'SELECT * FROM v_active_requests WHERE 1=1'
    params = []

    if city:
        sql += ' AND LOWER(city) = LOWER(%s)'
        params.append(city)
    if crop:
        sql += ' AND LOWER(crop_name) LIKE LOWER(%s)'
        params.append(f'%{crop}%')

    sql += ' ORDER BY created_at DESC'

    reqs = query(sql, params, fetchall=True)
    return jsonify([dict(r) for r in reqs]), 200


# ============================================================
# GET /api/requests/<id>
# ============================================================
@requests_bp.route('/<int:request_id>', methods=['GET'])
def get_request(request_id):
    req = query(
        'SELECT * FROM v_active_requests WHERE id = %s',
        (request_id,),
        fetchone=True
    )
    if not req:
        return jsonify({ 'error': 'Request not found' }), 404
    return jsonify(dict(req)), 200


# ============================================================
# POST /api/requests
# ============================================================
@requests_bp.route('/', methods=['POST'])
def create_request():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    # identity may be a dict {id, role, ...} or just an int (user ID)
    user_id = identity.get('id') if isinstance(identity, dict) else identity

    data = request.get_json()

    required = ['crop_name', 'amount_required', 'budget']
    for field in required:
        if not data.get(field):
            return jsonify({ 'error': f'{field} is required' }), 400

    # Normalise delivery_preference to DB ENUM values# Normalise delivery_preference to DB ENUM values (pickup / delivery / either)
    DELIVERY_MAP = {
        'delivery': 'delivery',
        'Seller Must Deliver': 'delivery',
        'Home Delivery (Seller Delivers)': 'delivery',

        'pickup': 'pickup',
        'Buyer Arranges Transport': 'pickup',
        'I will arrange transport / pick up': 'pickup',

        'any': 'either',
        'either': 'either',
        'Negotiable': 'either',
        'Either is fine / Negotiable': 'either',
    }
    delivery_pref = data.get('delivery_preference', 'either')
    delivery_pref = DELIVERY_MAP.get(delivery_pref, delivery_pref)
    # Final safety: if it's still not a valid ENUM value, default to 'either'
    valid_prefs = ('pickup', 'delivery', 'either')
    if delivery_pref not in valid_prefs:
        delivery_pref = 'either'

    # amount_required and budget can be numbers or strings — store as string
    import re
    match = re.search(r'[\d.]+', str(data['amount_required']))
    amount_required = match.group() if match else '0'
    budget          = str(data['budget'])

    req = query(
        '''
        INSERT INTO requests (buyer_id, crop_name, amount_required, budget,
                              delivery_preference, requirements,
                              pincode, city, state, country, lat, lng)
        VALUES (%s, %s, %s, %s, %s::delivery_preference, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
        ''',
        (
            user_id,
            data['crop_name'],
            amount_required,
            budget,
            delivery_pref,
            data.get('requirements'),
            data.get('pincode'),
            data.get('city'),
            data.get('state'),
            data.get('country', 'India'),
            data.get('lat'),
            data.get('lng')
        ),
        fetchone=True,
        commit=True
    )

    return jsonify({
        'message': 'Buyer request posted successfully',
        'id': req['id'],
        'request_id': req['id']
    }), 201


# ============================================================
# PUT /api/requests/<id>
# ============================================================
@requests_bp.route('/<int:request_id>', methods=['PUT'])
def update_request(request_id):
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    user_id = identity.get('id') if isinstance(identity, dict) else identity

    req = query(
        'SELECT buyer_id FROM requests WHERE id = %s',
        (request_id,),
        fetchone=True
    )
    if not req:
        return jsonify({ 'error': 'Request not found' }), 404
    if req['buyer_id'] != user_id:
        return jsonify({ 'error': 'Forbidden' }), 403

    data = request.get_json()

    query(
        '''UPDATE requests SET
            crop_name           = COALESCE(%s, crop_name),
            amount_required     = COALESCE(%s, amount_required),
            budget              = COALESCE(%s, budget),
            delivery_preference = COALESCE(%s, delivery_preference),
            requirements        = COALESCE(%s, requirements),
            status              = COALESCE(%s, status)
           WHERE id = %s''',
        (
            data.get('crop_name'),
            data.get('amount_required'),
            data.get('budget'),
            data.get('delivery_preference'),
            data.get('requirements'),
            data.get('status'),
            request_id
        ),
        commit=True
    )

    return jsonify({ 'message': 'Request updated successfully' }), 200


# ============================================================
# DELETE /api/requests/<id>
# ============================================================
@requests_bp.route('/<int:request_id>', methods=['DELETE'])
def delete_request(request_id):
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    user_id = identity.get('id') if isinstance(identity, dict) else identity

    req = query(
        'SELECT buyer_id FROM requests WHERE id = %s',
        (request_id,),
        fetchone=True
    )
    if not req:
        return jsonify({ 'error': 'Request not found' }), 404
    if req['buyer_id'] != user_id:
        return jsonify({ 'error': 'Forbidden' }), 403

    query('DELETE FROM requests WHERE id = %s', (request_id,), commit=True)
    return jsonify({ 'message': 'Request deleted successfully' }), 200
