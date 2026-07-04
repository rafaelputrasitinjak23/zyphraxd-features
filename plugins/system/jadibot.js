const { proto, generateWAMessageFromContent } = require("@whiskeysockets/baileys");
const jadibotManager = require("../../lib/jadibotManager");
const pelangganManager = require("../../lib/pelangganManager");
const { normalizeJid } = require("../../lib/pluginUtils");

function pickPhoneFromText(text, senderNumber, isCreator, options = {}) {
  const input = String(text || "").trim();
  const required = Boolean(options.required);
  if (!input) return required ? "" : jadibotManager.normalizePhoneNumber(senderNumber);

  const lower = input.toLowerCase();
  if (["start", "on", "ulang", "restart"].includes(lower)) {
    return required ? "" : jadibotManager.normalizePhoneNumber(senderNumber);
  }

  const phone = jadibotManager.normalizePhoneNumber(input);
  if (!phone) return "";

  // User biasa hanya boleh membuat jadibot untuk nomor sendiri.
  if (!isCreator) {
    const own = jadibotManager.normalizePhoneNumber(senderNumber);
    if (phone !== own) return "FORBIDDEN_OTHER_NUMBER";
  }

  return phone;
}

function pickTargetJid(text, sender, isCreator) {
  const input = String(text || "").trim();
  if (!input) return normalizeJid(sender);
  const first = input.split(/\s+/)[0];
  const jid = pelangganManager.normalizeJid(first);
  if (!jid) return "";
  if (!isCreator && jid !== normalizeJid(sender)) return "FORBIDDEN_OTHER_NUMBER";
  return jid;
}

function renderStatus(status) {
  if (!status) return "Jadibot tidak ditemukan.";
  return [
    "🤖 *STATUS JADIBOT*",
    "",
    `📱 Nomor: ${status.phoneNumber}`,
    `👤 Owner: ${status.ownerName || "-"}`,
    `🧩 Runtime: ${status.runtimeStatus || status.status || "offline"}`,
    `✅ Registered: ${status.registered ? "Ya" : "Belum"}`,
    status.botJid ? `🆔 Bot JID: ${status.botJid}` : "",
    status.lastOpenAt ? `🟢 Online terakhir: ${status.lastOpenAt}` : "",
    status.lastDisconnectAt ? `🔴 Disconnect terakhir: ${status.lastDisconnectAt}` : "",
    status.lastDisconnectReason ? `⚠️ Reason: ${status.lastDisconnectReason}` : ""
  ].filter(Boolean).join("\n");
}

function renderList(records) {
  if (!records.length) return "Belum ada data jadibot.";
  const lines = ["🤖 *LIST JADIBOT*", ""];

  records.forEach((record, index) => {
    lines.push(
      `${index + 1}. ${record.phoneNumber}`,
      `   Owner: ${record.ownerName || "-"}`,
      `   Status: ${record.runtimeStatus || record.status || "offline"}`,
      `   Registered: ${record.registered ? "Ya" : "Belum"}`,
      ""
    );
  });

  return lines.join("\n").trim();
}

function renderPelangganStatus(record) {
  if (!record || !record.active) {
    return [
      "👤 *STATUS PELANGGAN*",
      "",
      "Status: Tidak aktif",
      "Fitur .jadibot hanya bisa digunakan oleh Pelanggan."
    ].join("\n");
  }

  return [
    "👤 *STATUS PELANGGAN*",
    "",
    `📱 Nomor: ${record.number}`,
    `✅ Status: Aktif`,
    `⏳ Sisa: ${pelangganManager.formatRemaining(record.expiresAt)}`,
    `📅 Expired: ${pelangganManager.formatDate(record.expiresAt)}`
  ].join("\n");
}

function renderPelangganList(records) {
  if (!records.length) return "Belum ada pelanggan aktif.";
  const lines = ["👥 *LIST PELANGGAN AKTIF*", ""];
  records.forEach((record, index) => {
    lines.push(
      `${index + 1}. ${record.number}`,
      `   Nama: ${record.name || "-"}`,
      `   Sisa: ${pelangganManager.formatRemaining(record.expiresAt)}`,
      `   Expired: ${pelangganManager.formatDate(record.expiresAt)}`,
      ""
    );
  });
  return lines.join("\n").trim();
}

