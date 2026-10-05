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
                    axios.get('https://api.shusaku.my.id/api/downloader/ytmp3', {
                        params: { url: vidUrl },
                        timeout: 120_000,
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'Mozilla/5.0'
                        }
                    }).then(res => res.data),
                    120_000,
                    "Shusaku YTMP3 melewati batas waktu."
                ),
                8 * 60 * 1000
            );

            const result = cachedYoutube.value;
            const pickDownloadUrl = (value) => {
                if (!value) return null;
                if (typeof value === 'string') {
                    if (/^https?:\/\//i.test(value) &&
                        !/youtube\.com|youtu\.be/i.test(value)) return value;
                    return null;
                }
                if (Array.isArray(value)) {
                    for (const item of value) {
                        const found = pickDownloadUrl(item);
                        if (found) return found;
                    }
                    return null;
                }
                if (typeof value === 'object') {
                    const preferredKeys = [
                        'download', 'download_url', 'downloadUrl', 'dl_url', 'dlUrl',
                        'audio', 'audio_url', 'audioUrl', 'mp3', 'url', 'link', 'result'
                    ];
                    for (const key of preferredKeys) {
                        if (value[key] !== undefined) {
                            const found = pickDownloadUrl(value[key]);
                            if (found) return found;
                        }
                    }
                    for (const [key, child] of Object.entries(value)) {
                        if (/title|thumbnail|image|author|creator|message|status|success/i.test(key)) continue;
                        const found = pickDownloadUrl(child);
                        if (found) return found;
                    }
                }
                return null;
            };

            const resultUrl = pickDownloadUrl(result);
            const resultTitle = result?.title || result?.result?.title || result?.data?.title;
            const resultThumbnail = result?.thumbnail || result?.result?.thumbnail || result?.data?.thumbnail;
            if (!resultUrl) {
                return m.reply(`❌ *Gagal mendapatkan link audio dari API Shusaku!*\nAlasan: ${result?.message || result?.error || 'Response API tidak berisi URL audio.'}`);
            }
            title = resultTitle || title;
            cover = resultThumbnail || cover;
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
                url: resultUrl,
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
