from flask import Flask
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import os
from backend.routes.mandi import mandi_bp
import threading
from flask import render_template
from backend.routes.chat import chat_bp
from flask import send_from_directory
from datetime import timedelta                          # ← ADD



# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

# Import route blueprints
from backend.routes.auth         import auth_bp
from backend.routes.listings     import listings_bp
from backend.routes.requests     import requests_bp
from backend.routes.cart         import cart_bp
from backend.routes.transactions import transactions_bp
from backend.routes.reviews      import reviews_bp
from backend.routes.translate    import translate_bp

# ============================================================
# App setup
# ============================================================
app = Flask(__name__, template_folder='../templates')

# Allow frontend to talk to backend
CORS(app, resources={r"/api/*": {"origins": "*"}})

# JWT config
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'changeme')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=7)  # ← ADD (was 15 min default)
jwt = JWTManager(app)

# ============================================================
# Register blueprints
# ============================================================
app.register_blueprint(mandi_bp,        url_prefix='/api/mandi')
app.register_blueprint(auth_bp,         url_prefix='/api/auth')
app.register_blueprint(listings_bp,     url_prefix='/api/listings')
app.register_blueprint(requests_bp,     url_prefix='/api/requests')
app.register_blueprint(cart_bp,         url_prefix='/api/cart')
app.register_blueprint(transactions_bp, url_prefix='/api/transactions')
app.register_blueprint(reviews_bp,      url_prefix='/api/reviews')
app.register_blueprint(translate_bp,    url_prefix='/api/translate')
app.register_blueprint(chat_bp, url_prefix='/api')

# ============================================================
# Health check
# ============================================================
@app.route('/api/health')
def health():
    return { 'status': 'ok', 'message': 'Fasal Bazaar API is running', 'version': 'debug-test-1' }

@app.route("/")
def home():
    return render_template("Homepage.html")

@app.route("/<path:filename>")
def serve_template(filename):
    return send_from_directory(app.template_folder, filename)

# ============================================================
# Run
# ============================================================
if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5000,
        debug=os.getenv('FLASK_DEBUG', '1') == '1'
    )
