// ============================================================
// menuproai-router.js — Worker مسیریاب برای صفحه‌ی عمومی منو
// -------------------------------------------------------------
// این Worker فقط یه کار داره: هر درخواستی که به الگوی
//   menuproai.bytelabpro.xyz/USERS/{هر-چیزی}/menu.html
// بخوره رو می‌گیره و محتوای همون فایل ثابت public-menu.html (که رو
// گیت‌هاب‌پیجز همین ریپو هست) رو برمی‌گردونه. تشخیص اینکه منوی کدوم
// کافه‌ست، کاملاً سمت مرورگر و از روی خود آدرس (location.pathname)
// انجام می‌شه — پس این Worker نیازی به هیچ KV یا منطق اضافه نداره.
//
// این Worker باید فقط رو مسیر زیر Route بشه (نه کل دامنه):
//   menuproai.bytelabpro.xyz/USERS/*
// بقیه‌ی مسیرها (/, /dashboard.html و ...) دست‌نخورده می‌رن سمت
// GitHub Pages، چون این Worker فقط رو همین یه الگو فعاله.
// ============================================================

// آدرس واقعی فایل public-menu.html رو رو گیت‌هاب‌پیجز اینجا بذار
const TEMPLATE_URL = "https://mr-aiza.github.io/MenuProAi/public-menu.html";

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // فقط الگوی /USERS/{اسلاگ}/menu.html رو جواب بده
    if (!/^\/USERS\/[^/]+\/menu\.html$/i.test(url.pathname)) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const res = await fetch(TEMPLATE_URL, { cf: { cacheTtl: 300, cacheEverything: true } });
      if (!res.ok) {
        return new Response("قالب صفحه در دسترس نیست", { status: 502 });
      }
      const html = await res.text();
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    } catch (e) {
      return new Response("خطا در بارگذاری صفحه", { status: 500 });
    }
  },
};
