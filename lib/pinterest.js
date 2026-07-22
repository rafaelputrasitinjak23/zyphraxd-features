"use strict";

const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const { CookieJar } = require("tough-cookie");

const PINTEREST_ORIGIN = "https://id.pinterest.com";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) " +
  "Gecko/20100101 Firefox/152.0";
const DEFAULT_APP_VERSION = "8048c97";
const MAX_SEARCH_LIMIT = 30;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function normalizeLimit(value, fallback = 10) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), MAX_SEARCH_LIMIT);
}

function createPinterestClient() {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      withCredentials: true,
      timeout: 30_000,
      maxRedirects: 5,
      headers: {
        "user-agent": DEFAULT_USER_AGENT,
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9," +
          "image/avif,image/webp,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    })
  );

  return client;
}

function selectOriginalImage(pin) {
  return (
    pin?.images?.orig?.url ||
    pin?.images?.["736x"]?.url ||
    pin?.images?.["564x"]?.url ||
    pin?.images?.["474x"]?.url ||
    pin?.images?.["236x"]?.url ||
    null
  );
}

function normalizePin(pin) {
  const id = String(pin?.id || "").trim();
  const image = selectOriginalImage(pin);

  if (!id || !image) return null;

  return {
    id,
    title: pin.grid_title || pin.title || null,
    description: pin.description || null,
    image,
    pinUrl: `${PINTEREST_ORIGIN}/pin/${id}/`,
    link: pin.link || null,
    domain: pin.domain || null,
    pinner: pin.pinner?.full_name || null,
    username: pin.pinner?.username || null,
    likes: Number(pin.reaction_counts?.["1"] || 0),
    createdAt: pin.created_at || null,
  };
}

async function searchPinterest(query, options = {}) {
  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    throw new Error("Kata pencarian Pinterest tidak boleh kosong.");
  }

  const limit = normalizeLimit(options.limit, 10);
  const client = createPinterestClient();

  // Membuka halaman awal agar cookie Pinterest tersimpan di CookieJar.
  await client.get(`${PINTEREST_ORIGIN}/`);

  const sourceUrl =
    `/search/pins/?q=${encodeURIComponent(normalizedQuery)}&rs=typed`;

  const dataPayload = JSON.stringify({
    options: {
      query: normalizedQuery,
      scope: "pins",
      appliedProductFilters: "---",
      domains: null,
      user: null,
      seoDrawerEnabled: false,
      applied_unified_filters: null,
      auto_correction_disabled: false,
      journey_depth: null,
      source_id: null,
      source_module_id: null,
      source_url: sourceUrl,
      static_feed: false,
      selected_one_bar_modules: null,
      query_pin_sigs: null,
      page_size: limit,
      price_max: null,
      price_min: null,
      query_image_pins: null,
      request_params: null,
      top_pin_ids: null,
      article: null,
      corpus: null,
      customized_rerank_type: null,
      filters: null,
      rs: "typed",
      redux_normalize_feed: true,
    },
    context: {},
  });

  const requestUrl =
    `${PINTEREST_ORIGIN}/resource/BaseSearchResource/get/` +
    `?source_url=${encodeURIComponent(sourceUrl)}` +
    `&data=${encodeURIComponent(dataPayload)}` +
    `&_=${Date.now()}`;

  const response = await client.get(requestUrl, {
    headers: {
      "user-agent": DEFAULT_USER_AGENT,
      accept: "application/json, text/javascript, */*; q=0.01",
      "accept-language": "en-US,en;q=0.9",
      referer: `${PINTEREST_ORIGIN}/`,
      "x-requested-with": "XMLHttpRequest",
      "x-app-version":
        process.env.PINTEREST_APP_VERSION || DEFAULT_APP_VERSION,
      "x-pinterest-appstate": "active",
      "x-pinterest-source-url": "/",
      "x-pinterest-pws-handler": "www/index.js",
      "screen-dpr": "1.25",
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
    },
    responseType: "json",
  });

  const data = response.data;
  const status = data?.resource_response?.status;
  const rawResults = data?.resource_response?.data?.results;

  if (status !== "success" || !Array.isArray(rawResults)) {
    const message =
      data?.resource_response?.message ||
      data?.message ||
      "Pinterest tidak mengembalikan hasil pencarian yang valid.";
    throw new Error(message);
  }

  const results = rawResults
    .map(normalizePin)
    .filter(Boolean)
    .slice(0, limit);

  return {
    status: "success",
    code: response.status,
    input: normalizedQuery,
    total: results.length,
    result: results,
  };
}

function validatePinterestImageUrl(imageUrl) {
  let parsed;

  try {
    parsed = new URL(String(imageUrl || ""));
  } catch {
    throw new Error("URL gambar Pinterest tidak valid.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("URL gambar Pinterest harus menggunakan HTTPS.");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "pinimg.com" && !hostname.endsWith(".pinimg.com")) {
    throw new Error("Host gambar bukan domain resmi Pinterest.");
  }

  return parsed;
}

async function downloadPinterestImage(imageUrl, options = {}) {
  const parsedUrl = validatePinterestImageUrl(imageUrl);
  const maxBytes = Math.min(
    Math.max(Number(options.maxBytes) || MAX_IMAGE_BYTES, 1024),
    MAX_IMAGE_BYTES
  );

  const response = await axios.get(parsedUrl.toString(), {
    responseType: "arraybuffer",
    timeout: 60_000,
    maxContentLength: maxBytes,
    maxBodyLength: maxBytes,
    headers: {
      "user-agent": DEFAULT_USER_AGENT,
      accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5",
      referer: `${PINTEREST_ORIGIN}/`,
    },
  });

  const contentType = String(response.headers["content-type"] || "")
    .split(";")[0]
    .trim()
    .toLowerCase();

  if (!contentType.startsWith("image/")) {
    throw new Error("Hasil unduhan Pinterest bukan file gambar.");
  }

  const buffer = Buffer.from(response.data);
  if (!buffer.length) {
    throw new Error("File gambar Pinterest kosong.");
  }

  if (buffer.length > maxBytes) {
    throw new Error("Ukuran gambar Pinterest melebihi batas yang diizinkan.");
  }

  return {
    buffer,
    mimetype: contentType,
    size: buffer.length,
    fileName: parsedUrl.pathname.split("/").filter(Boolean).pop() || "pinterest.jpg",
  };
}

module.exports = {
  searchPinterest,
  downloadPinterestImage,
};
