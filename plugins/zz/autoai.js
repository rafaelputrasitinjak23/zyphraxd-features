const fs = require("fs");
const path = require("path");
const axios = require("axios");
const moment = require("moment-timezone");
const { runtimePath } = require("../../lib/paths");
const { findCommandSuggestions } = require("../../lib/didYouMean");
const { THUMBNAILS, sendThumbnailMessage } = require("../../lib/thumbnails");

const DATA_DIR = runtimePath("data");
const DATA_FILE = runtimePath("data", "autoai.json");
const API_URL = "https://api.siputzx.my.id/api/ai/glm47flash";

const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_HISTORY = 8;
const MAX_PROMPT_LENGTH = 3000;
const API_TIMEOUT = 45_000;

const BLOCKED_AI_COMMANDS = new Set([
  "autoai",
  "stopai",
  "resetai",
  "aistatus",
  "reloadplugins"
]);

const CONFIRM_COMMANDS = new Set([
  "restart",
  "update",
  "broadcast",
  "sendall",
  "restorebackup",
  "restoredb",
  "deletebackup",
  "ban",
  "kick",
  "demote",
  "close",
  "clearlogs",
  "cleartemp",
  "clearcache"
]);

const processingSessions = new Set();
let saveQueue = Promise.resolve();

function sendAutoAi(ctx, caption) {
  return sendThumbnailMessage(ctx.Rafael, ctx.m, THUMBNAILS.AUTO_AI, caption);
}

function defaultData() {
  return {
    version: 1,
    sessions: {}
  };
}

function loadData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaultData();
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    return {
      ...defaultData(),
      ...parsed,
      sessions:
        parsed.sessions && typeof parsed.sessions === "object"
          ? parsed.sessions
          : {}
    };
  } catch (error) {
    try {
      fs.copyFileSync(DATA_FILE, `${DATA_FILE}.corrupt-${Date.now()}`);
    } catch {}

    console.error("Data AutoAI rusak, membuat data baru:", error.message);
    return defaultData();
  }
}

const data = loadData();

function saveData() {
  const snapshot = JSON.stringify(data, null, 2);

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const temporary = `${DATA_FILE}.${process.pid}.tmp`;
      await fs.promises.writeFile(temporary, snapshot);
      await fs.promises.rename(temporary, DATA_FILE);
    });

  return saveQueue;
}

function normalizeJid(value) {
  const raw = String(value || "");
  const user = raw.split("@")[0].split(":")[0].replace(/[^0-9]/g, "");
  return user ? `${user}@s.whatsapp.net` : "";
}

function sessionKey(ctx) {
  const chat = String(ctx.m?.chat || ctx.from || "");
  const sender = normalizeJid(ctx.sender);
  return `${chat}:${sender}`;
}

function cleanupExpiredSessions() {
  const now = Date.now();
  let changed = false;

  for (const [key, session] of Object.entries(data.sessions)) {
    if (!session || now - Number(session.updatedAt || 0) > SESSION_TTL) {
      delete data.sessions[key];
      changed = true;
    }
  }

  if (changed) saveData().catch(() => {});
}

setInterval(cleanupExpiredSessions, 30 * 60 * 1000).unref?.();

function getSession(ctx) {
  cleanupExpiredSessions();
  return data.sessions[sessionKey(ctx)] || null;
}

function createSession(ctx) {
  const key = sessionKey(ctx);
  const now = Date.now();

  data.sessions[key] = {
    id: key,
    chat: String(ctx.m?.chat || ctx.from || ""),
    sender: normalizeJid(ctx.sender),
    active: true,
    createdAt: now,
    updatedAt: now,
    history: [],
    pendingAction: null
  };

  return data.sessions[key];
}

function ensureSession(ctx) {
  return getSession(ctx) || createSession(ctx);
}

function trimHistory(session) {
  if (!Array.isArray(session.history)) session.history = [];
  session.history = session.history.slice(-MAX_HISTORY);
}

