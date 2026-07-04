const axios = require("axios");
const cheerio = require("cheerio");

const TARGET_URL = "https://engine.web.id/download";

const headers = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Content-Type": "application/x-www-form-urlencoded",
  "Origin": "https://engine.web.id",
  "Referer": "https://engine.web.id/",
  "Cache-Control": "max-age=0",
  "Upgrade-Insecure-Requests": "1"
};

function extractMedia(html) {
  const $ = cheerio.load(html);
  const media = [];
  const seen = new Set();

  $("video source").each((_, el) => {
    const src = decodeHtml($(el).attr("src") || "");

    if (src && !seen.has(src)) {
      seen.add(src);
      media.push({
        type: "video",
        url: src
      });
    }
  });

  $(".media-container video").each((_, el) => {
    const src = decodeHtml($(el).attr("src") || "");

    if (src && !seen.has(src)) {
      seen.add(src);
      media.push({
        type: "video",
        url: src
      });
    }
  });

  $(".media-container img").each((_, el) => {
    const src = decodeHtml($(el).attr("src") || "");

    if (src && !seen.has(src)) {
      seen.add(src);
      media.push({
        type: "image",
        url: src
      });
    }
  });

  const forceDownloadMatches = html.matchAll(/forceDownload\('([^']+)'/g);

  for (const match of forceDownloadMatches) {
    const url = decodeHtml(match[1] || "");

    if (!url || seen.has(url)) continue;

    seen.add(url);

    media.push({
      type: detectType(url),
      url
    });
  }

  return media;
}

function detectType(url) {
  const clean = url.split("?")[0].toLowerCase();

  if (clean.endsWith(".mp4") || clean.includes(".mp4")) {
    return "video";
  }

  if (
    clean.endsWith(".jpg") ||
    clean.endsWith(".jpeg") ||
    clean.endsWith(".png") ||
    clean.endsWith(".webp") ||
    clean.includes(".jpg") ||
    clean.includes(".jpeg") ||
    clean.includes(".png") ||
    clean.includes(".webp")
  ) {
    return "image";
  }

  return "media";
}

function decodeHtml(value) {
  return String(value)
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function getErrorMessage(error) {
  if (error.response?.data) {
    if (typeof error.response.data === "string") {
      return error.response.data.slice(0, 500);
    }

    return JSON.stringify(error.response.data);
  }

  return error.message || "Unknown error";
}

async function downloadInstagram(url) {
  try {
    const body = new URLSearchParams();
    body.append("url", url);

    const res = await axios.post(TARGET_URL, body.toString(), {
      timeout: 60000,
      headers,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: () => true
    });

    const html = String(res.data || "");
    const results = extractMedia(html);

    const output = {
      status: res.status === 200 && results.length > 0,
      code: res.status,
      input: url,
      total: results.length,
      results
    };

    return output;
  } catch (error) {
    const output = {
      status: false,
      code: error.response?.status || 500,
      input: url,
      total: 0,
      results: [],
      error: getErrorMessage(error)
    };

    return output;
  }
}

module.exports = { downloadInstagram };
