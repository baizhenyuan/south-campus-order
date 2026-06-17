const form = document.querySelector("#orderForm");
const statusEl = document.querySelector("#status");
const menuList = document.querySelector("#menuList");
const cartList = document.querySelector("#cartList");
const cartTotal = document.querySelector("#cartTotal");
const categoryTabs = document.querySelector("#categoryTabs");
const searchInput = document.querySelector("#searchInput");
const menuCount = document.querySelector("#menuCount");

window.__orderAppBooted = true;

const accessKey = new URLSearchParams(window.location.search).get("key") || localStorage.getItem("orderAccessKey") || "";
if (accessKey) {
  localStorage.setItem("orderAccessKey", accessKey);
}

const state = {
  menu: null,
  category: "全部",
  query: "",
  mood: "想吃热乎的",
  fulfillment: "你来送",
  cart: new Map()
};

function money(value) {
  return `¥${Number(value || 0)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function menuItems() {
  if (!state.menu) return [];
  return state.menu.restaurants.flatMap((restaurant) =>
    restaurant.items.map((item) => ({
      ...item,
      restaurantId: restaurant.id,
      restaurant: restaurant.name,
      area: restaurant.area,
      category: restaurant.category,
      tags: restaurant.tags || []
    }))
  );
}

function filteredItems() {
  const query = state.query.trim().toLowerCase();
  return menuItems().filter((item) => {
    const inCategory = state.category === "全部" || item.category === state.category;
    const haystack = [item.name, item.restaurant, item.area, item.category, item.desc, ...item.tags].join(" ").toLowerCase();
    return inCategory && (!query || haystack.includes(query));
  });
}

function renderTabs() {
  categoryTabs.innerHTML = state.menu.categories.map((category) => `
    <button type="button" class="tab ${category === state.category ? "active" : ""}" data-category="${escapeHtml(category)}">
      ${escapeHtml(category)}
    </button>
  `).join("");
}

function renderMenu() {
  const items = filteredItems();
  menuCount.textContent = `${items.length} 个选择`;

  if (!items.length) {
    menuList.innerHTML = '<div class="empty-state">没有找到这个口味。</div>';
    return;
  }

  menuList.innerHTML = items.map((item) => {
    const inCart = state.cart.get(item.id);
    return `
      <article class="menu-card">
        <div class="menu-card-main">
          <div class="menu-meta">
            <span>${escapeHtml(item.category)}</span>
            <span>${escapeHtml(item.area)}</span>
          </div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.restaurant)} · ${escapeHtml(item.desc)}</p>
          <div class="tag-row">
            ${item.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
          </div>
        </div>
        <div class="menu-action">
          <strong>${money(item.price)}</strong>
          <button type="button" class="add-button" data-item-id="${escapeHtml(item.id)}">
            ${inCart ? `已加 ${inCart.qty}` : "加一份"}
          </button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCart() {
  const items = Array.from(state.cart.values());
  const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  cartTotal.textContent = money(total);

  if (!items.length) {
    cartList.innerHTML = '<div class="cart-empty">还没点菜。</div>';
    return;
  }

  cartList.innerHTML = items.map((item) => `
    <div class="cart-row">
      <div>
        <strong>${escapeHtml(item.name)}</strong>
        <span>${escapeHtml(item.restaurant)} · ${money(item.price)}</span>
      </div>
      <div class="stepper" aria-label="${escapeHtml(item.name)} 数量">
        <button type="button" data-step="-1" data-item-id="${escapeHtml(item.id)}">−</button>
        <span>${item.qty}</span>
        <button type="button" data-step="1" data-item-id="${escapeHtml(item.id)}">+</button>
      </div>
    </div>
  `).join("");
}

function renderAll() {
  renderTabs();
  renderMenu();
  renderCart();
}

function addItem(id) {
  const item = menuItems().find((entry) => entry.id === id);
  if (!item) return;
  const current = state.cart.get(id);
  state.cart.set(id, {
    id: item.id,
    restaurant: item.restaurant,
    name: item.name,
    price: item.price,
    qty: current ? Math.min(9, current.qty + 1) : 1
  });
  renderMenu();
  renderCart();
}

function stepItem(id, delta) {
  const current = state.cart.get(id);
  if (!current) return;
  const nextQty = current.qty + delta;
  if (nextQty <= 0) {
    state.cart.delete(id);
  } else {
    state.cart.set(id, { ...current, qty: Math.min(9, nextQty) });
  }
  renderMenu();
  renderCart();
}

document.querySelectorAll("[data-choice-group]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest(".choice");
    if (!button) return;

    group.querySelectorAll(".choice").forEach((item) => item.classList.remove("selected"));
    button.classList.add("selected");
    state[group.dataset.choiceGroup] = button.dataset.value;
  });
});

categoryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category;
  renderTabs();
  renderMenu();
});

searchInput.addEventListener("input", () => {
  state.query = searchInput.value;
  renderMenu();
});

menuList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-item-id]");
  if (!button) return;
  addItem(button.dataset.itemId);
});

cartList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-step]");
  if (!button) return;
  stepItem(button.dataset.itemId, Number(button.dataset.step));
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  statusEl.textContent = "发送中...";

  const payload = {
    mood: state.mood,
    fulfillment: state.fulfillment,
    items: Array.from(state.cart.values()),
    customFood: document.querySelector("#customFood").value,
    note: document.querySelector("#note").value
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Key": accessKey
      },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "发送失败");

    statusEl.textContent = "订单已发给你。";
    state.cart.clear();
    document.querySelector("#customFood").value = "";
    document.querySelector("#note").value = "";
    renderAll();
  } catch (error) {
    statusEl.textContent = error.message || "发送失败，请稍后再试。";
  }
});

async function boot() {
  try {
    const response = await fetch("/menu.json", {
      cache: "no-store",
      headers: accessKey ? { "X-Access-Key": accessKey } : {}
    });
    if (!response.ok) throw new Error("菜单需要口令");
    state.menu = await response.json();
    renderAll();
  } catch {
    menuList.innerHTML = '<div class="empty-state">菜单暂时加载失败。</div>';
  }
}

boot();
