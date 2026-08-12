// ============================================================
// menuproai-worker.js — بک‌اند اصلی MenuProAI (بایت‌لب)
// -------------------------------------------------------------
// این Worker مسئول ذخیره و مدیریت منوی هر کافه/کسب‌وکاره.
// احراز هویت مستقل نمی‌سازه — دقیقاً از همون سیستم سایت اصلی
// (bytelab-users-worker.js) استفاده می‌کنه: کاربر با bytelab-auth.js
// لاگین/ثبت‌نام می‌کنه (که به bytelab-users-worker می‌زنه)، و این
// Worker همون توکن سشن رو مستقیم تو USERS_KV چک می‌کنه.
//
// KV Bindings لازم (۲ تا):
//   1) MENU_KV   → یک namespace جدید و مخصوص همین پروژه بساز
//   2) USERS_KV  → همون namespace موجود bytelab-users-worker رو
//                  انتخاب کن (از دراپ‌داون Cloudflare، namespace
//                  فعلی رو پیدا کن، دوباره نسازش). این Worker فقط
//                  ازش می‌خونه، هیچ‌وقت چیزی توش نمی‌نویسه.
//
// ساختار داده تو MENU_KV:
//   owner:{phone}      -> "{slug}"           (هر مالک فقط یک اسلاگ/منو)
//   menu:{slug}        -> JSON کامل منو (پایین توضیح داده شده)
//   orders:{slug}      -> آرایه‌ی سفارش‌های ثبت‌شده برای همون کافه (حداکثر ۲۰۰ تای آخر)
//   slug_index         -> آرایه‌ی همه‌ی اسلاگ‌های ثبت‌شده (برای چک یکتا بودن)
//
// ساختار JSON هر منو:
//   {
//     slug: "kafe-boloot",
//     ownerPhone: "0912xxxxxxx",
//     cafeName: "کافه بلوط",
//     tagline: "...",
//     theme: { amber:"#D9A566", sage:"#8FB89C", ... }  // مرحله بعد پر می‌شه
//     categories: [ { id, title } ],
//     items: [ { id, name, category, price, tags, desc, pairsWith } ],
//     createdAt, updatedAt
//   }
// ============================================================

const ALLOWED_ORIGIN = "*"; // بعد از اتصال دامنه نهایی، با آدرس واقعی جایگزین کن
const RESERVED_SLUGS = ["api", "users", "assets", "admin", "login", "register", "menu", "www"];

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

// ------------------------------------------------------------
// تایید هویت — دقیقاً همون منطق bytelab-users-worker، فقط به‌صورت
// خواندنی و مستقل تو این Worker پیاده شده تا وابستگی شبکه‌ای
// (fetch به Worker دیگه) نداشته باشیم.
// ------------------------------------------------------------
async function getAuthedPhone(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return null;
  const phone = await env.USERS_KV.get("session:" + token);
  return phone || null;
}

function slugify(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidSlug(slug) {
  if (!slug || slug.length < 3 || slug.length > 40) return false;
  if (RESERVED_SLUGS.includes(slug)) return false;
  // فقط حروف انگلیسی/عدد/خط تیره — برای اینکه تو URL بدون دردسر کار کنه
  return /^[a-z0-9-]+$/.test(slug);
}

// ------------------------------------------------------------
// کمکی‌های KV
// ------------------------------------------------------------
async function addToSlugIndex(env, slug) {
  const raw = await env.MENU_KV.get("slug_index");
  const list = raw ? JSON.parse(raw) : [];
  if (!list.includes(slug)) {
    list.push(slug);
    await env.MENU_KV.put("slug_index", JSON.stringify(list));
  }
}

// ============================================================
// POST /api/menu/create
// body: { slug, cafeName, tagline? }
// اگه کاربر از قبل منو داشته باشه، خطا می‌ده (مرحله ویرایش بعداً اضافه می‌شه)
// ============================================================
async function handleCreateMenu(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const existingSlug = await env.MENU_KV.get("owner:" + phone);
  if (existingSlug) {
    return json({ error: "شما قبلاً یک منو ساخته‌اید.", slug: existingSlug }, 409);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: "بدنه درخواست نامعتبر است." }, 400);
  }

  const slug = slugify(body.slug || body.cafeName);
  const cafeName = String(body.cafeName || "").trim().slice(0, 60);
  const tagline = String(body.tagline || "").trim().slice(0, 160);

  if (!cafeName) return json({ error: "نام کافه/کسب‌وکار الزامی است." }, 400);
  if (!isValidSlug(slug)) {
    return json({ error: "آدرس انتخابی معتبر نیست. فقط حروف انگلیسی، عدد و خط تیره، حداقل ۳ کاراکتر." }, 400);
  }

  const alreadyTaken = await env.MENU_KV.get("menu:" + slug);
  if (alreadyTaken) {
    return json({ error: "این آدرس قبلاً گرفته شده. یکی دیگه امتحان کن." }, 409);
  }

  const menu = {
    slug,
    ownerPhone: phone,
    cafeName,
    tagline,
    theme: {},
    categories: [],
    items: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await env.MENU_KV.put("menu:" + slug, JSON.stringify(menu));
  await env.MENU_KV.put("owner:" + phone, slug);
  await addToSlugIndex(env, slug);

  return json({ ok: true, slug, menu }, 200);
}

