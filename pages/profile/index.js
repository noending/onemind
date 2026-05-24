const { getProgressItems, savePlans } = require("../../common/memory");
const {
  getPlatformInfo,
  getPlatformLabel,
  getReminderStrategy,
  getReminderCapabilities,
  getPlatformChecklist
} = require("../../common/platform");

Page({
  data: {
    stats: {
      reviewing: 0,
      atRisk: 0,
      mastered: 0
    },
    reviewing: [],
    mastered: [],
    platform: {
      label: "多端 MiniApp",
      model: "",
      system: ""
    },
    reminderStrategy: "",
    capabilities: [],
    checklist: []
  },

  onShow() {
    this.refreshProgress();
  },

  refreshProgress() {
    const progress = getProgressItems();
    const info = getPlatformInfo();
    this.setData({
      stats: {
        reviewing: progress.reviewing.length,
        atRisk: progress.atRisk.length,
        mastered: progress.mastered.length
      },
      reviewing: progress.reviewing,
      mastered: progress.mastered,
      platform: {
        label: getPlatformLabel(info),
        model: info.model,
        system: info.system
      },
      reminderStrategy: getReminderStrategy(),
      capabilities: getReminderCapabilities(),
      checklist: getPlatformChecklist()
    });
  },

  openPlan() {
    wx.navigateTo({ url: "/pages/plan/index" });
  },

  resetDemo() {
    savePlans([]);
    this.refreshProgress();
    wx.showToast({ title: "已重置", icon: "success" });
  }
});
