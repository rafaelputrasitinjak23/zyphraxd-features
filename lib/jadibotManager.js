const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const pino = require("pino");
const { Boom } = require("@hapi/boom");
const FileType = require("file-type");
const PhoneNumber = require("awesome-phonenumber");
const fetch = require("node-fetch");

const {
  default: makeWASocket,
  DisconnectReason,
  makeInMemoryStore,
  jidDecode,
  proto,
  prepareWAMessageMedia,
  generateWAMessageFromContent,
  getContentType,
  useMultiFileAuthState,
  initAuthCreds,
  BufferJSON,
  downloadContentFromMessage
} = require("@whiskeysockets/baileys");

const errorMonitor = require("./errorMonitor");
const downloaderCache = require("./cacheManager");
const { cleanupDirectory } = require("./systemHealth");
const { handleParticipantUpdate } = require("./groupMiddleware");
const {
  imageToWebp,
  videoToWebp,
  writeExifImg,
  writeExifVid,
  writeExif
} = require("./exif");

const { runtimePath } = require("./paths");
const { getCollections } = require("./mongoStore");
const ROOT = runtimePath();
const DATA_FILE = runtimePath("data", "jadibot.json");
const SESSIONS_DIR = runtimePath("jadibot-sessions");
const TEMP_DIR = runtimePath("tmp");
const MESSAGE_DEDUPE_TTL_MS = 10 * 60 * 1000;
const PAIRING_VERSION = [2, 3000, 1034074495];
const DEFAULT_MAX_BOTS = Number(process.env.JADIBOT_MAX_BOTS || 1000);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(file, fallback) {
  ensureDirectory(path.dirname(file));
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return JSON.parse(JSON.stringify(fallback));
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : JSON.parse(JSON.stringify(fallback));
  } catch (error) {
    console.error("jadibot.json tidak valid:", error.message);
    return JSON.parse(JSON.stringify(fallback));
  }
}

function writeJson(file, data) {
  ensureDirectory(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function normalizeJid(value) {
  const userPart = String(value || "").split("@")[0].split(":")[0];
  const number = userPart.replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : "";
}

function normalizePhoneNumber(input) {
  let phone = String(input || "").replace(/[^0-9]/g, "");
  if (!phone) return "";
  if (phone.startsWith("0")) phone = `62${phone.slice(1)}`;
  else if (phone.startsWith("8")) phone = `62${phone}`;
  return phone;
}

function formatPairingCode(code) {
  return String(code || "").match(/.{1,4}/g)?.join("-") || String(code || "");
}

function formatPhoneNumber(jid) {
  const number = String(jid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/[^0-9]/g, "");

  if (!number) return String(jid || "Unknown");

  try {
    return PhoneNumber(`+${number}`).getNumber("international") || `+${number}`;
  } catch {
    return `+${number}`;
  }
}

function unwrapMessageContent(message) {
  let content = message;
  const wrappers = [
    "ephemeralMessage",
    "viewOnceMessage",
    "viewOnceMessageV2",
    "viewOnceMessageV2Extension",
    "documentWithCaptionMessage"
  ];

  while (content && typeof content === "object") {
    const wrapper = wrappers.find((key) => content[key]?.message);
    if (!wrapper) break;
    content = content[wrapper].message;
  }

  return content;
}

function parseNativeFlowSelection(value) {
  if (!value) return "";
  if (typeof value === "object") {
    return String(
      value.id ||
      value.selectedId ||
      value.selectedRowId ||
      value.rowId ||
      value.command ||
      value?.single_select?.id ||
      ""
    );
  }

  try {
    return parseNativeFlowSelection(JSON.parse(String(value)));
  } catch {
    return "";
  }
}

async function inputToBuffer(input) {
  if (Buffer.isBuffer(input)) return input;

  if (typeof input !== "string") {
    throw new TypeError("Media harus berupa Buffer, URL, data URI, atau lokasi file.");
  }

  if (/^data:.*?\/.*?;base64,/i.test(input)) {
    return Buffer.from(input.split(",")[1], "base64");
  }

  if (/^https?:\/\//i.test(input)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);

    try {
      const response = await fetch(input, { signal: controller.signal });
      if (!response.ok) throw new Error(`Gagal mengambil media: HTTP ${response.status}`);
      return await response.buffer();
    } finally {
      clearTimeout(timer);
    }
  }

  if (fs.existsSync(input)) return fs.promises.readFile(input);
  throw new Error("Media tidak ditemukan.");
}

function ensureTempDirectory() {
  ensureDirectory(TEMP_DIR);
}

function createTempBase(prefix = "media") {
  ensureTempDirectory();
  return path.join(TEMP_DIR, `${prefix}-${Date.now()}-${crypto.randomUUID()}`);
}

async function safeUnlink(filePath) {
  if (!filePath || typeof filePath !== "string") return;
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error(`Gagal menghapus file sementara ${filePath}:`, error.message);
    }
  }
}

