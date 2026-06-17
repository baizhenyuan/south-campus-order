const list = document.querySelector("#orderList");
const refreshButton = document.querySelector("#refreshButton");

window.__orderAdminBooted = true;

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function money(value) {
  return `¥${Number(value || 0)}`;
}

function renderOrders(orders) {
  if (!orders.length) {
    list.innerHTML = '<div class="empty-state">还没有收到订单。</div>';
    return;
  }

  list.innerHTML = orders.map((order) => {
    const items = order.items || [];
    const customFood = order.customFood ? `<p class="custom-food">另想吃：${escapeHtml(order.customFood)}</p>` : "";
    const note = order.note ? escapeHtml(order.note) : "没有备注";

    return `
      <article class="report-card">
        <div class="report-topline">
          <strong>${escapeHtml(order.mood || "想吃点东西")}</strong>
          <time>${formatTime(order.createdAt)}</time>
        </div>
        <div class="order-summary">
          <span>${escapeHtml(order.fulfillment || "未选择安排方式")}</span>
          <strong>${money(order.total)}</strong>
        </div>
        <ul class="order-items">
          ${items.map((item) => `
            <li>
              <span>${escapeHtml(item.name)} × ${item.qty}</span>
              <small>${escapeHtml(item.restaurant)} · ${money(item.price * item.qty)}</small>
            </li>
          `).join("")}
        </ul>
        ${customFood}
        <dl>
          <div>
            <dt>备注</dt>
            <dd>${note}</dd>
          </div>
        </dl>
      </article>
    `;
  }).join("");
}

async function loadOrders() {
  refreshButton.disabled = true;
  try {
    const key = new URLSearchParams(window.location.search).get("key") || "";
    const response = await fetch("/api/orders", {
      cache: "no-store",
      headers: key ? { "X-Admin-Key": key } : {}
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    renderOrders(result.orders || []);
  } catch {
    list.innerHTML = '<div class="empty-state">暂时读不到订单。</div>';
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener("click", loadOrders);
loadOrders();
setInterval(loadOrders, 15000);
