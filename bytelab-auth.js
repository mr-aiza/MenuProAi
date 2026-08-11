// ============================================================
// بایت‌لب — سیستم احراز هویت کاربران سایت (شماره تماس + رمز عبور)
// این فایل باید قبل از استفاده از توابع لاگین/پروفایل/علاقه‌مندی‌ها لود بشه.
// یک شیء window.BytelabAuth می‌سازه که همه‌ی صفحات ازش استفاده می‌کنن.
// ============================================================
(function () {
  // آدرس Worker حساب‌کاربری رو بعد از دیپلوی، اینجا با آدرس واقعیت جایگزین کن
  const API_URL = "https://bytelab-users.bytelab.workers.dev";
  const TOKEN_KEY = "bytelab_auth_token";
  const USER_KEY = "bytelab_auth_user";

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function saveSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* localStorage غیرفعال باشه هم کرش نکنه */ }
  }
  function clearSession() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }
  function isLoggedIn() {
    return !!(getToken() && getUser());
  }

  async function apiFetch(path, options) {
    options = options || {};
    const headers = Object.assign({}, options.headers || {});
    const token = getToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const res = await fetch(API_URL + path, Object.assign({}, options, { headers }));
    let data = null;
    try { data = await res.json(); } catch (e) { /* بدنه خالی یا غیر JSON */ }

    if (!res.ok) {
      const err = new Error((data && data.error) || "خطایی رخ داد. دوباره تلاش کن.");
      err.status = res.status;
      throw err;
    }
    return data;
  }

  async function register(phone, password, name, email) {
    const data = await apiFetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ phone, password, name, email }),
    });
    saveSession(data.token, { phone: data.phone, name: data.name, email: data.email });
    return data;
  }

  async function login(phone, password) {
    const data = await apiFetch("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password }),
    });
    saveSession(data.token, { phone: data.phone, name: data.name, email: data.email });
    return data;
  }

  async function logout() {
    try { await apiFetch("/api/auth/logout", { method: "POST" }); } catch (e) { /* حتی اگه شکست بخوره، لوکال رو پاک کن */ }
    clearSession();
  }

  async function refreshUser() {
    if (!getToken()) return null;
    try {
      const data = await apiFetch("/api/auth/me", { method: "GET" });
      saveSession(getToken(), { phone: data.phone, name: data.name, email: data.email });
      return getUser();
    } catch (e) {
      return getUser();
    }
  }

  async function updateProfile(profile) {
    const data = await apiFetch("/api/auth/update-profile", {
      method: "POST",
      body: JSON.stringify(profile),
    });
    saveSession(getToken(), { phone: data.phone, name: data.name, email: data.email });
    return data;
  }

  async function changePassword(currentPassword, newPassword) {
    return apiFetch("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  }

  // --- علاقه‌مندی‌ها ---
  let favoriteIds = null; // کش محلی همین صفحه، بعد از اولین fetch پر می‌شه

  async function getFavoriteIds() {
    if (!isLoggedIn()) return [];
    if (favoriteIds) return favoriteIds;
    try {
      const data = await apiFetch("/api/favorites/mine", { method: "GET" });
      favoriteIds = data.itemIds || [];
    } catch (e) {
      favoriteIds = [];
    }
    return favoriteIds;
  }

  function isFavoriteCached(itemId) {
    return !!(favoriteIds && favoriteIds.includes(String(itemId)));
  }

  async function toggleFavorite(itemId) {
    const data = await apiFetch("/api/favorites/toggle", {
      method: "POST",
      body: JSON.stringify({ itemId: String(itemId) }),
    });
    favoriteIds = data.favorites || [];
    return data.favorited;
  }

  window.BytelabAuth = {
    getToken, getUser, isLoggedIn, saveSession, clearSession, apiFetch,
    register, login, logout, refreshUser, updateProfile, changePassword,
    getFavoriteIds, isFavoriteCached, toggleFavorite,
  };
})();
