const { getPlanRows, syncPlansFromBackend } = require("../../common/memory");

Page({
  data: {
    plans: [],
    hasPlans: false
  },

  onShow() {
    syncPlansFromBackend().finally(() => {
      const plans = getPlanRows();
      this.setData({
        plans,
        hasPlans: plans.length > 0
      });
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
