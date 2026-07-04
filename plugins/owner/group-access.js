const groupAccessManager = require("../../lib/groupAccessManager");

function renderList(groups, prefix) {
  if (!groups.length) {
    return [
      "Belum ada grup yang diizinkan.",
      "",
      `Tambahkan grup dengan: ${prefix}addgrup`,
      `Cek mode dengan: ${prefix}cekgrup`
    ].join("\n");
  }

  return [
    "📋 *DAFTAR GRUP RESPON BOT*",
    "",
    ...groups.map((group, index) => [
      `${index + 1}. ${group.subject || "Tanpa nama"}`,
      `   ${group.jid}`,
      group.addedAt ? `   Ditambahkan: ${new Date(group.addedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}` : ""
    ].filter(Boolean).join("\n"))
  ].join("\n");
}

function parseMode(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (["on", "aktif", "enable", "enabled", "1", "true"].includes(raw)) return true;
  if (["off", "mati", "disable", "disabled", "0", "false"].includes(raw)) return false;
  return null;
}

module.exports = {
  name: "group-access-control",
  commands: [
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
  ],
  category: "owner",
  owner: true,
  limit: 0,
  cooldown: 1000,
  async run(ctx) {
    const { command, args, text, prefix, m, from, isGroup, groupMetadata, botNumber, sender, canUseOwnerCommand } = ctx;

    if (!canUseOwnerCommand(command)) {
      return m.reply("Kamu tidak punya izin mengatur daftar grup respon bot ini.");
    }

    const cmd = String(command || "").toLowerCase();
    const targetGroup = isGroup ? from : groupAccessManager.normalizeGroupJid(args[0] || text);

    if (cmd === "groupmode" || cmd === "modegrup") {
      const mode = parseMode(args[0]);
      if (mode === null) {
        const status = groupAccessManager.status(botNumber, isGroup ? from : "");
        return m.reply([
          "⚙️ *MODE RESPON GRUP*",
          "",
          `Status filter: ${status.enabled ? "ON - hanya grup yang di-add" : "OFF - semua grup direspon"}`,
          `Total grup diizinkan: ${status.totalGroups}`,
          "",
          `Ubah mode: ${prefix + command} on`,
          `Matikan filter: ${prefix + command} off`
        ].join("\n"));
      }

      const result = groupAccessManager.setEnabled(botNumber, mode);
      return m.reply(`✅ Mode respon grup sekarang: ${result.enabled ? "ON, hanya grup yang sudah di-add" : "OFF, semua grup akan direspon"}.`);
    }

    if (cmd === "listgrup" || cmd === "listgroup") {
      return m.reply(renderList(groupAccessManager.listGroups(botNumber), prefix));
    }

    if (cmd === "cekgrup" || cmd === "cekgroup") {
      const status = groupAccessManager.status(botNumber, isGroup ? from : targetGroup);
      return m.reply([
        "📌 *STATUS GRUP RESPON*",
        "",
        `Mode filter: ${status.enabled ? "ON" : "OFF"}`,
        `Total grup diizinkan: ${status.totalGroups}`,
        status.groupJid ? `Grup ini: ${status.allowed ? "DIIZINKAN" : "BELUM DIIZINKAN"}` : "Grup ini: -",
        status.groupJid ? `Bot akan respon: ${status.canRespond ? "YA" : "TIDAK"}` : "",
        "",
        `Tambah: ${prefix}addgrup`,
        `Hapus: ${prefix}delgrup`
      ].filter(Boolean).join("\n"));
    }

    if (!targetGroup) {
      return m.reply([
        "Jalankan command ini di dalam grup, atau masukkan JID grup.",
        "",
        `Contoh di grup: ${prefix + command}`,
        `Contoh private: ${prefix + command} 120363xxxxx@g.us`
      ].join("\n"));
    }

    if (cmd === "addgrup" || cmd === "addgroup") {
      const record = groupAccessManager.addGroup(botNumber, targetGroup, {
        subject: groupMetadata?.subject || "",
        addedBy: sender
      });
      return m.reply([
        "✅ *GRUP DITAMBAHKAN*",
        "",
        `Nama: ${record.subject || "Tanpa nama"}`,
        `JID: ${record.jid}`,
        "",
        "Bot sekarang boleh merespon command di grup ini."
      ].join("\n"));
    }

    if (cmd === "delgrup" || cmd === "deletegrup" || cmd === "delgroup") {
      const removed = groupAccessManager.removeGroup(botNumber, targetGroup);
      if (!removed) return m.reply("Grup ini belum ada di daftar respon bot.");
      return m.reply(`✅ Grup ${removed.subject || removed.jid} berhasil dihapus dari daftar respon bot.`);
    }

    return m.reply(`Command tidak dikenali. Gunakan ${prefix}cekgrup`);
  }
};
