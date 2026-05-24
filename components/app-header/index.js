Component({
  data: {
    statusBarHeight: 0
  },

  lifetimes: {
    attached() {
      let statusBarHeight = 0;
      try {
        if (typeof wx.getWindowInfo === "function") {
          statusBarHeight = wx.getWindowInfo().statusBarHeight || 0;
        } else {
          statusBarHeight = wx.getSystemInfoSync().statusBarHeight || 0;
        }
      } catch (error) {
        statusBarHeight = 0;
      }

      this.setData({
        statusBarHeight
      });
    }
  }
});
