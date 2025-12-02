// ============================================================
// Homepage.js  —  wired to Flask backend
// Requires: api.js loaded first
// ============================================================

// ── Static featured products (displayed on homepage hero) ───
const featuredProducts = {
  staples: [
    { id: 's1', name: 'Corn',      price: 50,  unit: 'kg', image: 'Corn.jpeg',      rating: 4 },
    { id: 's2', name: 'Rice',      price: 90,  unit: 'kg', image: 'rice.jpg',        rating: 5 },
    { id: 's3', name: 'Wheat',     price: 45,  unit: 'kg', image: 'Wheat.Webp',      rating: 4 },
    { id: 's4', name: 'Soybeans',  price: 18,  unit: 'kg', image: 'Soybeans.jpeg',   rating: 4 },
  ],
  fresh: [
    { id: 'f1', name: 'Tomatoes',  price: 30,  unit: 'kg', image: 'Tomatoes.jpeg',   rating: 5 },
    { id: 'f2', name: 'Potatoes',  price: 25,  unit: 'kg', image: 'Potatoes.jpeg',   rating: 4 },
    { id: 'f3', name: 'Onions',    price: 35,  unit: 'kg', image: 'Onion.jpeg',       rating: 4 },
    { id: 'f4', name: 'Carrots',   price: 40,  unit: 'kg', image: 'Carrot.jpeg',      rating: 5 },
  ],
  industrial: [
    { id: 'i1', name: 'Cotton',    price: 60,  unit: 'kg', image: 'Cotton.Webp',      rating: 4 },
    { id: 'i2', name: 'Sugarcane', price: 20,  unit: 'kg', image: 'sugarcane.jpeg',   rating: 4 },
    { id: 'i3', name: 'Jute',      price: 55,  unit: 'kg', image: 'Jute.jpeg',         rating: 3 },
    { id: 'i4', name: 'Tea Leaves',price: 85,  unit: 'kg', image: 'Tea Leaves.jpeg',  rating: 5 },
  ],
};

// ── Auth UI ──────────────────────────────────────────────────
function checkAuth() {
  const user = Auth.getUser();
  if (user) updateUserIcon(user);
}

function updateUserIcon(user) {
  const btn = document.getElementById('userIconBtn');
  if (!btn) return; // ← guard: element may not exist on this page
  btn.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;position:relative;">
      <i class="fas fa-user"></i>
      <div class="user-menu" style="display:none;">
        <div style="padding:10px;background:white;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);position:absolute;top:45px;right:0;min-width:180px;">
          <div style="padding:10px;border-bottom:1px solid #eee;font-size:14px;color:#333;">
            <strong>${user.name}</strong><br><small>${user.email}</small>
          </div>
          <a href="#" onclick="logout()" style="display:block;padding:10px;color:#e74c3c;text-decoration:none;font-size:14px;">Logout</a>
        </div>
      </div>
    </div>`;
  btn.onclick = (e) => {
    e.stopPropagation();
    const m = btn.querySelector('.user-menu');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  };
}

function logout() {
  Auth.clear();
  location.reload();
}

function openAuthModal() {
  if (!Auth.isLoggedIn()) document.getElementById('authModal').style.display = 'block';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'signup' && i === 1));
  });
  document.getElementById('loginForm').classList.toggle('active',  tab === 'login');
  document.getElementById('signupForm').classList.toggle('active', tab === 'signup');
}

// ── Login (calls /api/auth/login) ────────────────────────────
async function handleLogin(event) {
  event.preventDefault();
  const email    = document.getElementById('loginUserId').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    Auth.setToken(res.token);
    Auth.setUser(res.user);
    showNotification('Login successful!');
    closeAuthModal();
    checkAuth();
  } catch (err) {
    showNotification(err.message, true);
  }
}

// ── Signup (calls /api/auth/signup) ──────────────────────────
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
    Auth.setToken(res.token);
    Auth.setUser(res.user);
    showNotification('Account created successfully!');
    closeAuthModal();
    checkAuth();
  } catch (err) {
    showNotification(err.message, true);
  }
}

function handleGoogleLogin() {
  showNotification('Google login is not yet configured.', true);
}

// ── Search ───────────────────────────────────────────────────
function searchCrop(cropName) {
  event.preventDefault();
  event.stopPropagation();
  localStorage.setItem('searchQuery', cropName);
  document.querySelector('.dropdown').classList.remove('active');
  setTimeout(() => { window.location.href = 'index.html'; }, 100);
}

document.getElementById('searchButton').addEventListener('click', () => {
  const q = document.getElementById('searchInput').value.trim();
  if (q) { localStorage.setItem('searchQuery', q); window.location.href = 'index.html'; }
  else alert('Please enter a crop name to search');
});

document.getElementById('searchInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    if (q) { localStorage.setItem('searchQuery', q); window.location.href = 'index.html'; }
  }
});

// ── Product grid (static featured section) ───────────────────
function displayProducts(category) {
  const grid = document.getElementById('productsGrid');
  grid.innerHTML = '';
  featuredProducts[category].forEach((p) => {
    const stars = '★'.repeat(p.rating) + '☆'.repeat(5 - p.rating);
    const card  = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <img src="${p.image}" alt="${p.name}" class="product-image"
           onclick="searchCropAndGo('${p.name}')" style="cursor:pointer;">
      <div class="product-info">
        <div class="product-name">${p.name}</div>
        <div class="product-rating">${stars}</div>
        <div class="product-footer">
          <div class="product-price">₹${p.price}/${p.unit}</div>
          <button class="add-to-cart"
            onclick="searchCropAndGo('${p.name}'); event.stopPropagation();">+</button>
        </div>
      </div>`;
    grid.appendChild(card);
  });
}

function searchCropAndGo(name) {
  localStorage.setItem('searchQuery', name);
  window.location.href = 'index.html';
}

function filterProducts(category) {
  document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  displayProducts(category);
}

// ── Cart (read-only display, actual cart managed in checkout) ─
function closeCart() {
  document.getElementById('cartModal').style.display = 'none';
}

function checkout() {
  window.location.href = 'checkout.html';
}

// ── Dropdown ─────────────────────────────────────────────────
function initializeDropdown() {
  const dropdown = document.querySelector('.dropdown');
  const toggle   = document.querySelector('.dropdown-toggle');
  if (toggle) {
    toggle.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); dropdown.classList.toggle('active'); });
  }
  document.addEventListener('click', (e) => { if (!dropdown.contains(e.target)) dropdown.classList.remove('active'); });
  document.querySelector('.dropdown-menu')?.addEventListener('click', (e) => e.stopPropagation());
}

// ── Close modals on outside click ────────────────────────────
window.onclick = (event) => {
  if (event.target === document.getElementById('authModal')) closeAuthModal();
  if (event.target === document.getElementById('cartModal'))  closeCart();
  document.querySelectorAll('.user-menu').forEach(m => {
    if (!m.contains(event.target)) m.style.display = 'none';
  });
};

// ── Init ─────────────────────────────────────────────────────
displayProducts('staples');
checkAuth();
initializeDropdown();
