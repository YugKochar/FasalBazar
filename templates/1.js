const products = {
    staples: [
        {
            id: 1,
            name: "Maize",
            price: 50,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23FDB913" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🌽%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 2,
            name: "Rice",
            price: 90,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23F5F5DC" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🍚%3C/text%3E%3C/svg%3E',
            rating: 5,
        },
        {
            id: 3,
            name: "Wheat",
            price: 45,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23D2691E" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🌾%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 4,
            name: "Soybeans",
            price: 18,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23D4A574" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🫘%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
    ],
    fresh: [
        {
            id: 5,
            name: "Tomatoes",
            price: 30,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23FF6347" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🍅%3C/text%3E%3C/svg%3E',
            rating: 5,
        },
        {
            id: 6,
            name: "Potatoes",
            price: 25,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23D2B48C" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🥔%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 7,
            name: "Onions",
            price: 35,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23E6D5C3" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🧅%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 8,
            name: "Carrots",
            price: 40,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23FF8C00" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🥕%3C/text%3E%3C/svg%3E',
            rating: 5,
        },
    ],
    industrial: [
        {
            id: 9,
            name: "Cotton",
            price: 60,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23F0F0F0" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🌿%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 10,
            name: "Sugarcane",
            price: 20,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23C4B454" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🎋%3C/text%3E%3C/svg%3E',
            rating: 4,
        },
        {
            id: 11,
            name: "Jute",
            price: 55,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23B8956A" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🌾%3C/text%3E%3C/svg%3E',
            rating: 3,
        },
        {
            id: 12,
            name: "Tea Leaves",
            price: 85,
            unit: "kg",
            image:
                'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%2385BB65" width="200" height="200"/%3E%3Ctext x="100" y="120" font-size="80" text-anchor="middle"%3E🍃%3C/text%3E%3C/svg%3E',
            rating: 5,
        },
    ],
};

let cart = JSON.parse(localStorage.getItem('fasalCart') || '[]');
let currentCategory = "staples";

// Check if user is logged in
function checkAuth() {
    const user = JSON.parse(localStorage.getItem('fasalUser') || 'null');
    if (user) {
        updateUserIcon(user);
    }
}

function updateUserIcon(user) {
    const userIconBtn = document.getElementById('userIconBtn');
    userIconBtn.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; position: relative;">
            <i class="fas fa-user"></i>
            <div class="user-menu" style="display: none;">
                <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); position: absolute; top: 45px; right: 0; min-width: 180px;">
                    <div style="padding: 10px; border-bottom: 1px solid #eee; font-size: 14px; color: #333;">
                        <strong>${user.name}</strong><br>
                        <small>${user.email}</small>
                    </div>
                    <a href="#" onclick="logout()" style="display: block; padding: 10px; color: #e74c3c; text-decoration: none; font-size: 14px;">Logout</a>
                </div>
            </div>
        </div>
    `;
    
    userIconBtn.onclick = function(e) {
        e.stopPropagation();
        const menu = userIconBtn.querySelector('.user-menu');
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    };
}

function logout() {
    localStorage.removeItem('fasalUser');
    location.reload();
}

// Search crop from dropdown
function searchCrop(cropName) {
    event.preventDefault();
    event.stopPropagation();
    localStorage.setItem('searchQuery', cropName);
    // Close dropdown
    document.querySelector('.dropdown').classList.remove('active');
    // Small delay for visual feedback
    setTimeout(() => {
        window.location.href = 'index.html';
    }, 100);
}

// Authentication Modal Functions
function openAuthModal() {
    const user = JSON.parse(localStorage.getItem('fasalUser') || 'null');
    if (!user) {
        document.getElementById('authModal').style.display = 'block';
    }
}

function closeAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function switchAuthTab(tab) {
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabs = document.querySelectorAll('.auth-tab');
    
    tabs.forEach(t => t.classList.remove('active'));
    
    if (tab === 'login') {
        loginForm.classList.add('active');
        signupForm.classList.remove('active');
        tabs[0].classList.add('active');
    } else {
        signupForm.classList.add('active');
        loginForm.classList.remove('active');
        tabs[1].classList.add('active');
    }
}

function handleLogin(event) {
    event.preventDefault();
    
    const userId = document.getElementById('loginUserId').value;
    const password = document.getElementById('loginPassword').value;
    
    // Get stored users
    const users = JSON.parse(localStorage.getItem('fasalUsers') || '[]');
    
    // Find user
    const user = users.find(u => 
        (u.userId === userId || u.email === userId) && u.password === password
    );
    
    if (user) {
        // Store logged in user
        localStorage.setItem('fasalUser', JSON.stringify({
            name: user.name,
            email: user.email,
            userId: user.userId,
            role: user.role
        }));
        
        showNotification('Login successful!');
        closeAuthModal();
        checkAuth();
    } else {
        alert('Invalid credentials. Please try again.');
    }
}

function handleSignup(event) {
    event.preventDefault();
    
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const phone = document.getElementById('signupPhone').value;
    const userId = document.getElementById('signupUserId').value;
    const password = document.getElementById('signupPassword').value;
    const role = document.getElementById('signupRole').value;
    
    // Get stored users
    const users = JSON.parse(localStorage.getItem('fasalUsers') || '[]');
    
    // Check if user already exists
    const existingUser = users.find(u => u.userId === userId || u.email === email);
    
    if (existingUser) {
        alert('User ID or Email already exists. Please use a different one.');
        return;
    }
    
    // Create new user
    const newUser = {
        name,
        email,
        phone,
        userId,
        password,
        role,
        createdAt: new Date().toISOString()
    };
    
    // Add to users array
    users.push(newUser);
    localStorage.setItem('fasalUsers', JSON.stringify(users));
    
    // Auto login
    localStorage.setItem('fasalUser', JSON.stringify({
        name,
        email,
        userId,
        role
    }));
    
    showNotification('Account created successfully!');
    closeAuthModal();
    checkAuth();
}

function handleGoogleLogin() {
    // Simulated Google OAuth
    // In production, this would integrate with Google OAuth 2.0
    const mockGoogleUser = {
        name: 'Google User',
        email: 'user@gmail.com',
        userId: 'google_' + Date.now(),
        role: 'buyer',
        authProvider: 'google'
    };
    
    localStorage.setItem('fasalUser', JSON.stringify(mockGoogleUser));
    showNotification('Logged in with Google!');
    closeAuthModal();
    checkAuth();
}

function displayProducts(category) {
    const grid = document.getElementById("productsGrid");
    grid.innerHTML = "";

    products[category].forEach((product) => {
        const stars =
            "★".repeat(product.rating) + "☆".repeat(5 - product.rating);
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
                    <img src="${product.image}" alt="${product.name}" class="product-image" onclick="viewProduct(${product.id}, '${category}')" style="cursor: pointer;">
                    <div class="product-info">
                        <div class="product-name">${product.name}</div>
                        <div class="product-rating">${stars}</div>
                        <div class="product-footer">
                            <div class="product-price">₹${product.price}/${product.unit}</div>
                            <button class="add-to-cart" onclick="addToCart(${product.id}, '${category}'); event.stopPropagation();">+</button>
                        </div>
                    </div>
                `;
        grid.appendChild(card);
    });
}

