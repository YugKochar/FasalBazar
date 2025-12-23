// ============================================================
// selling-script.js  —  wired to Flask /api/listings
// Requires: api.js, reverie.js loaded first
// ============================================================

let allUploadedImages = [];

// ── Language helper ───────────────────────────────────────────
function getLang() {
  return localStorage.getItem('fb_lang') || 'hi';
}

// ── Mic button helper ─────────────────────────────────────────
// Attaches a toggle-record behaviour to btnId, fills inputId with transcript.
// Works for both <input> and <textarea> elements.
function attachMic(btnId, inputId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  let recording = false;

  btn.addEventListener('click', async () => {
    if (recording) {
      // Stop early — onStop callback will handle filling the field
      recording = false;
      btn.textContent = '🎙️';
      btn.style.cssText = '';
      Reverie.stopRecording();
      return;
    }

    recording = true;
    btn.textContent = '⏹️';
    btn.style.background = '#e53935';
    btn.style.color      = '#fff';
    btn.style.borderColor = '#e53935';

    try {
      await Reverie.startRecording({
        onStop: async (blob) => {
          try {
            const text = await Reverie.transcribeFile(blob, getLang());
            if (text) {
              const field = document.getElementById(inputId);
              if (field) field.value = text;
            }
          } catch (err) {
            showNotification('Voice transcription failed. Please type instead.', true);
          } finally {
            recording = false;
            btn.textContent = '🎙️';
            btn.style.cssText = '';
          }
        },
      });
    } catch (err) {
      recording = false;
      btn.textContent = '🎙️';
      btn.style.cssText = '';
      showNotification('Microphone access denied. Please type instead.', true);
    }
  });
}

// ── Pincode auto-fill ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('postcode')?.addEventListener('input', async (e) => {
    const pincode = e.target.value.trim();
    const msg     = document.getElementById('locationMsg');
    if (pincode.length === 6 && /^\d+$/.test(pincode)) {
      msg.textContent = 'Fetching location...'; msg.style.color = '#666';
      try {
        const res  = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
        const data = await res.json();
        if (data[0].Status === 'Success') {
          const d = data[0].PostOffice[0];
          document.getElementById('city').value    = d.District;
          document.getElementById('state').value   = d.State;
          document.getElementById('country').value = 'India';
          msg.textContent = `✓ Found: ${d.District}, ${d.State}`; msg.style.color = '#2e7d32';
        } else {
          msg.textContent = 'Invalid Pincode'; msg.style.color = '#d32f2f';
          document.getElementById('city').value = ''; document.getElementById('state').value = '';
        }
      } catch { msg.textContent = 'Error fetching location'; msg.style.color = '#d32f2f'; }
    } else { if (msg) msg.textContent = ''; }
  });

  // ── Attach mic buttons to key fields ──────────────────────
  attachMic('micCropName',     'cropName');
  attachMic('micAmount',       'amountSelling');
  attachMic('micDescription',  'productDescription');
  attachMic('micDelivery',     'deliveryCost');
});

// ── Image upload ──────────────────────────────────────────────
function handleFileUpload(input) {
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => { allUploadedImages.push(e.target.result); renderImagePreview(); };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderImagePreview() {
  const grid = document.getElementById('photoPreviewGrid');
  grid.innerHTML = '';
  allUploadedImages.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = 'photo-preview-item';
    div.innerHTML = `<img src="${img}" alt="Preview"><button type="button" class="remove-photo-btn" onclick="removeImage(${i})">&times;</button>`;
    grid.appendChild(div);
  });
}

function removeImage(index) { allUploadedImages.splice(index, 1); renderImagePreview(); }

// ── Form submit → POST /api/listings ─────────────────────────
document.getElementById('sellingForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!Auth.isLoggedIn()) {
    showNotification('Please login before listing a crop.', true);
    return;
  }

  if (allUploadedImages.length === 0) {
    alert('Please upload at least one photo of your crop.');
    return;
  }

  const featuresRaw = document.getElementById('productFeatures').value;
  const features    = featuresRaw ? featuresRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const payload = {
    crop_name:     document.getElementById('cropName').value,
    amount:        parseFloat(document.getElementById('amountSelling').value) || 0,
    unit:          'kg',
    price:         parseFloat(document.getElementById('cost').value) || 0,
    description:   document.getElementById('productDescription').value,
    features,
    delivery_cost: document.getElementById('deliveryCost').value,
    city:          document.getElementById('city').value,
    state:         document.getElementById('state').value,
    country:       document.getElementById('country').value || 'India',
    pincode:       document.getElementById('postcode').value,
    images:        allUploadedImages,   // base64 array
    original_lang: getLang(),           // farmer's current language
  };

  const btn = e.target.querySelector('.submit-btn');
  btn.textContent = 'Listing...'; btn.disabled = true;

  try {
    await apiFetch('/listings/', { method: 'POST', body: payload, auth: true });
    showNotification('Crop listed successfully!');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (err) {
    showNotification(err.message, true);
    btn.textContent = 'List Crop for Sale'; btn.disabled = false;
  }
});
