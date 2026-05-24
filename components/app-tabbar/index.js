Component({
  properties: {
    active: {
      type: String,
      value: "home"
    }
  },

  data: {
    tabs: [
      {
        key: "home",
        label: "今日",
        icon: "/assets/tabbar/home.svg",
        iconActive: "/assets/tabbar/home-active.svg",
        url: "/pages/home/index"
      },
      {
        key: "library",
        label: "选内容",
        icon: "/assets/tabbar/library.svg",
        iconActive: "/assets/tabbar/library-active.svg",
        url: "/pages/library/index"
      },
      {
        key: "shop",
        label: "商城",
        icon: "/assets/tabbar/shop.svg",
        iconActive: "/assets/tabbar/shop-active.svg",
        url: "/pages/shop/index"
      },
      {
        key: "profile",
        label: "我的",
        icon: "/assets/tabbar/profile.svg",
        iconActive: "/assets/tabbar/profile-active.svg",
        url: "/pages/profile/index"
      }
    ]
  },

  methods: {
    go(event) {
      const key = event.currentTarget.dataset.key;
      const url = event.currentTarget.dataset.url;
      if (key === this.properties.active) return;
      if (!url) return;
      wx.redirectTo({ url });
    }
  }
});
