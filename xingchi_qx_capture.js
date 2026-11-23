/**
 * 星驰API refresh_token 抓取 · Quantumult X
 * 只读取登录/续期响应，不在响应脚本里发请求；签到脚本首次运行时会轮换令牌。
 */

const AUTH_KEY = "xingchi_auth:default";
const LEGACY_KEY = "xingchi_qx_access_token";
const API_HOSTS = ["xingchiapi.com", "api.xingchiapi.com"];
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function readRaw(key) {
  try {
    if (typeof $persistentStore !== "undefined") return $persistentStore.read(key);
  } catch (e) {}
  try {
    if (typeof $prefs !== "undefined") return $prefs.valueForKey(key);
  } catch (e) {}
  return null;
}

function writeRaw(key, value) {
  try {
    if (typeof $persistentStore !== "undefined") {
      $persistentStore.write(String(value), key);
      return;
    }
  } catch (e) {}
  try {
    if (typeof $prefs !== "undefined") $prefs.setValueForKey(String(value), key);
  } catch (e) {}
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
    const parts = String(token || "").split(".");
    if (parts.length < 2) return "";
    const payload = JSON.parse(b64ToUtf8(parts[1])) || {};
    return String(payload.email || "").toLowerCase().trim();
  } catch (e) {
    return "";
  }
}

function unwrap(payload) {
  if (payload && payload.code !== undefined && payload.data) return payload.data;
  return payload;
}

function hostMatches(url) {
  try {
    const host = new URL(url).hostname;
    return API_HOSTS.some((suffix) => host === suffix || host.endsWith("." + suffix));
  } catch (e) {
    return false;
  }
}

const url = String(($request && $request.url) || "");
if (!hostMatches(url) || url.indexOf("/api/v1/auth/") < 0 || !$response) {
  $done({});
} else {
  let access = "";
  let refresh = "";
  try {
    const data = unwrap(JSON.parse($response.body || "{}")) || {};
    access = String(data.access_token || data.token || "").trim();
    refresh = String(data.refresh_token || data.refreshToken || data.rt || "").trim();
  } catch (e) {}

  const email = emailFromToken(access);
  if (!access && !refresh) {
    $done({});
  } else if (!email) {
    notify("星驰Token抓取", "暂未保存", "抓到令牌但解不出账号邮箱，本次跳过");
    $done({});
  } else {
    let previous = {};
    try {
      previous = JSON.parse(readRaw(AUTH_KEY) || "{}") || {};
    } catch (e) {}

    const now = Math.floor(Date.now() / 1000);
    const next = {
      email,
      access_token: access || previous.access_token || "",
      refresh_token: refresh || previous.refresh_token || "",
      expires_at: previous.expires_at || 0,
      seed_from_browser: !!(refresh && refresh !== previous.refresh_token),
      updated_at: now,
    };

    try {
      const payload = JSON.parse(b64ToUtf8(next.access_token.split(".")[1])) || {};
      if (payload.exp) next.expires_at = Number(payload.exp);
    } catch (e) {}
    if (!next.expires_at) next.expires_at = now + 86400;

    writeRaw(AUTH_KEY, JSON.stringify(next));
    if (next.access_token) writeRaw(LEGACY_KEY, next.access_token);
    notify("星驰Token抓取", "登录态已保存", [
      email,
      next.access_token ? "access_token 有" : "access_token 无",
      next.refresh_token ? "refresh_token 有" : "refresh_token 无",
      next.seed_from_browser ? "签到首次运行将轮换为独立令牌" : ""
    ].filter(Boolean).join("，"));
    $done({});
  }
}
