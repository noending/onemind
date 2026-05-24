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

function getPlatformChecklist() {
  return [
    {
      key: "layout",
      title: "布局与安全区",
      desc: "检查顶部安全区、底栏、训练页反馈按钮和商城卡片是否溢出。",
      status: "pending"
    },
    {
      key: "asset",
      title: "图片与 SVG",
      desc: "检查商城图片、唐卡图片、底栏 SVG 图标是否正常显示。",
      status: "pending"
    },
    {
      key: "storage",
      title: "本地存储",
      desc: "创建计划、完成训练、进入我的页后进度应保持一致。",
      status: "pending"
    },
    {
      key: "navigation",
      title: "页面跳转",
      desc: "首页、内容库、训练页、商城、我的、计划页应能顺畅进出。",
      status: "pending"
    },
    {
      key: "reminder",
      title: "提醒策略",
      desc: "当前端应显示正确提醒方案，并能降级为站内待办。",
      status: "pending"
    }
  ];
}

module.exports = {
  getPlatformInfo,
  getPlatformLabel,
  getReminderStrategy,
  getReminderCapabilities,
  getPlatformChecklist
};
