const API_BASE = (() => {
  // APK local file:// olarsa birbaşa canlı API-yə get
  if (location.protocol === "file:") return "https://paraman.netlify.app/.netlify/functions/api";
  return "/.netlify/functions/api";
})();

const SESSION_KEY = "pm_session_v2";
const ADMIN_KEY = "pm_admin_token_v2";
const ADMIN_KEY_LEGACY = "pm_admin_token";

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Xeta");
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

async function registerUser({ name, phone, password, password2, referralCode }) {
  if (password !== password2) throw new Error("Sifreler eyni deyil");
  const data = await api("/register", {
    method: "POST",
    body: JSON.stringify({ name, phone, password, referralCode })
  });
  setSession(data.token, data.user);
  return data.user;
}

async function loginUser({ phone, password }) {
  const data = await api("/login", {
    method: "POST",
    body: JSON.stringify({ phone, password })
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
  const data = await api("/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone, pin })
  });
  localStorage.setItem(ADMIN_KEY, data.token);
  localStorage.setItem(ADMIN_KEY_LEGACY, data.token);
}
function getAdminToken() {
  return localStorage.getItem(ADMIN_KEY) || localStorage.getItem(ADMIN_KEY_LEGACY) || "";
}
function clearAdminToken() {
  localStorage.removeItem(ADMIN_KEY);
  localStorage.removeItem(ADMIN_KEY_LEGACY);
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