// ============================================================
// GET /api/menu/mine — منوی خود کاربر لاگین‌کرده (برای داشبورد)
// ============================================================
async function handleGetMine(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const slug = await env.MENU_KV.get("owner:" + phone);
  if (!slug) return json({ error: "هنوز منویی نساخته‌اید.", hasMenu: false }, 404);

  const raw = await env.MENU_KV.get("menu:" + slug);
  if (!raw) return json({ error: "منو پیدا نشد.", hasMenu: false }, 404);

  return json({ hasMenu: true, menu: JSON.parse(raw) }, 200);
}

// ============================================================
// GET /api/menu/public/:slug — عمومی، بدون نیاز به لاگین
// (صفحه‌ی نمایش منو تو مرحله ۳ از همین استفاده می‌کنه)
// ============================================================
async function handleGetPublicMenu(slug, env) {
  const raw = await env.MENU_KV.get("menu:" + slug);
  if (!raw) return json({ error: "منویی با این آدرس پیدا نشد." }, 404);
  return json({ menu: JSON.parse(raw) }, 200);
}

// ------------------------------------------------------------
// کمکی مشترک: منوی خود کاربر لاگین‌شده رو برمی‌گردونه (یا null)
// ------------------------------------------------------------
async function loadOwnMenu(phone, env) {
  const slug = await env.MENU_KV.get("owner:" + phone);
  if (!slug) return null;
  const raw = await env.MENU_KV.get("menu:" + slug);
  if (!raw) return null;
  return { slug, menu: JSON.parse(raw) };
}

async function saveMenu(slug, menu, env) {
  menu.updatedAt = new Date().toISOString();
  await env.MENU_KV.put("menu:" + slug, JSON.stringify(menu));
}

function randomId(prefix) {
  return (prefix ? prefix + "-" : "") + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

// ============================================================
// POST /api/menu/update-info — ویرایش نام/توضیح/رنگ کافه
// body: { cafeName?, tagline?, theme?: {varName: hex, ...} }
// ============================================================
async function handleUpdateInfo(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  if (typeof body.cafeName === "string" && body.cafeName.trim()) {
    own.menu.cafeName = body.cafeName.trim().slice(0, 60);
  }
  if (typeof body.tagline === "string") {
    own.menu.tagline = body.tagline.trim().slice(0, 160);
  }
  if (body.theme && typeof body.theme === "object") {
    own.menu.theme = { ...own.menu.theme, ...body.theme };
  }

  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, menu: own.menu }, 200);
}

// ============================================================
// دسته‌بندی‌ها
// POST /api/menu/categories        body: { title }
// POST /api/menu/categories/delete body: { id }
// ============================================================
async function handleAddCategory(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const title = String(body.title || "").trim().slice(0, 40);
  if (!title) return json({ error: "عنوان دسته الزامی است." }, 400);

  const id = randomId("cat");
  own.menu.categories.push({ id, title });
  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, category: { id, title }, menu: own.menu }, 200);
}