function addHistory(session, role, content) {
  const text = String(content || "").trim();
  if (!text) return;

  if (!Array.isArray(session.history)) session.history = [];
  session.history.push({
    role,
    content: text.slice(0, 800),
    at: Date.now()
  });

  trimHistory(session);
  session.updatedAt = Date.now();
}

function extractApiText(payload) {
  if (typeof payload === "string") return payload.trim();
  if (!payload || typeof payload !== "object") return "";

  const candidates = [
    payload.result,
    payload.response,
    payload.answer,
    payload.message,
    payload.content,
    payload.text,
    payload.data,
    payload.data?.result,
    payload.data?.response,
    payload.data?.answer,
    payload.data?.message,
    payload.data?.content,
    payload.data?.text,
    payload.choices?.[0]?.message?.content,
    payload.choices?.[0]?.text
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function parseToolCall(text) {
  const raw = String(text || "").trim();
  const matches = [
    raw.match(/<tool>\s*([\s\S]*?)\s*<\/tool>/i),
    raw.match(/```json\s*([\s\S]*?)\s*```/i),
    raw.match(/\{[\s\S]*?"type"\s*:\s*"command"[\s\S]*?\}/i)
  ].filter(Boolean);

  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1] || match[0]);
      if (parsed?.type === "command" && parsed.command) {
        return {
          type: "command",
          command: String(parsed.command).trim().toLowerCase(),
          args: String(parsed.args || "").trim(),
          confirmation: String(parsed.confirmation || "").trim()
        };
      }
    } catch {}
  }

  return null;
}

function stripToolBlock(text) {
  return String(text || "")
    .replace(/<tool>[\s\S]*?<\/tool>/gi, "")
    .replace(/```json[\s\S]*?```/gi, "")
    .trim();
}

function pluginVisible(plugin, ctx) {
  if (!plugin || typeof plugin.run !== "function") return false;
  if (plugin.owner && !ctx.isCreator) return false;
  if (plugin.group && !ctx.isGroup) return false;
  if (plugin.private && ctx.isGroup) return false;
  if (plugin.admin && !ctx.isAdmin && !ctx.isCreator) return false;
  if (plugin.botAdmin && !ctx.isBotAdmin) return false;
  if (plugin.premium && !ctx.user?.premium && !ctx.isCreator) return false;
  return true;
}

function commandCatalog(ctx) {
  const seen = new Set();
  const rows = [];

  for (const plugin of ctx.pluginManager.plugins || []) {
    if (!pluginVisible(plugin, ctx)) continue;

    const command = String(plugin.commands?.[0] || "").toLowerCase();
    if (!command || seen.has(command) || BLOCKED_AI_COMMANDS.has(command)) continue;

    seen.add(command);
    rows.push(
      `- ${command}: ${String(plugin.description || plugin.name || "Fitur bot").slice(0, 60)}`
    );
  }

  return rows.slice(0, 55).join("\n");
}

function historyPrompt(session) {
  const entries = Array.isArray(session.history) ? session.history.slice(-MAX_HISTORY) : [];
  if (!entries.length) return "Belum ada riwayat percakapan.";

  return entries
    .map((item) => `${item.role === "assistant" ? "ASSISTANT" : "USER"}: ${item.content}`)
    .join("\n");
}

