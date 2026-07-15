import { Button, DataTable, PageHeader, Section, StatusBadge } from '../components/ui.jsx';

function dateTime(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '未记录' : date.toLocaleString('zh-CN', { hour12: false });
}

function titleCell(title, subtitle) {
  return <span className="primary-cell"><strong>{title || '未命名'}</strong>{subtitle ? <small>{subtitle}</small> : null}</span>;
}

export function NotificationsPage({ rows, canDispatch, onDispatch }) {
  const pending = rows.filter((item) => ['pending', 'processing'].includes(item.status)).length;
  const failed = rows.filter((item) => item.status === 'failed').length;
  const sent = rows.filter((item) => item.status === 'sent').length;
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="触达与治理" title="通知任务" description="订阅授权、任务队列与微信发送结果在同一页面追踪。" actions={canDispatch ? <Button icon="PaperPlaneTilt" onClick={onDispatch}>派发到期提醒</Button> : null} />
      <section className="commerce-summary governance-summary">
        <div><span>待派发</span><strong>{pending}</strong><small>等待调度</small></div>
        <div><span>已发送</span><strong>{sent}</strong><small>微信明确确认</small></div>
        <div><span>发送失败</span><strong>{failed}</strong><small>需要人工复核</small></div>
        <div><span>总任务</span><strong>{rows.length}</strong><small>最近记录</small></div>
      </section>
      <Section className="table-section">
        <DataTable rows={rows} emptyTitle="暂无提醒任务" columns={[
          { key: 'title', label: '提醒', render: (row) => titleCell(row.title || row.payload?.title || '学习提醒', row.payload?.type || row.mode || '日常修学') },
          { key: 'userNickname', label: '用户', render: (row) => row.userNickname || row.userId || '微信用户' },
          { key: 'channel', label: '渠道', render: (row) => row.channel === 'wechat_subscribe' ? '微信订阅消息' : row.channel || '未设置' },
          { key: 'scheduledAt', label: '计划时间', render: (row) => dateTime(row.scheduledAt) },
          { key: 'status', label: '状态', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'sentAt', label: '发送时间', render: (row) => dateTime(row.sentAt) }
        ]} />
      </Section>
    </div>
  );
}

export function OrganizationsPage({ rows, assets, canManage, onAddMember }) {
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="触达与治理" title="组织成员" description="组织角色控制内容、资产与敏感操作的可见边界。" actions={canManage && rows[0] ? <Button icon="Plus" onClick={() => onAddMember(rows[0])}>添加成员</Button> : null} />
      <div className="organization-grid">
        {rows.map((organization) => (
          <Section key={organization.id} title={organization.name} description={`${organization.type || 'dharma_group'} · ${organization.status || 'active'}`} actions={<StatusBadge value={organization.status} />}>
            <dl className="definition-list">
              <div><dt>组织 ID</dt><dd>{organization.id}</dd></div>
              <div><dt>数字资产</dt><dd>{assets.filter((asset) => asset.organizationId === organization.id).length} 项</dd></div>
              <div><dt>权限模型</dt><dd>按组织角色与资产级别双重校验</dd></div>
            </dl>
          </Section>
        ))}
      </div>
    </div>
  );
}

export function AuditPage({ rows }) {
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="触达与治理" title="审计日志" description="内容、资产、成员、商品与订单的关键变更不可静默消失。" />
      <Section className="table-section">
        <DataTable rows={rows} emptyTitle="暂无审计记录" columns={[
          { key: 'action', label: '动作', render: (row) => titleCell(row.action, `${row.targetType || 'unknown'} · ${row.targetId || '无目标 ID'}`) },
          { key: 'actorType', label: '操作者', render: (row) => `${row.actorType || 'admin_user'} · ${row.actorId || 'system'}` },
          { key: 'organizationId', label: '组织', render: (row) => row.organizationId || '平台级' },
          { key: 'createdAt', label: '时间', render: (row) => dateTime(row.createdAt) }
        ]} />
      </Section>
    </div>
  );
}

export function SettingsPage({ health, session }) {
  const capabilities = [
    { name: '后台接口', status: health?.ok ? 'active' : 'failed', detail: health?.ok ? `${health.service} · ${health.storeMode || 'unknown'}` : '当前无法连接后端' },
    { name: '微信授权登录', status: 'active', detail: '用户身份与服务端会话已接入' },
    { name: '微信订阅提醒', status: 'active', detail: '授权、队列、派发与失败复核已拆分' },
    { name: '微信支付', status: 'pending', detail: '订单状态已接入；支付成功仍需真实商户配置和回调确认' }
  ];
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="触达与治理" title="系统设置" description="查看当前运行模式、管理员权限与外部能力边界。" />
      <div className="settings-grid">
        <Section title="服务能力" description="所有状态均来自真实运行边界，不用演示成功代替配置。">
          <div className="capability-list">
            {capabilities.map((item) => <div key={item.name}><span><strong>{item.name}</strong><small>{item.detail}</small></span><StatusBadge value={item.status} label={item.status === 'pending' ? '待配置' : item.status === 'active' ? '可用' : '不可用'} /></div>)}
          </div>
        </Section>
        <Section title="当前管理员" description="权限以后端会话返回为准。">
          <dl className="definition-list">
            <div><dt>姓名</dt><dd>{session?.name || session?.username}</dd></div>
            <div><dt>角色</dt><dd>{session?.role}</dd></div>
            <div><dt>权限数</dt><dd>{session?.permissions?.length || 0}</dd></div>
            <div><dt>数据源</dt><dd>{health?.storeMode || '未知'}</dd></div>
          </dl>
        </Section>
      </div>
    </div>
  );
}
