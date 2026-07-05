const os = require('os');
const { generateWAMessageFromContent, generateWAMessageContent, proto } = require('@whiskeysockets/baileys');
const { BRAND, formatRuntime } = require('./branding');

const CATEGORY_META = {
  main: { title: 'Main Menu', emoji: '🏠', desc: 'Navigasi utama bot' },
  channel: { title: 'Channel Menu', emoji: '📢', desc: 'Upload dan fitur saluran' },
  create: { title: 'Create Menu', emoji: '🎨', desc: 'AI image, meme, pixel, edit' },
  downloader: { title: 'Downloader Menu', emoji: '📥', desc: 'TikTok, YouTube, Instagram, Spotify' },
  audio: { title: 'Audio Menu', emoji: '🎧', desc: 'Audio2text, musicgen, convert' },
  sticker: { title: 'Sticker Menu', emoji: '✨', desc: 'Sticker maker dan watermark' },
  system: { title: 'System Menu', emoji: '🛠️', desc: 'Profile, health, queue, plugin' },
  group: { title: 'Group Menu', emoji: '👥', desc: 'Welcome, rules, warn, member tools' },
  game: { title: 'Game Menu', emoji: '🎮', desc: 'Mini game, XP, level, dan leaderboard grup' },
  tools: { title: 'Tools Menu', emoji: '🧰', desc: 'ToURL dan utilitas media' },
  owner: { title: 'Owner Menu', emoji: '🔐', desc: 'Broadcast, akses, backup, logs' },
  other: { title: 'Other Menu', emoji: '📦', desc: 'Fitur tambahan' }
};

const CATEGORY_ORDER = ['main', 'downloader', 'create', 'sticker', 'audio', 'tools', 'game', 'group', 'system', 'channel', 'owner', 'other'];

function titleCase(value = '') {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (s) => s.toUpperCase());
}

function getCategoryPlugins(pluginManager, category) {
  const items = pluginManager.plugins
    .filter((plugin) => typeof plugin.run === 'function')
    .filter((plugin) => !category || plugin.category === category)
    .sort((a, b) => (a.commands[0] || a.name).localeCompare(b.commands[0] || b.name));
  return items;
}

function shortBadges(plugin) {
  return [plugin.owner && 'owner', plugin.group && 'group', plugin.admin && 'admin', plugin.premium && 'premium'].filter(Boolean);
}

function formatPluginLine(plugin, prefix = '.') {
  const primary = `${prefix}${plugin.commands[0]}`;
  const desc = plugin.description || titleCase(plugin.name || plugin.commands[0]);
  const badges = shortBadges(plugin);
  const extra = badges.length ? ` • [${badges.join(', ')}]` : '';
  return `• ${primary}${extra}\n  └ ${desc}`;
}

function renderCategoryMenu(pluginManager, category, prefix = '.') {
  const plugins = getCategoryPlugins(pluginManager, category);
  const meta = CATEGORY_META[category] || { title: titleCase(category), emoji: '📦', desc: 'Kategori fitur' };
  const lines = plugins.map((plugin) => formatPluginLine(plugin, prefix));
  return {
    title: `${meta.emoji} ${meta.title}`,
    text: [
      `${meta.emoji} *${meta.title}*`,
      `_${meta.desc}_`,
      '',
      ...lines,
      '',
      `╭─ Ringkasan`,
      `│ Total Fitur   : ${plugins.length}`,
      `│ Nama Bot      : ${BRAND.botName}`,
      `│ Owner         : ${BRAND.ownerName}`,
      `╰──────────────`
    ].join('\n')
  };
}

function renderAllMenu(pluginManager, prefix = '.') {
  const lines = [
    `📚 *ALL MENU ${BRAND.botName.toUpperCase()}*`,
    '_Pilih kategori favoritmu atau gunakan tombol list untuk navigasi cepat._',
    ''
  ];

  for (const category of CATEGORY_ORDER) {
    const items = getCategoryPlugins(pluginManager, category);
    if (!items.length) continue;
    const meta = CATEGORY_META[category] || { title: titleCase(category), emoji: '📦', desc: 'Kategori fitur' };
    lines.push(`${meta.emoji} *${meta.title}*`);
    lines.push(`└ ${meta.desc}`);
    for (const plugin of items) {
      lines.push(formatPluginLine(plugin, prefix));
    }
    lines.push('');
  }

  const summary = pluginManager.summary();
  lines.push('╭─ Total Keseluruhan');
  lines.push(`│ Plugin  : ${summary.plugins}`);
  lines.push(`│ Command : ${summary.commands}`);
  lines.push(`│ Bot     : ${BRAND.botName}`);
  lines.push('╰──────────────');

  return {
    title: '📚 All Menu',
    text: lines.join('\n')
  };
}