function isDuplicateMessage(cache, message) {
  const messageId = String(message?.key?.id || "");
  const chatId = String(message?.key?.remoteJid || "");
  if (!messageId || !chatId) return false;

  const key = `${chatId}:${messageId}`;
  const now = Date.now();
  const previous = cache.get(key);
  if (previous && now - previous < MESSAGE_DEDUPE_TTL_MS) return true;

  cache.set(key, now);
  if (cache.size > 5000) {
    for (const [storedKey, timestamp] of cache) {
      if (now - timestamp >= MESSAGE_DEDUPE_TTL_MS) cache.delete(storedKey);
    }
  }
  return false;
}

function attachSocketHelpers(socket, store) {
  socket.decodeJid = (jid) => {
    if (!jid) return jid;
    if (/^\d+:\d+@/i.test(jid)) {
      const decoded = jidDecode(jid) || {};
      if (decoded.user && decoded.server) return `${decoded.user}@${decoded.server}`;
    }
    return jid;
  };

  socket.getName = async (jid, withoutContact = false) => {
    const id = socket.decodeJid(jid);
    const hideContact = socket.withoutContact || withoutContact;

    if (!id) return "Unknown";
    if (id === "0@s.whatsapp.net") return "WhatsApp";
    if (id === socket.decodeJid(socket.user?.id)) {
      return socket.user?.name || formatPhoneNumber(id);
    }

    let contact = store.contacts[id] || {};
    if (id.endsWith("@g.us") && !(contact.name || contact.subject)) {
      try {
        contact = (await socket.groupMetadata(id)) || contact;
      } catch {
        contact = store.contacts[id] || {};
      }
    }

    return (
      (hideContact ? "" : contact.name) ||
      contact.subject ||
      contact.verifiedName ||
      formatPhoneNumber(id)
    );
  };

  socket.serializeM = (message) => smsg(socket, message, store);

  socket.sendText = (jid, text, quoted = null, options = {}) => {
    const { quoted: customQuoted, ...contentOptions } = options || {};
    return socket.sendMessage(
      jid,
      { text: String(text), ...contentOptions },
      { quoted: customQuoted || quoted || undefined }
    );
  };

  socket.sendMedia = async (jid, media, fileName = "file", caption = "", quoted = null, options = {}) => {
    const buffer = await inputToBuffer(media);
    const detected = await FileType.fromBuffer(buffer);
    const mime = detected?.mime || "application/octet-stream";
    const ext = detected?.ext || "bin";
    const finalName = path.extname(fileName) ? fileName : `${fileName}.${ext}`;
    const content = { caption, ...options };

    if (mime.startsWith("image/")) content.image = buffer;
    else if (mime.startsWith("video/")) content.video = buffer;
    else if (mime.startsWith("audio/")) {
      content.audio = buffer;
      content.mimetype = mime;
    } else {
      content.document = buffer;
      content.mimetype = mime;
      content.fileName = finalName;
    }

    return socket.sendMessage(jid, content, { quoted: quoted || undefined });
  };

  socket.downloadMediaMessage = async (message) => {
    const content = message?.msg || message;
    if (!content) throw new Error("Pesan media tidak valid.");

    const mime = content.mimetype || message?.mimetype || "";
    const messageType = message?.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
    if (!messageType) throw new Error("Tipe media tidak dapat dikenali.");

    const stream = await downloadContentFromMessage(content, messageType);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  };

  socket.sendImageAsSticker = async (jid, media, quoted, options = {}) => {
    const inputBuffer = await inputToBuffer(media);
    let generatedPath = null;

    try {
      generatedPath = options.packname || options.author
        ? await writeExifImg(inputBuffer, options)
        : await imageToWebp(inputBuffer);

      const stickerBuffer = Buffer.isBuffer(generatedPath)
        ? generatedPath
        : await fs.promises.readFile(generatedPath);

      return await socket.sendMessage(jid, { sticker: stickerBuffer }, { quoted: quoted || undefined });
    } finally {
      if (typeof generatedPath === "string") await safeUnlink(generatedPath);
    }
  };

  socket.sendVideoAsSticker = async (jid, media, quoted, options = {}) => {
    const inputBuffer = await inputToBuffer(media);
    let generatedPath = null;

    try {
      generatedPath = options.packname || options.author
        ? await writeExifVid(inputBuffer, options)
        : await videoToWebp(inputBuffer);

      const stickerBuffer = Buffer.isBuffer(generatedPath)
        ? generatedPath
        : await fs.promises.readFile(generatedPath);

      return await socket.sendMessage(jid, { sticker: stickerBuffer }, { quoted: quoted || undefined });
    } finally {
      if (typeof generatedPath === "string") await safeUnlink(generatedPath);
    }
  };

  socket.sendLockedSticker = async (jid, media, quoted, options = {}) => {
    const inputBuffer = await inputToBuffer(media);
    const mediaType = String(options.mediaType || "image").toLowerCase();
    let generatedPath = null;

    try {
      if (mediaType === "sticker" || mediaType === "webp") {
        generatedPath = options.packname || options.author
          ? await writeExif({ mimetype: "image/webp", data: inputBuffer }, options)
          : inputBuffer;
      } else if (mediaType === "video") {
        generatedPath = options.packname || options.author
          ? await writeExifVid(inputBuffer, options)
          : await videoToWebp(inputBuffer);
      } else {
        generatedPath = options.packname || options.author
          ? await writeExifImg(inputBuffer, options)
          : await imageToWebp(inputBuffer);
      }

      const stickerBuffer = Buffer.isBuffer(generatedPath)
        ? generatedPath
        : await fs.promises.readFile(generatedPath);

      const prepared = await prepareWAMessageMedia(
        { sticker: stickerBuffer },
        { upload: socket.waUploadToServer }
      );

      if (!prepared?.stickerMessage) throw new Error("Gagal menyiapkan locked sticker.");

      const stickerMessage = proto.Message.StickerMessage.create({
        ...prepared.stickerMessage,
        mimetype: "image/webp",
        stickerSentTs: Date.now(),
        isAvatar: true,
        isAiSticker: false,
        isLottie: false,
        isAnimated: Boolean(options.isAnimated ?? prepared.stickerMessage.isAnimated ?? mediaType === "video")
      });

      const message = generateWAMessageFromContent(
        jid,
        { stickerMessage },
        { quoted: quoted || undefined, userJid: socket.user?.id }
      );

      await socket.relayMessage(jid, message.message, { messageId: message.key.id });
      return message;
    } finally {
      if (typeof generatedPath === "string") await safeUnlink(generatedPath);
    }
  };

  socket.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
    const buffer = await socket.downloadMediaMessage(message);
    const detected = await FileType.fromBuffer(buffer);
    const mime = (message?.msg || message)?.mimetype || "";
    const fallbackExt = mime.split("/")[1]?.split(";")[0] || "bin";
    const extension = detected?.ext || fallbackExt;
    const baseName = filename || createTempBase("media");
    const trueFileName = attachExtension && !path.extname(baseName) ? `${baseName}.${extension}` : baseName;

    await fs.promises.mkdir(path.dirname(path.resolve(trueFileName)), { recursive: true });
    await fs.promises.writeFile(trueFileName, buffer);
    return trueFileName;
  };
}

