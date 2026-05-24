const { getPlans } = require("../../common/memory");

function normalizePlan(plan) {
  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  return {
    ...plan,
    taskRows: tasks.map((task) => ({
      id: task.id,
      date: task.scheduledDate,
      title: `第 ${task.dayIndex + 1} 天 · ${task.method}`,
      done: task.done
    }))
  };
}

Page({
  data: {
    plans: [],
    hasPlans: false
  },

  onShow() {
    const plans = getPlans();
    this.setData({
      plans: plans.map(normalizePlan),
      hasPlans: plans.length > 0
    });
  }
});
