import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Button } from '../components/ui.jsx';

export default function LoginPage({ loading, error, onSubmit }) {
  const [username, setUsername] = useState('magic');
  const [password, setPassword] = useState('Noending5@');

  function submit(event) {
    event.preventDefault();
    onSubmit({ username: username.trim(), password });
  }

  return (
    <main className="login-screen">
      <section className="login-brand-panel">
        <div className="login-brand-mark"><Icon name="BookBookmark" size={34} weight="duotone" /></div>
        <span className="login-kicker">ONE MIND OPERATIONS</span>
        <h1>让每一次修学，<br />都被认真承接。</h1>
        <p>统一管理内容、科学记忆、日常读诵、用户触达与数字商城。</p>
        <div className="login-proof">
          <span><Icon name="Check" size={16} weight="bold" /> 内容与版本可追溯</span>
          <span><Icon name="Check" size={16} weight="bold" /> 学习数据真实回流</span>
          <span><Icon name="Check" size={16} weight="bold" /> 权限与操作全程留痕</span>
        </div>
      </section>
      <section className="login-form-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-form-heading">
            <span>一念法藏</span>
            <h2>登录管理后台</h2>
            <p>使用管理员账号进入运营工作台。</p>
          </div>
          <label className="field">
            <span>管理员账号</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
          </label>
          <label className="field">
            <span>密码</span>
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
          </label>
          {error ? <div className="inline-message inline-message-error">{error}</div> : null}
          <Button type="submit" disabled={loading} icon={loading ? 'SpinnerGap' : undefined} className={loading ? 'is-loading' : ''}>
            {loading ? '正在验证' : '进入运营工作台'}
          </Button>
          <small>登录行为与敏感操作将写入审计日志。</small>
        </form>
      </section>
    </main>
  );
}