function smsg(socket, message, store) {
  if (!message) return message;

  const M = proto.WebMessageInfo;
  const m = message;

  if (m.key) {
    m.id = m.key.id;
    m.isBaileys = Boolean(m.id?.startsWith("BAE5") && m.id.length === 16);
    m.chat = m.key.remoteJid;
    m.fromMe = m.key.fromMe;
    m.isGroup = Boolean(m.chat?.endsWith("@g.us"));
    m.sender = socket.decodeJid(
      (m.fromMe && socket.user?.id) ||
      m.participant ||
      m.key.participant ||
      m.chat ||
      ""
    );

    if (m.isGroup) m.participant = socket.decodeJid(m.key.participant) || "";
  }

  if (m.message) {
    m.message = unwrapMessageContent(m.message);
    m.mtype = getContentType(m.message);
    m.msg = m.mtype ? m.message[m.mtype] : null;
    const nativeFlowSelection = parseNativeFlowSelection(
      m.msg?.nativeFlowResponseMessage?.paramsJson ||
      m.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson
    );

    m.body =
      m.message.conversation ||
      m.msg?.caption ||
      m.msg?.text ||
      m.msg?.singleSelectReply?.selectedRowId ||
      m.msg?.selectedButtonId ||
      nativeFlowSelection ||
      "";

    const contextInfo = m.msg?.contextInfo || {};
    const quotedContainer = contextInfo.quotedMessage;
    m.mentionedJid = contextInfo.mentionedJid || [];

    if (quotedContainer) {
      const quotedMessage = unwrapMessageContent(quotedContainer);
      let type = getContentType(quotedMessage);
      let quoted = type ? quotedMessage[type] : null;

      if (type === "productMessage" && quoted) {
        const productType = getContentType(quoted);
        if (productType) {
          type = productType;
          quoted = quoted[productType];
        }
      }

      if (typeof quoted === "string") quoted = { text: quoted };

      if (quoted && typeof quoted === "object") {
        quoted.mtype = type;
        quoted.message = quotedMessage;
        quoted.id = contextInfo.stanzaId;
        quoted.chat = contextInfo.remoteJid || m.chat;
        quoted.isBaileys = Boolean(quoted.id?.startsWith("BAE5") && quoted.id.length === 16);
        quoted.sender = socket.decodeJid(contextInfo.participant || quoted.chat);
        quoted.fromMe = quoted.sender === socket.decodeJid(socket.user?.id);
        quoted.text = quoted.text || quoted.caption || quoted.conversation || quoted.contentText || quoted.selectedDisplayText || quoted.title || "";
        quoted.mentionedJid = quoted.contextInfo?.mentionedJid || [];

        const fakeObject = M.fromObject({
          key: {
            remoteJid: quoted.chat,
            fromMe: quoted.fromMe,
            id: quoted.id
          },
          message: quotedMessage,
          ...(m.isGroup ? { participant: quoted.sender } : {})
        });

        quoted.fakeObj = fakeObject;
        quoted.delete = () => socket.sendMessage(quoted.chat, { delete: fakeObject.key });
        quoted.copyNForward = (jid, forceForward = false, options = {}) => {
          if (typeof socket.copyNForward !== "function") throw new Error("Fungsi copyNForward tidak tersedia pada versi Baileys ini.");
          return socket.copyNForward(jid, fakeObject, forceForward, options);
        };
        quoted.download = () => socket.downloadMediaMessage(quoted);
        m.quoted = quoted;

        m.getQuotedObj = m.getQuotedMessage = async () => {
          if (!quoted.id) return false;
          const stored = await store.loadMessage(quoted.chat, quoted.id);
          return stored ? smsg(socket, stored, store) : false;
        };
      }
    } else {
      m.quoted = null;
    }
  }

  m.text =
    m.body ||
    m.msg?.text ||
    m.msg?.caption ||
    m.message?.conversation ||
    m.msg?.contentText ||
    m.msg?.selectedDisplayText ||
    m.msg?.title ||
    "";

  if (m.msg) m.download = () => socket.downloadMediaMessage(m);

  m.reply = (text, chatId = m.chat, options = {}) => {
    const destination = chatId || m.chat;
    return Buffer.isBuffer(text)
      ? socket.sendMedia(destination, text, "file", "", m, options)
      : socket.sendText(destination, text, m, options);
  };

  m.copy = () => smsg(socket, M.fromObject(M.toObject(m)), store);
  m.copyNForward = (jid = m.chat, forceForward = false, options = {}) => {
    if (typeof socket.copyNForward !== "function") throw new Error("Fungsi copyNForward tidak tersedia pada versi Baileys ini.");
    return socket.copyNForward(jid, m, forceForward, options);
  };

  return m;
}