async function handleDeleteCategory(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const id = String(body.id || "");
  own.menu.categories = own.menu.categories.filter((c) => c.id !== id);
  // آیتم‌های همون دسته یتیم می‌مونن، دسته‌شون رو خالی می‌کنیم تا تو UI مشخص بشه نیاز به دسته‌بندی مجدد دارن
  own.menu.items.forEach((it) => { if (it.category === id) it.category = ""; });

  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, menu: own.menu }, 200);
}

// ============================================================
// آیتم‌های منو
// POST /api/menu/items         body: { name, category, price, desc?, tags?, pairsWith? }
// POST /api/menu/items/update  body: { id, ...همون فیلدها }
// POST /api/menu/items/delete  body: { id }
// ============================================================
function sanitizeItemInput(body) {
  const price = Number(body.price);
  return {
    name: String(body.name || "").trim().slice(0, 60),
    category: String(body.category || "").trim().slice(0, 40),
    price: Number.isFinite(price) && price >= 0 ? Math.round(price) : 0,
    desc: String(body.desc || "").trim().slice(0, 240),
    tags: Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim().slice(0, 20)).filter(Boolean).slice(0, 8) : [],
    pairsWith: Array.isArray(body.pairsWith) ? body.pairsWith.map((p) => String(p).trim()).filter(Boolean).slice(0, 5) : [],
  };
}

async function handleAddItem(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const data = sanitizeItemInput(body);
  if (!data.name) return json({ error: "نام آیتم الزامی است." }, 400);

  const id = randomId("item");
  const item = { id, ...data };
  own.menu.items.push(item);
  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, item, menu: own.menu }, 200);
}

async function handleUpdateItem(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const id = String(body.id || "");
  const idx = own.menu.items.findIndex((it) => it.id === id);
  if (idx === -1) return json({ error: "آیتم پیدا نشد." }, 404);

  const data = sanitizeItemInput(body);
  if (!data.name) return json({ error: "نام آیتم الزامی است." }, 400);

  own.menu.items[idx] = { id, ...data };
  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, item: own.menu.items[idx], menu: own.menu }, 200);
}

async function handleDeleteItem(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const id = String(body.id || "");
  own.menu.items = own.menu.items.filter((it) => it.id !== id);
  await saveMenu(own.slug, own.menu, env);
  return json({ ok: true, menu: own.menu }, 200);
}

// ============================================================
// سفارش‌ها (تیکت مشتری برای صاحب کافه)
// POST /api/menu/order            body: { slug, items: [{ id, qty }], customerName, customerPhone, note? }   ← عمومی، بدون لاگین
// GET  /api/menu/orders           ← فقط صاحب کافه، سفارش‌های خودش
// POST /api/menu/orders/status    body: { id, status }                          ← فقط صاحب کافه
// ============================================================
const MAX_ORDERS_STORED = 200;

async function loadOrders(slug, env) {
  const raw = await env.MENU_KV.get("orders:" + slug);
  return raw ? JSON.parse(raw) : [];
}

async function saveOrders(slug, orders, env) {
  // فقط آخرین‌ها رو نگه می‌داریم که KV پر نشه
  const trimmed = orders.slice(-MAX_ORDERS_STORED);
  await env.MENU_KV.put("orders:" + slug, JSON.stringify(trimmed));
}

