const errorMonitor = require("../../lib/errorMonitor");
const { THUMBNAILS, sendThumbnailMessage } = require("../../lib/thumbnails");

function sendMonitor(ctx, caption) {
  return sendThumbnailMessage(ctx.Rafael, ctx.m, THUMBNAILS.ERROR_MONITOR, caption);
}

function formatEntryLine(entry, index) {
  const icon = entry.resolved
    ? "✅"
    : entry.severity === "critical"
      ? "🆘"
      : entry.severity === "warning"
        ? "⚠️"
        : "🚨";

  const time = new Date(entry.lastSeen || entry.createdAt).toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `${index + 1}. ${icon} *${entry.id}*\n   ${entry.plugin} • ${entry.command === "unknown" ? "-" : `.${entry.command}`} • ${entry.count}x\n   ${entry.message.slice(0, 120)}\n   ${time}`;
}

function formatDetail(entry) {
  return [
    `🔎 *DETAIL ERROR ${entry.id}*`,
    "",
    `Status     : ${entry.resolved ? "Selesai" : "Belum selesai"}`,
    `Level      : ${entry.severity.toUpperCase()}`,
    `Sumber     : ${entry.source}`,
    `Plugin     : ${entry.plugin}`,
    `Command    : ${entry.command === "unknown" ? "-" : `.${entry.command}`}`,
    `Nama error : ${entry.name}`,
    `Kode       : ${entry.code || "-"}`,
    `Terulang   : ${entry.count}x`,
    `Pertama    : ${new Date(entry.createdAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    `Terakhir   : ${new Date(entry.lastSeen).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    "",
    `👤 *Konteks Pengguna*`,
    `Nama       : ${entry.userName || "-"}`,
    `JID        : ${entry.userJid || "-"}`,
    `Chat       : ${entry.chatType || "-"}`,
    `Chat ID    : ${entry.chatId || "-"}`,
    `Message ID : ${entry.messageId || "-"}`,
    entry.input ? `Input      : ${entry.input}` : "",
    "",
    `💥 *Pesan Error*`,
    entry.message,
    "",
    `🧩 *Stack Trace*`,
    (entry.stack || "Stack tidak tersedia").slice(0, 7000),
    "",
    entry.resolved
      ? `Diselesaikan: ${entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) : "-"}`
      : `Gunakan *.resolveerror ${entry.id}* setelah error diperbaiki.`
  ].filter(Boolean).join("\n");
}

module.exports = {
  name: "error-monitor",
  commands: [
    "errorlog",
    "errors",
    "errorinfo",
    "errorstats",
    "resolveerror",
    "deleteerror",
    "clearerror",
    "testerror"
  ],
  category: "system",
  description: "Memonitor, mencatat, dan mengelola error bot",
  owner: true,
  limit: 0,
  cooldown: 1000,

  async run(ctx) {
    const { command, args, m, sender } = ctx;

    if (["errorlog", "errors"].includes(command)) {
      const amount = Math.max(1, Math.min(50, Number(args[0]) || 10));
      const entries = errorMonitor.list(amount);
      if (!entries.length) return m.reply("Belum ada error yang tercatat.");

      const stats = errorMonitor.stats();
      return sendMonitor(ctx, [
        "🚨 *ERROR MONITOR ZYPHRAXD*",
        "",
        `Total        : ${stats.total}`,
        `Belum selesai: ${stats.unresolved}`,
        `Critical     : ${stats.critical}`,
        `Error        : ${stats.error}`,
        `Warning      : ${stats.warning}`,
        "",
        ...entries.map(formatEntryLine),
        "",
        "Gunakan *.errorinfo ID* untuk melihat detail."
      ].join("\n"));
    }

    if (command === "errorinfo") {
      const id = args[0];
      if (!id) return m.reply("Gunakan: .errorinfo ERR-XXXXXXXX-XXXXXX");
      const entry = errorMonitor.get(id);
      if (!entry) return m.reply("ID error tidak ditemukan.");

      const detail = formatDetail(entry);
      if (detail.length <= 12000) return sendMonitor(ctx, detail);

      return ctx.Rafael.sendMessage(
        m.chat,
        {
          document: Buffer.from(detail),
          mimetype: "text/plain",
          fileName: `${entry.id}.txt`,
          caption: `Detail error ${entry.id}`
        },
        { quoted: m }
      );
    }

    if (command === "errorstats") {
      const stats = errorMonitor.stats();
      return sendMonitor(ctx, [
        "📊 *STATISTIK ERROR*",
        "",
        `Total        : ${stats.total}`,
        `Belum selesai: ${stats.unresolved}`,
        `Selesai      : ${stats.resolved}`,
        `Critical     : ${stats.critical}`,
        `Error        : ${stats.error}`,
        `Warning      : ${stats.warning}`
      ].join("\n"));
    }

    if (command === "resolveerror") {
      const id = args[0];
      if (!id) return m.reply("Gunakan: .resolveerror ID");
      const entry = await errorMonitor.resolve(id, sender);
      if (!entry) return m.reply("ID error tidak ditemukan.");
      return m.reply(`Error *${entry.id}* ditandai sudah selesai.`);
    }

    if (command === "deleteerror") {
      const id = args[0];
      if (!id) return m.reply("Gunakan: .deleteerror ID");
      const removed = await errorMonitor.remove(id);
      return m.reply(removed ? `Error *${id}* berhasil dihapus.` : "ID error tidak ditemukan.");
    }

    if (command === "clearerror") {
      if (!args.includes("--confirm")) {
        return m.reply("Perintah ini menghapus seluruh catatan error.\n\nKonfirmasi dengan: *.clearerror --confirm*");
      }
      const total = await errorMonitor.clear();
      return m.reply(`${total} catatan error berhasil dibersihkan.`);
    }

    if (command === "testerror") {
      throw new Error("Test Error Monitor ZyphraXD berhasil dipicu.");
    }
  }
};
