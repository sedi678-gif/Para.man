const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const jwtSecret = process.env.JWT_SECRET || "CHANGE_ME_SECRET_2026";
const adminPhone = process.env.ADMIN_PHONE || "+994501112233";
const adminPin = process.env.ADMIN_PIN || "123456";

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

function json(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

function normalizePhone(phone) {
  const d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("994") && d.length >= 12) return "+" + d.slice(0, 12);
  if (d.length === 9) return "+994" + d;
  return null;
}

function makeToken(payload) {
  return jwt.sign(payload, jwtSecret, { expiresIn: "30d" });
}

function parseToken(event) {
  const auth = event.headers.authorization || event.headers.Authorization || "";
  const token = auth.replace("Bearer ", "");
  if (!token) throw new Error("Token yoxdur");
  return jwt.verify(token, jwtSecret);
}

function clientIp(event) {
  const xff = event.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return event.headers["client-ip"] || "";
}

function routePath(eventPath) {
  let p = (eventPath || "").replace(/^\/\.netlify\/functions\/api/, "");
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/^\/api/, "");
  return p || "/";
}

async function createUniqueReferralCode() {
  for (let i = 0; i < 40; i++) {
    const code = "REF" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data } = await supabase.from("users").select("id").eq("referral_code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Referral kod yaradilmadi");
}

function getAllowedPromoCodes() {
  // Netlify ENV:
  // PROMO_CODES=START50:50,VIP100:100,AZ777:777
  const raw = process.env.PROMO_CODES || "";
  const map = new Map();

  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((pair) => {
      const [codeRaw, amountRaw] = pair.split(":");
      const code = String(codeRaw || "").trim().toUpperCase();
      const amount = Number(String(amountRaw || "").trim());
      if (code && Number.isFinite(amount) && amount > 0) {
        map.set(code, amount);
      }
    });

  return map;
}

