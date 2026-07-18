// ============================================================
// script.js  —  index.html shop/search page
// Requires: api.js loaded first
// ============================================================

const categoryMap = {
  'Grains':     ['bajra','basmati','jowar','maize','paddy','ragi','rice','wheat','barley','millet'],
  'Pulses':     ['chana','masoor','moong','tur','urad','green peas','rajma','horse gram'],
  'Vegetables': ['tomato','potato','onion','cabbage','cauliflower','carrot','brinjal','ladys finger','cucumber','capsicum'],
  'Fruits':     ['apple','banana','mango','grapes','orange','pomegranate','papaya','watermelon','guava','strawberry'],
  'Oilseeds':   ['groundnut','mustard','soyabean','sunflower seed','sesame','castor seed','cotton','coconut'],
  'Spices':     ['turmeric','ginger','garlic','dry chilli','coriander','jeera','pepper','cardamom','jute','tea'],
};

let currentListingType    = 'seller';
let currentCityFilter     = null;
let currentSearchQuery    = null;
let currentCategoryFilter = null;

// ── Geo-location ─────────────────────────────────────────────
function requestAndSaveLocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      localStorage.setItem('fb_lat', lat);
      localStorage.setItem('fb_lng', lng);
      // Update location display in header
      updateLocationDisplay(lat, lng);
      // Sync to backend profile if logged in
      if (Auth.isLoggedIn()) {
        try {
          await apiFetch('/auth/profile', { method: 'PUT', body: { lat, lng }, auth: true });
        } catch (_) { /* silent */ }
      }
      // Reload listings with geo-sorting now that we have location
      loadProducts();
    },
    () => { /* user denied — silently ignore */ },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

function updateLocationDisplay(lat, lng) {
  const el = document.getElementById('locationDisplay');
  if (!el) return;
  // Reverse geocode using pincode API isn't possible with just lat/lng,
  // so just show coordinates rounded nicely
  el.textContent = `Near you (${lat.toFixed(2)}°, ${lng.toFixed(2)}°)`;
}

// ── Auth UI ──────────────────────────────────────────────────
function checkAuth() {
  const user = Auth.getUser();
  const section = document.getElementById('userSection');
  if (!section) return;
  if (user) {
    section.innerHTML = `
      <div class="user-info">
        <span class="user-name">&#128100; ${user.name}</span>
        <button class="logout-btn" onclick="logout()">Logout</button>
      </div>`;
  }
}

function logout() { Auth.clear(); location.reload(); }

function openAuthModal() {
  if (!Auth.isLoggedIn()) document.getElementById('authModal').style.display = 'block';
}
function closeAuthModal() { document.getElementById('authModal').style.display = 'none'; }

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1));
  });
  document.getElementById('loginForm').classList.toggle('active',  tab === 'login');
  document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

async function handleLogin(event) {
  event.preventDefault();
  const email    = document.getElementById('loginUserId').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    Auth.setToken(res.token); Auth.setUser(res.user);
    showNotification('Login successful!');
    closeAuthModal(); checkAuth();
    // Request GPS after login so listings re-sort by proximity
    requestAndSaveLocation();
  } catch (err) { showNotification(err.message, true); }
}

async function handleSignup(event) {
  event.preventDefault();
  const payload = {
    name:     document.getElementById('signupName').value,
    email:    document.getElementById('signupEmail').value,
    phone:    document.getElementById('signupPhone').value,
    password: document.getElementById('signupPassword').value,
    role:     document.getElementById('signupRole').value,
  };
  try {
    const res = await apiFetch('/auth/signup', { method: 'POST', body: payload });
    Auth.setToken(res.token); Auth.setUser(res.user);
    showNotification('Account created!');
    closeAuthModal(); checkAuth();
    // Request GPS after signup
    requestAndSaveLocation();
  } catch (err) { showNotification(err.message, true); }
}

function handleGoogleLogin() { showNotification('Google login not configured yet.', true); }

