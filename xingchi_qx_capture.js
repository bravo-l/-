/**
 * 星驰API refresh_token 抓取 · Quantumult X
 * 匹配登录/续期响应，自动保存到持久化存储，供签到脚本使用。
 */

const STORE_KEY = "xingchi_qx_refresh_token";
const API_HOSTS = ["xingchiapi.com", "api.xingchiapi.com"];

function saveToken(token) {
  if (!token) return false;
  try {
    $persistentStore.write(String(token), STORE_KEY);
  } catch (e) {
    $prefs.setValueForKey(String(token), STORE_KEY);
  }
  return true;
}

function notify(title, subtitle, body) {
  try {
    $notify(title, subtitle, body);
  } catch (e) {
    $notification.post(title, subtitle, body);
  }
}

const host = $request.url.split("/")[2] || "";
const isAuthResponse = API_HOSTS.some((h) => host === h || host.endsWith("." + h)) && $request.url.indexOf("/api/v1/auth/") !== -1;

if ($response && isAuthResponse && ($request.method === "POST" || $request.method === "GET")) {
  try {
    const payload = JSON.parse($response.body || "{}");
    const data = payload && payload.data ? payload.data : payload;
    const token = data.refresh_token || data.token || "";
    if (saveToken(token)) {
      notify("星驰API", "refresh_token 已保存", "签到脚本将自动使用并轮换该令牌");
    }
  } catch (e) {}
}

$done({});
