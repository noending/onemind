const { contents, findContent } = require("../../common/content");
const { createMemoryPlan, upsertPlan } = require("../../common/memory");

Page({
  data: {
    filters: ["全部", "短咒", "短偈", "经文片段"],
    activeFilter: "全部",
    contents,
    filteredContents: contents,
    picked: null,
    showLongTip: false
  },

  changeFilter(event) {
    const activeFilter = event.currentTarget.dataset.filter;
    const filteredContents = activeFilter === "全部"
      ? this.data.contents
      : this.data.contents.filter((item) => item.category === activeFilter);

    this.setData({ activeFilter, filteredContents });
  },

  pickContent(event) {
    const id = event.currentTarget.dataset.id;
    const picked = findContent(id);
    if (!picked) return;
    this.setData({
      picked,
      showLongTip: picked.lengthTier === "long" && picked.planDays > 7
    });
  },

  closeSheet() {
    this.setData({ picked: null, showLongTip: false });
  },

  acceptPlan() {
    if (!this.data.picked) return;
    const plan = createMemoryPlan(this.data.picked);
    const savedPlan = upsertPlan(plan);
    wx.navigateTo({ url: `/pages/practice/index?id=${this.data.picked.id}&planId=${savedPlan.id}` });
  },

  goHome() {
    wx.redirectTo({ url: "/pages/home/index" });
  }
});
