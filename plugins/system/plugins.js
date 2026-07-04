const { THUMBNAILS, sendThumbnailMessage } = require('../../lib/thumbnails');

module.exports = {
  name: 'plugin-management',
  commands: ['plugins', 'reloadplugins'],
  category: 'system',
  description: 'Menampilkan dan memuat ulang plugin bot',
  limit: 0,
  cooldown: 1500,
  async run({ Rafael, command, m, pluginManager, isCreator }) {
    if (command === 'reloadplugins' && !isCreator) {
      return m.reply('Command ini hanya dapat digunakan oleh owner bot.');
    }

    if (command === 'reloadplugins') {
      const summary = pluginManager.reload();
      const caption = [
        '🧩 *PLUGIN MANAGER*',
        '',
        'Plugin berhasil dimuat ulang.',
        `Plugin  : ${summary.plugins}`,
        `Command : ${summary.commands}`,
        `Hook    : ${summary.hooks}`,
        `Error   : ${summary.errors}`
      ].join('\n');

      return sendThumbnailMessage(Rafael, m, THUMBNAILS.PLUGIN_MANAGER, caption);
    }

    const summary = pluginManager.summary();
    const names = pluginManager.plugins
      .map((item) => `${item.name} (${item.commands.length ? `${item.commands.length} command` : 'hook'})`)
      .join('\n');

    const caption = [
      '🧩 *PLUGIN MANAGER ZYPHRAXD*',
      '',
      `Plugin  : ${summary.plugins}`,
      `Command : ${summary.commands}`,
      `Hook    : ${summary.hooks}`,
      `Error   : ${summary.errors}`,
      '',
      names || 'Belum ada plugin.'
    ].join('\n');

    return sendThumbnailMessage(Rafael, m, THUMBNAILS.PLUGIN_MANAGER, caption);
  }
};
