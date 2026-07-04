const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { runtimePath } = require('../../lib/paths');

const DATA_DIR = runtimePath('data');
const DATA_FILE = runtimePath('data', 'menfess.json');
const INVITE_TTL = 24 * 60 * 60 * 1000;
const ROOM_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_PENDING_PER_USER = 3;
const CONTROL_COMMANDS = new Set(['menfess', 'balasmenfess', 'replymenfess', 'stopmenfess']);

fs.mkdirSync(DATA_DIR, { recursive: true });

function defaults() {
  return { version: 1, pending: {}, rooms: {} };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaults();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return {
      ...defaults(),
      ...parsed,
      pending: parsed?.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
      rooms: parsed?.rooms && typeof parsed.rooms === 'object' ? parsed.rooms : {}
    };
  } catch (error) {
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch {}
    console.error('[MENFESS] Database rusak:', error.message);
    return defaults();
  }
}

const data = loadData();
let saveQueue = Promise.resolve();

function saveData() {
  const snapshot = JSON.stringify(data, null, 2);
  saveQueue = saveQueue.catch(() => {}).then(async () => {
    const temporary = `${DATA_FILE}.${process.pid}.tmp`;
    await fs.promises.writeFile(temporary, snapshot);
    await fs.promises.rename(temporary, DATA_FILE);
  });
  return saveQueue;
}

