const PREFIX_PATTERN = /^[.!#,/?:;+\-_*@$%&~^|\\=]/;

function splitCommandText(value) {
  const content = String(value || '').trim();
  if (!content) return { candidate: '', args: [], text: '' };
  const parts = content.split(/\s+/);
  const candidate = String(parts.shift() || '').toLowerCase();
  return { candidate, args: parts, text: parts.join(' ') };
}

function parseCommandInput(body, pluginManager) {
  const raw = String(body || '').trim();
  if (!raw) {
    return {
      raw,
      prefix: '.',
      usedPrefix: '',
      hasExplicitPrefix: false,
      isDirectCommand: false,
      isCmd: false,
      command: '',
      rawCommand: '',
      args: [],
      text: ''
    };
  }

  const prefixMatch = raw.match(PREFIX_PATTERN);
  const usedPrefix = prefixMatch ? prefixMatch[0] : '';
  const hasExplicitPrefix = Boolean(usedPrefix);
  const content = hasExplicitPrefix ? raw.slice(usedPrefix.length).trim() : raw;
  const parsed = splitCommandText(content);
  const isDirectCommand = !hasExplicitPrefix && Boolean(parsed.candidate) && pluginManager.has(parsed.candidate);
  const isCmd = hasExplicitPrefix || isDirectCommand;

  return {
    raw,
    prefix: usedPrefix || '.',
    usedPrefix,
    hasExplicitPrefix,
    isDirectCommand,
    isCmd,
    command: isCmd ? parsed.candidate : '',
    rawCommand: parsed.candidate,
    args: isCmd ? parsed.args : [],
    text: isCmd ? parsed.text : ''
  };
}

function shouldSuggestWithoutPrefix(body, candidate) {
  const raw = String(body || '').trim();
  const token = String(candidate || '').trim();
  if (!raw || !token) return false;
  if (/\s/.test(raw)) return false;
  if (token.length < 3 || token.length > 32) return false;
  return /^[a-z0-9_-]+$/i.test(token);
}

module.exports = {
  PREFIX_PATTERN,
  parseCommandInput,
  shouldSuggestWithoutPrefix
};
