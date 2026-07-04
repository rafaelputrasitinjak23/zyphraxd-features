const {
  fs, path, os, crypto, util, pipeline, axios, exec, execFile, execFileAsync,
  yts, moment, wrapper, CookieJar, cheerio, youtubeDl, Smeme, audio2text,
  ChatMusicAPI, downloadInstagram, createBotBackup, deleteBotBackup,
  createTempPath, safeUnlink, runFfmpeg, withTimeout, normalizeJid,
  readAccessUsers, writeAccessUsers, checkAccess, ctext
} = require("../../lib/pluginUtils");

module.exports = {
  name: 'youtube-audio',
  commands: ['play', 'yta', 'ytmp3'],
  category: 'downloader',
  heavy: true,
  requiresText: true,
  async run(ctx) {
    const {
      Rafael, m, command, args, text, prefix, body, budy, from, sender, pushname,
      isGroup, isCreator, isAdmin, isBotAdmin, participants, groupAdmins,
      groupMetadata, user, group, database, downloaderCache, taskQueue, pluginManager,
      mime, quoted, isMedia, isAllowed, botNumber, senderNumber, ownerJids,
      time2, ucapanWaktu, wib, wita, wit, salam2, fVerif
    } = ctx;
        if (!isAllowed) {
            return m.reply('Akses ditolak. Nomor kamu tidak terdaftar dalam sistem.');
        }
        if (!text) {
            return m.reply(`*Format Salah!*\n\nMasukkan judul lagu atau link YouTube.\nContoh: ${prefix + command} melukis senja`);
        }
        m.reply('⏳ *Sedang mencari dan memproses audio, mohon tunggu sebentar...*');
        let tempInput = '';
        let tempOgg = '';
        try {
            let vidUrl = text;
            let title = 'Unknown Title';
            let cover = 'https://i.ibb.co/L5hSgTq/youtube-logo.png';
            let artist = 'YouTube';
            let sourceUrl = text;
            const isUrl = /youtu(\.)?be/.test(text) || /youtube\.com/.test(text);
            if (!isUrl) {
                const searchResults = await withTimeout(
                    yts(text),
                    45_000,
                    "Pencarian YouTube melewati batas waktu."
                );
                if (!searchResults || !searchResults.videos.length) {
                    return m.reply('❌ *Video tidak ditemukan!*');
                }
                const video = searchResults.videos[0];
                vidUrl = video.url;
                title = video.title;
                cover = video.thumbnail;
                artist = video.author?.name || artist;
                sourceUrl = video.url;
            } else {
                const videoId = text.split(/(vi\/|v=|\/v\/|youtu\.be\/|\/embed\/)/)[2]?.split(/[^0-9a-z_\-]/i)[0];
                if (videoId) {
                    try {
                        const videoDetails = await withTimeout(
                            yts({ videoId }),
                            45_000,
                            "Pengambilan detail YouTube melewati batas waktu."
                        );
                        title = videoDetails.title || title;
                        cover = videoDetails.thumbnail || cover;
                        artist = videoDetails.author?.name || artist;
                        sourceUrl = videoDetails.url || text;
                    } catch (e) {
                        console.error('YTS Error:', e);
                    }
                }
            }
            const cachedYoutube = await downloaderCache.getOrSet(
                `youtube-audio:${vidUrl}`,
                () => withTimeout(
                    youtubeDl(vidUrl, true),
                    120_000,
                    "YouTube downloader melewati batas waktu."
                ),
                8 * 60 * 1000
            );
            const result = cachedYoutube.value;
            if (!result || !result.status) {
                return m.reply(`❌ *Gagal mendapatkan link unduhan!*\nAlasan: ${result?.message || 'Tidak diketahui'}`);
            }
            title = result.title || title;
            cover = result.thumbnail || cover;
            const { runtimePath } = require('../../lib/paths');
            const tempDir = runtimePath('tmp', 'youtube');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            const timeStr = `${Date.now()}-${crypto.randomUUID()}`;
            tempInput = path.join(tempDir, `${timeStr}_input.tmp`);
            tempOgg = path.join(tempDir, `${timeStr}.ogg`);
            const response = await axios({
                method: 'GET',
                url: result.dl_url,
                responseType: 'stream',
                timeout: 90_000,
                maxContentLength: 100 * 1024 * 1024
            });
            await pipeline(response.data, fs.createWriteStream(tempInput));
            await runFfmpeg([
                "-i", tempInput,
                "-vn",
                "-c:a", "libopus",
                "-b:a", "128k",
                "-vbr", "on",
                "-ar", "48000",
                "-ac", "1",
                tempOgg
            ]);
            await Rafael.sendMessage(m.chat, {
                audio: await fs.promises.readFile(tempOgg),
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true
            }, { quoted: fVerif });
        } catch (error) {
            console.error('Error YT Audio/Play:', error);
            await m.reply(`❌ *Terjadi kesalahan sistem:* ${error.message || 'Gagal memproses permintaan.'}`);
        } finally {
            await Promise.all([safeUnlink(tempInput), safeUnlink(tempOgg)]);
        }
  }
};
