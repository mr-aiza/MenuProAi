/* MenuProAI self-contained auth adapter.
 * Uses the same Worker as the dashboard, so login/register/session and all data
 * requests share one source of truth. Existing bytelab-users sessions are still
 * accepted by the Worker for backwards compatibility.
 */
(function () {
  'use strict';
  const API = (window.__MENUPROAI_API__ || 'https://menuproai-api.bytelab.workers.dev').replace(/\/$/, '');
  const KEY = 'menuproai.auth.token.v2';
  const USER_KEY = 'menuproai.auth.user.v2';

  function getToken(){ return localStorage.getItem(KEY) || ''; }
  function setSession(data){
    if (!data || !data.token) throw new Error('توکن ورود از سرور دریافت نشد.');
    localStorage.setItem(KEY, data.token);
    if (data.user) localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  async function request(path, body){
    const headers = { 'Content-Type':'application/json' };
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    let res;
    try { res = await fetch(API + path, { method: body ? 'POST':'GET', headers, body: body ? JSON.stringify(body):undefined }); }
    catch(e){ throw new Error('اتصال به سرور برقرار نشد. آدرس Worker و CORS را بررسی کن.'); }
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data.error || ('خطای سرور ('+res.status+')'));
    return data;
  }
  window.BytelabAuth = {
    getToken,
    isLoggedIn(){ return !!getToken(); },
    getUser(){ try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null;} },
    async login(phone,password){ const d=await request('/api/auth/login',{phone,password}); setSession(d); return d; },
    async register(phone,password,name,email){ const d=await request('/api/auth/register',{phone,password,name,email}); setSession(d); return d; },
    async logout(){ try{ await request('/api/auth/logout',{}); } finally { localStorage.removeItem(KEY); localStorage.removeItem(USER_KEY); } },
    async me(){
      if (!getToken()) return {authenticated:false};
      try { const d=await request('/api/auth/me'); if (!d.authenticated){localStorage.removeItem(KEY);localStorage.removeItem(USER_KEY);} else if(d.user) localStorage.setItem(USER_KEY,JSON.stringify(d.user)); return d; }
      catch(e){ return {authenticated:false, error:e}; }
    }
  };
})();
