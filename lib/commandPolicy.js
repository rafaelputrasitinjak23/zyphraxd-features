const FREE_COMMANDS = new Set([
  "daftar", "register", "menu", "list", "list-ch", "buttonlist", "listbutton", "buttons", "limit", "profile", "me", "premium", "rules",
  "health", "server", "queue", "plugins", "groupstatus"
]);

const OWNER_COMMANDS = new Set([
  "backupbot", "backup", "getscript", "addakses", "broadcast", "sendall",
  "addpremium", "delpremium", "setlimit", "ban", "unban", "addbot",
  "addgrup", "addgroup", "delgrup", "deletegrup", "delgroup", "listgrup", "listgroup", "cekgrup", "cekgroup", "groupmode", "modegrup", "cleartemp",
  "clearcache", "savebackup", "backupdb", "listbackup", "restorebackup",
  "restoredb", "deletebackup", "reloadplugins", "logs", "clearlogs", "restart", "update"
]);

const HEAVY_COMMANDS = new Set([
  "spotify", "spdl", "tt", "tiktok", "play", "yta", "ytmp3", "musicgen",
  "genmusic", "generatemusic", "igdl", "igdownload", "instagram", "audio2text",
  "a2t", "transcribe", "topixel", "remini", "hd", "enhance", "aiimg", "img",
  "raphael", "memegen", "faceswap", "deepfake", "sticker", "s", "stiker",
  "bratvid", "convert", "smeme", "upch"
]);

const COSTS = {
  spotify: 3, spdl: 3,
  tt: 2, tiktok: 2,
  play: 2, yta: 2, ytmp3: 2,
  musicgen: 5, genmusic: 5, generatemusic: 5,
  igdl: 2, igdownload: 2, instagram: 2,
  audio2text: 4, a2t: 4, transcribe: 4,
  deepfake: 5, faceswap: 5,
  aiimg: 3, img: 3, raphael: 3,
  remini: 2, hd: 2, enhance: 2,
  bratvid: 3, convert: 2, topixel: 2
};

function getCommandPolicy(command, plugin = null, isPremium = false, isCreator = false) {
  if (isCreator || OWNER_COMMANDS.has(command)) {
    return { limit: 0, cooldown: 0, heavy: Boolean(plugin?.heavy || HEAVY_COMMANDS.has(command)) };
  }
  const limit = plugin?.limit ?? (FREE_COMMANDS.has(command) ? 0 : (COSTS[command] || 1));
  const baseCooldown = plugin?.cooldown ?? (HEAVY_COMMANDS.has(command) ? 10_000 : 3_000);
  return {
    limit,
    cooldown: isPremium ? Math.floor(baseCooldown / 2) : baseCooldown,
    heavy: Boolean(plugin?.heavy || HEAVY_COMMANDS.has(command))
  };
}

module.exports = { getCommandPolicy, HEAVY_COMMANDS, FREE_COMMANDS, OWNER_COMMANDS };