async function handleCreateOrder(request, env) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const slug = slugify(body.slug);
  if (!slug) return json({ error: "اسلاگ کافه مشخص نیست." }, 400);

  const raw = await env.MENU_KV.get("menu:" + slug);
  if (!raw) return json({ error: "منویی با این آدرس پیدا نشد." }, 404);
  const menu = JSON.parse(raw);

  const reqItems = Array.isArray(body.items) ? body.items : [];
  if (!reqItems.length) return json({ error: "سبد خرید خالی است." }, 400);

  // قیمت‌ها رو از روی خود منو (سمت سرور) محاسبه می‌کنیم، نه چیزی که کلاینت فرستاده
  const lines = [];
  let total = 0;
  for (const ri of reqItems) {
    const menuItem = menu.items.find((it) => it.id === String(ri.id || ""));
    if (!menuItem) continue;
    const qty = Math.max(1, Math.min(50, Math.round(Number(ri.qty) || 1)));
    const lineTotal = menuItem.price * qty;
    total += lineTotal;
    lines.push({ id: menuItem.id, name: menuItem.name, price: menuItem.price, qty, lineTotal });
  }
  if (!lines.length) return json({ error: "هیچ‌کدام از آیتم‌های سبد خرید معتبر نیست." }, 400);

  const customerName = String(body.customerName || "").trim().slice(0, 60);
  const customerPhone = String(body.customerPhone || "").trim().slice(0, 20);
  if (!customerName) return json({ error: "نام مشتری الزامی است." }, 400);
  if (!customerPhone) return json({ error: "شماره تلفن مشتری الزامی است." }, 400);

  const order = {
    id: randomId("order"),
    items: lines,
    total,
    note: String(body.note || "").trim().slice(0, 200),
    customerName,
    customerPhone,
    status: "new", // new | seen | done
    createdAt: new Date().toISOString(),
  };

  const orders = await loadOrders(slug, env);
  orders.push(order);
  await saveOrders(slug, orders, env);

  return json({ ok: true, order }, 200);
}

async function handleGetOrders(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  const orders = await loadOrders(own.slug, env);
  // جدیدترین اول
  orders.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return json({ ok: true, orders }, 200);
}

async function handleUpdateOrderStatus(request, env) {
  const phone = await getAuthedPhone(request, env);
  if (!phone) return json({ error: "لطفاً ابتدا وارد حساب کاربری شو." }, 401);

  const own = await loadOwnMenu(phone, env);
  if (!own) return json({ error: "هنوز منویی نساخته‌اید." }, 404);

  let body;
  try { body = await request.json(); } catch (e) { return json({ error: "بدنه درخواست نامعتبر است." }, 400); }

  const id = String(body.id || "");
  const status = String(body.status || "");
  if (!["new", "seen", "done"].includes(status)) return json({ error: "وضعیت نامعتبر است." }, 400);

  const orders = await loadOrders(own.slug, env);
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) return json({ error: "سفارش پیدا نشد." }, 404);

  orders[idx].status = status;
  await saveOrders(own.slug, orders, env);
  return json({ ok: true, order: orders[idx] }, 200);
}

// ============================================================
// روتر اصلی
// ============================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    try {
      if (url.pathname === "/api/menu/create" && request.method === "POST") {
        return await handleCreateMenu(request, env);
      }
      if (url.pathname === "/api/menu/mine" && request.method === "GET") {
        return await handleGetMine(request, env);
      }
      if (url.pathname.startsWith("/api/menu/public/") && request.method === "GET") {
        const slug = url.pathname.replace("/api/menu/public/", "").trim();
        return await handleGetPublicMenu(slug, env);
      }
      if (url.pathname === "/api/menu/update-info" && request.method === "POST") {
        return await handleUpdateInfo(request, env);
      }
      if (url.pathname === "/api/menu/categories" && request.method === "POST") {
        return await handleAddCategory(request, env);
      }
      if (url.pathname === "/api/menu/categories/delete" && request.method === "POST") {
        return await handleDeleteCategory(request, env);
      }
      if (url.pathname === "/api/menu/items" && request.method === "POST") {
        return await handleAddItem(request, env);
      }
      if (url.pathname === "/api/menu/items/update" && request.method === "POST") {
        return await handleUpdateItem(request, env);
      }
      if (url.pathname === "/api/menu/items/delete" && request.method === "POST") {
        return await handleDeleteItem(request, env);
      }
      if (url.pathname === "/api/menu/order" && request.method === "POST") {
        return await handleCreateOrder(request, env);
      }
      if (url.pathname === "/api/menu/orders" && request.method === "GET") {
        return await handleGetOrders(request, env);
      }
      if (url.pathname === "/api/menu/orders/status" && request.method === "POST") {
        return await handleUpdateOrderStatus(request, env);
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: "خطای داخلی سرور", detail: String(err && err.message || err) }, 500);
    }
  },
};
