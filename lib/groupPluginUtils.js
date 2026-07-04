const { normalizeJid } = require("./database");

function parseToggle(value) {
  const text = String(value || "").toLowerCase();
  if (["on", "1", "true", "aktif"].includes(text)) return true;
  if (["off", "0", "false", "nonaktif"].includes(text)) return false;
  return null;
}

function targetFromContext(ctx) {
  return normalizeJid(ctx.m.mentionedJid?.[0] || ctx.m.quoted?.sender || ctx.args[0]);
}

function mentionText(jid) {
  return `@${String(jid || "").split("@")[0]}`;
}

module.exports = { parseToggle, targetFromContext, mentionText };