function viewProduct(productId, category) {
    const product = products[category].find(p => p.id === productId);
    localStorage.setItem('currentProduct', JSON.stringify(product));
    window.location.href = 'Product_Page.html';
}

function filterProducts(category) {
    currentCategory = category;
    document
        .querySelectorAll(".category-tab")
        .forEach((tab) => tab.classList.remove("active"));
    event.target.classList.add("active");
    displayProducts(category);
}

function addToCart(productId, category) {
    const product = products[category].find((p) => p.id === productId);
    const existingItem = cart.find((item) => item.id === productId);

    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({ ...product, quantity: 1 });
    }

    localStorage.setItem('fasalCart', JSON.stringify(cart));
    updateCartDisplay();
    showNotification(`${product.name} added to cart!`);
}

function updateCartDisplay() {
    const cartItemsDiv = document.getElementById("cartItems");
    const cartTotalDiv = document.getElementById("cartTotal");

    if (cart.length === 0) {
        cartItemsDiv.innerHTML =
            '<p style="text-align: center; color: #999;">Your cart is empty</p>';
        cartTotalDiv.textContent = "₹0";
        return;
    }

    let total = 0;
    cartItemsDiv.innerHTML = "";

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;

        const itemDiv = document.createElement("div");
        itemDiv.style.cssText =
            "display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 1px solid #eee;";
        itemDiv.innerHTML = `
                    <div>
                        <div style="font-weight: 600;">${item.name}</div>
                        <div style="color: #666; font-size: 14px;">₹${item.price}/${item.unit} × ${item.quantity}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div style="font-weight: 600;">₹${itemTotal}</div>
                        <button onclick="removeFromCart(${index})" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">Remove</button>
                    </div>
                `;
        cartItemsDiv.appendChild(itemDiv);
    });

    cartTotalDiv.textContent = `₹${total}`;
}

function removeFromCart(index) {
    cart.splice(index, 1);
    localStorage.setItem('fasalCart', JSON.stringify(cart));
    updateCartDisplay();
}

function showNotification(message) {
    const notification = document.createElement("div");
    notification.textContent = message;
    notification.style.cssText =
        "position: fixed; top: 20px; right: 20px; background: #5a8c2e; color: white; padding: 15px 25px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.2); z-index: 2000; animation: slideInRight 0.3s;";
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = "slideOutRight 0.3s";
        setTimeout(() => notification.remove(), 300);
    }, 2000);
}

function closeCart() {
    document.getElementById("cartModal").style.display = "none";
}

function checkout() {
    if (cart.length === 0) {
        alert("Your cart is empty!");
        return;
    }
    window.location.href = 'checkout.html';
}

// Search functionality
document.getElementById("searchButton").addEventListener("click", () => {
    const query = document.getElementById("searchInput").value.trim();
    if (query) {
        localStorage.setItem('searchQuery', query);
        window.location.href = 'index.html';
    } else {
        alert('Please enter a crop name to search');
    }
});

document.getElementById("searchInput").addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
        const query = e.target.value.trim();
        if (query) {
            localStorage.setItem('searchQuery', query);
            window.location.href = 'index.html';
        } else {
            alert('Please enter a crop name to search');
        }
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const authModal = document.getElementById('authModal');
    const cartModal = document.getElementById('cartModal');
    
    if (event.target === authModal) {
        closeAuthModal();
    }
    if (event.target === cartModal) {
        closeCart();
    }
    
    // Close user menu
    const userMenus = document.querySelectorAll('.user-menu');
    userMenus.forEach(menu => {
        if (!menu.contains(event.target)) {
            menu.style.display = 'none';
        }
    });
}

// Initialize
displayProducts("staples");
checkAuth();
initializeDropdown();

// Dropdown functionality
function initializeDropdown() {
    const dropdown = document.querySelector('.dropdown');
    const dropdownToggle = document.querySelector('.dropdown-toggle');
    
    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('active');
        });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!dropdown.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
    
    // Keep dropdown open when clicking inside it
    const dropdownMenu = document.querySelector('.dropdown-menu');
    if (dropdownMenu) {
        dropdownMenu.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
}

// Add CSS animations
const style = document.createElement("style");
style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOutRight {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
document.head.appendChild(style);
