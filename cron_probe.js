/**
 * Quantumult X Cron Task 环境探测脚本
 * 添加为定时任务并手动执行一次，通知会列出可用内置对象。
 */

const names = [
  "$persistentStore",
  "$prefs",
  "$task",
  "$notify",
  "$notification",
  "$done",
  "$request",
  "$response",
  "$http",
  "$cache",
];

const available = names.filter((name) => {
  try {
    return typeof eval(name) !== "undefined";
  } catch (e) {
    return false;
  }
});
const unavailable = names.filter((name) => {
  try {
    return typeof eval(name) === "undefined";
  } catch (e) {
    return true;
  }
});

try {
  $notify("环境探测", "可用", available.join(", ") || "无");
  $notify("环境探测", "不可用", unavailable.join(", ") || "无");
} catch (e) {}

if (typeof $done === "function") {
  $done({
    available: available.join(", "),
    unavailable: unavailable.join(", "),
  });
}
