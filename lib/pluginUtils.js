const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const util = require("util");
const { pipeline } = require("stream/promises");
const axios = require("axios");
const { exec, execFile } = require("child_process");
const yts = require("yt-search");
const moment = require("moment-timezone");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");
const cheerio = require("cheerio");

const { youtubeDl, Smeme } = require("./scrape");
const { audio2text } = require("./audio2text");
const ChatMusicAPI = require("./musicgen");
const { downloadInstagram } = require("./igdownload");
const { createBotBackup, deleteBotBackup } = require("./backupBot");
const { database, normalizeJid: normalizeDatabaseJid } = require("./database");
const { runtimePath } = require("./paths");

const execFileAsync = util.promisify(execFile);
const TEMP_DIR = runtimePath("tmp");
const ACCESS_FILE = runtimePath("users.json");

function ensureTempDirectory() {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

function createTempPath(prefix = "temp", extension = "tmp") {
  ensureTempDirectory();
  const safeExtension = String(extension || "tmp").replace(/^\./, "");
  return path.join(TEMP_DIR, `${prefix}-${Date.now()}-${crypto.randomUUID()}.${safeExtension}`);
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

async function runFfmpeg(args, timeout = 180_000) {
  return execFileAsync("ffmpeg", ["-y", ...args], {
    timeout,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true
  });
}

function withTimeout(promise, timeout, message = "Proses melewati batas waktu.") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

function normalizeJid(value) {
  const userPart = String(value || "").split("@")[0].split(":")[0];
  const number = userPart.replace(/[^0-9]/g, "");
  return number ? `${number}@s.whatsapp.net` : "";
}

function readAccessUsers() {
  if (!fs.existsSync(ACCESS_FILE)) fs.writeFileSync(ACCESS_FILE, "[]");
  try {
    const parsed = JSON.parse(fs.readFileSync(ACCESS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error("users.json tidak valid:", error.message);
    return [];
  }
}

function writeAccessUsers(users) {
  fs.writeFileSync(ACCESS_FILE, JSON.stringify(users, null, 2));
}

function checkAccess(senderJid) {
  const normalizedSender = normalizeJid(senderJid);
  const owners = (global.owner || []).map(normalizeJid);
  if (owners.includes(normalizedSender)) return true;
  const user = database.getUser(normalizedSender);
  if (user?.premium) return true;
  return readAccessUsers().map(normalizeJid).includes(normalizedSender);
}

function ctext(text, style = 1) {
  const abc = "abcdefghijklmnopqrstuvwxyz1234567890".split("");
  const styles = {
    1: "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀꜱᴛᴜᴠᴡxʏᴢ1234567890"
  };
  const target = styles[style] || styles[1];
  const map = new Map(abc.map((item, index) => [item, target.split("")[index]]));
  return String(text || "")
    .split("")
    .map((char) => {
      if (char.toUpperCase() !== char.toLowerCase() && char === char.toUpperCase()) return char;
      return map.get(char.toLowerCase()) || char;
    })
    .join("");
}

function createVerificationQuote(chat) {
  return {
    key: {
      fromMe: false,
      participant: "0@s.whatsapp.net",
      ...(chat ? { remoteJid: "status@broadcast" } : {})
    },
    message: {
      extendedTextMessage: { text: "Rafael." }
    }
  };
}

module.exports = {
  fs,
  path,
  os,
  crypto,
  util,
  pipeline,
  axios,
  exec,
  execFile,
  execFileAsync,
  yts,
  moment,
  wrapper,
  CookieJar,
  cheerio,
  youtubeDl,
  Smeme,
  audio2text,
  ChatMusicAPI,
  downloadInstagram,
  createBotBackup,
  deleteBotBackup,
  database,
  normalizeDatabaseJid,
  TEMP_DIR,
  createTempPath,
  safeUnlink,
  runFfmpeg,
  withTimeout,
  normalizeJid,
  readAccessUsers,
  writeAccessUsers,
  checkAccess,
  ctext,
  createVerificationQuote
};
