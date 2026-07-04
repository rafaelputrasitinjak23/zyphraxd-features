const { normalizeJid } = require("./database");

// Command owner yang boleh dipakai owner anak bot / jadibot.
// Command owner lain seperti backup, restore, restart, shell/eval, broadcast, update tetap hanya owner utama.
const CHILD_OWNER_COMMANDS = new Set([
  "addpremium",
  "addakses",
  "addbot",
  "jadibot",
  "cekjadibot",
  "listjadibot",
  "stopjadibot",
  "deljadibot",
  "deletejadibot",
  "addgrup",
  "addgroup",
  "delgrup",
  "deletegrup",
  "delgroup",
  "listgrup",
  "listgroup",
  "cekgrup",
  "cekgroup",
  "groupmode",
  "modegrup"
]);

const GROUP_ACCESS_COMMANDS = new Set([
  "addgrup",
  "addgroup",
  "delgrup",
  "deletegrup",
  "delgroup",
  "listgrup",
  "listgroup",
  "cekgrup",
  "cekgroup",
  "groupmode",
  "modegrup"
]);

function normalizeCommand(command) {
  return String(command || "").trim().toLowerCase();
}

function canChildOwnerUse(command) {
  return CHILD_OWNER_COMMANDS.has(normalizeCommand(command));
}

function isGroupAccessCommand(command) {
  return GROUP_ACCESS_COMMANDS.has(normalizeCommand(command));
}

function canUseOwnerCommand(context = {}, command = context.command) {
  if (context.isCreator || context.isMainOwner) return true;
  if (!context.isChildOwner) return false;
  return canChildOwnerUse(command);
}

function buildOwnerRoles({ Rafael, sender, botNumber, dynamicOwnerJids = [] }) {
  const normalizedSender = normalizeJid(sender);
  const normalizedBot = normalizeJid(botNumber);
  const globalOwners = (global.owner || []).map(normalizeJid).filter(Boolean);
  const childOwners = dynamicOwnerJids.map(normalizeJid).filter(Boolean);

  // Bot utama: owner utama = global.owner + nomor bot sendiri.
  // Jadibot: owner utama hanya global.owner, sedangkan nomor bot/owner anak bot menjadi child owner terbatas.
  const mainOwnerJids = [
    ...globalOwners,
    ...(!Rafael?.isJadibot && normalizedBot ? [normalizedBot] : [])
  ].filter(Boolean);

  const childOwnerJids = Rafael?.isJadibot
    ? [...childOwners, normalizedBot].filter(Boolean)
    : [];

  const isMainOwner = mainOwnerJids.includes(normalizedSender);
  const isChildOwner = !isMainOwner && childOwnerJids.includes(normalizedSender);

  return {
    isMainOwner,
    isChildOwner,
    isCreator: isMainOwner,
    ownerJids: [...new Set([...mainOwnerJids, ...childOwnerJids])],
    mainOwnerJids: [...new Set(mainOwnerJids)],
    childOwnerJids: [...new Set(childOwnerJids)]
  };
}

module.exports = {
  CHILD_OWNER_COMMANDS,
  GROUP_ACCESS_COMMANDS,
  canChildOwnerUse,
  isGroupAccessCommand,
  canUseOwnerCommand,
  buildOwnerRoles
};
