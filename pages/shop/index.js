Page({
  data: {
    activeTab: "music",
    music: [
      { id: "m1", title: "心经·梵唱合集", artist: "灵山梵音", duration: "08:24", cover: "/assets/music-heart.jpg", price: 18, tag: "热门" },
      { id: "m2", title: "六字大明咒·颂钵冥想", artist: "雪域之声", duration: "12:10", cover: "/assets/music-mantra.jpg", price: 28, tag: "新上" },
      { id: "m3", title: "古琴禅意·静心三十分", artist: "山月音乐工坊", duration: "30:00", cover: "/assets/music-guqin.jpg", price: 36, tag: "精选" }
    ],
    thangka: [
      { id: "t1", title: "绿度母唐卡", desc: "传统矿物颜料 · 喇嘛开光", image: "/assets/thangka-tara.jpg", price: 1280, size: "40 × 60 cm", tag: "实物" },
      { id: "t2", title: "药师佛能量画", desc: "琉璃光加持 · 适合床头/书房", image: "/assets/thangka-medicine.jpg", price: 980, size: "30 × 45 cm", tag: "新品" },
      { id: "t3", title: "金色莲华曼陀罗", desc: "能量画 · 高清装裱", image: "/assets/thangka-mandala.jpg", price: 680, size: "40 × 40 cm", tag: "限量" }
    ]
  },

  switchTab(event) {
    this.setData({ activeTab: event.currentTarget.dataset.tab });
  }
});
