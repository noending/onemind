const CONFIG_ERROR = 'WECHAT_SUBSCRIBE_CONFIG_INVALID';

function configError(message) {
  const error = new Error(message || CONFIG_ERROR);
  error.code = CONFIG_ERROR;
  error.statusCode = 500;
  return error;
}

function parseWechatSubscribeTemplates(rawValue = process.env.WECHAT_SUBSCRIBE_TEMPLATES_JSON || '') {
  const raw = String(rawValue || '').trim();
  if (!raw) return { templates: [] };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw configError('WECHAT_SUBSCRIBE_TEMPLATES_JSON must be valid JSON');
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw configError('WECHAT_SUBSCRIBE_TEMPLATES_JSON must be an object');
  }

  const seenTemplateIds = new Set();
  const templates = Object.entries(parsed).map(([rawKey, value]) => {
    const key = String(rawKey || '').trim();
    const template = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const templateId = String(template.templateId || '').trim();
    const label = String(template.label || '').trim();
    const page = String(template.page || '').trim();
    const fields = template.fields;
    if (!key || !templateId || !label || !page || !fields || Array.isArray(fields) || typeof fields !== 'object') {
      throw configError(`Template ${key || '(empty)'} is missing templateId, label, page, or fields`);
    }
    const normalizedFields = Object.fromEntries(Object.entries(fields).map(([fieldName, payloadPath]) => {
      const name = String(fieldName || '').trim();
      const path = String(payloadPath || '').trim();
      if (!name || !path) throw configError(`Template ${key} has an invalid field mapping`);
      return [name, path];
    }));
    if (!Object.keys(normalizedFields).length || seenTemplateIds.has(templateId)) {
      throw configError(`Template ${key} has empty fields or a duplicate templateId`);
    }
    seenTemplateIds.add(templateId);
    const aliases = Array.from(new Set([
      key,
      ...(Array.isArray(template.aliases) ? template.aliases : [])
    ].map((item) => String(item || '').trim()).filter(Boolean)));
    return { key, templateId, label, page, fields: normalizedFields, aliases };
  });

  const aliasOwners = new Map();
  templates.forEach((template) => {
    template.aliases.forEach((alias) => {
      if (aliasOwners.has(alias) && aliasOwners.get(alias) !== template.key) {
        throw configError(`Alias ${alias} is assigned to multiple templates`);
      }
      aliasOwners.set(alias, template.key);
    });
  });
  return { templates };
}

function toPublicCapabilities(config = { templates: [] }) {
  const templates = Array.isArray(config.templates) ? config.templates : [];
  if (!templates.length) {
    return {
      provider: 'wechat_subscribe',
      available: false,
      templates: [],
      error: 'WECHAT_SUBSCRIBE_NOT_CONFIGURED'
    };
  }
  return {
    provider: 'wechat_subscribe',
    available: true,
    templates: templates.map(({ key, templateId, label }) => ({ key, templateId, label }))
  };
}

function resolveTemplateForJobType(config = { templates: [] }, jobType) {
  const normalizedType = String(jobType || '').trim();
  return (config.templates || []).find((template) =>
    template.key === normalizedType || (template.aliases || []).includes(normalizedType)
  ) || null;
}

function findTemplateById(config = { templates: [] }, templateId) {
  const normalizedTemplateId = String(templateId || '').trim();
  return (config.templates || []).find((template) => template.templateId === normalizedTemplateId) || null;
}

module.exports = {
  findTemplateById,
  parseWechatSubscribeTemplates,
  resolveTemplateForJobType,
  toPublicCapabilities
};