async function waitForPairingSocket(socket, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (socket?.ws?.readyState === 1 || socket?.ws?.readyState === socket?.ws?.OPEN) return true;
    await delay(500);
  }
  return false;
}

function isPairingRetryableError(error) {
  const statusCode = error?.output?.statusCode || error?.statusCode || error?.data?.statusCode;
  const message = String(error?.message || error?.output?.payload?.message || "").toLowerCase();
  return statusCode === 428 || message.includes("connection closed") || message.includes("precondition");
}

async function requestPairingCodeWithRetry(socket, phoneNumber, maxRetries = 5) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      await waitForPairingSocket(socket, 30_000);
      await delay(1500 * attempt);
      return await socket.requestPairingCode(phoneNumber);
    } catch (error) {
      lastError = error;
      if (!isPairingRetryableError(error) || attempt === maxRetries) break;
      await delay(2500 * attempt);
    }
  }

  throw lastError;
}

async function useMongoAuthState(sessionId) {
  const collections = await getCollections();
  const auth = collections.auth;

  const encode = (value) => JSON.parse(JSON.stringify(value, BufferJSON.replacer));
  const decode = (value) => JSON.parse(JSON.stringify(value), BufferJSON.reviver);

  let credsDoc = await auth.findOne({ sessionId, type: "creds", key: "creds" });
  let creds = credsDoc?.value ? decode(credsDoc.value) : initAuthCreds();

  const keys = {
    get: async (type, ids) => {
      const wanted = Array.isArray(ids) ? ids : [];
      if (!wanted.length) return {};
      const docs = await auth.find({ sessionId, type, key: { $in: wanted } }).toArray();
      const result = {};
      for (const id of wanted) {
        const doc = docs.find((item) => item.key === id);
        result[id] = doc?.value == null ? null : decode(doc.value);
      }
      return result;
    },
    set: async (data) => {
      const ops = [];
      for (const [type, values] of Object.entries(data || {})) {
        for (const [id, value] of Object.entries(values || {})) {
          const filter = { sessionId, type, key: id };
          if (value === null || value === undefined) {
            ops.push({ deleteOne: { filter } });
          } else {
            ops.push({ updateOne: { filter, update: { $set: { value: encode(value), updatedAt: new Date() } }, upsert: true } });
          }
        }
      }
      if (ops.length) await auth.bulkWrite(ops, { ordered: false });
    }
  };

  const saveCreds = async () => {
    await auth.updateOne(
      { sessionId, type: "creds", key: "creds" },
      { $set: { value: encode(creds), updatedAt: new Date() } },
      { upsert: true }
    );
  };

  return { state: { creds, keys }, saveCreds };
}

