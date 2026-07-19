/*
 * Created by : febry.is-a.dev
 * GitHub     : vandebry10-star
 * Date       : 16-07-2026
 *
 * Do not remove the creator's watermark, please respect the creator.
 */

const crypto = require("crypto");

const SIMPAN_SITE = "https://simpan.site/api/upload";
const TEMPLATE = "photo-to-ghibli-anime";
const PHOTOS_STYLE_BASE_URL = "https://www.photosstyle.com";

function ensureWebApiSupport() {
  if (
    typeof globalThis.fetch !== "function" ||
    typeof globalThis.Blob !== "function" ||
    typeof globalThis.FormData !== "function"
  ) {
    throw new Error("Fitur Ghibli memerlukan Node.js 18 atau versi yang lebih baru.");
  }
}

function splitSetCookieHeader(headerValue) {
  if (!headerValue) return [];
  return String(headerValue).split(/,(?=\s*[^;,\s=]+=[^;,]*)/g);
}

class AnimeConverter {
  constructor() {
    ensureWebApiSupport();

    this.cookies = {};
    this.baseHeaders = {
      accept: "*/*",
      "accept-language": "id-ID",
      "cache-control": "no-cache",
      origin: PHOTOS_STYLE_BASE_URL,
      pragma: "no-cache",
      priority: "u=1, i",
      referer: `${PHOTOS_STYLE_BASE_URL}/`,
      "sec-ch-ua": '"Chromium";v="127", "Not)A;Brand";v="99", "Microsoft Edge Simulate";v="127"',
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": '"Android"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Mobile Safari/537.36"
    };

    this.setCookie("GUEST_ID", crypto.randomUUID());
    this.setCookie("user_fingerprint", crypto.randomUUID());
  }

  _log(message) {
    console.log(`[AnimeConverter] ${message}`);
  }

  setCookie(key, value) {
    if (key && value) this.cookies[key] = value;
  }

  parseCookies(headers) {
    if (!headers) return;

    let setCookieHeaders = [];
    if (typeof headers.getSetCookie === "function") {
      setCookieHeaders = headers.getSetCookie();
    } else if (typeof headers.get === "function") {
      setCookieHeaders = splitSetCookieHeader(headers.get("set-cookie"));
    } else {
      const rawHeader = headers["set-cookie"];
      setCookieHeaders = Array.isArray(rawHeader)
        ? rawHeader
        : splitSetCookieHeader(rawHeader);
    }

    for (const cookieString of setCookieHeaders) {
      try {
        const mainPart = String(cookieString || "").split(";")[0];
        const [key, ...valueParts] = mainPart.split("=");
        const value = valueParts.join("=");
        if (key && value) this.cookies[key.trim()] = value.trim();
      } catch {}
    }
  }

  getCookieHeader() {
    return Object.entries(this.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join("; ");
  }

  async _req(url, options = {}) {
    const headers = {
      ...this.baseHeaders,
      ...options.headers,
      cookie: this.getCookieHeader()
    };

    const response = await globalThis.fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body || undefined,
      signal: options.signal
    });

