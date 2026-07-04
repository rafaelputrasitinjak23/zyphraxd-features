const os = require('os');
require('./config');

const ownerNumber = Array.isArray(global.owner) && global.owner[0] ? String(global.owner[0]) : '';

const BRAND = {
  botName: global.botName || process.env.BOT_NAME || 'ZyphraXD',
  ownerName: global.ownerName || process.env.OWNER_NAME || 'RafaelXD',
  ownerNumber,
  ownerJid: ownerNumber ? `${ownerNumber}@s.whatsapp.net` : '',
  channelUrl: global.saluran || process.env.CHANNEL_URL || '',
  channelName: process.env.CHANNEL_NAME || 'Saluran ZyphraXD',
  footer: global.botName || process.env.BOT_NAME || 'ZyphraXD',
  theme: {
    primary: '#6c63ff',
    secondary: '#8f8bff',
    accent: '#ff77c8',
    cyan: '#6ee7ff',
    dark: '#111827',
    light: '#f8fafc'
  }
};

function formatRuntime(seconds = process.uptime()) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(value / 86400);
  const h = Math.floor((value % 86400) / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = value % 60;
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function getBotInfo() {
  return {
    ...BRAND,
    platform: `${os.platform()} ${os.arch()}`,
    hostname: os.hostname(),
    node: process.version,
    runtime: formatRuntime(),
    memoryUsed: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)} MB`
  };
}

module.exports = { BRAND, getBotInfo, formatRuntime };