// ── Location (pincode modal) ──────────────────────────────────
function openPincodeModal()  { document.getElementById('pincodeModal').style.display = 'block'; }
function closePincodeModal() { document.getElementById('pincodeModal').style.display = 'none'; }

async function fetchLocation() {
  const pincode   = document.getElementById('pincodeInput').value.trim();
  const resultDiv = document.getElementById('locationResult');
  if (!/^\d{6}$/.test(pincode)) { resultDiv.innerHTML = '<p style="color:#d32f2f;">Enter a valid 6-digit pincode</p>'; return; }
  resultDiv.innerHTML = '<p>Loading...</p>';
  try {
    const res  = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
    const data = await res.json();
    if (data[0].Status === 'Success') {
      const po = data[0].PostOffice[0];
      const loc = { city: po.District, state: po.State, pincode, area: po.Name };
      localStorage.setItem('userLocation', JSON.stringify(loc));
      document.getElementById('locationDisplay').textContent = `${po.District}, ${po.State}`;
      resultDiv.innerHTML = `<p style="color:#2e7d32;font-weight:600;">✓ Found: ${po.District}, ${po.State}</p>`;
      setTimeout(closePincodeModal, 1500);
    } else {
      resultDiv.innerHTML = '<p style="color:#d32f2f;">Invalid pincode.</p>';
    }
  } catch { resultDiv.innerHTML = '<p style="color:#d32f2f;">Error fetching location.</p>'; }
}

function loadSavedLocation() {
  const el = document.getElementById('locationDisplay');
  if (!el) return;
  // Prefer GPS coordinates if available
  const lat = localStorage.getItem('fb_lat');
  const lng = localStorage.getItem('fb_lng');
  if (lat && lng) {
    el.textContent = `Near you (${parseFloat(lat).toFixed(2)}°, ${parseFloat(lng).toFixed(2)}°)`;
    return;
  }
  // Fall back to pincode-based location
  const loc = JSON.parse(localStorage.getItem('userLocation') || 'null');
  if (loc) el.textContent = `${loc.city}, ${loc.state}`;
}

// ── Listing type switcher ────────────────────────────────────
function switchListingType(type) {
  currentListingType = type;
  document.querySelectorAll('.listing-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  const ct = document.getElementById('commodityTitle');
  const dt = document.getElementById('dealsTitle');
  if (ct) ct.textContent = type === 'seller' ? 'Seller Commodity Listings' : 'Buyer Requirements';
  if (dt) dt.innerHTML  = type === 'seller'
    ? 'Available Products from <span class="highlight">Sellers</span>'
    : 'Active Buyer <span class="highlight">Requests</span>';
  loadCommodityData();
  loadProducts();
}

// ── Dropdowns ────────────────────────────────────────────────
function initializeDropdowns() {
  const dropdowns = document.querySelectorAll('.nav-dropdown');
  dropdowns.forEach(d => {
    d.querySelector('.dropdown-toggle')?.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdowns.forEach(o => { if (o !== d) o.classList.remove('active'); });
      d.classList.toggle('active');
    });
  });
  document.addEventListener('click', () => dropdowns.forEach(d => d.classList.remove('active')));
}

function searchCrop(cropName) {
  event.preventDefault(); event.stopPropagation();
  document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('active'));
  currentSearchQuery = cropName; currentCategoryFilter = null;
  document.getElementById('searchInput').value = cropName;
  hideCategoryBadge();
  loadCommodityData(); loadProducts();
  document.querySelector('.deals-section')?.scrollIntoView({ behavior: 'smooth' });
}

function filterByCategory(category, e) {
  if (e) e.stopPropagation();
  document.querySelectorAll('.nav-dropdown').forEach(d => d.classList.remove('active'));
  currentCategoryFilter = category; currentSearchQuery = null;
  document.getElementById('searchInput').value = '';
  document.getElementById('activeCategoryBadge').style.display = 'inline-flex';
  document.getElementById('activeCategoryLabel').textContent = category;
  document.getElementById('dealsTitle').innerHTML = `Listings in <span class="highlight">${category}</span>`;
  loadCommodityData(); loadProducts();
  document.querySelector('.deals-section')?.scrollIntoView({ behavior: 'smooth' });
}

