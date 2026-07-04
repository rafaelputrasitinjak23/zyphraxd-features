const { BRAND } = require('../../lib/branding');
const { THUMBNAILS } = require('../../lib/thumbnails');
const { renderAllMenu, sendMenuInteractive, buildMainSections } = require('../../lib/menuUtils');

module.exports = {
  name: 'all-menu',
  commands: ['allmenu'],
  category: 'main',
  description: 'Menampilkan seluruh kategori menu',
  limit: 0,
  cooldown: 1200,
  async run(ctx) {
    const { Rafael, m, pluginManager, prefix } = ctx;
    const menu = renderAllMenu(pluginManager, prefix);
    await sendMenuInteractive(Rafael, m, {
      title: menu.title,
      body: menu.text,
      footer: `${BRAND.botName} • pilih menu lain bila perlu`,
      sections: buildMainSections(prefix),
      headerImageUrl: THUMBNAILS.ALLMENU
    });
  }
};
