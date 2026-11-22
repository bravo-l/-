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

const available = names.filter((name) => typeof eval(name) !== "undefined");
const unavailable = names.filter((name) => typeof eval(name) === "undefined");

$done({
  available: available.join(", "),
  unavailable: unavailable.join(", "),
});
