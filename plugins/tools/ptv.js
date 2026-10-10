const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');

const execFileAsync = util.promisify(execFile);
const TEMP_DIR = path.join(os.tmpdir(), 'zyphraxd-ptv');

function createTempPath(ext = 'mp4') {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  return path.join(TEMP_DIR, `ptv-${Date.now()}-${crypto.randomUUID()}.${ext}`);
}

async function safeUnlink(file) {
  if (!file) return;
  try { await fs.promises.unlink(file); } catch (e) {
    if (e.code !== 'ENOENT') console.error('[PTV] gagal menghapus temp:', e.message);
  }
}

async function runFfmpeg(args, timeout = 240000) {
  return execFileAsync('ffmpeg', ['-y', ...args], {
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
}

function getVideoMessage(source) {
  return source?.msg || source?.message?.videoMessage || source?.message?.ptvMessage || source;
}

function isVideo(source) {
  const node = getVideoMessage(source);
  const mime = String(node?.mimetype || source?.mimetype || '');
  const type = String(
    source?.mtype ||
    Object.keys(source?.message || {}).find(k => k === 'videoMessage' || k === 'ptvMessage') ||
    ''
  );
  return /video/i.test(mime) || /^(videoMessage|ptvMessage)$/.test(type);
}

module.exports = {
  name: 'video-note',
  commands: ['ptv', 'videonote'],
  category: 'tools',
  heavy: true,

  async run(ctx) {
    const { Rafael, m, prefix, args = [] } = ctx;
    const source = m.quoted || m;
    const link = String(args[0] || '').trim();

    // Jangan memakai requiresMedia di metadata plugin. Pada beberapa versi
    // message wrapper, MIME video dari pesan yang direply tidak terbaca oleh
    // middleware sehingga command sebelumnya tidak pernah dieksekusi.
    if (!isVideo(source)) {
      return m.reply(
        `Balas video lalu ketik ${prefix}ptv untuk mengirim ke chat, atau\n` +
        `${prefix}ptv https://whatsapp.com/channel/xxxx untuk mengirim ke Channel.`
      );
    }

    let destination = m.chat;
    if (link) {
      const match = link.match(/^https?:\/\/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)\/?$/i);
      if (!match) {
        return m.reply(`❌ Link Channel tidak valid.\nContoh: ${prefix}ptv https://whatsapp.com/channel/xxxx`);
      }

      try {
        const metadata = await Rafael.newsletterMetadata('invite', match[1]);
        destination = String(metadata?.id || '');
        if (!destination) throw new Error('ID Channel tidak ditemukan.');
      } catch (error) {
        console.error('[PTV] newsletterMetadata:', error);
        return m.reply('❌ Tidak dapat mengakses Channel dari link tersebut. Pastikan link valid dan bot memiliki akses ke Channel.');
      }
    }

    let inputPath = null;
    let outputPath = null;

    try {
      await m.reply('⏳ Mengubah video menjadi video bulat...');

      if (typeof Rafael.downloadAndSaveMediaMessage !== 'function') {
        throw new Error('Fungsi download media bot tidak tersedia.');
      }
      inputPath = await Rafael.downloadAndSaveMediaMessage(source);
      if (!inputPath || !fs.existsSync(inputPath)) {
        throw new Error('Video gagal diunduh dari pesan.');
      }

      outputPath = createTempPath('mp4');
      await runFfmpeg([
        '-i', inputPath,
        '-vf', 'scale=480:480:force_original_aspect_ratio=increase,crop=480:480,setsar=1',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-movflags', '+faststart',
        outputPath
      ]);

      const video = await fs.promises.readFile(outputPath);
      await Rafael.sendMessage(
        destination,
        { video, mimetype: 'video/mp4', ptv: true },
        destination === m.chat ? { quoted: m } : undefined
      );

      if (destination !== m.chat) {
        await m.reply('✅ Video bulat berhasil dikirim ke Channel.');
      }
    } catch (error) {
      console.error('[PTV] error:', error);
      const message = error.code === 'ENOENT'
        ? 'FFmpeg tidak ditemukan. Install FFmpeg di VPS terlebih dahulu.'
        : (error.message || 'Terjadi kesalahan saat memproses video.');
      await m.reply(`❌ Gagal mengirim video bulat: ${message}`);
    } finally {
      await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
    }
  }
};
