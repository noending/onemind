const VALIDATION_STORAGE_KEY = "oneMind.phase2.validation";

function getPlatformInfo() {
  let info = {};
  try {
    info = wx.getSystemInfoSync();
  } catch (error) {
    info = {};
  }

  const host = info.host || {};
  const platform = info.platform || "unknown";

  return {
    platform,
    hostName: host.env || host.appId || "wechat-miniapp",
    system: info.system || "",
    model: info.model || ""
  };
}

function getPlatformLabel(info = getPlatformInfo()) {
  if (/HarmonyOS/i.test(info.system)) return "HarmonyOS MiniApp";
  if (info.platform === "ios") return "iOS MiniApp";
  if (info.platform === "android") return "Android MiniApp";
  if (info.hostName === "wechat" || info.hostName === "wechat-miniapp") return "微信小程序";
  return "多端 MiniApp";
}

function getReminderStrategy() {
  const info = getPlatformInfo();

  if (info.hostName === "wechat" || info.hostName === "wechat-miniapp") {
    return "微信端优先使用订阅消息与站内待办。";
  }

  if (info.platform === "ios" || info.platform === "android") {
    return "App 端使用系统通知与本地提醒。";
  }

  if (/HarmonyOS/i.test(info.system)) {
    return "鸿蒙端通过多端 MiniApp 通知适配层处理。";
  }

  return "当前端使用站内提醒。";
}

function getReminderCapabilities() {
  const info = getPlatformInfo();
  const isHarmony = /HarmonyOS/i.test(info.system);
  const isApp = info.platform === "ios" || info.platform === "android" || isHarmony;
  const isWechat = info.hostName === "wechat" || info.hostName === "wechat-miniapp";

  return [
    {
      key: "inbox",
      title: "站内待办",
      status: "available",
      desc: "首页展示今日待复习内容。"
    },
    {
      key: "subscribe",
      title: "订阅提醒",
      status: isWechat ? "ready" : "fallback",
      desc: isWechat ? "微信端后续接入订阅消息。" : "非微信端使用系统通知替代。"
    },
    {
      key: "system",
      title: "系统通知",
      status: isApp ? "ready" : "fallback",
      desc: isApp ? "App 容器后续接入本地通知。" : "小程序端以订阅消息和站内提醒为主。"
    }
  ];
}

function testStorage() {
  const key = "__oneMind_platform_probe__";
  const value = `${Date.now()}`;

  try {
    wx.setStorageSync(key, value);
    const stored = wx.getStorageSync(key);
    wx.removeStorageSync(key);
    return stored === value;
  } catch (error) {
    return false;
  }
}

function statusText(status) {
  if (status === "passed") return "通过";
  if (status === "failed") return "失败";
  return "待复测";
}

function getSavedValidationState() {
  try {
    const saved = wx.getStorageSync(VALIDATION_STORAGE_KEY);
    return saved && typeof saved === "object" ? saved : {};
  } catch (error) {
    return {};
  }
}

function saveValidationState(state) {
  wx.setStorageSync(VALIDATION_STORAGE_KEY, state);
}

function nextManualStatus(status) {
  if (status === "review") return "passed";
  if (status === "passed") return "failed";
  return "review";
}

function getPlatformChecklist() {
  const storageOk = testStorage();
  const savedState = getSavedValidationState();

  const rows = [
    {
      key: "layout",
      title: "布局与安全区",
      desc: "检查顶部安全区、底栏、训练页反馈按钮和商城卡片是否溢出。",
      status: "review"
    },
    {
      key: "asset",
      title: "图片与 SVG",
      desc: "检查商城图片、唐卡图片、底栏 SVG 图标是否正常显示。",
      status: "review"
    },
    {
      key: "storage",
      title: "本地存储",
      desc: storageOk ? "临时写入、读回、清理均成功。" : "存储读写失败，需要检查容器能力。",
      status: storageOk ? "passed" : "failed"
    },
    {
      key: "navigation",
      title: "页面跳转",
      desc: "首页、内容库、训练页、商城、我的、计划页应能顺畅进出。",
      status: "review"
    },
    {
      key: "reminder",
      title: "提醒策略",
      desc: "当前端应显示正确提醒方案，并能降级为站内待办。",
      status: "passed"
    }
  ];

  return rows.map((item) => {
    const saved = savedState[item.key];
    const status = item.key === "storage" || item.key === "reminder"
      ? item.status
      : (saved && saved.status) || item.status;

    return {
      ...item,
      status,
      statusText: statusText(status),
      updatedAt: saved && saved.updatedAt ? saved.updatedAt : ""
    };
  });
}

function toggleChecklistStatus(key) {
  const checklist = getPlatformChecklist();
  const current = checklist.find((item) => item.key === key);
  if (!current || current.key === "storage" || current.key === "reminder") {
    return getPlatformChecklist();
  }

  const savedState = getSavedValidationState();
  savedState[key] = {
    status: nextManualStatus(current.status),
    updatedAt: new Date().toISOString()
  };
  saveValidationState(savedState);
  return getPlatformChecklist();
}

function resetChecklistStatus() {
  saveValidationState({});
  return getPlatformChecklist();
}

module.exports = {
  getPlatformInfo,
  getPlatformLabel,
  getReminderStrategy,
  getReminderCapabilities,
  getPlatformChecklist,
  toggleChecklistStatus,
  resetChecklistStatus
};
