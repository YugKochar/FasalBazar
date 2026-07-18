// ============================================================
// Product_Page.js  —  wired to Flask /api/listings/:id
// Requires: api.js loaded first (initAuthUI runs automatically)
// ============================================================

let product   = null;
let quantity  = 1;
let selectedRating = 0;
let images    = [];

document.addEventListener('DOMContentLoaded', async () => {
  const listingId = localStorage.getItem('viewListingId');
  if (!listingId) { window.location.href = 'index.html'; return; }

  try {
    product = await apiFetch(`/listings/${listingId}`);

    // Apply stored translation for user's preferred language
    const lang = localStorage.getItem('fb_lang') || 'en';
    if (lang !== 'en' && product.translations) {
      let trans = product.translations;
      if (typeof trans === 'string') { try { trans = JSON.parse(trans); } catch(_) { trans = {}; } }
      if (trans[lang]) {
        if (trans[lang].crop_name)   product.crop_name   = trans[lang].crop_name;
        if (trans[lang].description) product.description = trans[lang].description;
      }
    }

    images = (product.images || []).map(img => img.image_data).filter(Boolean);
    if (images.length === 0) images = ['https://via.placeholder.com/400x300?text=No+Image'];

    renderProductDetails();
    renderGallery();
    renderReviews();
    initReviewStars();
    // Pre-fill review form with logged-in user details
    const user = Auth.getUser();
    if (user) {
      const rn = document.getElementById('reviewName');
      const re = document.getElementById('reviewEmail');
      if (rn) rn.value = user.name;
      if (re) re.value = user.email;
    }
    updateCartCount();
  } catch (err) {
    alert('Could not load listing: ' + err.message);
    window.location.href = 'index.html';
  }
});

function renderProductDetails() {
  document.getElementById('pName').textContent          = product.crop_name;
  document.getElementById('breadcrumbName').textContent = product.crop_name;
  document.getElementById('pLocation').innerHTML        = `<i class="fas fa-map-marker-alt"></i> ${product.city || ''}, ${product.state || 'India'}`;
  document.getElementById('pPrice').textContent         = `₹${product.price}/kg`;
  document.getElementById('pDescription').textContent   = product.description || 'No description provided.';
  document.getElementById('pSeller').textContent        = product.seller_name || 'Farmer';

  const featureList = document.getElementById('pFeatures');
  featureList.innerHTML = '';
  const features = Array.isArray(product.features) ? product.features : [];
  features.forEach(f => {
    const li = document.createElement('li'); li.className = 'feature-item'; li.textContent = f;
    featureList.appendChild(li);
  });
}

function renderGallery() {
  const mainImg  = document.getElementById('mainImageDisplay');
  const thumbCol = document.getElementById('thumbnailColumn');
  mainImg.style.backgroundImage = `url('${images[0]}')`;
  thumbCol.innerHTML = '';
  images.forEach((img, i) => {
    const div = document.createElement('div');
    div.className = `thumbnail ${i === 0 ? 'active' : ''}`;
    div.style.backgroundImage = `url('${img}')`;
    div.onclick = () => {
      mainImg.style.backgroundImage = `url('${img}')`;
      document.querySelectorAll('.thumbnail').forEach(t => t.classList.remove('active'));
      div.classList.add('active');
    };
    thumbCol.appendChild(div);
  });
}

// ── Reviews (from API) ────────────────────────────────────────
async function renderReviews() {
  const list = document.getElementById('reviewsList');
  try {
    const reviews = await apiFetch(`/reviews/?listing_id=${product.id}`);
    document.getElementById('pReviewCount').textContent = `(${reviews.length} review${reviews.length !== 1 ? 's' : ''})`;
    if (reviews.length > 0) updateHeaderStars(reviews.reduce((a, r) => a + r.rating, 0) / reviews.length);
    else updateHeaderStars(0);

    list.innerHTML = reviews.length === 0
      ? '<p style="color:#666;padding:20px;text-align:center;">No reviews yet. Be the first!</p>'
      : reviews.map(r => `
          <div class="review-card">
            <div class="review-header">
              <div class="reviewer-info">
                <div class="avatar"></div>
                <div>
                  <p class="reviewer-name">${r.reviewer_name}</p>
                  <p class="review-comment">${r.comment || ''}</p>
                  <p style="font-size:12px;color:#999;margin-top:5px;">${new Date(r.created_at).toLocaleDateString('en-IN')}</p>
                </div>
              </div>
              <div class="stars">${'<i class="fas fa-star" style="color:#ffc107"></i>'.repeat(r.rating)}${'<i class="far fa-star" style="color:#d1d5db"></i>'.repeat(5 - r.rating)}</div>
            </div>
          </div>`).join('');
  } catch {
    list.innerHTML = '<p style="color:#666;padding:20px;text-align:center;">Could not load reviews.</p>';
  }
}

