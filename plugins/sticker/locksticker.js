module.exports = {
  name: "locked-sticker",
  commands: [
    "locksticker",
    "stickerlock",
    "locks",
    "kuncisticker",
    "stikerlock"
  ],
  category: "sticker",
  description: "Membuat privacy locked sticker yang tidak dapat difavoritkan",
  heavy: true,
  requiresMedia: true,
  cooldown: 5000,

  async run({ Rafael, m, command, text, prefix }) {
    const quoted = m.quoted || m;
    const messageContent = quoted.msg || quoted;
    const mime = String(messageContent.mimetype || "").toLowerCase();

    if (!/(image|video|webp)/i.test(mime)) {
      return m.reply(
        `Kirim atau reply gambar, video, atau sticker dengan caption ${prefix + command}`
      );
    }

    const customMetadata = String(text || "").trim();
    const [customPackname, customAuthor] = customMetadata.split("|");
    const packname = String(
      customPackname || global.packname || "ZyphraXD"
    ).trim();
    const author = String(
      customAuthor || global.author || "RafaelXD"
    ).trim();

    const isWebp = /webp/i.test(mime);
    const isVideo = /video/i.test(mime);
    const isAnimated = Boolean(
      isVideo ||
      messageContent.isAnimated ||
      quoted.message?.stickerMessage?.isAnimated
    );

    await m.reply("Sedang membuat privacy locked sticker...");

    const media = await quoted.download();

    await Rafael.sendLockedSticker(m.chat, media, m, {
      mediaType: isWebp ? "sticker" : isVideo ? "video" : "image",
      isAnimated,
      packname,
      author
    });

    return m.reply(
      "Privacy locked sticker berhasil dibuat. Di WhatsApp resmi, sticker akan tampil sebagai Locked by dan tidak memiliki opsi Tambahkan ke Favorit."
    );
  }
};