function buildSystemPrompt(ctx) {
  const now = moment().tz("Asia/Jakarta");
  const catalog = commandCatalog(ctx);

  return [
    "Kamu adalah ZyphraXD AI, chatbot WhatsApp yang ramah, cepat, dan membantu.",
    "Gunakan bahasa Indonesia yang natural kecuali pengguna meminta bahasa lain.",
    "Jangan mengarang hasil command. Jika pengguna meminta fitur bot, gunakan tool command.",
    "Jangan pernah menjalankan command yang tidak ada di daftar.",
    "Jangan pernah menjalankan command owner/admin/premium bila command itu tidak ada di daftar yang diberikan.",
    "Gunakan satu command saja untuk satu respons.",
    "Jangan sertakan titik di depan nama command pada JSON.",
    "Pertahankan URL, nomor, judul lagu, prompt, dan parameter pengguna secara akurat di field args.",
    "Jika permintaan hanya percakapan biasa, jawab normal tanpa tool.",
    "Jika perlu menjalankan fitur bot, keluarkan format persis berikut:",
    '<tool>{"type":"command","command":"nama_command","args":"parameter","confirmation":"kalimat singkat"}</tool>',
    "Boleh menambahkan jawaban singkat di luar tag tool, tetapi jangan membuat tag tool lebih dari satu.",
    "",
    `Tanggal sekarang: ${now.format("dddd, DD MMMM YYYY")}`,
    `Waktu sekarang: ${now.format("HH:mm:ss")}`,
    "Zona waktu: Asia/Jakarta (WIB)",
    `Nama pengguna: ${ctx.pushname || "Pengguna"}`,
    `Jenis chat: ${ctx.isGroup ? "Grup" : "Pribadi"}`,
    "",
    "Daftar command yang boleh digunakan:",
    catalog || "Tidak ada command yang tersedia."
  ].join("\n");
}

function buildUserPrompt(session, message) {
  const prompt = [
    "RIWAYAT PERCAKAPAN:",
    historyPrompt(session),
    "",
    "PESAN TERBARU USER:",
    String(message || "").trim(),
    "",
    "Balas sesuai instruksi system."
  ].join("\n");

  return prompt.slice(-MAX_PROMPT_LENGTH);
}

async function requestAi(ctx, session, message) {
  const response = await axios.get(API_URL, {
    params: {
      prompt: buildUserPrompt(session, message),
      system: buildSystemPrompt(ctx),
      temperature: 0.7
    },
    timeout: API_TIMEOUT,
    headers: {
      Accept: "application/json",
      "User-Agent": "ZyphraXD/1.0"
    },
    maxRedirects: 2,
    validateStatus: (status) => status >= 200 && status < 500
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`API AI merespons HTTP ${response.status}`);
  }

  const result = extractApiText(response.data);
  if (!result) throw new Error("Respons AI kosong atau formatnya tidak dikenali.");
  return result;
}

function makeSyntheticMessage(m, commandLine) {
  const synthetic = Object.assign(Object.create(Object.getPrototypeOf(m) || null), m);
  synthetic.body = commandLine;
  synthetic.text = commandLine;
  synthetic.message = m.message;
  synthetic.reply = typeof m.reply === "function" ? m.reply.bind(m) : m.reply;
  return synthetic;
}

async function executeAiCommand(ctx, action) {
  const plugin = ctx.pluginManager.get(action.command);
  if (!plugin || !pluginVisible(plugin, ctx)) {
    return ctx.m.reply("Command yang dipilih AI tidak tersedia untuk chat ini.");
  }

  if (BLOCKED_AI_COMMANDS.has(action.command)) {
    return ctx.m.reply("Command tersebut tidak dapat dijalankan melalui AutoAI.");
  }

  const commandLine = `.${action.command}${action.args ? ` ${action.args}` : ""}`;
  const fakeMessage = makeSyntheticMessage(ctx.m, commandLine);

  if (action.confirmation) {
    await ctx.m.reply(`🤖 ${action.confirmation}\n\nMenjalankan: *${commandLine}*`);
  } else {
    await ctx.m.reply(`🤖 Menjalankan: *${commandLine}*`);
  }

  const caseHandler = require("../../case");
  await caseHandler(ctx.Rafael, fakeMessage);
}

async function handlePendingConfirmation(ctx, session, message) {
  const pending = session.pendingAction;
  if (!pending) return false;

  if (Date.now() > Number(pending.expiresAt || 0)) {
    session.pendingAction = null;
    await saveData();
    return false;
  }

  const normalized = String(message || "").trim().toLowerCase();

  if (["batal", "cancel", "tidak", "no"].includes(normalized)) {
    session.pendingAction = null;
    session.updatedAt = Date.now();
    await saveData();
    await ctx.m.reply("Tindakan dibatalkan.");
    return true;
  }

  if (!["ya", "iya", "yes", "lanjut", "konfirmasi"].includes(normalized)) {
    await ctx.m.reply(
      `Ada tindakan yang menunggu konfirmasi:\n*.${pending.command}${pending.args ? ` ${pending.args}` : ""}*\n\nKetik *ya* untuk menjalankan atau *batal* untuk membatalkan.`
    );
    return true;
  }

  session.pendingAction = null;
  session.updatedAt = Date.now();
  await saveData();
  await executeAiCommand(ctx, pending);
  return true;
}

