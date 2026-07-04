const menuPlugin = require('./menu');

module.exports = {
  name: 'button-list',
  commands: ['buttonlist', 'listbutton', 'buttons'],
  category: 'main',
  description: 'Menampilkan list button interaktif',
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    return menuPlugin.run(ctx);
  }
};
