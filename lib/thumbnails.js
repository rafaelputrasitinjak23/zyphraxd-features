const THUMBNAILS = Object.freeze({
  MAIN_MENU: "https://nayaara.my.id/f/HFNrfdbTsro7",
  ALLMENU: "https://nayaara.my.id/f/0mRzmtqEu0x8",
  DOWNLOAD_MENU: "https://nayaara.my.id/f/rF-_cv9bJ4Mo",
  CREATE_MENU: "https://nayaara.my.id/f/IvU1mlBeFLIS",
  STICKER_MENU: "https://nayaara.my.id/f/KGvvSPkAyiKb",
  AUDIO_MENU: "https://nayaara.my.id/f/cF5xiv99Y-Gy",
  TOOLS_MENU: "https://nayaara.my.id/f/EHGqkBdnot5f",
  GAME_MENU: "https://nayaara.my.id/f/76iEYxZ-ycEE",
  GROUP_MENU: "https://nayaara.my.id/f/B8ky-BNgbmKm",
  SYSTEM_MENU: "https://nayaara.my.id/f/EIjRcamC2h8A",
  CHANNEL_MENU: "https://nayaara.my.id/f/7OWe92ehgije",
  OWNER_MENU: "https://nayaara.my.id/f/8fGAOrsi6Nx4",
  OTHER_MENU: "https://nayaara.my.id/f/5gVMF4_9bbNg",
  STATUS_BOT: "https://nayaara.my.id/f/ovKNoShbx-Vj",
  PROFILE_BOT: "https://nayaara.my.id/f/OY1wpI5S5D-j",
  GROUP_STATUS: "https://nayaara.my.id/f/NZiXdDVAZYe1",
  PLUGIN_MANAGER: "https://nayaara.my.id/f/y1qfYYzaSyQp",
  BACKUP_BOT: "https://nayaara.my.id/f/jZ7X9s_Y0eFW",
  ERROR_MONITOR: "https://nayaara.my.id/f/2PT0MNFQD_SA",
  AUTO_AI: "https://nayaara.my.id/f/aedoSWjOo5yi"
});

const CATEGORY_THUMBNAILS = Object.freeze({
  main: THUMBNAILS.MAIN_MENU,
  downloader: THUMBNAILS.DOWNLOAD_MENU,
  create: THUMBNAILS.CREATE_MENU,
  sticker: THUMBNAILS.STICKER_MENU,
  audio: THUMBNAILS.AUDIO_MENU,
  tools: THUMBNAILS.TOOLS_MENU,
  game: THUMBNAILS.GAME_MENU,
  group: THUMBNAILS.GROUP_MENU,
  system: THUMBNAILS.SYSTEM_MENU,
  channel: THUMBNAILS.CHANNEL_MENU,
  owner: THUMBNAILS.OWNER_MENU,
  other: THUMBNAILS.OTHER_MENU
});

function getCategoryThumbnail(category) {
  return CATEGORY_THUMBNAILS[String(category || "").toLowerCase()] || THUMBNAILS.MAIN_MENU;
}

function resolveThumbnail(value) {
  if (!value) return null;
  if (/^https?:\/\//i.test(String(value))) return String(value);
  return THUMBNAILS[String(value)] || null;
}

async function sendThumbnailMessage(Rafael, m, thumbnail, caption, options = {}) {
  const url = resolveThumbnail(thumbnail);
  const content = {
    ...(options.content || {}),
    caption: String(caption || "")
  };

  if (url) {
    content.image = { url };
  }

  try {
    return await Rafael.sendMessage(
      m.chat,
      content,
      {
        quoted: m,
        ...(options.sendOptions || {})
      }
    );
  } catch (error) {
    console.error(`Gagal memuat thumbnail ${url || "tanpa URL"}:`, error.message || error);
    return m.reply(String(caption || ""));
  }
}

module.exports = {
  THUMBNAILS,
  CATEGORY_THUMBNAILS,
  getCategoryThumbnail,
  resolveThumbnail,
  sendThumbnailMessage
};
