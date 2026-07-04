const { BRAND } = require('../../lib/branding');
const { THUMBNAILS } = require('../../lib/thumbnails');
const {
  sendMenuInteractive,
  buildMainSections,
  buildBotSummary
} = require('../../lib/menuUtils');

module.exports = {
  name: 'menu',
  commands: ['menu', 'help'],
  category: 'main',
  description: 'Menampilkan ringkasan bot dan pilihan menu interaktif',
  limit: 0,
  cooldown: 1000,
  async run(ctx) {
    const { Rafael, m, prefix } = ctx;
    const summary = buildBotSummary(ctx);

    await sendMenuInteractive(Rafael, m, {
      title: BRAND.botName,
      body: summary.text,
      footer: `${BRAND.botName} • by ${BRAND.ownerName}`,
      sections: buildMainSections(prefix),
      mentions: [summary.ownerTag],
      headerImageUrl: THUMBNAILS.MAIN_MENU
    });
  }
};
