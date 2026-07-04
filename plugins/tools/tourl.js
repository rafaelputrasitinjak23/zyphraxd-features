const fs = require('fs');
const path = require('path');
const { runtimePath } = require('../../lib/paths');
const crypto = require('crypto');
const FileType = require('file-type');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');

const API_URL = 'https://rafaelxd.my.id';
const TEMP_DIR = runtimePath('tmp', 'tourl');
const SESSION_TTL = 10 * 60 * 1000;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const UPLOAD_TIMEOUT = 120000;
const ALLOWED_DURATIONS = ['24h', '48h', '7d', '30d', 'permanent'];
const pendingUploads = new Map();

fs.mkdirSync(TEMP_DIR, { recursive: true });

function createToken() {
  return crypto.randomBytes(12).toString('hex');
}

function sanitizeFileName(value) {
  return String(value || `file-${Date.now()}.bin`)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180) || `file-${Date.now()}.bin`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(2)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function durationLabel(value) {
  return ({ '24h': '24 Jam', '48h': '48 Jam', '7d': '7 Hari', '30d': '30 Hari', permanent: 'Permanen' })[value] || value;
}

function expirationLabel(value) {
  if (!value) return 'Tidak ada';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', dateStyle: 'medium', timeStyle: 'medium' });
}

function getMediaNode(source) {
  if (!source) return {};
  if (source.msg && typeof source.msg === 'object') return source.msg;
  if (source.mtype && source.message?.[source.mtype]) return source.message[source.mtype];
  const message = source.message || {};
  for (const key of ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage']) {
    if (message[key]) return message[key];
  }
  return source;
}

function getMediaType(source) {
  if (source?.mtype) return String(source.mtype);
  const message = source?.message || {};
  return Object.keys(message).find((key) => ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage'].includes(key)) || '';
}

function isSupportedMedia(source) {
  if (!source) return false;
  const supported = new Set(['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage', 'ptvMessage']);
  if (supported.has(getMediaType(source))) return true;
  const node = getMediaNode(source);
  return Boolean(node?.mimetype || node?.url || node?.directPath);
}

function getMediaInformation(source) {
  const node = getMediaNode(source);
  return {
    mimeType: node?.mimetype || source?.mimetype || 'application/octet-stream',
    fileName: node?.fileName || source?.fileName || ''
  };
}

function extensionFromMime(mime) {
  const clean = String(mime || '').split(';')[0].toLowerCase();
  const map = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/3gpp': '3gp', 'video/webm': 'webm',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/wav': 'wav',
    'application/pdf': 'pdf', 'application/zip': 'zip', 'application/vnd.rar': 'rar',
    'application/x-7z-compressed': '7z', 'application/json': 'json',
    'application/vnd.android.package-archive': 'apk', 'text/plain': 'txt'
  };
  return map[clean] || clean.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'bin';
}

async function detectInfo(buffer, info) {
  let detected = null;
  try {
    detected = await FileType.fromBuffer(buffer);
  } catch {}
  const mimeType = info.mimeType && info.mimeType !== 'application/octet-stream'
    ? info.mimeType
    : detected?.mime || 'application/octet-stream';
  const extension = detected?.ext || extensionFromMime(mimeType);
  let fileName = sanitizeFileName(info.fileName || `file-${Date.now()}.${extension}`);
  if (!path.extname(fileName)) fileName = `${fileName}.${extension}`;
  return { fileName, mimeType };
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('[TOURL] Gagal menghapus temporary:', error.message);
  }
}

async function cleanupPending(token) {
  const pending = pendingUploads.get(token);
  if (!pending) return;
  pendingUploads.delete(token);
  await safeUnlink(pending.filePath);
}

setInterval(async () => {
  const now = Date.now();
  for (const [token, pending] of pendingUploads.entries()) {
    if (!pending || now >= pending.expiresAt) await cleanupPending(token);
  }
}, 60_000).unref?.();