function clearCategoryFilter() {
  currentCategoryFilter = null; hideCategoryBadge();
  document.getElementById('dealsTitle').innerHTML = currentListingType === 'seller'
    ? 'Available Products from <span class="highlight">Sellers</span>'
    : 'Active Buyer <span class="highlight">Requests</span>';
  loadCommodityData(); loadProducts();
}

function hideCategoryBadge() { document.getElementById('activeCategoryBadge').style.display = 'none'; }

// ── Load products from API (with geo-sorting) ─────────────────
async function loadProducts(filterCity = null, searchQuery = null) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#888;">Loading...</div>';

  const q = searchQuery || currentSearchQuery;
  const c = filterCity  || currentCityFilter;

  try {
    let data;
    if (currentListingType === 'seller') {
      const params = {};
      if (q) params.crop = q;
      if (c) params.city = c;
      params.lang = localStorage.getItem('fb_lang') || 'en';  // ← E3a: pass user's language
      // Use geo:true so api.js auto-appends lat/lng/radius from localStorage
      data = await apiFetch('/listings/?' + new URLSearchParams(params), { geo: true });
    } else {
      const params = {};
      if (q) params.crop = q;
      if (c) params.city = c;
      data = await apiFetch('/requests/?' + new URLSearchParams(params));
    }

    // Apply category filter client-side
    if (currentCategoryFilter) {
      const keywords = categoryMap[currentCategoryFilter] || [];
      data = data.filter(item =>
        keywords.some(kw => (item.crop_name || '').toLowerCase().includes(kw))
      );
    }

    renderProducts(data);
    renderCommodityTable(data);
  } catch (err) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#e53935;">${err.message}</div>`;
  }
}

