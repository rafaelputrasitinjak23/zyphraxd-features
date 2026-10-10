const {
  fs,
  safeUnlink,
  runFfmpeg,
  createTempPath
} = require('../../lib/pluginUtils');

module.exports = {
  name: 'video-note',
  commands: ['ptv', 'videonote'],
  category: 'tools',
  heavy: true,
  async run(ctx) {
    const { Rafael, m, prefix, args } = ctx;
    const source = m.quoted || m;
    const link = args?.[0] || '';
    const match = link.match(/^https:\/\/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    const node = source?.msg || source?.message?.videoMessage || source?.message?.ptvMessage || source;
    const mime = String(node?.mimetype || source?.mimetype || '');
    const type = String(source?.mtype || Object.keys(source?.message || {}).find((key) => /^(videoMessage|ptvMessage)$/.test(key)) || '');

    if (!/video/i.test(mime) && !/^(videoMessage|ptvMessage)$/.test(type)) {
      return m.reply(
        `Balas video lalu ketik ${prefix}ptv untuk mengirim ke chat, atau ${prefix}ptv https://whatsapp.com/channel/xxxx untuk mengirim ke Channel.`
      );
    }

    let destination = m.chat;
    if (link) {
      if (!match) {
        return m.reply(`❌ Link saluran tidak valid.\nContoh: ${prefix}ptv https://whatsapp.com/channel/xxxx`);
      }
      try {
        const metadata = await Rafael.newsletterMetadata('invite', match[1]);
        destination = String(metadata.id);
      } catch (error) {
        console.error('Channel metadata error:', error);
        return m.reply('❌ Tidak dapat mengakses channel dari link tersebut. Pastikan link valid dan bot memiliki akses ke channel.');
      }
    }

    let inputPath = null;
    let outputPath = null;
    try {
      await m.reply('⏳ Mengubah video menjadi video bulat...');
      inputPath = await Rafael.downloadAndSaveMediaMessage(source);
      outputPath = createTempPath('ptv', 'mp4');

      // WhatsApp video note lebih kompatibel jika MP4 H.264 berbentuk persegi.
      await runFfmpeg([
        '-i', inputPath,
        '-vf', 'scale=480:480:force_original_aspect_ratio=increase,crop=480:480,setsar=1',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '96k',
        '-movflags', '+faststart',
        outputPath
      ], 240_000);

      await Rafael.sendMessage(
        destination,
        {
          video: await fs.promises.readFile(outputPath),
          mimetype: 'video/mp4',
          ptv: true
        },
        destination === m.chat ? { quoted: m } : undefined
      );
      if (destination !== m.chat) {
        await m.reply('✅ Video bulat berhasil dikirim ke Channel.');
      }
    } catch (error) {
      console.error('Video note error:', error);
      const message = error.code === 'ENOENT'
        ? 'FFmpeg tidak ditemukan. Pastikan FFmpeg sudah terpasang di server.'
        : (error.message || 'Terjadi kesalahan saat memproses video.');
      await m.reply(`❌ Gagal mengirim video bulat: ${message}`);
    } finally {
      await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);
    }
  }
};
