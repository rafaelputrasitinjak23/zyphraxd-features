const { normalizeJid } = require("./database");

function targetFromContext(ctx) {
  return normalizeJid(ctx.m.mentionedJid?.[0] || ctx.m.quoted?.sender || ctx.args[0]);
}

function parseDuration(value) {
  const match = String(value || "30d").trim().match(/^(\d+)(m|h|d)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return amount * multiplier;
}

function premiumStatus(user) {
  if (!user?.premium) return "Tidak";
  if (!user.premiumUntil) return "Ya (tanpa batas)";
  return `Ya, sampai ${new Date(user.premiumUntil).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`;
}

module.exports = { targetFromContext, parseDuration, premiumStatus };
