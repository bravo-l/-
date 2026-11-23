/**
 * 星驰API 自动签到 · Quantumult X
 * 使用 refresh_token 独立续期链；首次抓取的浏览器令牌会立即轮换。
 */

const BASE_URL = "https://api.xingchiapi.com";
const API_ROOT = BASE_URL + "/api/v1";
const REFRESH_URL = API_ROOT + "/auth/refresh";
const CHECKIN_URL = API_ROOT + "/user/checkin";
const PROFILE_URL = API_ROOT + "/user/profile";
const AUTH_KEY = "xingchi_auth:default";
const LEGACY_KEY = "xingchi_qx_access_token";
const MANUAL_REFRESH_TOKEN = "";
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function storeApi() {
  if (typeof $prefs !== "undefined") return { read: $prefs.valueForKey, write: $prefs.setValueForKey };
  if (typeof $persistentStore !== "undefined") {
    return { read: (key) => $persistentStore.read(key), write: (value, key) => $persistentStore.write(value, key) };
  }
  return null;
}

function readRaw(key) {
  const store = storeApi();
  try {
    return store ? store.read(key) : null;
  } catch (e) {
    return null;
  }
}

function writeRaw(key, value) {
  const store = storeApi();
  try {
    if (store) store.write(String(value), key);
  } catch (e) {}
}

function readState() {
  try {
    const state = JSON.parse(readRaw(AUTH_KEY) || "{}");
    return state && typeof state === "object" ? state : {};
  } catch (e) {
    return {};
  }
}

function writeState(state) {
  writeRaw(AUTH_KEY, JSON.stringify(state));
}

function notify(title, subtitle, body) {
  try {
    $notify(title, subtitle, body);
  } catch (e) {
    $notification.post(title, subtitle, body);
  }
}

function b64ToUtf8(input) {
  const str = String(input || "").replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  let buffer = 0;
  let bits = 0;
  const bytes = [];
  for (const ch of str) {
    const value = B64_CHARS.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes.map((byte) => String.fromCharCode(byte)).join("");
}

function emailFromToken(token) {
  try {
    const payload = JSON.parse(b64ToUtf8(String(token || "").split(".")[1])) || {};
    return String(payload.email || "").toLowerCase().trim();
  } catch (e) {
    return "";
  }
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function unwrap(raw) {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (payload && payload.code !== undefined && payload.data) return payload.data;
    return payload;
  } catch (e) {
    return null;
  }
}

function request(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = { url, method, headers, timeout: 20000 };
    if (body !== undefined) options.body = body;
    $task.fetch(options).then(
      (resp) => resolve({ status: resp.status, data: resp.body }),
      (error) => reject(new Error(error && error.error ? error.error : "network error"))
    );
  });
}

function apiHeaders(token) {
  return {
    Accept: "application/json",
    Authorization: "Bearer " + token,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept-Language": "zh-CN,zh;q=0.9",
  };
}

async function refreshToken(refreshToken) {
  if (!refreshToken) return null;
  const resp = await request(REFRESH_URL, "POST", {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Accept-Language": "zh-CN,zh;q=0.9",
  }, JSON.stringify({ refresh_token: refreshToken }));
  const data = unwrap(resp.data);
  if (resp.status >= 400 || !data || !data.access_token) return null;
  return {
    access_token: String(data.access_token),
    refresh_token: String(data.refresh_token || refreshToken),
    expires_in: Number(data.expires_in || 86400),
  };
}

async function resolveAuth() {
  let state = readState();
  if (!state.refresh_token) {
    const manual = String(MANUAL_REFRESH_TOKEN || "").trim();
    if (manual) state.refresh_token = manual;
  }
  if (!state.refresh_token) {
    const legacy = String(readRaw(LEGACY_KEY) || "").trim();
    if (legacy && emailFromToken(legacy)) state.access_token = legacy;
  }

  if (state.seed_from_browser && state.refresh_token) {
    const rotated = await refreshToken(state.refresh_token);
    if (rotated && emailFromToken(rotated.access_token) === state.email) {
      state = {
        email: state.email,
        access_token: rotated.access_token,
        refresh_token: rotated.refresh_token,
        expires_at: nowSec() + rotated.expires_in,
        seed_from_browser: false,
        updated_at: nowSec(),
      };
      writeState(state);
      return { token: state.access_token, state, message: "已轮换为独立登录态" };
    }
  }

  if (state.access_token && (!state.expires_at || Number(state.expires_at) - 120 > nowSec())) {
    return { token: state.access_token, state, message: "" };
  }

  const rotated = await refreshToken(state.refresh_token);
  if (rotated && (!state.email || emailFromToken(rotated.access_token) === state.email)) {
    state = {
      email: emailFromToken(rotated.access_token) || state.email || "",
      access_token: rotated.access_token,
      refresh_token: rotated.refresh_token,
      expires_at: nowSec() + rotated.expires_in,
      seed_from_browser: false,
      updated_at: nowSec(),
    };
    writeState(state);
    return { token: state.access_token, state, message: "已续期登录态" };
  }

  throw new Error("refresh_token 已失效，请重新登录触发抓取");
}

async function doCheckin(token) {
  const statusResp = await request(CHECKIN_URL, "GET", apiHeaders(token), undefined);
  if (statusResp.status === 401) throw new Error("登录态失效");
  if (statusResp.status >= 400) throw new Error("查询签到状态失败（HTTP " + statusResp.status + "）");
  const status = unwrap(statusResp.data) || {};
  if (status.enabled === false) return { skipped: true, message: "站点未开启签到" };
  if (status.claimed_today) return { skipped: true, message: "今日已签到" };

  const claimResp = await request(CHECKIN_URL, "POST", Object.assign(apiHeaders(token), { "Content-Type": "application/json" }), "{}");
  if (claimResp.status === 401) throw new Error("登录态失效");
  if (claimResp.status >= 400) {
    const payload = unwrap(claimResp.data) || {};
    throw new Error(payload.message || payload.msg || "签到请求失败（HTTP " + claimResp.status + "）");
  }
  return unwrap(claimResp.data) || {};
}

function formatQuota(value) {
  if (typeof value !== "number" || !isFinite(value)) return String(value);
  return value + " 额度（约 $" + (value / 500000).toFixed(4) + "）";
}

(async () => {
  try {
    const auth = await resolveAuth();
    if (!auth.token) throw new Error("缺少登录态，请重新登录触发抓取");

    const result = await doCheckin(auth.token);
    let profile = null;
    try {
      const resp = await request(PROFILE_URL, "GET", apiHeaders(auth.token), undefined);
      profile = unwrap(resp.data);
    } catch (e) {}

    const balance = profile && (profile.quota !== undefined ? profile.quota : profile.balance);
    const body = [
      auth.message,
      result.message,
      balance !== undefined ? "当前余额：" + formatQuota(balance) : ""
    ].filter(Boolean).join("，");
    notify("星驰API 签到", result.skipped ? "无需重复签到" : "签到成功", body || "已自动签到");
    $done();
  } catch (error) {
    notify("星驰API 签到", "签到失败", error.message || String(error));
    $done();
  }
})();