function renderProducts(data) {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  if (data.length === 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#666;">
        <p>No listings found.</p>
        <button onclick="clearFilters()" style="margin-top:20px;padding:10px 20px;background:#1a5490;color:white;border:none;border-radius:5px;cursor:pointer;">Show All</button>
      </div>`;
    return;
  }

  const hasLocation = !!localStorage.getItem('fb_lat');

  grid.innerHTML = '';
  data.forEach(item => {
    if (currentListingType === 'seller') {
      const imgUrl = item.image || item.primary_image || item.image_data || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"%3E%3Crect fill="%23e0e0e0" width="200" height="200"/%3E%3Ctext x="100" y="100" font-size="40" text-anchor="middle" dy=".3em"%3E🌾%3C/text%3E%3C/svg%3E';
      // Show distance badge if available
      const distanceBadge = (hasLocation && item.distance_km != null)
        ? `<span style="background:#e0f2fe;color:#0369a1;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700;">📍 ${item.distance_km.toFixed(1)} km away</span>`
        : `<span style="font-size:12px;color:#888;">📍 ${item.city || ''}</span>`;

      grid.innerHTML += `
        <div class="product-card" style="cursor:pointer;" onclick="goToListing(${item.id})">
          <img src="${imgUrl}" alt="${item.crop_name}" style="width:100%;height:180px;object-fit:cover;">
          <div class="product-info">
            <h3 data-t>${item.crop_name}</h3>
            <p class="price">₹${item.price}/kg</p>
            <p class="location" style="margin-bottom:8px;">${distanceBadge}</p>
            <p style="font-size:12px;color:#888;margin-bottom:10px;">Available: ${item.amount} ${item.unit || 'kg'}</p>
            <button class="contact-btn" onclick="goToListing(${item.id}); event.stopPropagation();">Contact Seller</button>
          </div>
        </div>`;
    } else {
      grid.innerHTML += `
        <div class="product-card request-card" style="cursor:pointer;border-top:4px solid #1a5490;" onclick="goToRequest(${item.id})">
          <div class="product-info" style="padding:25px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
              <span style="background:#e0f2fe;color:#0284c7;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:700;">BUYING</span>
              <span style="color:#666;font-size:12px;">${new Date(item.created_at).toLocaleDateString()}</span>
            </div>
            <h3 style="font-size:20px;margin-bottom:15px;">${item.crop_name}</h3>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px;font-size:14px;">
              <span style="color:#666;">Budget:</span>
              <span style="font-weight:700;color:#1a5490;">₹${item.budget}/kg</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:15px;font-size:14px;">
              <span style="color:#666;">Quantity:</span>
              <span style="font-weight:700;">${item.amount_required} kg</span>
            </div>
            <p class="location" style="margin-bottom:20px;">📍 ${item.city || ''}</p>
            <button class="contact-btn" style="background-color:#1a5490;" onclick="goToRequest(${item.id}); event.stopPropagation();">View Request</button>
          </div>
        </div>`;
    }
  });

  // ← E3a: translate dynamically injected product card names
  if (typeof SiteTranslate !== 'undefined') {
    SiteTranslate.translateDynamic(grid);
  }
}

function goToListing(id) {
  localStorage.setItem('viewListingId', id);
  window.location.href = 'Product_Page.html';
}

function goToRequest(id) {
  localStorage.setItem('viewRequestId', id);
  window.location.href = 'Request_Page.html';
}

// ── Commodity table ───────────────────────────────────────────
function renderCommodityTable(data) {
  const body = document.getElementById('commodityBody');
  const head = document.getElementById('commodityTableHead');
  if (!body || !head) return;

  const hasLocation = !!localStorage.getItem('fb_lat');

  if (currentListingType === 'seller') {
    head.innerHTML = `<tr><th>Crop</th><th>City</th>${hasLocation ? '<th>Distance</th>' : ''}<th>Amount</th><th>Price</th><th>Seller</th></tr>`;
    body.innerHTML = data.length === 0
      ? '<tr><td colspan="6" style="text-align:center;padding:30px;color:#999;">No listings found.</td></tr>'
      : data.map(i => `
          <tr>
            <td><a href="#" onclick="goToListing(${i.id})">${i.crop_name}</a></td>
            <td>${i.city || ''}</td>
            ${hasLocation && i.distance_km != null ? `<td style="color:#0369a1;font-weight:600;">${i.distance_km.toFixed(1)} km</td>` : (hasLocation ? '<td>-</td>' : '')}
            <td>${i.amount} ${i.unit || 'kg'}</td>
            <td>₹${i.price}/kg</td>
            <td>${i.seller_name || 'Seller'}</td>
          </tr>`).join('');
  } else {
    head.innerHTML = '<tr><th>Crop</th><th>City</th><th>Amount Required</th><th>Budget</th><th>Buyer</th></tr>';
    body.innerHTML = data.length === 0
      ? '<tr><td colspan="5" style="text-align:center;padding:30px;color:#999;">No requests found.</td></tr>'
      : data.map(i => `
          <tr>
            <td><a href="#" onclick="goToRequest(${i.id})">${i.crop_name}</a></td>
            <td>${i.city || ''}</td>
            <td>${i.amount_required} kg</td>
            <td>₹${i.budget}/kg</td>
            <td>${i.buyer_name || 'Buyer'}</td>
          </tr>`).join('');
  }
}

function loadCommodityData() { loadProducts(currentCityFilter, currentSearchQuery); }

// ── Cart sidebar ──────────────────────────────────────────────
function openCartSidebar() { renderCartSidebar(); document.getElementById('cartSidebar')?.classList.add('open'); document.getElementById('cartOverlay')?.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCartSidebar() { document.getElementById('cartSidebar')?.classList.remove('open'); document.getElementById('cartOverlay')?.classList.remove('open'); document.body.style.overflow = ''; }

function renderCartSidebar() {
  const cart   = JSON.parse(localStorage.getItem('fb_cart') || '[]');
  const items  = document.getElementById('cartSidebarItems');
  const footer = document.getElementById('cartSidebarFooter');
  if (!items) return;

  if (cart.length === 0) {
    items.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-basket" style="font-size:48px;color:#ddd;margin-bottom:15px;"></i><p>Your cart is empty</p></div>';
    if (footer) footer.style.display = 'none';
    return;
  }

  let total = 0;
  items.innerHTML = cart.map((item, index) => {
    const t = (item.price || 0) * (item.quantity || 1);
    total += t;
    const img = item.image
      ? `<img src="${item.image}" alt="${item.name}" class="cart-item-img">`
      : `<div class="cart-item-img" style="display:flex;align-items:center;justify-content:center;background:#e0f2fe;color:#0284c7;font-weight:bold;font-size:24px;">R</div>`;
    return `
      <div class="cart-item">
        ${img}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${item.seller_name || ''}</div>
        </div>
        <div class="cart-item-right">
          <div class="cart-item-total">${item.price ? '₹' + t : 'Request'}</div>
          <button class="cart-item-remove" onclick="removeCartItem(${index})"><i class="fas fa-trash"></i></button>
        </div>
      </div>`;
  }).join('');

  const totalEl = document.getElementById('cartSidebarTotal');
  if (totalEl) totalEl.textContent = '₹' + total;
  if (footer) footer.style.display = 'block';
}

function removeCartItem(index) {
  const cart = JSON.parse(localStorage.getItem('fb_cart') || '[]');
  cart.splice(index, 1);
  localStorage.setItem('fb_cart', JSON.stringify(cart));
  updateCartCount(); renderCartSidebar();
}

function updateCartCount() {
  const cart  = JSON.parse(localStorage.getItem('fb_cart') || '[]');
  const total = cart.reduce((s, i) => s + (i.quantity || 1), 0);
  const badge = document.getElementById('cartCount');
  if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'flex' : 'none'; }
}

// ── City filter ───────────────────────────────────────────────
function filterByCity(city) { currentCityFilter = city; loadProducts(city, currentSearchQuery); document.querySelector('.deals-section')?.scrollIntoView({ behavior: 'smooth' }); }

function clearFilters() {
  currentCityFilter = null; currentSearchQuery = null; currentCategoryFilter = null;
  document.getElementById('searchInput').value = '';
  hideCategoryBadge();
  document.getElementById('dealsTitle').innerHTML = 'Grab the best deal on <span class="highlight">Crops</span>';
  loadCommodityData(); loadProducts();
}

function scrollCities(direction) {
  const el = document.getElementById('citiesScroll');
  el?.scrollBy({ left: direction === 'left' ? -200 : 200, behavior: 'smooth' });
}

function performSearch() {
  const q = document.getElementById('searchInput').value.trim();
  currentSearchQuery = q; currentCategoryFilter = null; hideCategoryBadge();
  loadCommodityData(); loadProducts(currentCityFilter, q);
  document.querySelector('.deals-section')?.scrollIntoView({ behavior: 'smooth' });
}

window.onclick = (event) => {
  if (event.target === document.getElementById('authModal'))    closeAuthModal();
  if (event.target === document.getElementById('pincodeModal')) closePincodeModal();
};

// ── Init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initializeDropdowns();
  checkAuth();
  updateCartCount();

  const saved = localStorage.getItem('searchQuery');
  if (saved) {
    currentSearchQuery = saved;
    const si = document.getElementById('searchInput');
    if (si) si.value = saved;
    localStorage.removeItem('searchQuery');
  }

  loadSavedLocation();

  // Request GPS on page load — if granted, listings auto-reload with geo-sorting
  requestAndSaveLocation();

  // Initial load (will be re-triggered by requestAndSaveLocation if GPS is granted)
  loadProducts();

  document.getElementById('searchInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
});
