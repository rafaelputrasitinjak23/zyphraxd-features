const BASE_URL = "https://raphael.app";
const API_URL = `${BASE_URL}/api/generate-image`;

function randomId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function parseBool(value, defaultValue = false) {
  if (typeof value === "boolean") return value;

  if (typeof value === "string") {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }

  return defaultValue;
}

function parseNumber(value, defaultValue) {
  const number = Number(value);
  return Number.isFinite(number) ? number : defaultValue;
}

async function raphael(prompt, options = {}) {
  try {
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return {
        status: false,
        code: 400,
        creator: "rhmt",
        error: "Prompt kosong"
      };
    }

    const body = {
      prompt: prompt.trim(),
      negativePrompt: options.negativePrompt || "",
      aspect: options.aspect || "1:1",
      isSafeContent: options.isSafeContent !== undefined ? options.isSafeContent : true,
      autoTranslate: options.autoTranslate !== undefined ? options.autoTranslate : true,
      model_id: options.model_id || "raphael-basic",
      number_of_images: parseNumber(options.number_of_images, 4),
      highQuality: parseBool(options.highQuality, false),
      fastMode: parseBool(options.fastMode, false),
      turnstileToken: options.turnstileToken || null,
      client_request_id: options.client_request_id || randomId()
    };

    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        origin: BASE_URL,
        referer: `${BASE_URL}/id`,
        "user-agent":
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36"
      },
      body: JSON.stringify(body)
    });

    const rawText = await res.text();

    if (!res.ok) {
      return {
        status: false,
        code: res.status,
        creator: "rhmt",
        input: prompt,
        error: "Request gagal",
        raw: rawText
      };
    }

    const lines = rawText
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.startsWith("{") && line.endsWith("}"));

    const parsed = [];

    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {}
    }

    const results = parsed
      .map((item, index) => {
        const url = item.url && item.url.startsWith("http")
          ? item.url
          : `${BASE_URL}${item.url || ""}`;

        return {
          no: index + 1,
          url,
          seed: item.seed || null,
          width: item.width || null,
          height: item.height || null,
          isHighQuality: item.isHighQuality || false
        };
      })
      .filter(item => item.url && item.url !== BASE_URL);

    return {
      status: true,
      code: 200,
      creator: "rhmt",
      prompt: body.prompt,
      negativePrompt: body.negativePrompt,
      model: body.model_id,
      aspect: body.aspect,
      total: results.length,
      results,
      raw: parsed
    };
  } catch (error) {
    return {
      status: false,
      code: 500,
      creator: "rhmt",
      error: error.message || "Terjadi kesalahan"
    };
  }
}

module.exports = raphael;