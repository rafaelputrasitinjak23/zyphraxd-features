const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'face-swap',
  commands: ['faceswap', 'deepfake'],
  category: 'create',
  heavy: true,
  requiresMedia: true,
  requiresQuoted: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      const deepfakeMaker = require("../../lib/deepfakeMaker");

      if (!m.quoted) {
        return m.reply(
          `Cara penggunaan:
    1. Kirim gambar target
    2. Reply gambar target dengan gambar wajah/source
    3. Ketik ${prefix + command}`
        );
      }

      const targetMessage = m.quoted;
      const sourceMessage = m;
      const targetMime = (targetMessage.msg || targetMessage).mimetype || "";
      const sourceMime = (sourceMessage.msg || sourceMessage).mimetype || "";

      if (!/image/i.test(targetMime)) return m.reply("Reply harus berupa gambar target.");
      if (!/image/i.test(sourceMime)) {
        return m.reply("Kirim gambar wajah/source sambil mereply gambar target.");
      }

      let targetPath = null;
      let sourcePath = null;

      try {
        await m.reply("Sedang melakukan face swap...");
        targetPath = createTempPath("deepfake-target", "jpg");
        sourcePath = createTempPath("deepfake-source", "jpg");

        await Promise.all([
          fs.promises.writeFile(targetPath, await targetMessage.download()),
          fs.promises.writeFile(sourcePath, await sourceMessage.download())
        ]);

        const result = await withTimeout(
          deepfakeMaker.swapFace(sourcePath, targetPath),
          240_000,
          "Proses face swap melewati batas waktu."
        );

        if (!result?.status) {
          return m.reply(`Gagal face swap:
    ${result?.message || "Tidak diketahui"}`);
        }

        await Rafael.sendMessage(
          m.chat,
          {
            image: { url: result.url },
            caption: "Berhasil melakukan face swap."
          },
          { quoted: m }
        );
      } catch (error) {
        console.error("Face swap error:", error);
        await m.reply(`Terjadi error saat face swap: ${error.message}`);
      } finally {
        await Promise.all([safeUnlink(targetPath), safeUnlink(sourcePath)]);
      }
  }
};
