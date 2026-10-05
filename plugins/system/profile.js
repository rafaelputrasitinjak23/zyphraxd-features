const { premiumStatus } = require('../../lib/systemPluginUtils');
const { BRAND } = require('../../lib/branding');
const { THUMBNAILS, sendThumbnailMessage } = require('../../lib/thumbnails');
const { nextLevelExp } = require('../../lib/database');

module.exports = {
  name: 'user-profile',
  commands: ['profile', 'me', 'limit', 'premium'],
  category: 'system',
  description: 'Menampilkan profil dan statistik pengguna',
  limit: 0,
  cooldown: 1500,
  async run({ Rafael, m, user, pushname }) {
    const lastSeenDate = new Date(user.lastSeen || Date.now());
    const level = user.level || 1;
    const exp = user.exp || 0;
    const nextExp = nextLevelExp(level);

    const caption = [
      `👤 *${BRAND.botName} • USER PROFILE*`,
      '',
      `Nama WA     : ${pushname || user.name}`,
      `Nomor       : ${user.jid.split('@')[0]}`,
      `Premium     : ${premiumStatus(user)}`,
      `Limit       : ${user.limit}/${user.dailyLimit}`,
      `Level       : ${level}`,
      `EXP         : ${exp}/${nextExp}`,
      `Total CMD   : ${user.totalCommands || 0}`,
      `Terakhir    : ${lastSeenDate.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      `Status      : ${user.banned ? `Diblokir (${user.banReason || '-'})` : 'Aktif'}`
    ].join('\n');

    return sendThumbnailMessage(Rafael, m, THUMBNAILS.PROFILE_BOT, caption);
  }
};
