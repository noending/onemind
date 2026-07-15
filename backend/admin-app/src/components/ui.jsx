import Icon from './Icon.jsx';

export function Button({ variant = 'primary', icon, children, className = '', ...props }) {
  return (
    <button className={`button button-${variant} ${className}`.trim()} {...props}>
      {icon ? <Icon name={icon} size={17} weight="bold" /> : null}
      <span>{children}</span>
    </button>
  );
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        {eyebrow ? <span className="eyebrow">{eyebrow}</span> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

const STATUS_LABELS = {
  active: '正常',
  approved: '已通过',
  archived: '已归档',
  cancelled: '已取消',
  completed: '已完成',
  draft: '草稿',
  failed: '失败',
  mastered: '已掌握',
  paid: '已支付',
  pending: '待处理',
  processing: '处理中',
  published: '已发布',
  refunded: '已退款',
  rejected: '已驳回',
  reviewing: '审核中',
  sent: '已发送',
  unpaid: '未支付'
};

export function StatusBadge({ value, label }) {
  const key = String(value || 'neutral').toLowerCase();
  const tone = ['failed', 'rejected', 'cancelled'].includes(key)
    ? 'danger'
    : ['published', 'approved', 'sent', 'completed', 'paid', 'active', 'mastered'].includes(key)
      ? 'success'
      : ['pending', 'processing', 'reviewing', 'unpaid'].includes(key)
        ? 'warning'
        : 'neutral';
  return <span className={`status-badge status-${tone}`}>{label || STATUS_LABELS[key] || value || '未设置'}</span>;
}

export function Section({ title, description, actions, className = '', children }) {
  return (
    <section className={`section-surface ${className}`.trim()}>
      {(title || actions) ? (
        <div className="section-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {actions ? <div className="section-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title = '暂无数据', description = '调整筛选条件后再试。' }) {
  return (
    <div className="empty-state">
      <Icon name="ArchiveBox" size={24} />
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function DataTable({ columns, rows, rowKey = 'id', emptyTitle, emptyDescription }) {
  if (!rows?.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={column.className || ''}>{column.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={typeof rowKey === 'function' ? rowKey(row, index) : row[rowKey] || index}>
              {columns.map((column) => (
                <td key={column.key} className={column.className || ''}>
                  {column.render ? column.render(row, index) : row[column.key] ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ children, meta }) {
  return (
    <div className="filter-bar">
      <div className="filter-controls">{children}</div>
      {meta ? <span className="filter-meta">{meta}</span> : null}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = '搜索内容' }) {
  return (
    <label className="search-field">
      <Icon name="MagnifyingGlass" size={17} />
      <input aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

export function Modal({ title, description, children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="modal-panel" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭">
            <Icon name="X" size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
