from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from backend.db import query

cart_bp = Blueprint('cart', __name__)

# ============================================================
# GET /api/cart
# ============================================================
@cart_bp.route('/', methods=['GET'])
def get_cart():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    cart_items = query(
        '''
        SELECT
            c.id, c.item_type, c.quantity, c.added_at,
            -- Listing details
            l.id          AS listing_id,
            l.crop_name   AS listing_crop,
            l.price       AS listing_price,
            l.city        AS listing_city,
            u_s.name      AS seller_name,
            u_s.phone     AS seller_phone,
            u_s.whatsapp_number AS seller_whatsapp,
            (SELECT image_data FROM listing_images li
             WHERE li.listing_id = l.id AND li.is_primary = TRUE LIMIT 1) AS image,
            -- Request details
            r.id          AS request_id,
            r.crop_name   AS request_crop,
            r.budget      AS request_budget,
            r.city        AS request_city,
            u_b.name      AS buyer_name,
            u_b.phone     AS buyer_phone
        FROM cart c
        LEFT JOIN listings l  ON l.id = c.listing_id
        LEFT JOIN users u_s   ON u_s.id = l.seller_id
        LEFT JOIN requests r  ON r.id = c.request_id
        LEFT JOIN users u_b   ON u_b.id = r.buyer_id
        WHERE c.user_id = %s
        ORDER BY c.added_at DESC
        ''',
        (identity['id'],),
        fetchall=True
    )

    return jsonify([dict(item) for item in cart_items]), 200


# ============================================================
# POST /api/cart
# ============================================================
@cart_bp.route('/', methods=['POST'])
def add_to_cart():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    data = request.get_json()
    item_type  = data.get('item_type')   # 'listing' or 'request'
    listing_id = data.get('listing_id')
    request_id = data.get('request_id')
    quantity   = data.get('quantity', 1)

    if item_type not in ('listing', 'request'):
        return jsonify({ 'error': 'item_type must be listing or request' }), 400

    if item_type == 'listing' and not listing_id:
        return jsonify({ 'error': 'listing_id is required' }), 400
    if item_type == 'request' and not request_id:
        return jsonify({ 'error': 'request_id is required' }), 400

    # Check if already in cart
    if item_type == 'listing':
        existing = query(
            'SELECT id FROM cart WHERE user_id = %s AND listing_id = %s',
            (identity['id'], listing_id),
            fetchone=True
        )
    else:
        existing = query(
            'SELECT id FROM cart WHERE user_id = %s AND request_id = %s',
            (identity['id'], request_id),
            fetchone=True
        )

    if existing:
        return jsonify({ 'error': 'Item already in cart' }), 409

    query(
        '''INSERT INTO cart (user_id, item_type, listing_id, request_id, quantity)
           VALUES (%s, %s, %s, %s, %s)''',
        (identity['id'], item_type, listing_id, request_id, quantity),
        commit=True
    )

    return jsonify({ 'message': 'Added to cart successfully' }), 201


# ============================================================
# DELETE /api/cart/<id>
# ============================================================
@cart_bp.route('/<int:cart_id>', methods=['DELETE'])
def remove_from_cart(cart_id):
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    item = query(
        'SELECT user_id FROM cart WHERE id = %s',
        (cart_id,),
        fetchone=True
    )
    if not item:
        return jsonify({ 'error': 'Cart item not found' }), 404
    if item['user_id'] != identity['id']:
        return jsonify({ 'error': 'Forbidden' }), 403

    query('DELETE FROM cart WHERE id = %s', (cart_id,), commit=True)
    return jsonify({ 'message': 'Item removed from cart' }), 200


# ============================================================
# DELETE /api/cart  (clear entire cart)
# ============================================================
@cart_bp.route('/', methods=['DELETE'])
def clear_cart():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    query('DELETE FROM cart WHERE user_id = %s', (identity['id'],), commit=True)
    return jsonify({ 'message': 'Cart cleared' }), 200
