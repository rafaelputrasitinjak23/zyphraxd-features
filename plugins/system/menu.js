const { BRAND } = require('../../lib/branding');
const { THUMBNAILS } = require('../../lib/thumbnails');
const { renderCategoryMenu, sendMenuInteractive, buildMainSections } = require('../../lib/menuUtils');

module.exports = {
  name: 'system-menu',
  commands: ['botmenu', 'systemmenu'],
  category: 'system',
  description: 'Menampilkan menu sistem dan utilitas',
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { Rafael, m, pluginManager, prefix } = ctx;
    const menu = renderCategoryMenu(pluginManager, 'system', prefix);
    await sendMenuInteractive(Rafael, m, {
      title: menu.title,
      body: menu.text,
      footer: `${BRAND.botName} • System Tools`,
      sections: buildMainSections(prefix),
      headerImageUrl: THUMBNAILS.SYSTEM_MENU
    });
  }
};