async function sendPairingCodeButton(Rafael, m, { phoneNumber, formattedCode, rawCode, prefix }) {
  const code = String(rawCode || formattedCode || "").replace(/[^A-Za-z0-9]/g, "");
  const shownCode = formattedCode || code;

  const buttons = [
    {
      name: "cta_copy",
      buttonParamsJson: JSON.stringify({
        display_text: "Salin Kode",
        copy_code: code || shownCode
      })
    },
    {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: "Cek Status",
        id: `${prefix}cekjadibot ${phoneNumber}`
      })
    },
    {
      name: "quick_reply",
      buttonParamsJson: JSON.stringify({
        display_text: "Stop Jadibot",
        id: `${prefix}stopjadibot ${phoneNumber}`
      })
    }
  ];

  const text = [
    "✅ *PAIRING CODE JADIBOT*",
    "",
    `📱 Nomor: *${phoneNumber}*`,
    `🔐 Code: *${shownCode}*`,
    "",
    "Tekan tombol *Salin Kode*, lalu masukkan kode di WhatsApp nomor tersebut:",
    "",
    "1. Buka WhatsApp",
    "2. Masuk ke *Perangkat tertaut*",
    "3. Pilih *Tautkan dengan nomor telepon*",
    "4. Masukkan kode pairing di atas",
    "",
    "Setelah berhasil tersambung, anak bot otomatis berjalan."
  ].join("\n");

  const interactiveMessage = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({ text }),
    footer: proto.Message.InteractiveMessage.Footer.create({ text: "ZyphraXD • JadiBot Pelanggan" }),
    header: proto.Message.InteractiveMessage.Header.create({
      title: "Pairing Code JadiBot",
      subtitle: phoneNumber,
      hasMediaAttachment: false
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({ buttons })
  });

  // Kirim kode sebagai teks biasa dulu agar tetap masuk di private maupun grup.
  // Button/copy hanya tambahan karena beberapa versi WhatsApp kadang tidak menampilkan nativeFlow di grup.
  try {
    await Rafael.sendMessage(m.chat, { text }, { quoted: m });
  } catch {
    await m.reply(text);
  }

  const message = generateWAMessageFromContent(
    m.chat,
    {
      viewOnceMessage: {
        message: {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2
          },
          interactiveMessage
        }
      }
    },
    { quoted: m, userJid: Rafael.user?.id }
  );

  try {
    await Rafael.relayMessage(m.chat, message.message, { messageId: message.key.id });
  } catch {
    // Kode sudah dikirim lewat teks biasa, jadi button gagal tidak menjadi masalah.
  }
}

function pelangganHelp(prefix) {
  return [
    "🤖 *JADIBOT PELANGGAN*",
    "",
    "Fitur ini khusus *Pelanggan*, berbeda dari Premium.",
    "Bisa digunakan di private chat maupun grup.",
    "",
    "Command user:",
    `• ${prefix}jadibot 628xxxxxxxxxx`,
    `• ${prefix}cekjadibot`,
    `• ${prefix}stopjadibot`,
    `• ${prefix}deljadibot`,
    `• ${prefix}cekpelanggan`,
    "",
    "Command owner:",
    `• ${prefix}addpelanggan 628xxxxxxxxxx 30d`,
    `• ${prefix}delpelanggan 628xxxxxxxxxx`,
    `• ${prefix}listpelanggan`,
    `• ${prefix}listjadibot`,
    `• ${prefix}restartjadibot 628xxxxxxxxxx`,
    `• ${prefix}restorejadibot`
  ].join("\n");
}

