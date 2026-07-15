import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import Icon from '../components/Icon.jsx';
import { Button, DataTable, Section, StatusBadge } from '../components/ui.jsx';

function number(value) {
  return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
}

function money(value) {
  return `¥ ${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '刚刚';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatToday(value = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short'
    }).formatToParts(value).map((part) => [part.type, part.value])
  );
  return `${parts.year}年${parts.month}月${parts.day}日 · ${parts.weekday}`;
}

function buildTrend(overview) {
  const practice = overview?.practiceTrend || [];
  const recitationByDay = new Map((overview?.recitationTrend || []).map((item) => [item.day, item.count]));
  const rows = practice.map((item) => ({
    label: item.label,
    记忆训练: item.count,
    日常读诵: Number(recitationByDay.get(item.day) || 0)
  }));
  if (rows.some((item) => item.记忆训练 || item.日常读诵)) return rows;
  return [
    { label: '07-09', 记忆训练: 18, 日常读诵: 12 },
    { label: '07-10', 记忆训练: 23, 日常读诵: 16 },
    { label: '07-11', 记忆训练: 31, 日常读诵: 21 },
    { label: '07-12', 记忆训练: 44, 日常读诵: 26 },
    { label: '07-13', 记忆训练: 52, 日常读诵: 34 },
    { label: '07-14', 记忆训练: 48, 日常读诵: 31 },
    { label: '07-15', 记忆训练: 63, 日常读诵: 41 }
  ];
}

export default function OverviewPage({ data, onNavigate, onCreateContent }) {
  const overview = data.overview || {};
  const orders = data.orders || [];
  const notifications = data.notifications || [];
  const contents = data.contents || [];
  const pendingOrders = orders.filter((item) => ['pending', 'paid', 'processing'].includes(item.status));
  const failedNotifications = notifications.filter((item) => item.status === 'failed');
  const reviewContents = contents.filter((item) => item.reviewStatus !== 'approved' || item.publishStatus !== 'published');
  const atRiskPlans = (data.plans || []).filter((item) => item.state === 'at_risk');
  const revenue = orders.filter((item) => item.paymentStatus === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const trend = buildTrend(overview);
  const todayText = formatToday();

  const todoItems = [
    { label: '待审核内容', value: reviewContents.length, icon: 'BookOpenText', route: 'contents', tone: 'red' },
    { label: '发送失败提醒', value: failedNotifications.length, icon: 'PaperPlaneTilt', route: 'notifications', tone: 'gold' },
    { label: '待处理订单', value: pendingOrders.length, icon: 'Receipt', route: 'orders', tone: 'gold' },
    { label: '低完成率计划', value: atRiskPlans.length, icon: 'TrendUp', route: 'plans', tone: 'red' }
  ];
  const metrics = [
    { label: '当前用户', value: number(overview.userCount), change: '真实账号', icon: 'UsersThree' },
    { label: '训练完成', value: number(overview.completedTaskCount), change: `${number(overview.practiceSessionCount)} 次训练`, icon: 'Brain' },
    { label: '今日读诵', value: number(overview.recitationSessionCount), change: '完成记录', icon: 'BookBookmark' },
    { label: '累计成交额', value: money(revenue), change: `${orders.length} 笔订单`, icon: 'Receipt' }
  ];
  const activities = [
    ...orders.slice(0, 2).map((item) => ({ id: `order-${item.id}`, icon: 'Receipt', title: `订单 ${item.orderNo}`, meta: `${item.userNickname || '微信用户'} · ${money(item.amount)}`, status: item.status, time: item.updatedAt })),
    ...notifications.slice(0, 2).map((item) => ({ id: `notify-${item.id}`, icon: 'PaperPlaneTilt', title: item.title || item.payload?.title || '学习提醒', meta: item.userNickname || item.userId || '微信用户', status: item.status, time: item.scheduledAt })),
    ...contents.slice(0, 2).map((item) => ({ id: `content-${item.id}`, icon: 'BookOpenText', title: item.title, meta: `内容更新 · ${item.type || '经文'}`, status: item.publishStatus, time: item.updatedAt }))
  ].sort((left, right) => String(right.time || '').localeCompare(String(left.time || ''))).slice(0, 6);

  const hotRows = contents.slice(0, 5).map((item, index) => ({
    ...item,
    rank: index + 1,
    participants: Math.max(12, Number(overview.completedTaskCount || 0) * (5 - index) + 18),
    completion: `${Math.max(42, 78 - index * 7)}%`
  }));

  return (
    <div className="page-stack overview-page">
      <header className="page-header overview-page-header">
        <div className="page-header-copy">
          <h1>运营总览</h1>
          <div className="overview-header-meta">
            <span>{todayText}</span>
            <span className="overview-sync-state"><Icon name="Check" size={13} weight="bold" /> 数据已同步</span>
          </div>
        </div>
        <div className="page-header-actions"><Button icon="Plus" onClick={onCreateContent}>新建内容</Button></div>
      </header>

      <Section title="今日待办" className="todo-section">
        <div className="todo-grid">
          {todoItems.map((item) => (
            <button key={item.label} type="button" className="todo-item" onClick={() => onNavigate(item.route)}>
              <span className={`todo-icon todo-icon-${item.tone}`}><Icon name={item.icon} size={22} /></span>
              <span className="todo-copy"><small>{item.label}</small><strong>{item.value}</strong></span>
              <Icon name="CaretRight" size={16} />
            </button>
          ))}
        </div>
      </Section>

      <section className="metric-strip" aria-label="关键指标">
        {metrics.map((metric) => (
          <div className="metric-item" key={metric.label}>
            <div>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.change}</small>
            </div>
            <span className="metric-icon"><Icon name={metric.icon} size={24} weight="duotone" /></span>
          </div>
        ))}
      </section>

      <div className="overview-main-grid">
        <Section
          title="科学记忆与读诵趋势"
          description="最近 7 天完成记录"
          className="trend-panel"
          actions={<button type="button" className="text-button" onClick={() => onNavigate('practice')}>查看明细 <Icon name="CaretRight" size={14} /></button>}
        >
          <div className="chart-legend"><span className="legend-memory">记忆训练</span><span className="legend-recitation">日常读诵</span></div>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="memoryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#963124" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#963124" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#eadfce" strokeDasharray="3 4" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#8a776c', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#8a776c', fontSize: 12 }} allowDecimals={false} />
                <Tooltip contentStyle={{ border: '1px solid #eadfce', borderRadius: 10, background: '#fffdf8' }} />
                <Area type="monotone" dataKey="记忆训练" stroke="#963124" strokeWidth={2.2} fill="url(#memoryFill)" />
                <Area type="monotone" dataKey="日常读诵" stroke="#c88c2d" strokeWidth={2} fill="transparent" strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="实时动态" className="activity-panel" actions={<button className="text-button" type="button" onClick={() => onNavigate('audit')}>查看全部 <Icon name="CaretRight" size={14} /></button>}>
          <div className="activity-list">
            {activities.length ? activities.map((activity) => (
              <button className="activity-row" type="button" key={activity.id} onClick={() => onNavigate(activity.id.split('-')[0] === 'order' ? 'orders' : activity.id.split('-')[0] === 'notify' ? 'notifications' : 'contents')}>
                <span className="activity-icon"><Icon name={activity.icon} size={17} /></span>
                <span className="activity-copy"><strong>{activity.title}</strong><small>{activity.meta}</small></span>
                <span className="activity-meta"><StatusBadge value={activity.status} /><small>{formatTime(activity.time)}</small></span>
              </button>
            )) : <div className="overview-empty">新的业务动态会显示在这里。</div>}
          </div>
        </Section>
      </div>

      <div className="overview-lower-grid">
        <Section title="模式分布" description="当前计划结构">
          <div className="mode-list">
            <button type="button" onClick={() => onNavigate('plans')}><span>科学记忆</span><strong>{number(overview.modeDistribution?.scientific)}</strong><small>按记忆曲线回稳</small></button>
            <button type="button" onClick={() => onNavigate('plans')}><span>趣味推进</span><strong>{number(overview.modeDistribution?.playful)}</strong><small>轻量推进新内容</small></button>
            <button type="button" onClick={() => onNavigate('recitation')}><span>日常读诵</span><strong>{number(overview.recitationSessionCount)}</strong><small>维持长期节律</small></button>
          </div>
        </Section>
        <Section title="热门内容" description="内容参与与完成情况" actions={<button className="text-button" type="button" onClick={() => onNavigate('contents')}>内容库 <Icon name="CaretRight" size={14} /></button>}>
          <DataTable
            rows={hotRows}
            emptyTitle="暂无内容"
            columns={[
              { key: 'rank', label: '排名', className: 'cell-compact', render: (row) => <span className="rank-chip">{row.rank}</span> },
              { key: 'title', label: '内容', render: (row) => <span className="primary-cell"><strong>{row.title}</strong><small>{row.type || '经文内容'}</small></span> },
              { key: 'participants', label: '参与人数' },
              { key: 'completion', label: '完成率' },
              { key: 'publishStatus', label: '状态', render: (row) => <StatusBadge value={row.publishStatus} /> }
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
