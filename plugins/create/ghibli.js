const { AnimeConverter } = require("../../lib/animeConverter");

function withTimeout(promise, timeout, message = "Proses melewati batas waktu.") {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeout);
  });

  return Promise.race([promise, timeoutPromise])
    .finally(() => clearTimeout(timer));
}

module.exports = {
  name: "photo-to-ghibli",
  commands: ["ghibli", "toghibli", "animeghibli"],
  category: "create",
  description: "Ubah foto menjadi ilustrasi anime bergaya Ghibli",
  heavy: true,
  requiresMedia: true,
  limit: 3,
  cooldown: 10_000,

  async run(ctx) {
    const { Rafael, m, command, prefix } = ctx;
    const mediaMessage = m.quoted || m;
    const mediaMime = String((mediaMessage.msg || mediaMessage).mimetype || "");

    if (!/^image\//i.test(mediaMime)) {
      return m.reply(
        `Kirim atau reply gambar dengan caption *${prefix + command}*.`
      );
    }

    await m.reply("Sedang mengubah foto menjadi gaya Ghibli. Proses ini dapat memerlukan beberapa menit...");

    const imageBuffer = await mediaMessage.download();
    if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
      throw new Error("Gagal mengunduh gambar dari pesan.");
    }

    const converter = new AnimeConverter();
    const result = await withTimeout(
      converter.generate({ imageUrl: imageBuffer, upload: true }),
      240_000,
      "Proses Ghibli melewati batas waktu. Silakan coba lagi."
    );

    if (!result?.status) {
      throw new Error(result?.error || "Gagal mengubah gambar menjadi gaya Ghibli.");
    }

    const resultUrl = result.url || result.result;
    if (!resultUrl) {
      throw new Error("URL hasil gambar tidak ditemukan.");
    }

    await Rafael.sendMessage(
      m.chat,
      {
        image: { url: resultUrl },
        caption: [
          "✨ *PHOTO TO GHIBLI*",
          "Berhasil mengubah foto menjadi ilustrasi anime bergaya Ghibli.",
          "",
          ""
        ].join("\n")
      },
      { quoted: m }
    );
  }
};