function normalizeJid(value) {
  let number = String(value || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  if (number.startsWith('0')) number = `62${number.slice(1)}`;
  return number ? `${number}@s.whatsapp.net` : '';
}

function code() {
  return `MF-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function roomId() {
  return `ROOM-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

function cleanup() {
  const now = Date.now();
  let changed = false;
  for (const [id, invite] of Object.entries(data.pending)) {
    if (!invite || Number(invite.expiresAt || 0) <= now) {
      delete data.pending[id];
      changed = true;
    }
  }
  for (const [id, room] of Object.entries(data.rooms)) {
    const last = Number(room?.lastActivity || room?.createdAt || 0);
    if (!room || now - last > ROOM_TTL) {
      delete data.rooms[id];
      changed = true;
    }
  }
  if (changed) saveData().catch(() => {});
}

setInterval(cleanup, 10 * 60 * 1000).unref?.();

function findRoom(jid) {
  cleanup();
  return Object.values(data.rooms).find((room) => room && (room.userA === jid || room.userB === jid)) || null;
}

function partner(room, jid) {
  if (!room) return '';
  return room.userA === jid ? room.userB : room.userA;
}

function incoming(jid) {
  cleanup();
  return Object.values(data.pending)
    .filter((invite) => invite?.to === jid)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

function outgoingCount(jid) {
  cleanup();
  return Object.values(data.pending).filter((invite) => invite?.from === jid).length;
}

async function checkNumber(Rafael, jid) {
  if (typeof Rafael.onWhatsApp !== 'function') return { exists: true, jid };
  try {
    const result = await Rafael.onWhatsApp(jid.split('@')[0]);
    const first = Array.isArray(result) ? result[0] : result;
    if (!first) return { exists: false, jid };
    return { exists: first.exists !== false, jid: normalizeJid(first.jid || jid) };
  } catch {
    return { exists: true, jid };
  }
}

function footer() {
  return '\n\n_Ketik .stopmenfess untuk mengakhiri room._';
}

async function relayMessage(Rafael, m, target, body) {
  const type = String(m.mtype || '');
  const source = m.msg || m.message || {};
  const caption = String(body || '').trim();

  if (type === 'imageMessage') {
    const buffer = await Rafael.downloadMediaMessage(m);
    await Rafael.sendMessage(target, { image: buffer, caption: `🖼️ *MENFESS CHAT*${caption ? `\n\n${caption}` : ''}${footer()}` });
    return true;
  }
  if (type === 'videoMessage') {
    const buffer = await Rafael.downloadMediaMessage(m);
    await Rafael.sendMessage(target, { video: buffer, mimetype: source.mimetype || 'video/mp4', caption: `🎬 *MENFESS CHAT*${caption ? `\n\n${caption}` : ''}${footer()}` });
    return true;
  }
  if (type === 'audioMessage') {
    const buffer = await Rafael.downloadMediaMessage(m);
    await Rafael.sendMessage(target, { audio: buffer, mimetype: source.mimetype || 'audio/mpeg', ptt: Boolean(source.ptt) });
    await Rafael.sendMessage(target, { text: `🎧 *Audio dari Menfess Chat*${footer()}` });
    return true;
  }
  if (type === 'stickerMessage') {
    const buffer = await Rafael.downloadMediaMessage(m);
    await Rafael.sendMessage(target, { sticker: buffer });
    return true;
  }
  if (type === 'documentMessage') {
    const buffer = await Rafael.downloadMediaMessage(m);
    await Rafael.sendMessage(target, {
      document: buffer,
      mimetype: source.mimetype || 'application/octet-stream',
      fileName: source.fileName || `menfess-${Date.now()}.bin`,
      caption: `📄 *MENFESS CHAT*${caption ? `\n\n${caption}` : ''}${footer()}`
    });
    return true;
  }
  if (caption) {
    await Rafael.sendMessage(target, { text: `💬 *MENFESS CHAT*\n\n${caption}${footer()}` });
    return true;
  }
  return false;
}

async function createMenfess(ctx) {
  const { Rafael, m, text, sender, prefix } = ctx;
  const senderJid = normalizeJid(sender);
  if (findRoom(senderJid)) return m.reply('Kamu masih berada di room menfess. Ketik .stopmenfess terlebih dahulu.');

  const index = String(text || '').indexOf('|');
  if (index === -1) {
    return m.reply(`Format:\n${prefix}menfess 628xxxxxxxxxx|pesan kamu\n\nContoh:\n${prefix}menfess 628123456789|Hai, boleh kenalan?`);
  }

  let targetJid = normalizeJid(text.slice(0, index).trim());
  const message = text.slice(index + 1).trim();
  if (!targetJid || targetJid.split('@')[0].length < 8) return m.reply('Nomor tujuan tidak valid. Gunakan format 628xxxxxxxxxx.');
  if (!message) return m.reply('Pesan menfess tidak boleh kosong.');
  if (message.length > 1500) return m.reply('Pesan menfess maksimal 1.500 karakter.');
  if (targetJid === senderJid) return m.reply('Kamu tidak dapat mengirim menfess kepada diri sendiri.');
  if (targetJid === normalizeJid(Rafael.user?.id)) return m.reply('Nomor tujuan tidak boleh nomor bot.');
  if (findRoom(targetJid)) return m.reply('Target sedang berada di room menfess lain. Coba lagi nanti.');
  if (outgoingCount(senderJid) >= MAX_PENDING_PER_USER) return m.reply(`Maksimal ${MAX_PENDING_PER_USER} undangan menfess yang belum dibalas.`);

  const duplicate = Object.values(data.pending).find((invite) => invite?.from === senderJid && invite?.to === targetJid);
  if (duplicate) return m.reply('Kamu sudah mengirim menfess ke nomor tersebut. Tunggu dibalas atau gunakan .stopmenfess.');

  const checked = await checkNumber(Rafael, targetJid);
  if (!checked.exists) return m.reply('Nomor tujuan tidak terdaftar di WhatsApp.');
  targetJid = checked.jid || targetJid;

  const id = code();
  const now = Date.now();
  data.pending[id] = { id, from: senderJid, to: targetJid, message, createdAt: now, expiresAt: now + INVITE_TTL };
  await saveData();

  try {
    await Rafael.sendMessage(targetJid, {
      text: [
        '💌 *MENFESS MASUK*', '', message, '', `Kode: *${id}*`, '',
        `Balas dengan: *.balasmenfess ${id}*`,
        'Jika hanya ada satu menfess masuk, cukup ketik *.balasmenfess*.', '',
        'Undangan berlaku selama 24 jam.'
      ].join('\n')
    });
  } catch (error) {
    delete data.pending[id];
    await saveData();
    throw new Error(`Gagal mengirim menfess: ${error.message}`);
  }

  return m.reply(`Menfess berhasil dikirim secara anonim.\nKode: ${id}\nStatus: menunggu penerima membalas.`);
}

async function acceptMenfess(ctx) {
  const { Rafael, m, sender, args } = ctx;
  const receiver = normalizeJid(sender);
  if (findRoom(receiver)) return m.reply('Kamu sudah berada di room menfess.');

  const list = incoming(receiver);
  if (!list.length) return m.reply('Tidak ada menfess yang menunggu untuk kamu balas.');

  const requested = String(args[0] || '').trim().toUpperCase();
  let invite;
  if (requested) {
    invite = data.pending[requested];
    if (!invite || invite.to !== receiver) return m.reply('Kode menfess tidak ditemukan atau bukan milik kamu.');
  } else if (list.length === 1) {
    invite = list[0];
  } else {
    const preview = list.slice(0, 10).map((item, i) => `${i + 1}. ${item.id} — ${String(item.message).replace(/\s+/g, ' ').slice(0, 50)}`).join('\n');
    return m.reply(`Ada ${list.length} menfess menunggu:\n\n${preview}\n\nPilih dengan .balasmenfess KODE`);
  }

  if (findRoom(invite.from)) {
    delete data.pending[invite.id];
    await saveData();
    return m.reply('Pengirim sedang berada di room lain. Undangan dibatalkan.');
  }

  const id = roomId();
  const now = Date.now();
  data.rooms[id] = { id, userA: invite.from, userB: receiver, createdAt: now, lastActivity: now };
  delete data.pending[invite.id];
  await saveData();

  const notice = [
    '✅ *ROOM MENFESS DIBUKA*', '',
    'Kalian dapat mengirim teks, gambar, video, audio, sticker, dan dokumen.',
    'Identitas tetap dirahasiakan.', '',
    'Ketik *.stopmenfess* untuk menutup room.'
  ].join('\n');

  await Promise.allSettled([
    Rafael.sendMessage(invite.from, { text: notice }),
    Rafael.sendMessage(receiver, { text: notice })
  ]);
}

async function stopMenfess(ctx) {
  const { Rafael, m, sender } = ctx;
  const jid = normalizeJid(sender);
  const room = findRoom(jid);
  if (room) {
    const other = partner(room, jid);
    delete data.rooms[room.id];
    await saveData();
    await Promise.allSettled([
      Rafael.sendMessage(jid, { text: '🛑 Room menfess telah ditutup.' }),
      Rafael.sendMessage(other, { text: '🛑 Lawan bicara menutup room menfess.' })
    ]);
    return;
  }

  let cancelled = 0;
  for (const [id, invite] of Object.entries(data.pending)) {
    if (invite?.from === jid || invite?.to === jid) {
      delete data.pending[id];
      cancelled += 1;
    }
  }
  if (cancelled) {
    await saveData();
    return m.reply(`${cancelled} undangan menfess berhasil dibatalkan.`);
  }
  return m.reply('Kamu tidak sedang berada di room atau memiliki undangan menfess aktif.');
}

module.exports = {
  name: 'menfess-chat',
  commands: ['menfess', 'balasmenfess', 'replymenfess', 'stopmenfess'],
  category: 'main',
  description: 'Menfess anonim dan room chat pribadi',
  private: true,
  limit: 0,
  cooldown: 1500,

  async run(ctx) {
    if (ctx.command === 'menfess') return createMenfess(ctx);
    if (['balasmenfess', 'replymenfess'].includes(ctx.command)) return acceptMenfess(ctx);
    if (ctx.command === 'stopmenfess') return stopMenfess(ctx);
  },

  async onMessage(ctx) {
    const { Rafael, m, sender, body, command, isGroup } = ctx;
    if (isGroup || m.key?.fromMe) return false;
    if (CONTROL_COMMANDS.has(String(command || '').toLowerCase())) return false;

    const jid = normalizeJid(sender);
    const room = findRoom(jid);
    if (!room) return false;

    const other = partner(room, jid);
    if (!other) {
      delete data.rooms[room.id];
      await saveData();
      return false;
    }

    try {
      const relayed = await relayMessage(Rafael, m, other, body);
      if (!relayed) await m.reply('Jenis pesan ini belum didukung di room menfess.');
      room.lastActivity = Date.now();
      await saveData();
      return true;
    } catch (error) {
      console.error('[MENFESS] Gagal meneruskan pesan:', error);
      await m.reply('Pesan gagal diteruskan. Coba kirim ulang beberapa saat lagi.');
      return true;
    }
  }
};