class JadibotManager {
  constructor() {
    this.sessions = new Map();
    this.records = new Map();
    this.restoreLock = false;
    this.mongoReady = this.initMongo();
  }

  async initMongo() {
    const collections = await getCollections();
    const records = await collections.sessions.find({}).toArray();
    this.records.clear();
    for (const record of records) this.records.set(record.phoneNumber, record);
    return true;
  }

  async syncMongoRecord(phoneNumber, patch = {}) {
    await this.mongoReady;
    const phone = normalizePhoneNumber(phoneNumber);
    const collections = await getCollections();
    const existing = this.records.get(phone) || {};
    const now = new Date();
    const record = {
      phoneNumber: phone,
      createdAt: existing.createdAt || now,
      ...existing,
      ...patch,
      updatedAt: now
    };
    delete record._id;
    await collections.sessions.updateOne({ phoneNumber: phone }, { $set: record }, { upsert: true });
    this.records.set(phone, record);
    return record;
  }

  upsertRecord(phoneNumber, patch = {}) {
    const phone = normalizePhoneNumber(phoneNumber);
    const existing = this.records.get(phone) || {};
    const record = { phoneNumber: phone, ...existing, ...patch, updatedAt: new Date() };
    this.records.set(phone, record);
    this.syncMongoRecord(phone, patch).catch((error) => console.error(`[JADIBOT DB] ${error.message}`));
    return record;
  }

  removeRecord(phoneNumber) {
    const phone = normalizePhoneNumber(phoneNumber);
    this.records.delete(phone);
    this.mongoReady.then(() => getCollections()).then(({ sessions }) => sessions.deleteOne({ phoneNumber: phone })).catch((error) => console.error(`[JADIBOT DB] ${error.message}`));
  }

  getRecord(phoneNumber) {
    return this.records.get(normalizePhoneNumber(phoneNumber)) || null;
  }

  listRecords() {
    return [...this.records.values()].map((record) => ({
      ...record,
      runtimeStatus: this.sessions.get(record.phoneNumber)?.status || "offline"
    }));
  }

  getSessionDir(phoneNumber) {
    const phone = normalizePhoneNumber(phoneNumber);
    if (!phone) throw new Error("Nomor tidak valid.");
    return path.join(SESSIONS_DIR, phone);
  }

  getRunningCount() {
    return [...this.sessions.values()].filter((item) => ["connecting", "pairing", "open"].includes(item.status)).length;
  }

  getStatus(phoneNumber) {
    const phone = normalizePhoneNumber(phoneNumber);
    const runtime = this.sessions.get(phone);
    const record = this.getRecord(phone);
    if (!runtime && !record) return null;
    return {
      ...(record || { phoneNumber: phone }),
      runtimeStatus: runtime?.status || "offline",
      connected: runtime?.status === "open",
      starting: runtime?.starting || false,
      user: runtime?.socket?.user || null,
      pairingCode: runtime?.pairingCode || record?.pairingCode || null,
      qr: runtime?.qr || record?.qr || null
    };
  }

