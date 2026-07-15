import { useState } from 'react';
import { NAV_GROUPS, findRoute } from '../app/navigation.js';
import { searchAdminIndex } from '../app/search.js';
import Icon from './Icon.jsx';

function Brand() {
  return (
    <div className="brand-lockup">
      <BookMark />
      <div>
        <strong>一念法藏</strong>
        <span>oneMind</span>
      </div>
    </div>
  );
}

function BookMark() {
  return (
    <span className="brand-icon" aria-hidden="true">
      <Icon name="BookBookmark" size={25} weight="duotone" />
    </span>
  );
}

function dateRangeLabel() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  const format = (date) => new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date).replaceAll('/', '-');
  return `${format(start)} 至 ${format(end)}`;
}

export default function AdminShell({
  routeId,
  session,
  syncing,
  searchIndex,
  organizations,
  organizationId,
  notificationCount,
  onSearchActivate,
  onOrganizationChange,
  onNavigate,
  onRefresh,
  onLogout,
  children
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const route = findRoute(routeId);
  const searchResults = searchAdminIndex(searchIndex, searchQuery);

  function navigate(nextRoute) {
    onNavigate(nextRoute);
    setMobileOpen(false);
    setSearchOpen(false);
  }

  function openSearchResult(result) {
    setSearchQuery('');
    navigate(result.route);
  }

  return (
    <div className="admin-layout">
      <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="打开导航">
        <Icon name="CirclesFour" size={22} />
      </button>
      {mobileOpen ? <button className="mobile-nav-backdrop" type="button" onClick={() => setMobileOpen(false)} aria-label="关闭导航" /> : null}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <Brand />
        <nav className="primary-nav" aria-label="管理后台导航">
          {NAV_GROUPS.map((group) => (
            <div className="nav-group" key={group.id}>
              {group.label ? <span className="nav-group-label">{group.label}</span> : null}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`nav-item ${item.id === routeId ? 'nav-item-active' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-current={item.id === routeId ? 'page' : undefined}
                >
                  <Icon name={item.icon} size={19} weight={item.id === routeId ? 'fill' : 'regular'} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button type="button" className="admin-identity" onClick={onLogout} title="退出登录">
            <span className="admin-avatar">{String(session?.name || session?.username || '管').slice(0, 1)}</span>
            <span className="admin-identity-copy">
              <strong>{session?.name || session?.username || '管理员'}</strong>
              <small>{session?.role || 'readonly_member'}</small>
            </span>
            <Icon name="SignOut" size={17} />
          </button>
        </div>
      </aside>

      <div className="admin-stage">
        <header className="topbar">
          <div className="breadcrumb">
            <Icon name="House" size={16} />
            <span>总览</span>
            <Icon name="CaretRight" size={14} />
            <strong>{route.label}</strong>
          </div>
          <div className="topbar-tools">
            <div className="global-search-wrap">
              <label className="global-search">
                <Icon name="MagnifyingGlass" size={17} />
                <input
                  aria-label="全局搜索"
                  aria-expanded={searchOpen && Boolean(searchQuery)}
                  aria-controls="admin-global-search-results"
                  value={searchQuery}
                  placeholder="搜索内容 / 用户 / 订单 / 编号"
                  onChange={(event) => {
                    setSearchQuery(event.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    setSearchOpen(true);
                    onSearchActivate?.();
                  }}
                  onBlur={() => window.setTimeout(() => setSearchOpen(false), 120)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setSearchQuery('');
                      setSearchOpen(false);
                    }
                    if (event.key === 'Enter' && searchResults[0]) openSearchResult(searchResults[0]);
                  }}
                />
              </label>
              {searchOpen && searchQuery.trim() ? (
                <div className="global-search-results" id="admin-global-search-results">
                  {searchResults.length ? searchResults.map((result) => (
                    <button key={result.id} type="button" onMouseDown={() => openSearchResult(result)}>
                      <strong>{result.title}</strong>
                      <small>{result.meta}</small>
                    </button>
                  )) : <span className="global-search-empty">没有匹配结果</span>}
                </div>
              ) : null}
            </div>
            <select
              className="topbar-control organization-control"
              aria-label="组织范围"
              value={organizationId}
              onChange={(event) => onOrganizationChange(event.target.value)}
            >
              <option value="">全部组织</option>
              {(organizations || []).map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
            </select>
            <span className="topbar-control date-control">{dateRangeLabel()}</span>
            <button className="icon-button" type="button" onClick={onRefresh} aria-label="刷新数据">
              <Icon className={syncing ? 'spin' : ''} name="ClockCounterClockwise" size={19} />
            </button>
            <button className="icon-button notification-button" type="button" onClick={() => navigate('notifications')} aria-label="通知任务">
              <Icon name="Bell" size={19} />
              {notificationCount ? <span>{notificationCount > 99 ? '99+' : notificationCount}</span> : null}
            </button>
          </div>
        </header>
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
