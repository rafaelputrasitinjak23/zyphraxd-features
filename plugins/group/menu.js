const { BRAND } = require('../../lib/branding');
const { THUMBNAILS, sendThumbnailMessage } = require('../../lib/thumbnails');
const { renderCategoryMenu, sendMenuInteractive, buildMainSections } = require('../../lib/menuUtils');

module.exports = {
  name: 'group-menu',
  commands: ['groupmenu', 'groupstatus'],
  category: 'group',
  group: true,
  description: 'Menampilkan menu dan status pengaturan grup',
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { Rafael, m, group, groupMetadata, pluginManager, prefix, command } = ctx;

    if (command === 'groupstatus') {
      const caption = [
        `👥 *PENGATURAN GRUP*`,
        '',
        `Nama Grup   : ${groupMetadata?.subject || 'Grup'}`,
        `Welcome     : ${group.welcome ? 'ON' : 'OFF'}`,
        `Goodbye     : ${group.goodbye ? 'ON' : 'OFF'}`,
        `Anti-link   : ${group.antiLink ? 'ON' : 'OFF'}`,
        `Anti-spam   : ${group.antiSpam ? 'ON' : 'OFF'}`,
        `Anti-toxic  : ${group.antiToxic ? 'ON' : 'OFF'}`,
        `Mute        : ${group.muted ? 'ON' : 'OFF'}`,
        `Total Warn  : ${Object.keys(group.warnings || {}).length}`
      ].join('\n');

      return sendThumbnailMessage(Rafael, m, THUMBNAILS.GROUP_STATUS, caption);
    }

    const menu = renderCategoryMenu(pluginManager, 'group', prefix);
    const extra = `\n\nPlaceholder sambutan:\n• @user = anggota\n• @group = nama grup`;
    await sendMenuInteractive(Rafael, m, {
      title: menu.title,
      body: `${menu.text}${extra}`,
      footer: `${BRAND.botName} • Group Management`,
      sections: buildMainSections(prefix),
      headerImageUrl: THUMBNAILS.GROUP_MENU
    });
  }
};
