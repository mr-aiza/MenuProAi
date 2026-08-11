// =======================================================================
// Worker هوش مصنوعی MenuProAI — نسخه‌ی چندمستأجری
// این Worker جدا از menuproai-worker.js (که KV رو مدیریت می‌کنه) دیپلوی
// می‌شه، ولی هر دو باید به یک KV namespace مشترک وصل باشن:
//   MENU_KV → همون namespace ای که تو menuproai-worker.js ساختی
//             (از دراپ‌داون namespace موجود رو انتخاب کن، جدید نساز)
// همچنین به Workers AI binding با نام AI نیاز داره (از قبل داشتی).
//
// دیگه به MENU_URL نیازی نیست — هر کافه از KV با کلید menu:{slug} خونده می‌شه.
// =======================================================================

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

// اجازه دسترسی از دامنه سایتت (بعد از دیپلوی، ستاره رو با دامنه واقعی عوض کن)
const ALLOWED_ORIGIN = "*";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders() },
  });
}

async function loadMenu(slug, env) {
  if (!slug) throw new Error("اسلاگ کافه مشخص نیست");
  const raw = await env.MENU_KV.get("menu:" + slug);
  if (!raw) throw new Error("منویی با این آدرس پیدا نشد");
  return JSON.parse(raw);
}

function buildSystemPrompt(menu) {
  const compactItems = menu.items.map((it) => ({
    id: it.id,
    name: it.name,
    category: it.category,
    price: it.price,
    tags: it.tags,
    desc: it.desc,
    ...(it.recipe ? { ingredients: it.recipe.ingredients } : {}),
  }));

  return `تو دستیار سفارش‌گیری «${menu.cafeName}» هستی. فقط و فقط از آیتم‌های زیر که در منوی واقعی کافه هستند پیشنهاد بده و هیچ‌وقت چیزی خارج از این لیست اختراع نکن.

منوی کامل (JSON):
${JSON.stringify(compactItems)}

قوانین پاسخ:
- همیشه به فارسی، بسیار مؤدبانه و محترمانه پاسخ بده (مثلاً با «لطفاً»، «بله حتماً»، «با کمال میل»)، و راهنمایی‌ات را با احترام کامل ارائه کن.
- پاسخ باید کوتاه و دقیق باشد؛ حداکثر یک جمله، بدون حاشیه یا توضیح اضافه.
- بر اساس ترجیح کاربر (گرم/سرد، شیرین/ترش/تلخ، با کافئین یا بدون، همراه با دسر و غیره) از میان آیتم‌های بالا ۱ تا ۳ مورد را انتخاب کن.
- اگر خواسته کاربر مبهم است، فقط یک سوال کوتاه و مؤدبانه بپرس تا انتخابش را محدود کند، ولی اگر می‌توانی حدس معقولی بزنی همان را پیشنهاد بده.
- خروجی را دقیقاً و فقط به‌صورت یک شیء JSON با این ساختار برگردان، بدون هیچ متن اضافه یا Markdown:
{"reply": "حداکثر یک جمله کوتاه، دقیق و بسیار مؤدبانه", "suggestions": [{"id": "شناسه دقیق از لیست بالا", "reason": "دلیل مناسب بودن این گزینه، در حداکثر چند کلمه کوتاه"}]}
- فیلد id باید دقیقاً یکی از شناسه‌های موجود در منو باشد، هیچ‌وقت شناسه جدید نساز.
- اگر فقط سوال می‌پرسی و هنوز پیشنهادی نداری، suggestions را آرایه خالی [] بگذار.`;
}

function safeParseModelJson(raw) {
  if (!raw) return null;
  let text = raw.trim();
  // اگر مدل داخل ```json برگرداند، پاک‌سازی کن
  text = text.replace(/```json|```/g, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    return null;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return json({ error: "فقط POST مجاز است" }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: "بدنه درخواست نامعتبر است" }, 400);
    }

    const message = (body.message || "").toString().slice(0, 500);
    const history = Array.isArray(body.history) ? body.history.slice(-6) : [];
    const slug = (body.slug || "").toString().trim();

    if (!message.trim()) {
      return json({ error: "پیام خالی است" }, 400);
    }
    if (!slug) {
      return json({ error: "اسلاگ کافه ارسال نشده" }, 400);
    }

    let menu;
    try {
      menu = await loadMenu(slug, env);
    } catch (e) {
      return json({ reply: "منو در حال حاضر در دسترس نیست، لطفاً بعداً امتحان کن.", suggestions: [] }, 200);
    }

    const messages = [
      { role: "system", content: buildSystemPrompt(menu) },
      ...history.map((h) => ({ role: h.role === "user" ? "user" : "assistant", content: String(h.content).slice(0, 500) })),
      { role: "user", content: message },
    ];

    let aiResult;
    try {
      aiResult = await env.AI.run(MODEL, { messages, max_tokens: 600 });
    } catch (e) {
      return json({ reply: "با عرض پوزش، دستیار موقتاً در دسترس نیست. لطفاً دوباره تلاش کنید.", suggestions: [] }, 200);
    }

    const raw = aiResult.response || "";
    const parsed = safeParseModelJson(raw);

    if (!parsed || !parsed.reply) {
      return json({
        reply: raw.slice(0, 300) || "متوجه نشدم، می‌شه یه‌جور دیگه بگی چی می‌خوای؟",
        suggestions: [],
      });
    }

    const validIds = new Set(menu.items.map((it) => it.id));
    const suggestions = Array.isArray(parsed.suggestions)
      ? parsed.suggestions.filter((s) => s && validIds.has(s.id)).slice(0, 3)
      : [];

    return json({ reply: parsed.reply, suggestions });
  },
};
