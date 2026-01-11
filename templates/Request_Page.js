// ============================================================
// Request_Page.js  —  wired to Flask /api/requests/:id
// Requires: api.js loaded first
// ============================================================

let buyerRequest = null;

document.addEventListener('DOMContentLoaded', async () => {
  const requestId = localStorage.getItem('viewRequestId');
  if (!requestId) { window.location.href = 'index.html'; return; }

  try {
    buyerRequest = await apiFetch(`/requests/${requestId}`);
    renderRequestDetails();
    updateCartCount();
    document.getElementById('addToShortlistBtn').onclick = addToShortlist;
  } catch (err) {
    alert('Could not load request: ' + err.message);
    window.location.href = 'index.html';
  }
});

function renderRequestDetails() {
  document.getElementById('reqName').textContent       = buyerRequest.crop_name;
  document.getElementById('breadcrumbName').textContent = buyerRequest.crop_name;
  document.getElementById('reqLocation').innerHTML     = `<i class="fas fa-map-marker-alt"></i> ${buyerRequest.city || ''}, ${buyerRequest.state || 'India'}`;
  document.getElementById('reqPrice').textContent      = `₹${buyerRequest.budget}/kg`;
  document.getElementById('reqQty').textContent        = `${buyerRequest.amount_required} kg`;
  document.getElementById('reqDelivery').textContent   = buyerRequest.delivery_preference || 'Negotiable';
  document.getElementById('reqBuyer').textContent      = buyerRequest.buyer_name || 'Buyer';
  document.getElementById('reqDesc').textContent       = buyerRequest.requirements || 'No specific requirements mentioned.';
}

function addToShortlist() {
  const cart     = JSON.parse(localStorage.getItem('fb_cart') || '[]');
  const existing = cart.find(i => i.request_id === buyerRequest.id);

  if (existing) { alert('This request is already in your shortlist.'); return; }

  cart.push({
    request_id:  buyerRequest.id,
    name:        `REQ: ${buyerRequest.crop_name}`,
    price:       0,
    image:       null,
    quantity:    1,
    unit:        'Request',
    seller_name: buyerRequest.buyer_name || 'Buyer',
  });

  localStorage.setItem('fb_cart', JSON.stringify(cart));
  updateCartCount();
  showNotification('Request added to your shortlist!');
}

function updateCartCount() {
  const count = JSON.parse(localStorage.getItem('fb_cart') || '[]').length;
  const badge = document.getElementById('cartBadge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}
