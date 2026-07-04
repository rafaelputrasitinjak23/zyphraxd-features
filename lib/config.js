const fs = require("fs");

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// Config default aman untuk package dependency.
// Bot utama sebaiknya mengatur nilai ini lewat .env.
global.owner = splitCsv(process.env.OWNER_NUMBERS || process.env.OWNER_NUMBER || "");
global.ownerName = process.env.OWNER_NAME || "RafaelXD";
global.botName = process.env.BOT_NAME || "ZyphraXD";
global.saluran = process.env.CHANNEL_URL || "";
global.idsal = process.env.CHANNEL_ID || "";

global.packname = process.env.PACKNAME || global.botName;
global.author = process.env.AUTHOR || global.ownerName;

const file = require.resolve(__filename);
fs.watchFile(file, () => {
  fs.unwatchFile(file);
  console.log(`Update ${__filename}`);
  delete require.cache[file];
  require(file);
});
