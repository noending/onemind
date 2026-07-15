import { useState } from 'react';
import { Button, DataTable, FilterBar, PageHeader, SearchField, Section, StatusBadge } from '../components/ui.jsx';

function includesQuery(item, query, fields) {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) return true;
  return fields.some((field) => String(item?.[field] || '').toLowerCase().includes(normalized));
}

function formatDate(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '未记录';
  return date.toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function modeLabel(value) {
  return value === 'playful' ? '趣味推进' : '科学记忆';
}

function titleCell(title, subtitle) {
  return <span className="primary-cell"><strong>{title || '未命名'}</strong>{subtitle ? <small>{subtitle}</small> : null}</span>;
}

export function ContentsPage({ rows, canWrite, onCreate, onEdit, onArchive }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const filtered = rows.filter((item) => (
    includesQuery(item, query, ['title', 'body', 'scene'])
    && (!type || item.type === type)
    && (!status || item.publishStatus === status)
  ));
  return (
    <ResourcePage
      eyebrow="修学运营"
      title="内容库"
      description="经咒正文、训练模式、读诵能力与发布版本使用同一份内容源。"
      primaryAction={canWrite ? <Button icon="Plus" onClick={onCreate}>新建内容</Button> : null}
      filter={(
        <FilterBar meta={`共 ${filtered.length} 条内容`}>
          <SearchField value={query} onChange={setQuery} placeholder="搜索标题、正文或场景" />
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label="内容类型">
            <option value="">全部类型</option><option value="mantra">短咒</option><option value="verse">短偈</option><option value="sutra_segment">经文片段</option><option value="ritual">仪轨片段</option>
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="发布状态">
            <option value="">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option>
          </select>
        </FilterBar>
      )}
    >
      <DataTable rows={filtered} emptyTitle="没有符合条件的内容" columns={[
        { key: 'title', label: '内容', render: (row) => titleCell(row.title, row.scene) },
        { key: 'type', label: '类型', render: (row) => row.type || '未分类' },
        { key: 'defaultMode', label: '默认模式', render: (row) => modeLabel(row.defaultMode) },
        { key: 'planDays', label: '计划天数', render: (row) => `${row.planDays || 1} 天` },
        { key: 'reviewStatus', label: '审核', render: (row) => <StatusBadge value={row.reviewStatus} /> },
        { key: 'publishStatus', label: '发布', render: (row) => <StatusBadge value={row.publishStatus} /> },
        { key: 'updatedAt', label: '最近更新', render: (row) => formatDate(row.updatedAt) },
        { key: 'actions', label: '操作', className: 'cell-actions', render: (row) => canWrite ? <span className="row-actions"><button type="button" onClick={() => onEdit(row)}>编辑</button><button type="button" className="danger-link" onClick={() => onArchive(row)}>归档</button></span> : '只读' }
      ]} />
    </ResourcePage>
  );
}

export function FestivalsPage({ rows, canWrite, onCreate, onEdit, onArchive }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((item) => includesQuery(item, query, ['name', 'relatedFigure', 'lunarDate']));
  return (
    <ResourcePage eyebrow="修学运营" title="节日专题" description="节日当天的小程序推荐由这里配置和追溯。" primaryAction={canWrite ? <Button icon="Plus" onClick={onCreate}>新建专题</Button> : null} filter={<FilterBar meta={`共 ${filtered.length} 个专题`}><SearchField value={query} onChange={setQuery} placeholder="搜索节日或人物" /></FilterBar>}>
      <DataTable rows={filtered} emptyTitle="暂无节日专题" columns={[
        { key: 'name', label: '专题', render: (row) => titleCell(row.name, row.description) },
        { key: 'lunarDate', label: '农历' },
        { key: 'solarDate', label: '公历', render: (row) => row.solarDate || '按农历计算' },
        { key: 'relatedFigure', label: '相关人物' },
        { key: 'recommendedContentIds', label: '推荐内容', render: (row) => `${row.recommendedContentIds?.length || 0} 条` },
        { key: 'publishStatus', label: '状态', render: (row) => <StatusBadge value={row.publishStatus || 'published'} /> },
        { key: 'actions', label: '操作', className: 'cell-actions', render: (row) => canWrite ? <span className="row-actions"><button type="button" onClick={() => onEdit(row)}>编辑</button><button type="button" className="danger-link" onClick={() => onArchive(row)}>下架</button></span> : '只读' }
      ]} />
    </ResourcePage>
  );
}

export function AssetsPage({ rows, canWrite, onCreate, onEdit, onArchive }) {
  const [query, setQuery] = useState('');
  const [access, setAccess] = useState('');
  const filtered = rows.filter((item) => includesQuery(item, query, ['title', 'type']) && (!access || item.accessLevel === access));
  return (
    <ResourcePage eyebrow="修学运营" title="数字资产" description="统一管理音频、图片与文档的版权和访问边界。" primaryAction={canWrite ? <Button icon="Plus" onClick={onCreate}>新增资产</Button> : null} filter={<FilterBar meta={`共 ${filtered.length} 项资产`}><SearchField value={query} onChange={setQuery} placeholder="搜索资产名称" /><select value={access} onChange={(event) => setAccess(event.target.value)} aria-label="访问级别"><option value="">全部权限</option><option value="public">公开</option><option value="registered">登录可见</option><option value="member">组织成员</option><option value="restricted">指定人员</option><option value="private">私密</option></select></FilterBar>}>
      <DataTable rows={filtered} emptyTitle="暂无数字资产" columns={[
        { key: 'title', label: '资产', render: (row) => titleCell(row.title, row.url || '受限资源不返回原始地址') },
        { key: 'type', label: '类型' },
        { key: 'accessLevel', label: '访问级别', render: (row) => <StatusBadge value={row.accessLevel} label={row.accessLevel} /> },
        { key: 'copyrightStatus', label: '版权', render: (row) => row.copyrightStatus || '未标注' },
        { key: 'publishStatus', label: '状态', render: (row) => <StatusBadge value={row.publishStatus} /> },
        { key: 'actions', label: '操作', className: 'cell-actions', render: (row) => canWrite ? <span className="row-actions"><button type="button" onClick={() => onEdit(row)}>编辑</button><button type="button" className="danger-link" onClick={() => onArchive(row)}>下架</button></span> : '只读' }
      ]} />
    </ResourcePage>
  );
}

export function UsersPage({ rows }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((item) => includesQuery(item, query, ['id', 'nickname', 'platform']));
  return (
    <ResourcePage eyebrow="学习数据" title="用户" description="微信身份、修学计划和最近活动使用同一用户记录。" filter={<FilterBar meta={`共 ${filtered.length} 位用户`}><SearchField value={query} onChange={setQuery} placeholder="搜索昵称或用户 ID" /></FilterBar>}>
      <DataTable rows={filtered} emptyTitle="暂无用户数据" columns={[
        { key: 'nickname', label: '用户', render: (row) => titleCell(row.nickname, row.id) },
        { key: 'platform', label: '来源', render: () => '微信小程序' },
        { key: 'planCount', label: '记忆计划' },
        { key: 'practiceCount', label: '训练次数' },
        { key: 'recitationCount', label: '读诵次数' },
        { key: 'status', label: '状态', render: (row) => <StatusBadge value={row.status} /> },
        { key: 'lastActiveAt', label: '最近活跃', render: (row) => formatDate(row.lastActiveAt) }
      ]} />
    </ResourcePage>
  );
}

export function PlansPage({ rows }) {
  const [mode, setMode] = useState('');
  const filtered = rows.filter((item) => !mode || item.mode === mode);
  return (
    <ResourcePage eyebrow="学习数据" title="记忆计划" description="按科学记忆与趣味推进观察计划状态和掌握度。" filter={<FilterBar meta={`共 ${filtered.length} 个计划`}><select value={mode} onChange={(event) => setMode(event.target.value)} aria-label="训练模式"><option value="">全部模式</option><option value="scientific">科学记忆</option><option value="playful">趣味推进</option></select></FilterBar>}>
      <DataTable rows={filtered} emptyTitle="暂无记忆计划" columns={[
        { key: 'contentTitle', label: '内容', render: (row) => titleCell(row.contentTitle || row.title, row.userNickname || row.userId) },
        { key: 'mode', label: '模式', render: (row) => modeLabel(row.mode) },
        { key: 'progress', label: '进度', render: (row) => `${row.currentDay || 1} / ${row.totalDays || 1} 天` },
        { key: 'masteryScore', label: '掌握度', render: (row) => `${Math.round(Number(row.masteryScore || 0))}%` },
        { key: 'state', label: '状态', render: (row) => <StatusBadge value={row.state} /> },
        { key: 'updatedAt', label: '最近更新', render: (row) => formatDate(row.updatedAt || row.createdAt) }
      ]} />
    </ResourcePage>
  );
}

export function PracticePage({ rows }) {
  return <SessionPage kind="practice" rows={rows} />;
}

export function RecitationPage({ rows }) {
  return <SessionPage kind="recitation" rows={rows} />;
}

function SessionPage({ kind, rows }) {
  const [query, setQuery] = useState('');
  const filtered = rows.filter((item) => includesQuery(item, query, ['contentTitle', 'userNickname', 'mode', 'period']));
  const isPractice = kind === 'practice';
  return (
    <ResourcePage eyebrow="学习数据" title={isPractice ? '训练记录' : '日常读诵'} description={isPractice ? '查看训练结果、响应表现与遗忘风险。' : '查看读诵轮次、时段与持续节律。'} filter={<FilterBar meta={`共 ${filtered.length} 条记录`}><SearchField value={query} onChange={setQuery} placeholder="搜索内容或用户" /></FilterBar>}>
      <DataTable rows={filtered} emptyTitle={isPractice ? '暂无训练记录' : '暂无读诵记录'} columns={isPractice ? [
        { key: 'contentTitle', label: '内容', render: (row) => titleCell(row.contentTitle, row.userNickname || row.userId) },
        { key: 'mode', label: '模式', render: (row) => modeLabel(row.mode) },
        { key: 'resultLevel', label: '结果', render: (row) => <StatusBadge value={row.resultLevel} label={row.resultLevel || '已完成'} /> },
        { key: 'growthStage', label: '成长阶段', render: (row) => row.growthStage || '初见' },
        { key: 'mistakeCount', label: '错误数', render: (row) => Number(row.mistakeCount || 0) },
        { key: 'createdAt', label: '完成时间', render: (row) => formatDate(row.createdAt) }
      ] : [
        { key: 'contentTitle', label: '内容', render: (row) => titleCell(row.contentTitle, row.userNickname || row.userId) },
        { key: 'period', label: '时段', render: (row) => row.period === 'evening' ? '晚课' : '晨课' },
        { key: 'roundCount', label: '轮次', render: (row) => `${row.roundCount || 1} 轮` },
        { key: 'durationSeconds', label: '时长', render: (row) => `${Math.round(Number(row.durationSeconds || 0) / 60)} 分钟` },
        { key: 'completed', label: '状态', render: (row) => <StatusBadge value={row.completed ? 'completed' : 'pending'} /> },
        { key: 'createdAt', label: '完成时间', render: (row) => formatDate(row.createdAt) }
      ]} />
    </ResourcePage>
  );
}

function ResourcePage({ eyebrow, title, description, primaryAction, filter, children }) {
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow={eyebrow} title={title} description={description} actions={primaryAction} />
      <Section className="table-section">{filter}{children}</Section>
    </div>
  );
}
