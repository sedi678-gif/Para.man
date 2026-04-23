const API = "";
const SESSION_KEY = "pm_session_v2";
const ADMIN_KEY = "pm_admin_token_v2";

async function api(path, options = {}) {
  const res = await fetch(API + path, {
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
  const data = await api("/api/register", {
    method: "POST",
    body: JSON.stringify({ name, phone, password, referralCode })
  });
  setSession(data.token, data.user);
  return data.user;
}

async function loginUser({ phone, password }) {
  const data = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ phone, password })
  });
  setSession(data.token, data.user);
  return data.user;
}

async function fetchMe() {
  const s = getSession();
  if (!s?.token) throw new Error("Sessiya yoxdur");
  const data = await api("/api/me", {
    headers: { Authorization: "Bearer " + s.token }
  });
  setSession(s.token, data.user);
  return data.user;
}

async function claimDailyBonus() {
  const s = getSession();
  const data = await api("/api/daily-bonus", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token }
  });
  return data.balance;
}

async function rechargeBalance(amount) {
  const s = getSession();
  const data = await api("/api/recharge", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token },
    body: JSON.stringify({ amount })
  });
  return data.balance;
}

async function withdrawBalance(amount) {
  const s = getSession();
  const data = await api("/api/withdraw", {
    method: "POST",
    headers: { Authorization: "Bearer " + s.token },
    body: JSON.stringify({ amount })
  });
  return data.balance;
}

async function fetchMyReferrals() {
  const s = getSession();
  const data = await api("/api/my-referrals", {
    headers: { Authorization: "Bearer " + s.token }
  });
  return data.referrals || [];
}

function getRefFromUrl() {
  return (new URL(location.href).searchParams.get("ref") || "").toUpperCase();
}

async function adminLogin(phone, pin) {
  const data = await api("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ phone, pin })
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
  return api("/api/admin/users", {
    headers: { Authorization: "Bearer " + getAdminToken() }
  });
}

async function adminSetBan(uid, banned) {
  return api(`/api/admin/users/${encodeURIComponent(uid)}/ban`, {
    method: "PATCH",
    headers: { Authorization: "Bearer " + getAdminToken() },
    body: JSON.stringify({ banned })
  });
}