function updateHeaderStars(rating) {
  const container = document.getElementById('avgStars');
  container.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('i');
    s.className = rating >= i ? 'fas fa-star' : rating >= i - 0.6 ? 'fas fa-star-half-alt' : 'far fa-star';
    container.appendChild(s);
  }
}

// ── Star rating input ─────────────────────────────────────────
function initReviewStars() {
  const stars = document.querySelectorAll('#reviewStars .star-clickable');
  stars.forEach((star, i) => {
    star.onclick = () => {
      selectedRating = parseInt(star.dataset.rating);
      stars.forEach((s, j) => {
        s.classList.toggle('star-filled', j < selectedRating);
        s.classList.toggle('star-empty',  j >= selectedRating);
      });
    };
    star.onmouseenter = () => {
      const r = parseInt(star.dataset.rating);
      stars.forEach((s, j) => { s.style.opacity = j < r ? '1' : '0.4'; s.style.transform = j < r ? 'scale(1.15)' : 'scale(1)'; });
    };
    star.onmouseleave = () => stars.forEach(s => { s.style.opacity = '1'; s.style.transform = 'scale(1)'; });
  });
}

// ── Submit review → POST /api/reviews ────────────────────────
document.getElementById('reviewForm').onsubmit = async (e) => {
  e.preventDefault();
  if (selectedRating === 0) { alert('Please select a star rating.'); return; }
  if (!Auth.isLoggedIn()) { showNotification('Please login to post a review.', true); return; }

  try {
    await apiFetch('/reviews/', {
      method: 'POST',
      body: {
        listing_id: product.id,
        rating:     selectedRating,
        comment:    document.getElementById('reviewComment').value,
      },
      auth: true,
    });
    document.getElementById('reviewForm').reset();
    selectedRating = 0;
    document.querySelectorAll('#reviewStars .star-clickable').forEach(s => { s.classList.remove('star-filled'); s.classList.add('star-empty'); });
    showNotification('Review posted!');
    renderReviews();
  } catch (err) { showNotification(err.message, true); }
};

// ── Quantity controls ─────────────────────────────────────────
document.getElementById('decreaseQty').onclick = () => { if (quantity > 1) { quantity--; document.getElementById('quantity').textContent = quantity; } };
document.getElementById('increaseQty').onclick = () => { quantity++; document.getElementById('quantity').textContent = quantity; };

// ── Add to cart (localStorage shortlist) ─────────────────────
document.getElementById('addToCartBtn').onclick = () => {
  const cart     = JSON.parse(localStorage.getItem('fb_cart') || '[]');
  const existing = cart.find(i => i.listing_id === product.id);
  if (existing) { existing.quantity += quantity; }
  else {
    cart.push({
      listing_id:  product.id,
      name:        product.crop_name,
      price:       product.price,
      image:       images[0],
      quantity,
      unit:        product.unit || 'kg',
      seller_name: product.seller_name || 'Farmer',
    });
  }
  localStorage.setItem('fb_cart', JSON.stringify(cart));
  updateCartCount();
  showNotification(`${product.crop_name} added to shortlist!`);
};

function updateCartCount() {
  const count = JSON.parse(localStorage.getItem('fb_cart') || '[]').reduce((s, i) => s + i.quantity, 0);
  const badge = document.getElementById('cartBadge');
  if (badge) { badge.textContent = count; badge.classList.toggle('hidden', count === 0); }
}