exports.handler = async (event) => {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return json(500, { error: "SUPABASE env yoxdur" });
    }

    const method = event.httpMethod;
    const path = routePath(event.path);
    const body = event.body ? JSON.parse(event.body) : {};

    // REGISTER
    if (method === "POST" && path === "/register") {
      const { name, phone, password, referralCode } = body;
      const p = normalizePhone(phone);

      if (!name || !String(name).trim()) return json(400, { error: "Ad bos ola bilmez" });
      if (!p) return json(400, { error: "Telefon duzgun deyil" });
      if (!password || String(password).length < 4) return json(400, { error: "Sifre min 4 simvol olmalidir" });

      const { data: samePhone } = await supabase
        .from("users")
        .select("id")
        .eq("phone", p)
        .maybeSingle();

      if (samePhone) return json(400, { error: "Bu nomre ile artiq hesab var" });

      let inviter = null;
      const rc = String(referralCode || "").trim().toUpperCase();
      if (rc) {
        const { data: inv } = await supabase
          .from("users")
          .select("user_id, referral_code")
          .eq("referral_code", rc)
          .maybeSingle();

        if (!inv) return json(400, { error: "Referral kod tapilmadi" });
        inviter = inv;
      }

      const passwordHash = await bcrypt.hash(String(password), 10);
      const referralCodeNew = await createUniqueReferralCode();

      const { data: inserted, error: insertErr } = await supabase
        .from("users")
        .insert({
          name: String(name).trim(),
          phone: p,
          password_hash: passwordHash,
          referral_code: referralCodeNew,
          referred_by_code: inviter ? inviter.referral_code : null,
          referred_by_user_id: inviter ? inviter.user_id : null,
          register_ip: clientIp(event),
          register_device: event.headers["user-agent"] || ""
        })
        .select("id")
        .single();

      if (insertErr) return json(500, { error: "Qeydiyyat xetasi" });

      const userId = "PM" + String(inserted.id).padStart(6, "0");
      await supabase.from("users").update({ user_id: userId }).eq("id", inserted.id);

      const { data: user } = await supabase
        .from("users")
        .select("user_id,name,phone,balance,referral_code,referred_by_code")
        .eq("id", inserted.id)
        .single();

      const token = makeToken({ uid: user.user_id, phone: user.phone, role: "user" });
      return json(200, { token, user });
    }

    // LOGIN
    if (method === "POST" && path === "/login") {
      const { phone, password } = body;
      const p = normalizePhone(phone);
      if (!p) return json(400, { error: "Telefon duzgun deyil" });

      const { data: u } = await supabase.from("users").select("*").eq("phone", p).maybeSingle();
      if (!u) return json(400, { error: "Bu nomre ile hesab tapilmadi" });
      if (u.is_banned) return json(403, { error: "Hesabiniz bloklanib" });

      const ok = await bcrypt.compare(String(password || ""), u.password_hash);
      if (!ok) return json(400, { error: "Sifre yanlisdir" });

      const token = makeToken({ uid: u.user_id, phone: u.phone, role: "user" });
      return json(200, {
        token,
        user: {
          user_id: u.user_id,
          name: u.name,
          phone: u.phone,
          balance: u.balance,
          referral_code: u.referral_code,
          referred_by_code: u.referred_by_code
        }
      });
    }

    // ME
    if (method === "GET" && path === "/me") {
      const authUser = parseToken(event);
      const { data: user } = await supabase
        .from("users")
        .select("user_id,name,phone,balance,referral_code,referred_by_code,is_banned")
        .eq("user_id", authUser.uid)
        .maybeSingle();

      if (!user) return json(404, { error: "Tapilmadi" });
      return json(200, { user });
    }

    // DAILY BONUS
    if (method === "POST" && path === "/daily-bonus") {
      const authUser = parseToken(event);
      const today = new Date().toISOString().slice(0, 10);

      const { data: u } = await supabase
        .from("users")
        .select("balance,last_claim_date")
        .eq("user_id", authUser.uid)
        .maybeSingle();

      if (!u) return json(404, { error: "Tapilmadi" });
      if (u.last_claim_date === today) return json(400, { error: "Bu gun bonus artiq goturulub" });

      const newBal = Number(u.balance || 0) + 1;
      await supabase.from("users").update({ balance: newBal, last_claim_date: today }).eq("user_id", authUser.uid);
      return json(200, { balance: newBal });
    }

    // RECHARGE
    if (method === "POST" && path === "/recharge") {
      const authUser = parseToken(event);
      const amount = Number(body.amount || 0);
      if (amount < 10) return json(400, { error: "Minimum yukleme 10 AZN" });

      const { data: u } = await supabase.from("users").select("balance").eq("user_id", authUser.uid).maybeSingle();
      if (!u) return json(404, { error: "Tapilmadi" });

      const newBal = Number(u.balance || 0) + amount;
      await supabase.from("users").update({ balance: newBal }).eq("user_id", authUser.uid);
      return json(200, { balance: newBal });
    }

    // WITHDRAW
    if (method === "POST" && path === "/withdraw") {
      const authUser = parseToken(event);
      const amount = Number(body.amount || 0);
      if (amount < 6) return json(400, { error: "Minimum cixaris 6 AZN" });

      const { data: u } = await supabase.from("users").select("balance").eq("user_id", authUser.uid).maybeSingle();
      if (!u) return json(404, { error: "Tapilmadi" });

      const bal = Number(u.balance || 0);
      if (amount > bal) return json(400, { error: "Balans kifayet deyil" });

      const newBal = bal - amount;
      await supabase.from("users").update({ balance: newBal }).eq("user_id", authUser.uid);
      return json(200, { balance: newBal });
    }

    // TREASURE PROMO REDEEM
    if (method === "POST" && path === "/treasure/redeem") {
      const authUser = parseToken(event);
      const promoCode = String(body.promoCode || "").trim().toUpperCase();
      if (!promoCode) return json(400, { error: "Promo kod bosdur" });

      const allowed = getAllowedPromoCodes();
      const bonus = allowed.get(promoCode);
      if (!bonus) return json(400, { error: "Kod etibarsizdir" });

      const { data: currentUser } = await supabase
        .from("users")
        .select("balance, used_promo_codes")
        .eq("user_id", authUser.uid)
        .maybeSingle();

      if (!currentUser) return json(404, { error: "Tapilmadi" });

      const usedCodes = Array.isArray(currentUser.used_promo_codes)
        ? currentUser.used_promo_codes
        : [];

      if (usedCodes.includes(promoCode)) {
        return json(400, { error: "Bu kod artiq istifade edilib" });
      }

      const newBal = Number(currentUser.balance || 0) + Number(bonus);
      usedCodes.push(promoCode);

      const { error: updErr } = await supabase
        .from("users")
        .update({
          balance: newBal,
          used_promo_codes: usedCodes
        })
        .eq("user_id", authUser.uid);

      if (updErr) return json(500, { error: "Kod tetbiq olunmadi" });

      return json(200, {
        ok: true,
        promoCode,
        bonus: Number(bonus),
        balance: newBal
      });
    }

    // MY REFERRALS
    if (method === "GET" && path === "/my-referrals") {
      const authUser = parseToken(event);

      const { data: refs } = await supabase
        .from("users")
        .select("user_id,name,phone,created_at")
        .eq("referred_by_user_id", authUser.uid)
        .order("id", { ascending: false });

      return json(200, { referrals: refs || [] });
    }

    // ADMIN LOGIN
    if (method === "POST" && path === "/admin/login") {
      const { phone, pin } = body;
      if (phone !== adminPhone || pin !== adminPin) {
        return json(401, { error: "Admin giris yanlisdir" });
      }
      const token = makeToken({ uid: "ADMIN", role: "admin", phone: adminPhone });
      return json(200, { token });
    }

    // ADMIN USERS
    if (method === "GET" && path === "/admin/users") {
      const authUser = parseToken(event);
      if (authUser.role !== "admin") return json(403, { error: "Yalniz admin" });

      const { data: users } = await supabase
        .from("users")
        .select("user_id,name,phone,balance,is_banned,referral_code,referred_by_code,register_ip,created_at,used_promo_codes")
        .order("id", { ascending: false });

      return json(200, { users: users || [] });
    }

    // ADMIN BAN/UNBAN
    if (method === "PATCH" && path.startsWith("/admin/users/") && path.endsWith("/ban")) {
      const authUser = parseToken(event);
      if (authUser.role !== "admin") return json(403, { error: "Yalniz admin" });

      const uid = decodeURIComponent(path.replace("/admin/users/", "").replace("/ban", ""));
      const banned = !!body.banned;

      await supabase.from("users").update({ is_banned: banned }).eq("user_id", uid);
      return json(200, { ok: true });
    }

    return json(404, { error: "Route tapilmadi" });
  } catch (e) {
    return json(500, { error: e.message || "Server xetasi" });
  }
};