    this.parseCookies(response.headers);
    return response;
  }

  async _readJson(response, fallbackMessage) {
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error(fallbackMessage || `Respons server tidak valid (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(
        data?.message ||
        data?.error ||
        fallbackMessage ||
        `Permintaan gagal dengan status ${response.status}.`
      );
    }

    return data;
  }

  async _toBuffer(input) {
    if (Buffer.isBuffer(input)) return input;
    if (input instanceof Uint8Array) return Buffer.from(input);

    if (typeof input === "string") {
      if (/^https?:\/\//i.test(input)) {
        const response = await globalThis.fetch(input);
        if (!response.ok) {
          throw new Error(`Gagal mengunduh gambar (${response.status}).`);
        }
        return Buffer.from(await response.arrayBuffer());
      }

      if (/^data:image\/[a-z0-9.+-]+;base64,/i.test(input)) {
        return Buffer.from(input.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, ""), "base64");
      }

      if (/^[A-Za-z0-9+/=\r\n]+$/.test(input)) {
        return Buffer.from(input.replace(/\s+/g, ""), "base64");
      }
    }

    throw new Error("Format gambar tidak valid.");
  }

  async _upload(buffer) {
    const filename = `${crypto.randomBytes(8).toString("hex")}.jpg`;
    const blob = new Blob([buffer], { type: "image/jpeg" });
    const formData = new FormData();
    formData.append("file", blob, filename);

    const response = await this._req(`${PHOTOS_STYLE_BASE_URL}/api/upload`, {
      method: "POST",
      body: formData
    });
    const data = await this._readJson(response, "Upload gambar gagal.");
    const url = data?.url || data?.data?.url;

    if (!url) throw new Error("Upload gagal: URL gambar tidak ditemukan.");
    return url;
  }

  async _poll(taskId) {
    for (let index = 1; index <= 60; index += 1) {
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const response = await this._req(
        `${PHOTOS_STYLE_BASE_URL}/api/generation/task?taskId=${encodeURIComponent(taskId)}`
      );
      const data = await this._readJson(response, "Gagal memeriksa status generation.");
      const status = data?.data?.status;

      this._log(`Polling [${index}/60]: ${status || "unknown"}`);

      if (status === "succeeded") return data.data;
      if (status === "failed" || status === "error") {
        throw new Error(data?.data?.message || "Generation failed.");
      }
    }

    throw new Error("Polling timeout.");
  }

  async _uploadToSimpan(imageUrl) {
    try {
      this._log("Uploading to simpan.site...");

      const imageResponse = await globalThis.fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Gagal mengambil hasil gambar (${imageResponse.status}).`);
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer());
      const contentType = imageResponse.headers.get("content-type") || "image/png";
      const blob = new Blob([buffer], { type: contentType });
      const formData = new FormData();
      formData.append("file", blob, "anime-result.png");

      const uploadResponse = await globalThis.fetch(SIMPAN_SITE, {
        method: "POST",
        body: formData
      });
      const data = await this._readJson(uploadResponse, "Upload hasil ke simpan.site gagal.");

      if (data?.success && data?.files?.[0]?.file?.url) {
        return data.files[0].file.url;
      }

      return null;
    } catch (error) {
      this._log(`Upload error: ${error.message}`);
      return null;
    }
  }

  async generate({ imageUrl, upload = true } = {}) {
    this._log("=== START ===");

    try {
      if (!imageUrl) throw new Error("Gambar diperlukan.");

      const buffer = await this._toBuffer(imageUrl);
      this._log("Uploading image...");
      const uploadedImageUrl = await this._upload(buffer);
      this._log("Upload OK.");

      const payload = {
        urls: [uploadedImageUrl],
        templateId: TEMPLATE,
        aspectRatio: "2:3",
        category: TEMPLATE,
        credit: "1",
        utm_source: null
      };

      this._log("Sending task...");
      const chatResponse = await this._req(`${PHOTOS_STYLE_BASE_URL}/api/generation/chat`, {
        method: "POST",
        body: JSON.stringify(payload),
        headers: { "content-type": "application/json" }
      });
      const chatData = await this._readJson(chatResponse, "Gagal membuat task generation.");
      const taskId = chatData?.data?.id;

      if (!taskId) throw new Error("Gagal mendapatkan Task ID.");
      this._log(`Task ID: ${taskId}`);

      const finalResult = await this._poll(taskId);
      const resultUrl = finalResult?.imgUrl || null;

      if (!resultUrl) throw new Error("URL hasil generation tidak ditemukan.");
      this._log("=== SUCCESS ===");

      const uploadedUrl = upload
        ? await this._uploadToSimpan(resultUrl)
        : null;

      return {
        status: true,
        result: resultUrl,
        url: uploadedUrl
      };
    } catch (error) {
      this._log(`ERROR: ${error.message}`);
      return {
        status: false,
        result: null,
        url: null,
        error: error.message
      };
    }
  }
}

/*
 * Created by : febry.is-a.dev
 *
 * Do not remove the watermark.
 */

async function handler(req, res) {
  const params = req.method === "GET" ? req.query : req.body;

  if (!params?.imageUrl) {
    return res.status(400).json({ error: "Parameter 'imageUrl' diperlukan" });
  }

  const api = new AnimeConverter();

  try {
    const data = await api.generate(params);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Internal Server Error"
    });
  }
}

module.exports = handler;
module.exports.handler = handler;
module.exports.AnimeConverter = AnimeConverter;
