const { getTodayReviews, hasPlans } = require("../../common/memory");

function formatDateLabel(now = new Date()) {
  const weekdays = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return `${now.getMonth() + 1}月${now.getDate()}日${weekdays[now.getDay()]}`;
}

Page({
  data: {
    reviews: [],
    reviewCount: 0,
    dateLabel: "",
    hasPlans: false
  },

  onShow() {
    const reviews = getTodayReviews();
    this.setData({
      reviews,
      reviewCount: reviews.length,
      dateLabel: formatDateLabel(),
      hasPlans: hasPlans()
    });
  },

  openPractice(event) {
    const id = event.currentTarget.dataset.id;
    const planId = event.currentTarget.dataset.planId;
    const query = planId ? `id=${id}&planId=${planId}` : `id=${id}`;
    wx.navigateTo({ url: `/pages/practice/index?${query}` });
  },

  goLibrary() {
    wx.redirectTo({ url: "/pages/library/index" });
  }
});