function shouldLetDidYouMeanHandle(ctx) {
  if (ctx.isCmd) return true;
  const raw = String(ctx.rawCommand || "").trim();
  if (!raw || raw.includes(" ")) return false;

  const suggestions = findCommandSuggestions(ctx.pluginManager, raw, ctx, {
    minimum: 70,
    limit: 1
  });

  return suggestions.length > 0;
}

function groupMessageTargetsBot(ctx) {
  if (!ctx.isGroup) return true;

  const botJid = normalizeJid(ctx.botNumber || ctx.Rafael.user?.id);
  const mentioned = (ctx.m.mentionedJid || []).map(normalizeJid).includes(botJid);
  const repliedToBot = normalizeJid(ctx.m.quoted?.sender) === botJid;
  return mentioned || repliedToBot;
}

async function handleAutoAiMessage(ctx) {
  const session = getSession(ctx);
  if (!session?.active) return false;
  if (ctx.m.key?.fromMe) return false;
  if (ctx.isCmd) return false;
  if (shouldLetDidYouMeanHandle(ctx)) return false;
  if (!groupMessageTargetsBot(ctx)) return false;

  const message = String(ctx.body || ctx.budy || "").trim();
  if (!message) return false;

  const key = sessionKey(ctx);
  if (processingSessions.has(key)) {
    await ctx.m.reply("AutoAI masih memproses pesan sebelumnya. Tunggu sebentar ya.");
    return true;
  }

  if (await handlePendingConfirmation(ctx, session, message)) return true;

  processingSessions.add(key);

  try {
    addHistory(session, "user", message);
    await saveData();

    const aiText = await requestAi(ctx, session, message);
    const action = parseToolCall(aiText);
    const normalReply = stripToolBlock(aiText);

    if (normalReply) {
      await ctx.m.reply(normalReply);
      addHistory(session, "assistant", normalReply);
    }

    if (action) {
      const plugin = ctx.pluginManager.get(action.command);

      if (!plugin || !pluginVisible(plugin, ctx)) {
        const failure = `Maaf, command .${action.command} tidak tersedia atau tidak dapat kamu gunakan di chat ini.`;
        await ctx.m.reply(failure);
        addHistory(session, "assistant", failure);
      } else if (CONFIRM_COMMANDS.has(action.command)) {
        session.pendingAction = {
          ...action,
          expiresAt: Date.now() + 60_000
        };

        const notice = [
          "⚠️ *Konfirmasi Tindakan*",
          "",
          `AutoAI ingin menjalankan:`,
          `*.${action.command}${action.args ? ` ${action.args}` : ""}*`,
          "",
          "Ketik *ya* dalam 60 detik untuk menjalankan atau *batal* untuk membatalkan."
        ].join("\n");

        await ctx.m.reply(notice);
        addHistory(session, "assistant", notice);
      } else {
        addHistory(
          session,
          "assistant",
          `[Menjalankan command .${action.command}${action.args ? ` ${action.args}` : ""}]`
        );
        await saveData();
        await executeAiCommand(ctx, action);
      }
    }

    if (!normalReply && !action) {
      await ctx.m.reply(aiText);
      addHistory(session, "assistant", aiText);
    }

    session.updatedAt = Date.now();
    trimHistory(session);
    await saveData();
    return true;
  } catch (error) {
    console.error("AutoAI error:", error?.response?.data || error);

    await ctx.m.reply(
      `AutoAI sedang tidak dapat merespons.\n${error.message || "Terjadi gangguan pada layanan AI."}`
    );

    return true;
  } finally {
    processingSessions.delete(key);
  }
}