  async startSession(options = {}) {
    const phoneNumber = normalizePhoneNumber(options.phoneNumber);
    const ownerJid = normalizeJid(options.ownerJid || options.sender || "");
    const ownerName = options.ownerName || "User";
    const requestPairing = options.requestPairing !== false;
    const restoring = Boolean(options.restoring);
    const forceNewPairing = Boolean(options.forceNewPairing) && requestPairing && !restoring;

    if (!phoneNumber) throw new Error("Nomor jadibot tidak valid.");

    const existingRuntime = this.sessions.get(phoneNumber);
    if (existingRuntime?.status === "open") {
      return {
        phoneNumber,
        alreadyRunning: true,
        registered: true,
        status: existingRuntime.status,
        message: "Jadibot sudah online."
      };
    }
    if (existingRuntime?.starting) throw new Error("Jadibot untuk nomor ini sedang diproses. Tunggu sebentar.");

    // Jika user meminta pairing baru dari command .jadibot 628xxx,
    // runtime lama yang offline/close dihentikan dulu supaya Baileys membuat kode baru.
    if (existingRuntime && forceNewPairing) {
      existingRuntime.shouldReconnect = false;
      if (existingRuntime.reconnectTimer) clearTimeout(existingRuntime.reconnectTimer);
      try { existingRuntime.socket?.ev?.removeAllListeners?.(); } catch {}
      try { existingRuntime.socket?.ws?.close?.(); } catch {}
      try { existingRuntime.socket?.end?.(new Error("Memulai ulang pairing jadibot.")); } catch {}
      this.sessions.delete(phoneNumber);
    }

    if (this.getRunningCount() >= DEFAULT_MAX_BOTS && !this.sessions.has(phoneNumber)) {
      throw new Error(`Limit jadibot aktif penuh. Maksimal ${DEFAULT_MAX_BOTS} anak bot.`);
    }

    const record = this.getRecord(phoneNumber) || {};
    const finalOwnerJid = ownerJid || record.ownerJid;
    const finalOwnerName = ownerName || record.ownerName || "User";
    const sessionDir = this.getSessionDir(phoneNumber);

    if (forceNewPairing) {
      const collections = await getCollections();
      await collections.auth.deleteMany({ sessionId: phoneNumber });
      if (fs.existsSync(sessionDir)) await fs.promises.rm(sessionDir, { recursive: true, force: true });
    }

    ensureDirectory(sessionDir);

    const store = makeInMemoryStore({
      logger: pino().child({ level: "silent", stream: `jadibot-${phoneNumber}` })
    });
    const processedMessages = new Map();
    const { state, saveCreds } = await useMongoAuthState(phoneNumber);

    const socket = makeWASocket({
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      ...(PAIRING_VERSION ? { version: PAIRING_VERSION } : {}),
      auth: state,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      keepAliveIntervalMs: 10_000,
      emitOwnEvents: false,
      fireInitQueries: true,
      generateHighQualityLinkPreview: true,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      browser: ["Ubuntu", "Chrome", "20.0.04"]
    });

    socket.public = true;
    socket.isJadibot = true;
    socket.childOwnerJid = finalOwnerJid;
    socket.childOwnerJids = finalOwnerJid ? [finalOwnerJid] : [];
    socket.childPhoneNumber = phoneNumber;
    attachSocketHelpers(socket, store);
    store.bind(socket.ev);

    const item = {
      phoneNumber,
      ownerJid: finalOwnerJid,
      ownerName: finalOwnerName,
      socket,
      store,
      processedMessages,
      status: state.creds.registered ? "connecting" : "pairing",
      starting: true,
      shouldReconnect: true,
      reconnectTimer: null,
      pairingCode: null,
      qr: null,
      startedAt: Date.now()
    };

    this.sessions.set(phoneNumber, item);
    this.upsertRecord(phoneNumber, {
      ownerJid: finalOwnerJid,
      ownerName: finalOwnerName,
      status: item.status,
      registered: Boolean(state.creds.registered),
      lastStartAt: new Date().toISOString()
    });

    const cleanupRuntime = () => {
      const current = this.sessions.get(phoneNumber);
      if (current === item) this.sessions.delete(phoneNumber);
      if (item.reconnectTimer) clearTimeout(item.reconnectTimer);
    };

    const scheduleReconnect = (delayMs = 5000) => {
      if (!item.shouldReconnect || item.reconnectTimer) return;
      item.status = "reconnecting";
      this.upsertRecord(phoneNumber, { status: "reconnecting" });
      item.reconnectTimer = setTimeout(() => {
        item.reconnectTimer = null;
        cleanupRuntime();
        this.startSession({
          phoneNumber,
          ownerJid: finalOwnerJid,
          ownerName: finalOwnerName,
          requestPairing: false,
          restoring: true
        }).catch((error) => {
          console.error(`[JADIBOT ${phoneNumber}] Gagal reconnect:`, error.message);
          this.upsertRecord(phoneNumber, {
            status: "error",
            lastError: error.message,
            lastDisconnectAt: new Date().toISOString()
          });
        });
      }, delayMs);
      item.reconnectTimer.unref?.();
    };

    socket.ev.on("messages.upsert", async (chatUpdate) => {
      if (chatUpdate.type !== "notify") return;

      for (const rawMessage of chatUpdate.messages || []) {
        try {
          if (isDuplicateMessage(processedMessages, rawMessage)) continue;

          const mek = {
            ...rawMessage,
            message: unwrapMessageContent(rawMessage.message)
          };

          if (!mek.message) continue;
          if (mek.key?.remoteJid === "status@broadcast") continue;
          if (!socket.public && !mek.key?.fromMe) continue;
          if (mek.key?.id?.startsWith("BAE5") && mek.key.id.length === 16) continue;

          const m = smsg(socket, mek, store);
          const caseHandler = require("../case");
          await caseHandler(socket, m, chatUpdate, store);
        } catch (error) {
          console.error(`[JADIBOT ${phoneNumber}] Gagal memproses pesan:`, error);
          await errorMonitor.capture(error, {
            Rafael: socket,
            m: rawMessage,
            from: rawMessage?.key?.remoteJid,
            sender: rawMessage?.key?.participant
          }, {
            source: "jadibot.messages.upsert",
            plugin: "jadibot-manager"
          });
        }
      }
    });

    socket.ev.on("group-participants.update", async (update) => {
      try {
        await handleParticipantUpdate(socket, update);
      } catch (error) {
        console.error(`[JADIBOT ${phoneNumber}] Gagal memproses member grup:`, error.message);
        await errorMonitor.capture(error, {
          Rafael: socket,
          from: update?.id
        }, {
          source: "jadibot.group-participants.update",
          plugin: "jadibot-manager",
          severity: "warning"
        });
      }
    });

    socket.ev.on("connection.update", async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        item.qr = qr;
        this.upsertRecord(phoneNumber, { status: "qr", qr, registered: false, lastQrAt: new Date().toISOString() });
      }

      if (connection === "open") {
        item.status = "open";
        item.starting = false;
        const botJid = socket.decodeJid(socket.user?.id || `${phoneNumber}@s.whatsapp.net`);
        console.log(`✅ [JADIBOT] ${phoneNumber} online sebagai ${botJid}`);
        item.qr = null;
        this.upsertRecord(phoneNumber, {
          status: "open",
          qr: null,
          registered: true,
          botJid,
          lastOpenAt: new Date().toISOString(),
          lastError: ""
        });
        cleanupDirectory(TEMP_DIR, 6 * 60 * 60 * 1000).catch(() => {});
        downloaderCache.cleanup();
        return;
      }

      if (connection !== "close") return;

      item.starting = false;
      const reason =
        lastDisconnect?.error?.output?.statusCode ||
        new Boom(lastDisconnect?.error).output?.statusCode;
      const message = lastDisconnect?.error?.message || "Connection closed";
      item.status = "close";
      console.log(`⚠️ [JADIBOT] ${phoneNumber} terputus: ${reason || message}`);
      this.upsertRecord(phoneNumber, {
        status: "close",
        lastDisconnectReason: reason || message,
        lastDisconnectAt: new Date().toISOString()
      });

      if (!item.shouldReconnect) {
        cleanupRuntime();
        return;
      }

      if (
        reason === DisconnectReason.loggedOut ||
        reason === DisconnectReason.badSession ||
        reason === DisconnectReason.connectionReplaced
      ) {
        this.upsertRecord(phoneNumber, {
          status: reason === DisconnectReason.loggedOut ? "loggedOut" : "stopped",
          registered: reason !== DisconnectReason.loggedOut,
          lastDisconnectReason: reason || message
        });
        cleanupRuntime();
        return;
      }

      scheduleReconnect(5000);
    });

    socket.ev.on("creds.update", saveCreds);

    let pairingCode = null;
    if (!state.creds.registered && requestPairing) {
      try {
        pairingCode = await requestPairingCodeWithRetry(socket, phoneNumber);
        item.pairingCode = formatPairingCode(pairingCode);
        item.status = "pairing";
        item.starting = false;
        this.upsertRecord(phoneNumber, {
          status: "pairing",
          pairingCode: formatPairingCode(pairingCode),
          registered: false,
          lastPairingAt: new Date().toISOString()
        });
      } catch (error) {
        item.starting = false;
        this.upsertRecord(phoneNumber, {
          status: "pairing_error",
          lastError: error.message,
          lastPairingErrorAt: new Date().toISOString()
        });
        throw error;
      }
    } else {
      item.starting = false;
    }

    return {
      phoneNumber,
      ownerJid: finalOwnerJid,
      ownerName: finalOwnerName,
      registered: Boolean(state.creds.registered),
      code: pairingCode,
      formattedCode: pairingCode ? formatPairingCode(pairingCode) : "",
      status: item.status,
      restoring,
      message: pairingCode ? "Pairing code berhasil dibuat." : "Jadibot sedang dijalankan."
    };
  }

  async stopSession(phoneNumber, options = {}) {
    const phone = normalizePhoneNumber(phoneNumber);
    if (!phone) throw new Error("Nomor tidak valid.");

    const item = this.sessions.get(phone);
    if (item) {
      item.shouldReconnect = false;
      item.status = "stopped";
      if (item.reconnectTimer) clearTimeout(item.reconnectTimer);
      try {
        item.socket?.ev?.removeAllListeners?.();
      } catch {}
      try {
        item.socket?.ws?.close?.();
      } catch {}
      try {
        item.socket?.end?.(new Error("Jadibot dihentikan."));
      } catch {}
      this.sessions.delete(phone);
    }

    this.upsertRecord(phone, {
      status: "stopped",
      lastStopAt: new Date().toISOString()
    });

    if (options.deleteSession) {
      const collections = await getCollections();
      await collections.auth.deleteMany({ sessionId: phone });
      await collections.sessions.deleteOne({ phoneNumber: phone });
      this.records.delete(phone);
    }

    return true;
  }

  async processPendingCommand(command) {
    if (!command?.requestId) return;
    const { commands } = await getCollections();
    const requestId = command.requestId;
    const phoneNumber = normalizePhoneNumber(command.phoneNumber);

    try {
      let result;
      if (command.type === "start") {
        result = await this.startSession({
          phoneNumber,
          ownerJid: command.payload?.ownerJid || "",
          ownerName: command.payload?.ownerName || "API User",
          forceNewPairing: Boolean(command.payload?.forceNewPairing),
          requestPairing: command.payload?.requestPairing !== false
        });
      } else if (command.type === "stop") {
        await this.stopSession(phoneNumber);
        result = { phoneNumber, status: "stopped", message: "Jadibot dihentikan." };
      } else if (command.type === "delete") {
        await this.deleteSession(phoneNumber);
        result = { phoneNumber, status: "deleted", message: "Session dihapus." };
      } else {
        throw new Error(`Command Jadibot tidak dikenal: ${command.type}`);
      }

      await commands.updateOne(
        { requestId },
        { $set: { status: "done", result, updatedAt: new Date(), completedAt: new Date() } }
      );
    } catch (error) {
      await commands.updateOne(
        { requestId },
        { $set: { status: "error", error: error.message, updatedAt: new Date(), completedAt: new Date() } }
      );
    }
  }

  async startCommandLoop() {
    if (this.commandLoopStarted) return;
    this.commandLoopStarted = true;
    const pollMs = Math.max(250, Number(process.env.JADIBOT_COMMAND_POLL_MS || 1000));
    const workerId = `${process.pid}-${crypto.randomUUID()}`;
    console.log(`[JADIBOT] MongoDB command loop aktif (${workerId})`);

    while (true) {
      try {
        await this.mongoReady;
        const { commands } = await getCollections();
        const now = new Date();
        const staleBefore = new Date(Date.now() - Math.max(60_000, Number(process.env.JADIBOT_COMMAND_STALE_MS || 120_000)));

        await commands.updateMany(
          { status: "processing", updatedAt: { $lt: staleBefore } },
          { $set: { status: "pending", updatedAt: now, recoveredAt: now } }
        );

        const pending = await commands.findOneAndUpdate(
          { status: "pending" },
          { $set: { status: "processing", workerId, updatedAt: now } },
          { sort: { createdAt: 1 }, returnDocument: "after" }
        );

        if (pending) await this.processPendingCommand(pending);
      } catch (error) {
        console.error(`[JADIBOT DB] command loop: ${error.message}`);
        await delay(Math.max(pollMs, 2000));
      }
      await delay(pollMs);
    }
  }

  async restoreSavedSessions() {
    if (this.restoreLock) return { restored: 0, skipped: 0, failed: [] };
    this.restoreLock = true;

    await this.mongoReady;
    const collections = await getCollections();
    const records = await collections.sessions.find({}).toArray();
    for (const record of records) this.records.set(record.phoneNumber, record);
    let restored = 0;
    let skipped = 0;
    const failed = [];

    try {
      for (const record of records) {
        const phoneNumber = normalizePhoneNumber(record.phoneNumber);
        if (!phoneNumber) {
          skipped += 1;
          continue;
        }
        if (this.sessions.has(phoneNumber)) {
          skipped += 1;
          continue;
        }
        if (record.status === "loggedOut" || record.registered === false) {
          skipped += 1;
          continue;
        }

        try {
          await this.startSession({
            phoneNumber,
            ownerJid: record.ownerJid,
            ownerName: record.ownerName,
            requestPairing: false,
            restoring: true
          });
          restored += 1;
          await delay(1000);
        } catch (error) {
          failed.push({ phoneNumber, error: error.message });
        }
      }
    } finally {
      this.restoreLock = false;
    }

    return { restored, skipped, failed };
  }

  async deleteSession(phoneNumber) {
    return this.stopSession(phoneNumber, { deleteSession: true });
  }

  isOwnerOf(phoneNumber, senderJid) {
    const record = this.getRecord(phoneNumber);
    if (!record) return false;
    return normalizeJid(record.ownerJid) === normalizeJid(senderJid);
  }
}

module.exports = new JadibotManager();
module.exports.JadibotManager = JadibotManager;
module.exports.normalizePhoneNumber = normalizePhoneNumber;
module.exports.normalizeJid = normalizeJid;
