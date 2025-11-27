import os
import json
import google.generativeai as genai
from flask import Blueprint, request, jsonify

chat_bp = Blueprint('chat', __name__)

genai.configure(api_key=os.environ.get('GEMINI_API_KEY'))

SYSTEM_PROMPT = """You are a helpful voice assistant for Fasal Bazaar, an agricultural marketplace in India.
Your job is to help farmers list their crops for sale by asking them questions conversationally.

You need to collect these fields:
1. crop_name  — what crop (फसल) they want to sell
2. amount     — how many (number only, no units)
3. unit       — kg / quintal / ton / packet / litre / dozen / piece
4. price      — price per unit in INR (numbers only)
5. city       — where the crop is located (city name)
6. description — optional: quality, variety, anything extra

HINGLISH / ROMANIZED INPUT RULES (very important):
- Users often type in Hinglish (Roman script Hindi), e.g. "chawal" (rice), "gehun" (wheat),
  "aalu" (potato), "pyaaz" (onion), "tamatar" (tomato), "makka" (corn), "sarso" (mustard),
  "moong" (moong dal), "chana" (chickpea), "arhar" (pigeon pea), "bajra" (pearl millet),
  "jowar" (sorghum), "kapas" (cotton), "ganna" (sugarcane), "adrak" (ginger), "lahsun" (garlic).
- Always understand and accept Hinglish crop names. Store crop_name as the common English name
  (e.g. "chawal" → "Rice", "gehun" → "Wheat", "aalu" → "Potato").
- If you cannot map it to English, store the Hinglish word as-is.
- Users may say quantities like "50 kilo", "2 quintal", "ek ton" — parse these correctly.
- "ek"=1, "do"=2, "teen"=3, "char"=4, "paanch"=5, "das"=10, "bis"=20, "sau"=100.
- Users may mix Hindi and English freely — always understand the intent.

LANGUAGE RULES:
- Respond ONLY in {LANG_NAME}. Never switch languages mid-conversation.
- Ask for ONE missing piece of information at a time.
- If the user gives multiple pieces of info at once, acknowledge all and ask only for what is missing.
- Be warm, encouraging, and use simple farmer-friendly language.

COMPLETION RULE:
- When ALL six fields are collected (description can be empty string ""), respond with EXACTLY
  this format on its own line at the END of your message — no text after it:
  LISTING_COMPLETE:{{"crop_name":"...","amount":...,"unit":"...","price":...,"city":"...","description":"..."}}
- amount and price must be numbers (not strings).
- crop_name must be in English (translate from Hinglish if needed).
- If the user says something unrelated, gently bring them back to the listing."""

BUYER_SYSTEM_PROMPT = """You are a helpful voice assistant for Fasal Bazaar, an agricultural marketplace in India.
Your job is to help buyers post a crop purchase request by asking them questions conversationally.

You need to collect these fields:
1. crop_name           — what crop they want to buy
2. amount_required     — how much quantity (e.g. "100 kg", "5 quintal")
3. budget              — maximum price per unit in INR (number only)
4. delivery_preference — one of: "Seller Must Deliver", "Buyer Arranges Transport", "Negotiable"
5. requirements        — optional: quality requirements or notes

HINGLISH / ROMANIZED INPUT RULES (very important):
- Users often type in Hinglish (Roman script Hindi), e.g. "chawal" (rice), "gehun" (wheat),
  "aalu" (potato), "pyaaz" (onion), "tamatar" (tomato).
- Always understand and accept Hinglish crop names. Store crop_name as the common English name.
- Users may say quantities like "50 kilo", "2 quintal" — parse these correctly.
- "ek"=1, "do"=2, "teen"=3, "char"=4, "paanch"=5, "das"=10, "bis"=20, "sau"=100.

LANGUAGE RULES:
- Respond ONLY in {LANG_NAME}. Never switch languages.
- Ask for ONE missing piece of information at a time.
- Be warm, encouraging, and use simple farmer-friendly language.

COMPLETION RULE:
- When ALL five fields are collected (requirements can be ""), respond with EXACTLY this format
  on its own line at the END of your message:
  REQUEST_COMPLETE:{{"crop_name":"...","amount_required":"...","budget":...,"delivery_preference":"...","requirements":"..."}}
- budget must be a number.
- crop_name must be in English.
- delivery_preference must be exactly one of: "Seller Must Deliver", "Buyer Arranges Transport", "Negotiable"
- If user says "main le jaunga" / "pickup" / "I will pick up" → "Buyer Arranges Transport"
- If user says "ghar pe chahiye" / "deliver karo" / "home delivery" → "Seller Must Deliver"
- Otherwise → "Negotiable"
- If the user says something unrelated, gently bring them back."""

LANG_NAMES = {
    'hi': 'Hindi', 'mr': 'Marathi', 'pa': 'Punjabi',
    'gu': 'Gujarati', 'en': 'English', 'ta': 'Tamil',
    'te': 'Telugu', 'kn': 'Kannada', 'bn': 'Bengali', 'ml': 'Malayalam'
}


@chat_bp.route('/chat/', methods=['POST'])
def chat():
    data = request.get_json(force=True)

    message = (data.get('message') or '').strip()
    history = data.get('history') or []
    lang    = data.get('lang') or 'hi'
    mode    = data.get('mode') or 'seller'   # 'seller' | 'buyer'

    if not message:
        return jsonify({'error': 'message is required'}), 400

    lang_name = LANG_NAMES.get(lang, 'Hindi')

    # Pick the right system prompt based on mode
    base_prompt = BUYER_SYSTEM_PROMPT if mode == 'buyer' else SYSTEM_PROMPT
    system = base_prompt.replace('{LANG_NAME}', lang_name)

    try:
        model = genai.GenerativeModel(
            model_name='gemini-1.5-flash',
            system_instruction=system
        )

        # Convert history {role, content} → Gemini {role, parts}
        gemini_history = []
        for turn in history:
            role = 'model' if turn.get('role') == 'assistant' else 'user'
            gemini_history.append({
                'role': role,
                'parts': [turn.get('content', '')]
            })

        chat_session = model.start_chat(history=gemini_history)
        response = chat_session.send_message(message)
        reply = response.text.strip()

        return jsonify({'reply': reply})

    except Exception as e:
        print(f'[chat.py] Gemini error: {e}')
        error_msg = (
            'माफ करें, कुछ गड़बड़ हो गई। फिर से कोशिश करें।'
            if lang == 'hi'
            else 'Sorry, something went wrong. Please try again.'
        )
        return jsonify({'reply': error_msg}), 500
