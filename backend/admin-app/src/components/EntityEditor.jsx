import { useEffect, useState } from 'react';
import { Button, Modal } from './ui.jsx';

const DEFAULTS = {
  content: {
    title: '', type: 'mantra', body: '', planDays: 4, lengthTier: 'short', defaultMode: 'scientific', supportedModes: 'scientific,playful', supportsRecitation: true, scene: '', publishStatus: 'draft', reviewStatus: 'draft'
  },
  festival: {
    name: '', lunarDate: '', solarDate: '', relatedFigure: '', description: '', publishStatus: 'draft'
  },
  asset: {
    title: '', type: 'audio', url: '', accessLevel: 'public', copyrightStatus: 'authorized', organizationId: ''
  },
  product: {
    title: '', subtitle: '', category: '经文音频', tag: '', price: 0, originalPrice: '', stock: 999, cover: '', description: '', features: '', status: 'draft', isFeatured: false, color: '#7E2A1C'
  },
  member: {
    userId: '', role: 'readonly_member', organizationId: ''
  }
};

const TITLES = {
  content: '内容',
  festival: '节日专题',
  asset: '数字资产',
  product: '商品',
  member: '组织成员'
};

function initialForm(type, item, organizations) {
  const defaults = DEFAULTS[type] || {};
  const source = item || {};
  return {
    ...defaults,
    ...source,
    organizationId: source.organizationId || defaults.organizationId || organizations?.[0]?.id || '',
    supportedModes: Array.isArray(source.supportedModes) ? source.supportedModes.join(',') : source.supportedModes || defaults.supportedModes,
    features: Array.isArray(source.features) ? source.features.join('\n') : source.features || defaults.features
  };
}