async function uploadFileToApi(buffer, options = {}) {
  const {
    fileName = `file-${Date.now()}.bin`,
    mimeType = 'application/octet-stream',
    duration = '24h',
    timeout = 120000
  } = options;

  if (!Buffer.isBuffer(buffer)) throw new TypeError('File harus berupa Buffer');
  if (!buffer.length) throw new Error('Buffer file kosong');
  if (!ALLOWED_DURATIONS.includes(duration)) {
    throw new Error('Durasi tidak valid. Gunakan 24h, 48h, 7d, 30d, atau permanent');
  }
  if (typeof fetch !== 'function' || typeof FormData !== 'function' || typeof Blob !== 'function') {
    throw new Error('Fitur upload membutuhkan Node.js versi 18 atau lebih baru');
  }

  const endpoint = duration === 'permanent' ? '/api/upload/permanent' : '/api/upload/temporary';
  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), fileName);
  if (duration !== 'permanent') formData.append('duration', duration);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
      signal: controller.signal
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      const clean = responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Respons API tidak valid: ${clean || 'Respons kosong'}`);
    }

    if (!response.ok || result.success !== true) {
      throw new Error(result.message || result.error || `Upload gagal dengan HTTP ${response.status}`);
    }
    if (!result.data || typeof result.data !== 'object') throw new Error('Data file tidak ditemukan pada respons API');
    if (!result.data.download_url) throw new Error('URL download tidak ditemukan pada respons API');

    return {
      success: true,
      id: result.data.id || null,
      url: result.data.download_url,
      infoUrl: result.data.info_url || null,
      fileName: result.data.filename || fileName,
      mimeType: result.data.mime_type || mimeType,
      size: Number(result.data.size || buffer.length),
      storageType: result.data.storage_type || null,
      duration: result.data.duration || duration,
      expiresAt: result.data.expires_at || null,
      deleteToken: result.data.delete_token || null,
      data: result.data
    };
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Upload timeout setelah ${timeout} ms`);
    throw new Error(error.message || 'Terjadi kesalahan saat mengupload file');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createTemporary(buffer, information) {
  const detected = await detectInfo(buffer, information);
  const token = createToken();
  const filePath = path.join(TEMP_DIR, `${token}-${detected.fileName}`);
  await fs.promises.writeFile(filePath, buffer);
  return { token, filePath, ...detected };
}

async function sendDurationList(Rafael, m, pending, prefix) {
  const listPayload = {
    title: 'Pilih Durasi',
    sections: [
      {
        title: 'Penyimpanan Sementara',
        highlight_label: 'Pilih durasi',
        rows: [
          { header: '24 Jam', title: 'Simpan selama 24 jam', description: 'File otomatis terhapus setelah 24 jam', id: `${prefix}tourl-upload 24h ${pending.token}` },
          { header: '48 Jam', title: 'Simpan selama 48 jam', description: 'File otomatis terhapus setelah 48 jam', id: `${prefix}tourl-upload 48h ${pending.token}` },
          { header: '7 Hari', title: 'Simpan selama 7 hari', description: 'File otomatis terhapus setelah 7 hari', id: `${prefix}tourl-upload 7d ${pending.token}` },
          { header: '30 Hari', title: 'Simpan selama 30 hari', description: 'File otomatis terhapus setelah 30 hari', id: `${prefix}tourl-upload 30d ${pending.token}` }
        ]
      },
      {
        title: 'Penyimpanan Premium',
        rows: [
          {
            header: pending.isPremium ? 'Permanen' : 'Permanen 🔒',
            title: pending.isPremium ? 'Simpan secara permanen' : 'Khusus pengguna premium',
            description: pending.isPremium ? 'File tidak memiliki waktu kedaluwarsa' : 'Upgrade premium untuk menggunakan fitur ini',
            id: `${prefix}tourl-upload permanent ${pending.token}`
          }
        ]
      }
    ]
  };

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: [
        '📤 *TO URL UPLOADER*', '',
        `Nama file : ${pending.fileName}`,
        `Tipe file : ${pending.mimeType}`,
        `Ukuran    : ${formatBytes(pending.size)}`, '',
        'Tekan tombol list di bawah lalu pilih durasi penyimpanan file.', '',
        pending.isPremium
          ? '✨ Akun kamu dapat menggunakan penyimpanan permanen.'
          : '🔒 Penyimpanan permanen hanya tersedia untuk pengguna premium.', '',
        'Sesi pemilihan berlaku selama 10 menit.'
      ].join('\n')
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: 'ZyphraXD • File Uploader' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: 'Pilih Durasi Penyimpanan', subtitle: 'ZyphraXD ToURL', hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [{ name: 'single_select', buttonParamsJson: JSON.stringify(listPayload) }]
    })
  });

  const message = generateWAMessageFromContent(m.chat, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage
      }
    }
  }, { quoted: m });

  await Rafael.relayMessage(m.chat, message.message, { messageId: message.key.id });
}

