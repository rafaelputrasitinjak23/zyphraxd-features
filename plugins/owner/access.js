const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, parseAccessDuration, getAccessEntries, ctext
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

      const rawTarget = m.mentionedJid?.[0] || m.quoted?.sender || args?.[0] || text?.split(/\s+/)[0];
      const target = normalizeJid(rawTarget);
      const durationInput = args?.[1] || text?.trim().split(/\s+/).slice(1).join(" ") || "30day";
      const durationMs = parseAccessDuration(durationInput);

      if (!target) {
        return m.reply(`Format salah!\nTag, reply pesan, atau masukkan nomor.\n\nContoh:\n${prefix + command} 628xxxxxxxxxx 1day\n${prefix + command} 628xxxxxxxxxx 7day\n${prefix + command} 628xxxxxxxxxx 30day\n${prefix + command} 628xxxxxxxxxx permanent`);
      }

      if (durationMs === undefined) {
        return m.reply(`Durasi tidak valid. Gunakan contoh: 1day, 7day, 30day, 1week, 1month, 1year, atau permanent.`);
      }

      const entries = getAccessEntries();
      const existing = entries.find(entry => entry.jid === target);
      const now = Date.now();
      let expiresAt = null;

      if (durationMs !== null) {
        const base = existing?.expiresAt && existing.expiresAt > now ? existing.expiresAt : now;
        expiresAt = base + durationMs;
      }

      const next = entries.filter(entry => entry.jid !== target);
      next.push({ jid: target, expiresAt });
      writeAccessUsers(next);
      database.getUser(target, "Access User");

      const expiryText = expiresAt
        ? new Date(expiresAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })
        : "Permanen";
      const actionText = existing ? "Memperpanjang akses" : "Berhasil menambahkan akses";

      await m.reply(
        `${actionText} untuk @${target.split("@")[0]}\n` +
        `Durasi: ${durationInput}\n` +
        `Berlaku sampai: ${expiryText}`,
        m.chat,
        { mentions: [target] }
      );
  }
};
