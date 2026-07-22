"use strict";

const { withTimeout } = require("../../lib/pluginUtils");
const {
  searchPinterest,
  downloadPinterestImage,
} = require("../../lib/pinterest");

const DEFAULT_SEND_COUNT = 5;
const MAX_SEND_COUNT = 10;
const SEARCH_CACHE_TTL = 10 * 60 * 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePinterestInput(text) {
  const raw = String(text || "").trim();
  const separatorIndex = raw.lastIndexOf("|");

  if (separatorIndex === -1) {
    return {
      query: raw,
      count: DEFAULT_SEND_COUNT,
    };
  }

  const possibleCount = raw.slice(separatorIndex + 1).trim();
  const parsedCount = Number.parseInt(possibleCount, 10);

  if (!/^\d+$/.test(possibleCount) || !Number.isFinite(parsedCount)) {
    return {
      query: raw,
      count: DEFAULT_SEND_COUNT,
    };
  }

  return {
    query: raw.slice(0, separatorIndex).trim(),
    count: Math.min(Math.max(parsedCount, 1), MAX_SEND_COUNT),
  };
}

function truncate(value, maxLength) {
  const text = String(value || "").trim();
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function buildCaption(pin, query, current, total) {
  const lines = [
    "📌 *PINTEREST SEARCH*",
    "",
    `🔎 *Pencarian:* ${query}`,
    `🖼️ *Hasil:* ${current}/${total}`,
    `📝 *Judul:* ${truncate(pin.title, 120)}`,
  ];

  if (pin.pinner || pin.username) {
    const creator = pin.pinner || pin.username;
    const username = pin.username ? ` (@${pin.username})` : "";
    lines.push(`👤 *Pembuat:* ${creator}${username}`);
  }

  if (pin.domain) {
    lines.push(`🌐 *Domain:* ${pin.domain}`);
  }

  lines.push(`🔗 *Pinterest:* ${pin.pinUrl}`);

  if (pin.link && pin.link !== pin.pinUrl) {
    lines.push(`↗️ *Sumber:* ${pin.link}`);
  }

  return lines.join("\n");
}

module.exports = {
  name: "pinterest-search",
  commands: ["pinterest", "pin", "pinsearch"],
  category: "downloader",
  description: "Mencari dan mengirim gambar dari Pinterest.",
  heavy: true,
  requiresText: true,
  cooldown: 5_000,
  limit: 1,

  async run(ctx) {
    const {
      Rafael,
      m,
      command,
      text,
      prefix,
      isAllowed,
      downloaderCache,
    } = ctx;

    if (!isAllowed) {
      return m.reply(
        "Akses ditolak.\nNomor kamu tidak terdaftar dalam sistem."
      );
    }

    const { query, count } = parsePinterestInput(text);

    if (!query) {
      return m.reply(
        [
          "*Format Pinterest Search*",
          "",
          `${prefix + command} kata pencarian`,
          `${prefix + command} kata pencarian|jumlah`,
          "",
          "Contoh:",
          `${prefix + command} idle rossie`,
          `${prefix + command} wallpaper anime|8`,
          "",
          `Jumlah maksimal: ${MAX_SEND_COUNT} gambar.`,
        ].join("\n")
      );
    }

    await m.reply(
      `⏳ Mencari *${query}* di Pinterest dan menyiapkan ${count} gambar...`
    );

    const cacheKey = `pinterest:${query.toLowerCase()}:${count}`;
    const cachedSearch = await downloaderCache.getOrSet(
      cacheKey,
      () =>
        withTimeout(
          searchPinterest(query, { limit: count }),
          60_000,
          "Pencarian Pinterest melewati batas waktu."
        ),
      SEARCH_CACHE_TTL
    );

    const searchResult = cachedSearch.value;
    const pins = Array.isArray(searchResult?.result)
      ? searchResult.result.slice(0, count)
      : [];

    if (!pins.length) {
      throw new Error(`Tidak ada gambar Pinterest untuk pencarian "${query}".`);
    }

    let sent = 0;
    let failed = 0;

    for (let index = 0; index < pins.length; index += 1) {
      const pin = pins[index];

      try {
        const downloaded = await withTimeout(
          downloadPinterestImage(pin.image),
          75_000,
          `Unduhan gambar Pinterest ${index + 1} melewati batas waktu.`
        );

        await Rafael.sendMessage(
          m.chat,
          {
            image: downloaded.buffer,
            mimetype: downloaded.mimetype,
            caption: buildCaption(pin, query, index + 1, pins.length),
          },
          { quoted: m }
        );

        sent += 1;

        if (index < pins.length - 1) {
          await delay(900);
        }
      } catch (error) {
        failed += 1;
        console.error(
          `[PINTEREST] Gagal mengirim hasil ${index + 1} (${pin.id}):`,
          error.message
        );
      }
    }

    if (sent === 0) {
      throw new Error(
        "Hasil ditemukan, tetapi semua gambar gagal diunduh atau dikirim."
      );
    }

    if (failed > 0) {
      await m.reply(
        `✅ Berhasil mengirim ${sent} gambar. ${failed} gambar lainnya gagal diproses.`
      );
    }
  },
};
