from flask import Blueprint, request, jsonify
from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
from backend.db import query

reviews_bp = Blueprint('reviews', __name__)

# ============================================================
# GET /api/reviews?seller_id=&listing_id=
# ============================================================
@reviews_bp.route('/', methods=['GET'])
def get_reviews():
    seller_id  = request.args.get('seller_id',  type=int)
    listing_id = request.args.get('listing_id', type=int)

    sql = '''
        SELECT r.*, u.name AS reviewer_name
        FROM reviews r
        JOIN users u ON u.id = r.reviewer_id
        WHERE 1=1
    '''
    params = []

    if seller_id:
        sql += ' AND r.seller_id = %s'
        params.append(seller_id)
    if listing_id:
        sql += ' AND r.listing_id = %s'
        params.append(listing_id)

    sql += ' ORDER BY r.created_at DESC'

    reviews = query(sql, params, fetchall=True)
    return jsonify([dict(r) for r in reviews]), 200


# ============================================================
# POST /api/reviews
# ============================================================
@reviews_bp.route('/', methods=['POST'])
def create_review():
    try:
        verify_jwt_in_request()
        identity = get_jwt_identity()
    except:
        return jsonify({ 'error': 'Unauthorized' }), 401

    data = request.get_json()

    if not data.get('rating'):
        return jsonify({ 'error': 'rating is required' }), 400
    if not data.get('seller_id') and not data.get('listing_id'):
        return jsonify({ 'error': 'seller_id or listing_id is required' }), 400

    try:
        query(
            '''INSERT INTO reviews (reviewer_id, seller_id, listing_id, rating, comment)
               VALUES (%s, %s, %s, %s, %s)''',
            (
                identity['id'],
                data.get('seller_id'),
                data.get('listing_id'),
                data['rating'],
                data.get('comment')
            ),
            commit=True
        )
    except Exception as e:
        if 'unique' in str(e).lower():
            return jsonify({ 'error': 'You have already reviewed this' }), 409
        raise e

    return jsonify({ 'message': 'Review posted successfully' }), 201