module.exports = {
  name: "auto-ai-chatbot",
  commands: ["autoai", "stopai", "resetai", "aistatus"],
  category: "system",
  description: "Chatbot AI dengan sesi terpisah dan akses fitur bot",
  limit: 0,
  cooldown: 1200,

  async run(ctx) {
    const { command, args, m, isGroup } = ctx;
    const action = String(args[0] || "").toLowerCase();
    const key = sessionKey(ctx);
    const current = getSession(ctx);

    if (command === "stopai" || (command === "autoai" && ["off", "stop", "disable"].includes(action))) {
      if (!current) return sendAutoAi(ctx, "🤖 *AUTO AI*\n\nSesi AutoAI belum aktif.");
      delete data.sessions[key];
      await saveData();
      return sendAutoAi(ctx, "🛑 *AUTO AI DINONAKTIFKAN*\n\nSesi percakapan berhasil dihapus.");
    }

    if (command === "resetai") {
      const session = ensureSession(ctx);
      session.active = true;
      session.history = [];
      session.pendingAction = null;
      session.updatedAt = Date.now();
      await saveData();
      return sendAutoAi(ctx, "🔄 *AUTO AI DIRESET*\n\nRiwayat percakapan berhasil dihapus dan sesi tetap aktif.");
    }

    if (command === "aistatus") {
      if (!current?.active) {
        return sendAutoAi(ctx, "🤖 *STATUS AUTO AI*\n\nStatus: OFF\nAktifkan dengan *.autoai on*");
      }

      return sendAutoAi(ctx,
        [
          "🤖 *Status AutoAI*",
          "",
          "Status       : ON",
          `Jenis sesi   : ${isGroup ? "User + Grup" : "Private Chat"}`,
          `Riwayat      : ${current.history?.length || 0}/${MAX_HISTORY} pesan`,
          `Dibuat       : ${moment(current.createdAt).tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss")}`,
          `Diperbarui   : ${moment(current.updatedAt).tz("Asia/Jakarta").format("DD/MM/YYYY HH:mm:ss")}`,
          `Konfirmasi   : ${current.pendingAction ? "Menunggu" : "Tidak ada"}`
        ].join("\n")
      );
    }

    if (command === "autoai") {
      if (!action) {
        return sendAutoAi(ctx,
          [
            "🤖 *AutoAI ZyphraXD*",
            "",
            "Gunakan:",
            "• *.autoai on* — aktifkan chatbot",
            "• *.autoai off* — matikan dan hapus sesi",
            "• *.resetai* — reset riwayat",
            "• *.aistatus* — lihat status",
            "",
            "Setelah aktif, kamu bisa chat biasa atau meminta fitur bot, misalnya:",
            '• "Tolong play lagu Perfect Ed Sheeran"',
            '• "Download video TikTok ini https://..."',
            '• "Buat gambar anime kota futuristik"',
            "",
            isGroup
              ? "Di grup, mention atau reply pesan bot agar AutoAI merespons."
              : "Di private chat, AutoAI akan merespons pesan biasa secara otomatis."
          ].join("\n")
        );
      }

      if (!["on", "start", "enable"].includes(action)) {
        return sendAutoAi(ctx, "Gunakan *.autoai on* atau *.autoai off*.");
      }

      const session = ensureSession(ctx);
      session.active = true;
      session.updatedAt = Date.now();
      await saveData();

      return sendAutoAi(ctx,
        [
          "✅ *AutoAI berhasil diaktifkan*",
          "",
          "Sesi percakapan dibuat khusus untuk chat ini sehingga tidak bertabrakan dengan sesi pengguna lain.",
          "Tanggal dan waktu akan diperbarui secara realtime pada setiap permintaan.",
          "AutoAI dapat menjalankan command yang sesuai dengan hak akses kamu.",
          "",
          isGroup
            ? "Di grup, mention atau reply bot saat berbicara dengan AutoAI."
            : "Sekarang kamu dapat langsung mengirim pesan biasa."
        ].join("\n")
      );
    }
  },

  async onMessage(ctx) {
    return handleAutoAiMessage(ctx);
  }
};
