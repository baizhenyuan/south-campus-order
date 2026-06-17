const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const ACCESS_KEY = process.env.ACCESS_KEY || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "orders.json");

if (process.env.NODE_ENV === "production" && (!ACCESS_KEY || !ADMIN_KEY || ACCESS_KEY === ADMIN_KEY)) {
  throw new Error("Production requires different ACCESS_KEY and ADMIN_KEY environment variables.");
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const postAttempts = new Map();

async function ensureDataFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

async function readOrders() {
  await ensureDataFile();
  const raw = await fs.readFile(DATA_FILE, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeOrders(orders) {
  await ensureDataFile();
  await fs.writeFile(DATA_FILE, `${JSON.stringify(orders, null, 2)}\n`, "utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders()
  });
  res.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 64) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeEqual(actual, expected) {
  if (!expected) return true;
  const actualBuffer = Buffer.from(String(actual || ""));
  const expectedBuffer = Buffer.from(String(expected));
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function providedKey(req, parsedUrl, headerName = "x-access-key") {
  return req.headers[headerName] || parsedUrl.searchParams.get("key") || "";
}

function rejectHtml(res, message) {
  res.writeHead(401, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders()
  });
  res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>需要口令</title><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:28px;line-height:1.6"><h1>需要口令</h1><p>${message}</p></body>`);
}

function tooManyPosts(req) {
  const ip = req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (postAttempts.get(ip) || []).filter((time) => now - time < 60_000);
  recent.push(now);
  postAttempts.set(ip, recent);
  return recent.length > 20;
}

function normalizeItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((item) => ({
    id: cleanText(item.id, 80),
    restaurant: cleanText(item.restaurant, 80),
    name: cleanText(item.name, 80),
    price: Math.max(0, Math.round(Number(item.price || 0))),
    qty: Math.min(9, Math.max(1, Math.round(Number(item.qty || 1))))
  })).filter((item) => item.id && item.name && item.qty > 0);
}

async function handleApi(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && parsedUrl.pathname === "/api/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/api/orders") {
    const key = providedKey(req, parsedUrl, "x-admin-key");
    if (!safeEqual(key, ADMIN_KEY)) {
      sendJson(res, 401, { error: "需要查看密码。" });
      return;
    }

    const orders = await readOrders();
    sendJson(res, 200, { orders: orders.slice().reverse() });
    return;
  }

  if (req.method === "POST" && parsedUrl.pathname === "/api/orders") {
    const key = providedKey(req, parsedUrl);
    if (!safeEqual(key, ACCESS_KEY)) {
      sendJson(res, 401, { error: "需要点餐口令。" });
      return;
    }

    if (tooManyPosts(req)) {
      sendJson(res, 429, { error: "提交太频繁，请稍后再试。" });
      return;
    }

    const payload = JSON.parse(await readBody(req) || "{}");
    const items = normalizeItems(payload.items);
    const total = items.reduce((sum, item) => sum + item.price * item.qty, 0);
    const order = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      mood: cleanText(payload.mood, 40),
      appetite: cleanText(payload.appetite, 40),
      fulfillment: cleanText(payload.fulfillment, 40),
      items,
      customFood: cleanText(payload.customFood, 80),
      note: cleanText(payload.note, 240),
      total
    };

    if (order.items.length === 0 && !order.customFood) {
      sendJson(res, 400, { error: "请至少点一道菜，或者写下想吃的。" });
      return;
    }

    const orders = await readOrders();
    orders.push(order);
    await writeOrders(orders.slice(-500));
    sendJson(res, 201, { order });
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

async function serveStatic(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const urlPath = decodeURIComponent(parsedUrl.pathname);
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, requested));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if ((requested === "/index.html" || requested === "/menu.json") && !safeEqual(providedKey(req, parsedUrl), ACCESS_KEY)) {
    rejectHtml(res, "请使用带点餐口令的专属链接打开。");
    return;
  }

  if (requested === "/admin.html" && !safeEqual(providedKey(req, parsedUrl), ADMIN_KEY)) {
    rejectHtml(res, "请使用带管理口令的后台链接打开。");
    return;
  }

  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" || requested === "/menu.json" ? "no-store" : "public, max-age=3600",
      ...securityHeaders()
    });
    res.end(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Order site is running at http://${HOST}:${PORT}`);
});
