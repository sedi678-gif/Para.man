const API = "/.netlify/functions/api";
const SESSION_KEY = "pm_session_v2";
const ADMIN_KEY = "pm_admin_token_v2";

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Xəta");
  return data;
}

function setSession(token, user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }));
}
function getSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
  catch { return null; }
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

/** +994 formatına salır: user yalnız 9 rəqəm yazır */
function normalizeAzPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 9) return "+994" + digits;
  if (digits.length === 12 && digits.startsWith("994")) return "+" + digits;
  if (digits.length === 13 && digits.startsWith("994")) return "+" + digits.slice(1);
  if (digits.length === 12 && digits.startsWith("+994")) return digits;
  return null;
}

async function registerUser({ name, phone, password, password2, referralCode }) {
  if (password !== password2) throw new Error("Şifrələr eyni deyil");

  const normalized = normalizeAzPhone(phone);
  if (!normalized) throw new Error("Telefon formatı yanlışdır. 9 rəqəm yazın.");

  const data = await api("/register", {
    method: "POST",
    body: JSON.stringify({ name, phone: normalized, password, referralCode })
  });
  setSession(data.token, data.user);
  return data.user;
}

async function loginUser({ phone, password }) {
  const normalized = normalizeAzPhone(phone);
  if (!normalized) throw new Error("Telefon formatı yanlışdır. 9 rəqəm yazın.");

  const data = await api("/login", {
    method: "POST",
    body: JSON.stringify({ phone: normalized, password })
  });
  setSession(data.token, data.user);
  return data.user;
}

async function fetchMe() {
  const s = getSession();
  if (!s?.token) throw new Error("Sessiya yoxdur");
  const data = await api("/me", {
    headers: { Authorization: "Bearer " + s.token }
  });
  setSession(s.token, data.user);
  return data.user;
}

async function claimDailyBonus() {
  const s = getSession();
  const data = await api("/daily-bonus", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token }
  });
  return data.balance;
}

async function rechargeBalance(amount) {
  const s = getSession();
  const data = await api("/recharge", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token },
    body: JSON.stringify({ amount })
  });
  return data.balance;
}

async function withdrawBalance(amount) {
  const s = getSession();
  const data = await api("/withdraw", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token },
    body: JSON.stringify({ amount })
  });
  return data.balance;
}

async function fetchMyReferrals() {
  const s = getSession();
  const data = await api("/my-referrals", {
    headers: { Authorization: "Bearer " + s.token }
  });
  return data.referrals || [];
}

function getRefFromUrl() {
  return (new URL(location.href).searchParams.get("ref") || "").toUpperCase();
}

async function adminLogin(phone, pin) {
  const normalized = normalizeAzPhone(phone);
  if (!normalized) throw new Error("Telefon formatı yanlışdır. 9 rəqəm yazın.");

  const data = await api("/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone: normalized, pin })
  });
  localStorage.setItem(ADMIN_KEY, data.token);
}
function getAdminToken() {
  return localStorage.getItem(ADMIN_KEY) || "";
}
function clearAdminToken() {
  localStorage.removeItem(ADMIN_KEY);
}
async function adminGetUsers() {
  return api("/admin/users", {
    headers: { Authorization: "Bearer " + getAdminToken() }
  });
}
async function adminSetBan(uid, banned) {
  return api(`/admin/users/${encodeURIComponent(uid)}/ban`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + getAdminToken() },
    body: JSON.stringify({ banned })
  });
}