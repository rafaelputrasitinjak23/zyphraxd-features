const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
process.env.ZYPHRA_ROOT_DIR = process.env.ZYPHRA_ROOT_DIR || ROOT;
const IGNORED = new Set(["node_modules", "session", "sessions", "backups", "tmp"]);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (IGNORED.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
  }
}

walk(ROOT);
let failed = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    console.error(`Gagal: ${path.relative(ROOT, file)}`);
    console.error(result.stderr || result.stdout);
  }
}

const caseSource = fs.readFileSync(path.join(ROOT, "case.js"), "utf8");
if (/switch\s*\(\s*command\s*\)/.test(caseSource) || /^\s*case\s+["']/m.test(caseSource)) {
  failed = true;
  console.error("case.js masih mengandung switch/case command. Semua fitur harus berada di plugin.");
}

try {
  const pluginManager = require(path.join(ROOT, "lib", "pluginManager"));
  const summary = pluginManager.summary();
  const requiredLegacyCommands = [
    "menu", "list", "list-ch", "buttonlist", "listbutton", "buttons", "iqc", "spotify", "spdl", "smeme", "upch", "up",
    "backupbot", "backup", "getscript", "tt", "tiktok", "play", "yta", "ytmp3",
    "addakses", "broadcast", "sendall", "musicgen", "genmusic", "generatemusic",
    "igdl", "igdownload", "instagram", "audio2text", "a2t", "transcribe", "brat",
    "topixel", "remini", "hd", "enhance", "aiimg", "img", "raphael", "memegen",
    "faceswap", "deepfake", "sticker", "s", "stiker", "bratvid", "swm", "stickerwm",
    "stikerwm", "locksticker", "stickerlock", "locks", "kuncisticker", "stikerlock", "convert",
    "autoai", "stopai", "resetai", "aistatus",
    "menfess", "balasmenfess", "replymenfess", "stopmenfess",
    "tourl", "upload", "uploadfile", "tourl-upload",
    "game", "gamemenu", "leaderboard", "rank",
    "errorlog", "errorinfo", "errorstats", "testerror"
  ];
  const missing = requiredLegacyCommands.filter((command) => !pluginManager.has(command));

  if (summary.errors > 0) {
    failed = true;
    console.error("Plugin error:", summary.errorList);
  }
  if (missing.length) {
    failed = true;
    console.error("Command lama yang hilang:", missing.join(", "));
  }

  console.log(`JavaScript: ${files.length} file`);
  console.log(`Plugin: ${summary.plugins}`);
  console.log(`Command plugin: ${summary.commands}`);
  console.log(`Message hook: ${summary.hooks}`);
  console.log(`Command lama: ${requiredLegacyCommands.length - missing.length}/${requiredLegacyCommands.length}`);
} catch (error) {
  failed = true;
  console.error("Gagal memuat plugin:", error);
}

if (failed) process.exit(1);
console.log("Pemeriksaan selesai tanpa error.");
