from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from backend.db import query

transactions_bp = Blueprint('transactions', __name__)

# ============================================================
# GET /api/transactions  (user's own transactions)
# ============================================================
@transactions_bp.route('/', methods=['GET'])
def get_transactions():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    txns = query(
        '''
        SELECT t.*,
               l.crop_name  AS listing_crop,
               l.city       AS listing_city,
               u_s.name     AS seller_name,
               r.crop_name  AS request_crop,
               u_b.name     AS buyer_name
        FROM transactions t
        LEFT JOIN listings l  ON l.id = t.listing_id
        LEFT JOIN users u_s   ON u_s.id = l.seller_id
        LEFT JOIN requests r  ON r.id = t.request_id
        LEFT JOIN users u_b   ON u_b.id = r.buyer_id
        WHERE l.seller_id = %s OR r.buyer_id = %s
        ORDER BY t.created_at DESC
        ''',
        (identity['id'], identity['id']),
        fetchall=True
    )

    return jsonify([dict(t) for t in txns]), 200


# ============================================================
# POST /api/transactions  (create inquiry / transaction)
# ============================================================
@transactions_bp.route('/', methods=['POST'])
def create_transaction():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    data = request.get_json()

    listing_id = data.get('listing_id')
    request_id = data.get('request_id')

    if not listing_id and not request_id:
        return jsonify({ 'error': 'listing_id or request_id is required' }), 400

    # Get crop details from listing or request
    if listing_id:
        source = query(
            'SELECT crop_name, amount FROM listings WHERE id = %s',
            (listing_id,),
            fetchone=True
        )
        crop_name = source['crop_name']
        quantity  = source['amount']
    else:
        source = query(
            'SELECT crop_name, amount_required FROM requests WHERE id = %s',
            (request_id,),
            fetchone=True
        )
        crop_name = source['crop_name']
        quantity  = source['amount_required']

    txn = query(
        '''
        INSERT INTO transactions (listing_id, request_id, crop_name, quantity, agreed_price, status)
        VALUES (%s, %s, %s, %s, %s, 'pending')
        RETURNING id
        ''',
        (listing_id, request_id, crop_name, quantity, data.get('agreed_price')),
        fetchone=True,
        commit=True
    )

    return jsonify({
        'message': 'Transaction created successfully',
        'transaction_id': txn['id']
    }), 201


# ============================================================
# PUT /api/transactions/<id>  (update status)
# ============================================================
@transactions_bp.route('/<int:txn_id>', methods=['PUT'])
def update_transaction(txn_id):
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    data   = request.get_json()
    status = data.get('status')

    if status not in ('pending', 'completed', 'cancelled'):
        return jsonify({ 'error': 'Invalid status' }), 400

    query(
        'UPDATE transactions SET status = %s WHERE id = %s',
        (status, txn_id),
        commit=True
    )

    return jsonify({ 'message': f'Transaction marked as {status}' }), 200
