// ============================================================
// buying-script.js  —  wired to Flask /api/requests
// Requires: api.js loaded first
// ============================================================

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
});

// ── Form submit → POST /api/requests ─────────────────────────
document.getElementById('buyingForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!Auth.isLoggedIn()) {
    showNotification('Please login before posting a buying request.', true);
    return;
  }

  const payload = {
    crop_name:           document.getElementById('cropName').value,
    amount_required:     parseFloat(document.getElementById('amountRequired').value) || 0,
    budget:              parseFloat(document.getElementById('startingCost').value) || 0,
    delivery_preference: document.getElementById('deliveryPayable').value,
    requirements:        document.getElementById('requirements').value,
    city:                document.getElementById('city').value,
    state:               document.getElementById('state').value,
    country:             document.getElementById('country').value || 'India',
    pincode:             document.getElementById('postcode').value,
  };

  const btn = e.target.querySelector('.submit-btn');
  btn.textContent = 'Posting...'; btn.disabled = true;

  try {
    await apiFetch('/requests/', { method: 'POST', body: payload, auth: true });
    showNotification('Buying request posted!');
    setTimeout(() => { window.location.href = 'index.html'; }, 1200);
  } catch (err) {
    showNotification(err.message, true);
    btn.textContent = 'Post Buying Request'; btn.disabled = false;
  }
});
