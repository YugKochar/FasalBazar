from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
import bcrypt
from backend.db import query

auth_bp = Blueprint('auth', __name__)

# ============================================================
# POST /api/auth/signup
# ============================================================
@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()

    # Required fields
    required = ['name', 'email', 'phone', 'password', 'role']
    for field in required:
        if not data.get(field):
            return jsonify({ 'error': f'{field} is required' }), 400

    # Check if email already exists
    existing = query(
        'SELECT id FROM users WHERE email = %s OR phone = %s',
        (data['email'], data['phone']),
        fetchone=True
    )
    if existing:
        return jsonify({ 'error': 'Email or phone already registered' }), 409

    # Hash password
    password_hash = bcrypt.hashpw(
        data['password'].encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

    # Insert user
    user = query(
        '''
        INSERT INTO users (name, email, phone, whatsapp_number, password_hash, role,
                           pincode, city, state, country, lat, lng, preferred_language, default_radius)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id, name, email, phone, role
        ''',
        (
            data['name'],
            data['email'],
            data['phone'],
            data.get('whatsapp_number', data['phone']),
            password_hash,
            data['role'],
            data.get('pincode'),
            data.get('city'),
            data.get('state'),
            data.get('country', 'India'),
            data.get('lat'),
            data.get('lng'),
            data.get('preferred_language', 'en'),
            data.get('default_radius', 50)
        ),
        fetchone=True,
        commit=True
    )

    # Create JWT token (identity must be a string; extra info goes in additional_claims)
    token = create_access_token(
        identity=str(user['id']),
        additional_claims={
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
    )

    return jsonify({
        'message': 'Account created successfully',
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
    }), 201


# ============================================================
# POST /api/auth/login
# ============================================================
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()

    if not data.get('email') or not data.get('password'):
        return jsonify({ 'error': 'Email and password are required' }), 400

    # Find user
    user = query(
        'SELECT * FROM users WHERE email = %s',
        (data['email'],),
        fetchone=True
    )

    if not user:
        return jsonify({ 'error': 'Invalid email or password' }), 401

    # Check password
    if not bcrypt.checkpw(data['password'].encode('utf-8'), user['password_hash'].encode('utf-8')):
        return jsonify({ 'error': 'Invalid email or password' }), 401

    # Create JWT token (identity must be a string; extra info goes in additional_claims)
    token = create_access_token(
        identity=str(user['id']),
        additional_claims={
            'name': user['name'],
            'email': user['email'],
            'role': user['role']
        }
    )

    return jsonify({
        'message': 'Login successful',
        'token': token,
        'user': {
            'id': user['id'],
            'name': user['name'],
            'email': user['email'],
            'phone': user['phone'],
            'role': user['role'],
            'city': user['city'],
            'state': user['state'],
            'preferred_language': user['preferred_language']
        }
    }), 200


# ============================================================
# GET /api/auth/profile
# ============================================================
@auth_bp.route('/profile', methods=['GET'])
def get_profile():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
    except Exception as e:
        print(f"JWT verification failed: {repr(e)}", flush=True)
        return jsonify({ 'error': 'Unauthorized' }), 401

    user = query(
        '''SELECT id, name, email, phone, whatsapp_number, role,
                  pincode, city, state, country, lat, lng,
                  preferred_language, default_radius, created_at
           FROM users WHERE id = %s''',
        (user_id,),
        fetchone=True
    )

    if not user:
        return jsonify({ 'error': 'User not found' }), 404

    return jsonify(dict(user)), 200


# ============================================================
# PUT /api/auth/profile
# ============================================================
@auth_bp.route('/profile', methods=['PUT'])
def update_profile():
    from flask_jwt_extended import verify_jwt_in_request, get_jwt_identity
    try:
        verify_jwt_in_request()
        user_id = get_jwt_identity()
    except Exception as e:
        print(f"JWT verification failed: {repr(e)}", flush=True)
        return jsonify({ 'error': 'Unauthorized' }), 401

    data = request.get_json()

    query(
        '''UPDATE users SET
            name               = COALESCE(%s, name),
            phone              = COALESCE(%s, phone),
            whatsapp_number    = COALESCE(%s, whatsapp_number),
            pincode            = COALESCE(%s, pincode),
            city               = COALESCE(%s, city),
            state              = COALESCE(%s, state),
            country            = COALESCE(%s, country),
            lat                = COALESCE(%s, lat),
            lng                = COALESCE(%s, lng),
            preferred_language = COALESCE(%s, preferred_language),
            default_radius     = COALESCE(%s, default_radius)
           WHERE id = %s''',
        (
            data.get('name'),
            data.get('phone'),
            data.get('whatsapp_number'),
            data.get('pincode'),
            data.get('city'),
            data.get('state'),
            data.get('country'),
            data.get('lat'),
            data.get('lng'),
            data.get('preferred_language'),
            data.get('default_radius'),
            user_id
        ),
        commit=True
    )

    return jsonify({ 'message': 'Profile updated successfully' }), 200