export default function EntityEditor({ editor, organizations, loading, onClose, onSubmit }) {
  const { type, item } = editor;
  const [form, setForm] = useState(() => initialForm(type, item, organizations));

  useEffect(() => {
    setForm(initialForm(type, item, organizations));
  }, [type, item, organizations]);

  function set(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit(event) {
    event.preventDefault();
    const payload = { ...form };
    if (type === 'content') {
      payload.planDays = Number(payload.planDays || 1);
      payload.supportedModes = String(payload.supportedModes || '').split(',').map((value) => value.trim()).filter(Boolean);
      payload.segments = payload.body;
    }
    if (type === 'product') {
      payload.price = Number(payload.price || 0);
      payload.originalPrice = payload.originalPrice === '' ? null : Number(payload.originalPrice || 0);
      payload.stock = Number(payload.stock || 0);
      payload.features = String(payload.features || '').split('\n').map((value) => value.trim()).filter(Boolean);
    }
    onSubmit({ type, item, payload });
  }

  const label = TITLES[type] || '记录';
  return (
    <Modal title={`${item ? '编辑' : '新增'}${label}`} description="保存后会同步到服务端数据源并写入审计记录。" onClose={onClose}>
      <form className="editor-form" onSubmit={submit}>
        {type === 'content' ? <ContentFields form={form} set={set} /> : null}
        {type === 'festival' ? <FestivalFields form={form} set={set} /> : null}
        {type === 'asset' ? <AssetFields form={form} set={set} organizations={organizations} /> : null}
        {type === 'product' ? <ProductFields form={form} set={set} /> : null}
        {type === 'member' ? <MemberFields form={form} set={set} /> : null}
        <footer className="editor-footer">
          <Button type="button" variant="ghost" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={loading}>{loading ? '正在保存' : '保存'}</Button>
        </footer>
      </form>
    </Modal>
  );
}

function Field({ label, children, full = false }) {
  return <label className={`field ${full ? 'field-full' : ''}`}><span>{label}</span>{children}</label>;
}

function ContentFields({ form, set }) {
  return <div className="form-grid">
    <Field label="标题"><input value={form.title} onChange={(event) => set('title', event.target.value)} required /></Field>
    <Field label="类型"><select value={form.type} onChange={(event) => set('type', event.target.value)}><option value="mantra">短咒</option><option value="verse">短偈</option><option value="sutra_segment">经文片段</option><option value="ritual">仪轨片段</option><option value="teaching">上师开示</option></select></Field>
    <Field label="正文" full><textarea rows="7" value={form.body} onChange={(event) => set('body', event.target.value)} required /></Field>
    <Field label="计划天数"><input type="number" min="1" value={form.planDays} onChange={(event) => set('planDays', event.target.value)} /></Field>
    <Field label="长度"><select value={form.lengthTier} onChange={(event) => set('lengthTier', event.target.value)}><option value="short">短</option><option value="medium">中</option><option value="long">长</option></select></Field>
    <Field label="默认模式"><select value={form.defaultMode} onChange={(event) => set('defaultMode', event.target.value)}><option value="scientific">科学记忆</option><option value="playful">趣味推进</option></select></Field>
    <Field label="支持模式"><input value={form.supportedModes} onChange={(event) => set('supportedModes', event.target.value)} placeholder="scientific,playful" /></Field>
    <Field label="发布状态"><select value={form.publishStatus} onChange={(event) => set('publishStatus', event.target.value)}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></Field>
    <Field label="审核状态"><select value={form.reviewStatus} onChange={(event) => set('reviewStatus', event.target.value)}><option value="draft">待处理</option><option value="reviewing">审核中</option><option value="approved">已通过</option><option value="rejected">已驳回</option></select></Field>
    <Field label="使用场景" full><input value={form.scene} onChange={(event) => set('scene', event.target.value)} /></Field>
    <label className="check-field field-full"><input type="checkbox" checked={Boolean(form.supportsRecitation)} onChange={(event) => set('supportsRecitation', event.target.checked)} /> 支持日常读诵</label>
  </div>;
}

function FestivalFields({ form, set }) {
  return <div className="form-grid">
    <Field label="专题名称"><input value={form.name} onChange={(event) => set('name', event.target.value)} required /></Field>
    <Field label="相关人物"><input value={form.relatedFigure} onChange={(event) => set('relatedFigure', event.target.value)} /></Field>
    <Field label="农历日期"><input value={form.lunarDate} onChange={(event) => set('lunarDate', event.target.value)} /></Field>
    <Field label="公历日期"><input type="date" value={form.solarDate || ''} onChange={(event) => set('solarDate', event.target.value)} /></Field>
    <Field label="说明" full><textarea rows="5" value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
    <Field label="状态"><select value={form.publishStatus} onChange={(event) => set('publishStatus', event.target.value)}><option value="draft">草稿</option><option value="published">已发布</option></select></Field>
  </div>;
}

function AssetFields({ form, set, organizations }) {
  return <div className="form-grid">
    <Field label="资产名称"><input value={form.title} onChange={(event) => set('title', event.target.value)} required /></Field>
    <Field label="类型"><select value={form.type} onChange={(event) => set('type', event.target.value)}><option value="audio">音频</option><option value="image">图片</option><option value="document">文档</option><option value="video">视频</option></select></Field>
    <Field label="资源地址" full><input value={form.url || ''} onChange={(event) => set('url', event.target.value)} required /></Field>
    <Field label="访问级别"><select value={form.accessLevel} onChange={(event) => set('accessLevel', event.target.value)}><option value="public">公开</option><option value="registered">登录可见</option><option value="member">组织成员</option><option value="restricted">指定人员</option><option value="private">私密</option></select></Field>
    <Field label="版权状态"><input value={form.copyrightStatus} onChange={(event) => set('copyrightStatus', event.target.value)} /></Field>
    <Field label="所属组织" full><select value={form.organizationId} onChange={(event) => set('organizationId', event.target.value)}>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></Field>
  </div>;
}

function ProductFields({ form, set }) {
  return <div className="form-grid">
    <Field label="商品名称"><input value={form.title} onChange={(event) => set('title', event.target.value)} required /></Field>
    <Field label="分类"><select value={form.category} onChange={(event) => set('category', event.target.value)}><option value="经文音频">经文音频</option><option value="唐卡 · 壁纸">唐卡 · 壁纸</option><option value="图鉴">图鉴</option></select></Field>
    <Field label="副标题" full><input value={form.subtitle} onChange={(event) => set('subtitle', event.target.value)} /></Field>
    <Field label="售价"><input type="number" min="0" step="0.01" value={form.price} onChange={(event) => set('price', event.target.value)} required /></Field>
    <Field label="原价"><input type="number" min="0" step="0.01" value={form.originalPrice} onChange={(event) => set('originalPrice', event.target.value)} /></Field>
    <Field label="库存"><input type="number" min="0" value={form.stock} onChange={(event) => set('stock', event.target.value)} /></Field>
    <Field label="标签"><input value={form.tag} onChange={(event) => set('tag', event.target.value)} /></Field>
    <Field label="封面地址" full><input value={form.cover} onChange={(event) => set('cover', event.target.value)} /></Field>
    <Field label="商品说明" full><textarea rows="4" value={form.description} onChange={(event) => set('description', event.target.value)} /></Field>
    <Field label="特性（每行一项）" full><textarea rows="4" value={form.features} onChange={(event) => set('features', event.target.value)} /></Field>
    <Field label="状态"><select value={form.status} onChange={(event) => set('status', event.target.value)}><option value="draft">草稿</option><option value="published">已上架</option><option value="archived">已下架</option></select></Field>
    <label className="check-field"><input type="checkbox" checked={Boolean(form.isFeatured)} onChange={(event) => set('isFeatured', event.target.checked)} /> 设为精选商品</label>
  </div>;
}

function MemberFields({ form, set }) {
  return <div className="form-grid">
    <Field label="用户 ID" full><input value={form.userId} onChange={(event) => set('userId', event.target.value)} required /></Field>
    <Field label="成员角色" full><select value={form.role} onChange={(event) => set('role', event.target.value)}><option value="readonly_member">只读成员</option><option value="asset_maintainer">资料维护人</option><option value="organization_admin">组织管理员</option></select></Field>
  </div>;
}
