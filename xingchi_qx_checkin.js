/**
 * 星驰API 自动签到 · Quantumult X
 * 用法：圈X 重写引用 xingchi_qx_module.conf，脚本本地/远程均可。
 * 首次签到请在圈X [mitm] 里开启域名解密，或直接在持久化存储中保存 access_token。
 */

const BASE_URL = "https://api.xingchiapi.com";
const STATUS_URL = BASE_URL + "/api/v1/lottery";
const CHECKIN_URL = BASE_URL + "/api/v1/lottery/draw";
const PROFILE_URL = BASE_URL + "/api/v1/auth/me";
const STORE_KEY = "xingchi_qx_access_token";
const MANUAL_ACCESS_TOKEN = "";
const QUOTA_PER_DOLLAR = 500000;

function readToken() {
  if (MANUAL_ACCESS_TOKEN.trim()) {
    return MANUAL_ACCESS_TOKEN.trim();
  }
  let token = $persistentStore.read(STORE_KEY) || "";
  if (!token) {
    token = $prefs.valueForKey(STORE_KEY) || "";
  }
  return String(token).trim();
}

function saveToken(token) {
  if (!token) return;
  try {
    $persistentStore.write(String(token), STORE_KEY);
  } catch (e) {
    $prefs.setValueForKey(String(token), STORE_KEY);
  }
}

function notify(title, subtitle, body) {
  try {
    $notify(title, subtitle, body);
  } catch (e) {
    $notification.post(title, subtitle, body);
  }
}

function request(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const options = { url, method, headers, body, timeout: 15000 };
    $task.fetch(options).then(
      (resp) => resolve({ status: resp.status, data: resp.body }),
      (error) => reject(new Error(error && error.error ? error.error : "network error"))
    );
  });
}

function unwrap(raw) {
  try {
    const payload = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (payload && payload.code !== undefined && payload.data) return payload.data;
    return payload;
  } catch (e) {
    throw new Error("响应 JSON 解析失败：" + (e && e.message));
  }
}


async function getProfile(token) {
  const resp = await request(PROFILE_URL, "GET", {
    Authorization: "Bearer " + token,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  }, undefined);
  return unwrap(resp.data);
}

async function doCheckin(token) {
  const resp = await request(CHECKIN_URL, "POST", {
    Authorization: "Bearer " + token,
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  }, undefined);
  try {
    return unwrap(resp.data);
  } catch (e) {
    let payload = {};
    try { payload = JSON.parse(resp.data || "{}"); } catch (parseError) {}
    throw new Error(payload.message || "签到请求失败（HTTP " + resp.status + "）");
  }
}

function formatQuota(value) {
  if (typeof value !== "number" || !isFinite(value)) return String(value);
  return value + " 额度（约 $" + (value / QUOTA_PER_DOLLAR).toFixed(4) + "）";
}

(async () => {
  try {
    const token = readToken();
    if (!token) {
      notify("星驰API 签到", "缺少 access_token", "请从浏览器 localStorage 中复制 auth_token 并写入配置");
      $done();
      return;
    }

    await doCheckin(token);
    let profile;
    try {
      profile = await getProfile(token);
    } catch (e) {
      profile = null;
    }

    const balance = profile && (profile.quota !== undefined ? profile.quota : profile.balance);
    notify("星驰API 签到", "签到成功", balance !== undefined ? "当前余额：" + formatQuota(balance) : "已自动签到");
    $done();
  } catch (error) {
    notify("星驰API 签到", "签到失败", error.message || String(error));
    $done();
  }
})();
