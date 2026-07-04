const { BRAND } = require('../../lib/branding');
const { getCategoryThumbnail } = require('../../lib/thumbnails');
const { renderCategoryMenu, sendMenuInteractive, buildMainSections } = require('../../lib/menuUtils');

const MAP = {
  downloadmenu: 'downloader',
  createmenu: 'create',
  stickermenu: 'sticker',
  audiomenu: 'audio',
  channelmenu: 'channel',
  ownermenu: 'owner',
  toolsmenu: 'tools',
  othermenu: 'other'
};

module.exports = {
  name: 'category-menus',
  commands: Object.keys(MAP),
  category: 'main',
  description: 'Menampilkan menu kategori fitur',
  limit: 0,
  cooldown: 1200,
  async run(ctx) {
    const { Rafael, m, pluginManager, prefix, command } = ctx;
    const category = MAP[command];
    const menu = renderCategoryMenu(pluginManager, category, prefix);
    await sendMenuInteractive(Rafael, m, {
      title: menu.title,
      body: menu.text,
      footer: `${BRAND.botName} • ${menu.title}`,
      sections: buildMainSections(prefix),
      headerImageUrl: getCategoryThumbnail(category)
    });
  }
};
