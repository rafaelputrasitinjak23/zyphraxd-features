const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'access-user',
  commands: ['addakses'],
  category: 'owner',
  owner: true,
  limit: 0,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif, canUseOwnerCommand
    } = ctx;
      if (!canUseOwnerCommand(command)) return m.reply("Fitur ini hanya dapat digunakan oleh owner utama atau owner jadibot yang diizinkan.");

      const rawTarget = m.mentionedJid?.[0] || m.quoted?.sender || text;
      const target = normalizeJid(rawTarget);
      if (!target) {
        return m.reply(`Format salah!
    Tag, reply pesan, atau masukkan nomor.
    Contoh: ${prefix + command} 628xxxxxxxxxx`);
      }

      const users = readAccessUsers().map(normalizeJid).filter(Boolean);
      if (users.includes(target)) return m.reply("Nomor tersebut sudah memiliki akses.");

      users.push(target);
      writeAccessUsers([...new Set(users)]);
      database.getUser(target, "Access User");
      await m.reply(
        `Berhasil menambahkan akses untuk @${target.split("@")[0]}`,
        m.chat,
        { mentions: [target] }
      );
  }
};
