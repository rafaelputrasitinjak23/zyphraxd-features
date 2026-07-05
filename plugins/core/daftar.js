const registrationManager = require("../../lib/registrationManager");

module.exports = {
  name: "registration",
  commands: ["daftar", "register"],
  category: "main",
  description: "Daftar akun bot dengan captcha",
  limit: 0,
  cooldown: 1500,

  async run({ Rafael, m, text, prefix, command, sender, user }) {
    if (user?.registered) {
      return m.reply([
        "Kamu sudah terdaftar.",
        `Nama  : ${user.profileName || user.name || "-"}`,
        `Umur  : ${user.age || "-"}`,
        `Level : ${user.level || 1}`,
        `EXP   : ${user.exp || 0}`
      ].join("\n"));
    }

    let profile;
    try {
      profile = registrationManager.parseRegistrationText(text);
    } catch (error) {
      return m.reply([
        "Format daftar salah.",
        "",
        `Gunakan: ${prefix + command} nama,umur`,
        `Contoh : ${prefix + command} Rafael,18`,
        "",
        error.message
      ].join("\n"));
    }

    const session = registrationManager.createSession(sender, profile);
    const minutes = Math.floor(registrationManager.CAPTCHA_TTL_MS / 60_000);

    return Rafael.sendMessage(
      m.chat,
      {
        image: session.image,
        caption: [
          "Verifikasi captcha pendaftaran.",
          "",
          `Nama : ${profile.name}`,
          `Umur : ${profile.age}`,
          "",
          `Ketik kode pada gambar dalam ${minutes} menit.`,
          "Kirim kode saja, tanpa titik atau command."
        ].join("\n")
      },
      { quoted: m }
    );
  },

  async onMessage({ m, sender, body, user, database, pushname, isCmd }) {
    if (isCmd || user?.registered) return false;

    const pending = registrationManager.getSession(sender);
    if (!pending) return false;

    const result = registrationManager.verify(sender, body);
    if (!result.ok) {
      await m.reply(result.message);
      return true;
    }

    const registered = database.registerUser(sender, result.profile, pushname);
    await m.reply([
      "Pendaftaran berhasil.",
      "",
      `Nama  : ${registered.profileName}`,
      `Umur  : ${registered.age}`,
      `Level : ${registered.level}`,
      `EXP   : ${registered.exp}`,
      `Limit : ${registered.limit}/${registered.dailyLimit}`,
      "",
      "Sekarang kamu sudah bisa memakai fitur bot."
    ].join("\n"));
    return true;
  }
};