module.exports = {
  name: "jadibot",
  commands: [
    "jadibot",
    "addbot",
    "stopjadibot",
    "cekjadibot",
    "listjadibot",
    "deljadibot",
    "deletejadibot",
    "restartjadibot",
    "restorejadibot",
    "addpelanggan",
    "delpelanggan",
    "deletepelanggan",
    "listpelanggan",
    "cekpelanggan",
    "pelanggan"
  ],
  category: "system",
  private: false,
  limit: 0,
  cooldown: 1500,
  async run(ctx) {
    const { Rafael, m, command, text, args, prefix, sender, senderNumber, pushname, isCreator } = ctx;
    const cmd = String(command || "").toLowerCase();
    const ownPhone = jadibotManager.normalizePhoneNumber(senderNumber);
    const isPelanggan = pelangganManager.isPelanggan(sender);

    if (cmd === "pelanggan") {
      return m.reply(pelangganHelp(prefix));
    }

    if (cmd === "addpelanggan") {
      if (!isCreator) return m.reply("Command ini hanya untuk owner utama.");
      const target = pelangganManager.normalizeJid(args[0]);
      const duration = args[1] || "30d";
      if (!target) {
        return m.reply(`Format salah.\n\nContoh:\n${prefix}addpelanggan 628xxxxxxxxxx 30d\n${prefix}addpelanggan 628xxxxxxxxxx permanent`);
      }

      const record = pelangganManager.add(target, {
        duration,
        name: `Pelanggan ${target.split("@")[0]}`,
        addedBy: sender
      });

      return m.reply([
        "✅ *PELANGGAN DITAMBAHKAN*",
        "",
        `📱 Nomor: ${record.number}`,
        `⏳ Durasi: ${record.durationLabel}`,
        `📅 Expired: ${pelangganManager.formatDate(record.expiresAt)}`,
        "",
        `Sekarang user bisa memakai: ${prefix}jadibot ${record.number} atau ${prefix}addbot ${record.number}`
      ].join("\n"));
    }

    if (cmd === "delpelanggan" || cmd === "deletepelanggan") {
      if (!isCreator) return m.reply("Command ini hanya untuk owner utama.");
      const target = pelangganManager.normalizeJid(args[0]);
      if (!target) return m.reply(`Format salah.\n\nContoh:\n${prefix}delpelanggan 628xxxxxxxxxx`);
      const removed = pelangganManager.remove(target);
      if (!removed) return m.reply("Pelanggan tidak ditemukan.");
      return m.reply(`✅ Pelanggan *${removed.number}* berhasil dinonaktifkan.`);
    }

    if (cmd === "listpelanggan") {
      if (!isCreator) return m.reply("Command ini hanya untuk owner utama.");
      return m.reply(renderPelangganList(pelangganManager.list()));
    }

    if (cmd === "cekpelanggan") {
      const target = pickTargetJid(text, sender, isCreator);
      if (!target || target === "FORBIDDEN_OTHER_NUMBER") {
        return m.reply("Kamu hanya bisa cek status pelanggan milik sendiri.");
      }
      return m.reply(renderPelangganStatus(pelangganManager.get(target)));
    }

    if (Rafael.isJadibot && (cmd === "jadibot" || cmd === "addbot")) {
      return m.reply("Fitur .jadibot/.addbot hanya bisa dijalankan dari bot utama, bukan dari anak bot.");
    }

    if (cmd === "jadibot" || cmd === "addbot" || cmd === "restartjadibot") {
      if (!isCreator && !isPelanggan) {
        return m.reply([
          "🔒 *FITUR KHUSUS PELANGGAN*",
          "",
          "Kamu belum terdaftar sebagai Pelanggan.",
          "Fitur ini berbeda dari Premium, jadi Premium tidak otomatis bisa menggunakan JadiBot.",
          "",
          "Hubungi owner untuk mengaktifkan akses Pelanggan."
        ].join("\n"));
      }

      const phoneNumber = pickPhoneFromText(text, senderNumber, isCreator, { required: true });
      if (!phoneNumber) {
        return m.reply([
          "Nomor wajib diisi.",
          "",
          `Contoh: ${prefix}${cmd === "addbot" ? "addbot" : "jadibot"} 628xxxxxxxxxx`,
          `Contoh di grup: ${prefix}${cmd === "addbot" ? "addbot" : "jadibot"} 628xxxxxxxxxx`
        ].join("\n"));
      }
      if (phoneNumber === "FORBIDDEN_OTHER_NUMBER") {
        return m.reply("User biasa hanya boleh membuat jadibot untuk nomor sendiri.");
      }

      await m.reply([
        "⏳ Sedang membuat sesi jadibot...",
        "Pairing code akan dikirim ke chat ini dengan tombol reply/copy.",
        "Jangan spam command ini agar WhatsApp tidak menolak pairing."
      ].join("\n"));

      const result = await jadibotManager.startSession({
        phoneNumber,
        ownerJid: normalizeJid(sender),
        ownerName: pushname,
        requestPairing: true,
        forceNewPairing: true
      });

      if (result.alreadyRunning) {
        return m.reply(`✅ Jadibot nomor *${phoneNumber}* sudah online.`);
      }

      if (result.formattedCode) {
        await sendPairingCodeButton(Rafael, m, {
          phoneNumber,
          formattedCode: result.formattedCode,
          rawCode: result.code,
          prefix
        });
        return;
      }

      return m.reply(`✅ Jadibot nomor *${phoneNumber}* sedang dijalankan. Jika session sudah tersimpan, tidak perlu pairing ulang.`);
    }

    if (cmd === "stopjadibot") {
      const phoneNumber = pickPhoneFromText(text, senderNumber, isCreator);
      if (!phoneNumber || phoneNumber === "FORBIDDEN_OTHER_NUMBER") {
        return m.reply(`Format salah.\n\nContoh:\n${prefix}stopjadibot\n${prefix}stopjadibot 628xxxxxxxxxx`);
      }

      const status = jadibotManager.getStatus(phoneNumber);
      if (!status) return m.reply("Jadibot tidak ditemukan.");
      if (!isCreator && !jadibotManager.isOwnerOf(phoneNumber, sender)) {
        return m.reply("Kamu bukan owner jadibot ini.");
      }

      await jadibotManager.stopSession(phoneNumber, { deleteSession: false });
      return m.reply(`✅ Jadibot *${phoneNumber}* berhasil dihentikan. Session tidak dihapus.`);
    }

    if (cmd === "deljadibot" || cmd === "deletejadibot") {
      const phoneNumber = pickPhoneFromText(text, senderNumber, isCreator);
      if (!phoneNumber || phoneNumber === "FORBIDDEN_OTHER_NUMBER") {
        return m.reply(`Format salah.\n\nContoh:\n${prefix}deljadibot\n${prefix}deljadibot 628xxxxxxxxxx`);
      }

      const status = jadibotManager.getStatus(phoneNumber);
      if (!status) return m.reply("Jadibot tidak ditemukan.");
      if (!isCreator && !jadibotManager.isOwnerOf(phoneNumber, sender)) {
        return m.reply("Kamu bukan owner jadibot ini.");
      }

      await jadibotManager.deleteSession(phoneNumber);
      return m.reply(`✅ Session jadibot *${phoneNumber}* berhasil dihapus. Jika ingin pakai lagi harus pairing ulang.`);
    }

    if (cmd === "cekjadibot") {
      const input = String(text || "").trim();
      const phoneNumber = input ? pickPhoneFromText(input, senderNumber, isCreator) : ownPhone;

      if (!phoneNumber || phoneNumber === "FORBIDDEN_OTHER_NUMBER") {
        return m.reply("Kamu hanya bisa cek jadibot milik sendiri.");
      }

      return m.reply(renderStatus(jadibotManager.getStatus(phoneNumber)));
    }

    if (cmd === "listjadibot") {
      const records = jadibotManager.listRecords();
      const visibleRecords = isCreator
        ? records
        : records.filter((record) => normalizeJid(record.ownerJid) === normalizeJid(sender));
      return m.reply(renderList(visibleRecords));
    }

    if (cmd === "restorejadibot") {
      if (!isCreator) return m.reply("Command ini hanya untuk owner utama.");
      await m.reply("⏳ Sedang restore semua session jadibot yang tersimpan...");
      const result = await jadibotManager.restoreSavedSessions();
      return m.reply([
        "✅ *RESTORE JADIBOT SELESAI*",
        "",
        `🟢 Restored: ${result.restored}`,
        `⚪ Skipped: ${result.skipped}`,
        `🔴 Failed: ${result.failed.length}`,
        result.failed.length
          ? "\nGagal:\n" + result.failed.map((item) => `- ${item.phoneNumber}: ${item.error}`).join("\n")
          : ""
      ].filter(Boolean).join("\n"));
    }

    return m.reply(`Command tidak dikenali. Gunakan ${prefix}jadibot`);
  }
};
