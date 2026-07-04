const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'broadcast',
  commands: ['broadcast', 'sendall'],
  category: 'owner',
  owner: true,
  requiresText: true,
  limit: 0,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
        if (!isCreator) return m.reply('Fitur ini hanya dapat digunakan oleh Creator.');
        if (!text) return m.reply(`Format salah!\nGunakan: *${prefix + command}* [pesan]\nContoh: *${prefix + command}* Halo semua!`);
        
        try {
            const users = readAccessUsers().map(normalizeJid).filter(Boolean);
            
            if (!Array.isArray(users) || users.length === 0) {
                return m.reply('Tidak ada user yang terdaftar.');
            }
            
            let successCount = 0;
            let failCount = 0;
            
            for (let user of users) {
                try {
                    await Rafael.sendMessage(user, { text: text });
                    successCount++;
                } catch (error) {
                    console.error(`Gagal mengirim ke ${user}:`, error.message);
                    failCount++;
                }
            }
            
            await m.reply(`✅ *Broadcast Selesai*\n\nBerhasil: ${successCount}\nGagal: ${failCount}\nTotal: ${users.length}`);
        } catch (error) {
            m.reply(`❌ Error: ${error.message}`);
        }
  }
};