async function sendMenuInteractive(Rafael, m, { title, body, footer, sections, mentions = [], headerImageUrl = null }) {
  let header = {
    title,
    subtitle: BRAND.botName,
    hasMediaAttachment: false
  };

  if (headerImageUrl) {
    try {
      const imageMsg = await generateWAMessageContent({ image: { url: headerImageUrl } }, { upload: Rafael.waUploadToServer });
      header = { hasMediaAttachment: true, imageMessage: imageMsg.imageMessage };
    } catch {}
  }

  const buttons = [
    {
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: 'Pilih Menu',
        sections
      })
    },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: 'Saluran WhatsApp',
        url: BRAND.channelUrl,
        merchant_url: BRAND.channelUrl
      })
    }
  ];

  const content = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage: proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({ text: body }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: footer || BRAND.footer }),
          header: proto.Message.InteractiveMessage.Header.create(header),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
        })
      }
    }
  };

  const msg = generateWAMessageFromContent(m.chat, content, { quoted: m, userJid: Rafael.user?.id, mentions });
  await Rafael.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
}

function buildMainSections(prefix = '.') {
  return [
    {
      title: '🌸 Menu Utama',
      rows: [
        { title: 'All Menu', description: 'Lihat seluruh kategori dan daftar fitur', id: `${prefix}allmenu` },
        { title: 'Daftar Akun', description: 'Registrasi akun bot dengan captcha', id: `${prefix}daftar nama,umur` },
        { title: 'Profile Saya', description: 'Kartu profil dan statistik akun', id: `${prefix}profile` },
        { title: 'Status Bot', description: 'Runtime bot, server, RAM, dan queue', id: `${prefix}health` }
      ]
    },
    {
      title: '🧩 Pilih Kategori',
      rows: [
        { title: 'Downloader Menu', description: 'TikTok, YouTube, Instagram, Spotify', id: `${prefix}downloadmenu` },
        { title: 'Create Menu', description: 'AI image, pixel, meme, deepfake, dll', id: `${prefix}createmenu` },
        { title: 'Sticker Menu', description: 'Sticker, swm, brat, bratvid', id: `${prefix}stickermenu` },
        { title: 'Audio Menu', description: 'Musicgen, audio2text, convert', id: `${prefix}audiomenu` },
        { title: 'Tools Menu', description: 'ToURL dan utilitas media', id: `${prefix}toolsmenu` },
        { title: 'Other Menu', description: 'Fitur tambahan lainnya', id: `${prefix}othermenu` }
      ]
    },
    {
      title: '👥 Group & System',
      rows: [
        { title: 'Game Menu', description: 'Mini game, rank, level, dan leaderboard grup', id: `${prefix}gamemenu` },
        { title: 'AutoAI', description: 'Aktifkan chatbot AI per sesi', id: `${prefix}autoai on` },
        { title: 'Menfess', description: 'Panduan menfess anonim', id: `${prefix}menfess` },
        { title: 'Group Menu', description: 'Welcome, anti-link, warn, member tools', id: `${prefix}groupmenu` },
        { title: 'System Menu', description: 'Profile, health, queue, plugin', id: `${prefix}systemmenu` },
        { title: 'Owner Menu', description: 'Broadcast, akses, backup, logs', id: `${prefix}ownermenu` },
        { title: 'Channel Menu', description: 'Upload saluran dan katalog layanan', id: `${prefix}channelmenu` },
        { title: 'Katalog Layanan', description: 'Buka daftar dan katalog ZyphraXD', id: `${prefix}list-ch` }
      ]
    }
  ];
}

function buildBotSummary(ctx) {
  const { pushname, ownerJids = [], pluginManager, prefix = '.', botNumber } = ctx;
  const ownerTag = ownerJids.find((jid) => jid !== botNumber) || BRAND.ownerJid;
  const summary = pluginManager.summary();
  const mem = process.memoryUsage().rss / 1024 / 1024;
  return {
    text: [
      `Halo ${pushname || 'Kak'} 👋`,
      '',
      '╭─ *INFORMASI BOT*',
      `│ Nama Bot     : ${BRAND.botName}`,
      `│ Nama Owner   : ${BRAND.ownerName}`,
      `│ Nomor Owner  : @${ownerTag.split('@')[0]}`,
      `│ Prefix       : ${prefix}`,
      `│ Total Plugin : ${summary.plugins}`,
      `│ Total Cmd    : ${summary.commands}`,
      '╰──────────────',
      '',
      '╭─ *INFORMASI RUNTIME*',
      `│ Runtime Bot  : ${formatRuntime(process.uptime())}`,
      `│ Running Host : ${os.hostname()}`,
      `│ Platform     : ${os.platform()} ${os.arch()}`,
      `│ Node.js      : ${process.version}`,
      `│ RAM Used     : ${mem.toFixed(1)} MB`,
      '╰──────────────',
      '',
      'Gunakan button list di bawah untuk memilih menu yang kamu mau ✨'
    ].join('\n'),
    ownerTag
  };
}

module.exports = {
  CATEGORY_META,
  getCategoryPlugins,
  renderCategoryMenu,
  renderAllMenu,
  sendMenuInteractive,
  buildMainSections,
  buildBotSummary
};