async function sendResult(Rafael, m, result) {
  const buttons = [
    { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Buka File', url: result.url, merchant_url: result.url }) },
    { name: 'cta_copy', buttonParamsJson: JSON.stringify({ display_text: 'Salin URL', copy_code: result.url }) }
  ];
  if (result.infoUrl) {
    buttons.push({ name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Lihat Informasi', url: result.infoUrl, merchant_url: result.infoUrl }) });
  }

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: [
        '✅ *UPLOAD BERHASIL*', '',
        `ID          : ${result.id || '-'}`,
        `Nama file   : ${result.fileName}`,
        `Tipe file   : ${result.mimeType}`,
        `Ukuran      : ${formatBytes(result.size)}`,
        `Penyimpanan : ${result.storageType || '-'}`,
        `Durasi      : ${durationLabel(result.duration)}`,
        `Kedaluwarsa : ${expirationLabel(result.expiresAt)}`, '',
        `URL:\n${result.url}`
      ].join('\n')
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: 'ZyphraXD • ToURL' }),
    header: proto.Message.InteractiveMessage.Header.create({ title: 'File Berhasil Diunggah', subtitle: durationLabel(result.duration), hasMediaAttachment: false }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
  });

  const message = generateWAMessageFromContent(m.chat, {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage
      }
    }
  }, { quoted: m });

  await Rafael.relayMessage(m.chat, message.message, { messageId: message.key.id });
}

module.exports = {
  name: 'to-url',
  commands: ['tourl', 'upload', 'uploadfile', 'tourl-upload'],
  category: 'tools',
  description: 'Upload semua jenis media menjadi URL',
  limit: 0,
  cooldown: 1500,

  async run(ctx) {
    const { Rafael, m, command, args, prefix, sender, user, isCreator } = ctx;

    if (command === 'tourl-upload') {
      const duration = String(args[0] || '').trim().toLowerCase();
      const token = String(args[1] || '').trim();
      if (!ALLOWED_DURATIONS.includes(duration)) return m.reply('Durasi upload tidak valid.');
      if (!token) return m.reply('Token upload tidak ditemukan.');

      const pending = pendingUploads.get(token);
      if (!pending) return m.reply('Sesi upload tidak ditemukan atau sudah kedaluwarsa. Kirim ulang media menggunakan .tourl');
      if (Date.now() >= pending.expiresAt) {
        await cleanupPending(token);
        return m.reply('Sesi upload sudah kedaluwarsa. Silakan kirim ulang media.');
      }
      if (pending.sender !== sender || pending.chat !== m.chat) return m.reply('Sesi upload ini bukan milik kamu.');

      const premium = Boolean(user?.premium || isCreator);
      if (duration === 'permanent' && !premium) return m.reply('🔒 Penyimpanan permanen hanya tersedia untuk pengguna premium.');
      if (pending.processing) return m.reply('File sedang diupload. Mohon tunggu hingga selesai.');

      pending.processing = true;
      try {
        await m.reply(`⏳ Mengupload file dengan durasi ${durationLabel(duration)}...`);
        const buffer = await fs.promises.readFile(pending.filePath);
        const result = await uploadFileToApi(buffer, {
          fileName: pending.fileName,
          mimeType: pending.mimeType,
          duration,
          timeout: UPLOAD_TIMEOUT
        });
        await sendResult(Rafael, m, result);
        await cleanupPending(token);
      } catch (error) {
        pending.processing = false;
        console.error('[TOURL] Upload error:', error);
        return m.reply(`❌ Upload gagal.\n\nError: ${error.message || String(error)}\n\nKamu masih dapat memilih ulang durasi sebelum sesi kedaluwarsa.`);
      }
      return;
    }

    const source = m.quoted || m;
    if (!isSupportedMedia(source)) {
      return m.reply([
        'Reply atau kirim media menggunakan:', '', `${prefix}tourl`, '',
        'Mendukung gambar, video, audio, voice note, sticker, dokumen, PDF, ZIP/RAR/7Z, APK, dan semua jenis file.'
      ].join('\n'));
    }

    let temporary = null;
    try {
      await m.reply('⏳ Membaca dan menyiapkan media...');
      const buffer = await Rafael.downloadMediaMessage(source);
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw new Error('Media tidak berhasil diunduh');
      if (buffer.length > MAX_FILE_SIZE) throw new Error(`Ukuran file maksimal ${formatBytes(MAX_FILE_SIZE)}`);

      temporary = await createTemporary(buffer, getMediaInformation(source));
      const pending = {
        token: temporary.token,
        filePath: temporary.filePath,
        fileName: temporary.fileName,
        mimeType: temporary.mimeType,
        size: buffer.length,
        sender,
        chat: m.chat,
        isPremium: Boolean(user?.premium || isCreator),
        processing: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + SESSION_TTL
      };
      pendingUploads.set(temporary.token, pending);
      await sendDurationList(Rafael, m, pending, prefix);
    } catch (error) {
      if (temporary?.token) await cleanupPending(temporary.token);
      else if (temporary?.filePath) await safeUnlink(temporary.filePath);
      console.error('[TOURL] Prepare error:', error);
      return m.reply(`❌ Gagal membaca media.\n\nError: ${error.message || String(error)}`);
    }
  }
};
