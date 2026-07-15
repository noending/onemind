import { useState } from 'react';
import { Button, DataTable, FilterBar, PageHeader, SearchField, Section, StatusBadge } from '../components/ui.jsx';

function money(value) {
  return `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '未记录' : date.toLocaleString('zh-CN', { hour12: false });
}

function titleCell(title, subtitle) {
  return <span className="primary-cell"><strong>{title || '未命名'}</strong><small>{subtitle || '暂无说明'}</small></span>;
}

export function ProductsPage({ rows, canWrite, onCreate, onEdit, onArchive }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const filtered = rows.filter((item) => (
    (!query || [item.title, item.subtitle, item.tag].some((value) => String(value || '').toLowerCase().includes(query.toLowerCase())))
    && (!category || item.category === category)
    && (!status || item.status === status)
  ));
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="商城运营" title="商品" description="小程序商品目录、价格、库存与上下架共用服务端数据。" actions={canWrite ? <Button icon="Plus" onClick={onCreate}>新增商品</Button> : null} />
      <section className="commerce-summary">
        <div><span>全部商品</span><strong>{rows.length}</strong><small>包含草稿与下架</small></div>
        <div><span>已上架</span><strong>{rows.filter((item) => item.status === 'published').length}</strong><small>小程序当前可见</small></div>
        <div><span>精选商品</span><strong>{rows.filter((item) => item.isFeatured).length}</strong><small>首页主题位</small></div>
        <div><span>低库存</span><strong>{rows.filter((item) => Number(item.stock || 0) < 10).length}</strong><small>需及时补充</small></div>
      </section>
      <Section className="table-section">
        <FilterBar meta={`显示 ${filtered.length} / ${rows.length} 项`}>
          <SearchField value={query} onChange={setQuery} placeholder="搜索商品、标签或说明" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="商品分类"><option value="">全部分类</option><option value="经文音频">经文音频</option><option value="唐卡 · 壁纸">唐卡 · 壁纸</option><option value="图鉴">图鉴</option></select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="商品状态"><option value="">全部状态</option><option value="published">已上架</option><option value="draft">草稿</option><option value="archived">已下架</option></select>
        </FilterBar>
        <DataTable rows={filtered} emptyTitle="暂无商品" columns={[
          { key: 'title', label: '商品', render: (row) => titleCell(row.title, `${row.category} · ${row.tag || '普通商品'}`) },
          { key: 'price', label: '价格', render: (row) => <span className="price-cell">{money(row.price)}{row.originalPrice ? <small>{money(row.originalPrice)}</small> : null}</span> },
          { key: 'stock', label: '库存', render: (row) => Number(row.stock || 0) },
          { key: 'isFeatured', label: '推荐位', render: (row) => row.isFeatured ? <StatusBadge value="published" label="精选" /> : '—' },
          { key: 'status', label: '状态', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'updatedAt', label: '最近更新', render: (row) => dateTime(row.updatedAt) },
          { key: 'actions', label: '操作', className: 'cell-actions', render: (row) => canWrite ? <span className="row-actions"><button type="button" onClick={() => onEdit(row)}>编辑</button><button type="button" className="danger-link" onClick={() => onArchive(row)}>下架</button></span> : '只读' }
        ]} />
      </Section>
    </div>
  );
}

export function OrdersPage({ rows, canManage, onUpdateStatus }) {
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const filtered = rows.filter((item) => (!status || item.status === status) && (!paymentStatus || item.paymentStatus === paymentStatus));
  const paidRevenue = rows.filter((item) => item.paymentStatus === 'paid').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return (
    <div className="page-stack resource-page">
      <PageHeader eyebrow="商城运营" title="订单" description="订单流转与支付结果分离管理，支付状态只接受服务端确认。" />
      <section className="commerce-summary order-summary">
        <div><span>订单总数</span><strong>{rows.length}</strong><small>当前筛选范围</small></div>
        <div><span>已支付金额</span><strong>{money(paidRevenue)}</strong><small>不含未支付订单</small></div>
        <div><span>待处理</span><strong>{rows.filter((item) => ['paid', 'processing'].includes(item.status)).length}</strong><small>需要运营跟进</small></div>
        <div><span>未支付</span><strong>{rows.filter((item) => item.paymentStatus === 'unpaid').length}</strong><small>不可手动标记成功</small></div>
      </section>
      <Section className="table-section">
        <FilterBar meta={`共 ${filtered.length} 笔订单`}>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="订单状态"><option value="">全部订单状态</option><option value="pending">待支付</option><option value="paid">已支付</option><option value="processing">处理中</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select>
          <select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} aria-label="支付状态"><option value="">全部支付状态</option><option value="paid">已支付</option><option value="unpaid">未支付</option><option value="refunded">已退款</option></select>
        </FilterBar>
        <DataTable rows={filtered} emptyTitle="暂无订单" columns={[
          { key: 'orderNo', label: '订单', render: (row) => titleCell(row.orderNo, `${row.items?.length || 0} 件商品 · ${dateTime(row.createdAt)}`) },
          { key: 'userNickname', label: '用户', render: (row) => titleCell(row.userNickname || '微信用户', row.userId) },
          { key: 'amount', label: '金额', render: (row) => <strong>{money(row.amount)}</strong> },
          { key: 'paymentStatus', label: '支付', render: (row) => <StatusBadge value={row.paymentStatus} /> },
          { key: 'status', label: '订单状态', render: (row) => <StatusBadge value={row.status} /> },
          { key: 'updatedAt', label: '最近更新', render: (row) => dateTime(row.updatedAt) },
          { key: 'actions', label: '操作', className: 'cell-actions', render: (row) => canManage ? <OrderAction row={row} onUpdate={onUpdateStatus} /> : '只读' }
        ]} />
      </Section>
    </div>
  );
}

function OrderAction({ row, onUpdate }) {
  const nextStatus = row.status === 'paid' ? 'processing' : row.status === 'processing' ? 'completed' : '';
  if (!nextStatus) return <span className="muted-cell">无需操作</span>;
  return <button type="button" onClick={() => onUpdate(row, nextStatus)}>{nextStatus === 'processing' ? '开始处理' : '标记完成'}</button>;
}
