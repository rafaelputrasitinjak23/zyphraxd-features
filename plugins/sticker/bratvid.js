const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'brat-video',
  commands: ['bratvid'],
  category: 'sticker',
  heavy: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
      const { bratVid } = require("brat-canvas/video");
      let outputPath = null;

      try {
        const content =
          text ||
          m.quoted?.text ||
          m.quoted?.caption ||
          m.quoted?.body ||
          m.quoted?.message?.conversation ||
          m.quoted?.message?.extendedTextMessage?.text;

        if (!content) {
          return m.reply(`Masukkan teks atau reply teks.

    Contoh:
    ${prefix + command} Just friend ygy 🤣`);
        }

        await m.reply("⏳ Sedang membuat sticker brat video...");
        outputPath = createTempPath("bratvid", "mp4");

        const buffer = await withTimeout(
          bratVid(content, {
            outputFormat: "mp4",
            fast_progress: true,
            lyric: {
              maxWordPerLayer: 5,
              frameDuration: 0.7,
              lastFrameDuration: 1.5
            },
            brat: { BLUR: 0 },
            onProgress: ({ current, total, text: progressText }) => {
              console.log(`[BRATVID] ${current}/${total} - ${progressText}`);
            }
          }),
          180_000,
          "Pembuatan brat video melewati batas waktu."
        );

        await fs.promises.writeFile(outputPath, buffer);
        await Rafael.sendVideoAsSticker(m.chat, await fs.promises.readFile(outputPath), m, {
          packname: global.packname || "Sticker Bot",
          author: global.author || "RafaelXD"
        });
      } catch (error) {
        console.error("Error bratvid:", error);
        await m.reply(`❌ Gagal membuat sticker brat video: ${error.message}`);
      } finally {
        await safeUnlink(outputPath);
      }
  }
};
