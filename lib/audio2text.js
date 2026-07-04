const axios = require("axios");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const BASE = "https://audioconvert.ai";
const PAGE_URL = `${BASE}/id`;
const JWT_SECRET = "auc995cx6se";
const LANGUAGE_CODE = "";
const SCENARIO = "auto";

const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function createGuestBearer(userId = crypto.randomUUID()) {
  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const payload = {
    userId
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const data = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(data)
    .digest("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return {
    userId,
    token: `${data}.${signature}`
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanUploadUrl(uploadUrl) {
  return uploadUrl.split("?")[0];
}

async function getDurationMinutes(filePath) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);

    const seconds = Number(stdout.trim());

    if (!Number.isFinite(seconds) || seconds <= 0) return 1;

    return Math.max(1, Math.ceil(seconds / 60));
  } catch {
    return 1;
  }
}

async function warmup(userAgent = USER_AGENT) {
  const client = axios.create({
    timeout: 30000,
    validateStatus: () => true
  });

  await client.get(PAGE_URL, {
    headers: {
      "user-agent": userAgent,
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
      referer: BASE,
      "upgrade-insecure-requests": "1",
      "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
      "sec-ch-ua-mobile": "?1",
      "sec-ch-ua-platform": `"Android"`,
      "sec-fetch-site": "none",
      "sec-fetch-mode": "navigate",
      "sec-fetch-user": "?1",
      "sec-fetch-dest": "document"
    }
  });
}

async function presign(filename, guest, client) {
  const url = `${BASE}/api/resource/upload/presign?filename=${encodeURIComponent(filename)}`;

  const headersBase = {
    "user-agent": USER_AGENT,
    authorization: `Bearer ${guest.token}`,
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: PAGE_URL,
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": `"Android"`
  };

  const { data, status } = await client.get(url, {
    headers: {
      ...headersBase,
      accept: "*/*",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty"
    }
  });

  if (status < 200 || status >= 300 || data?.code !== 100000 || !data?.data?.upload_url) {
    throw new Error(`Presign gagal HTTP ${status}: ${JSON.stringify(data)}`);
  }

  return data.data.upload_url;
}

async function uploadToOss(uploadUrl, filePath) {
  const fileSize = fs.statSync(filePath).size;
  const url = new URL(uploadUrl);

  await new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "PUT",
        headers: {
          "Content-Length": fileSize
        }
      },
      (res) => {
        let body = "";

        res.setEncoding("utf8");

        res.on("data", (chunk) => {
          body += chunk;
        });

        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Upload OSS gagal HTTP ${res.statusCode}: ${body}`));
          }
        });
      }
    );

    req.on("error", reject);

    fs.createReadStream(filePath)
      .on("error", reject)
      .pipe(req);
  });

  return cleanUploadUrl(uploadUrl);
}

async function checkGuestQuota(durationMinutes, guest, client) {
  const headersBase = {
    "user-agent": USER_AGENT,
    authorization: `Bearer ${guest.token}`,
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: PAGE_URL,
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": `"Android"`
  };

  const { data, status } = await client.post(
    `${BASE}/api/transcribe/check-guest-quota`,
    {
      duration_minutes: durationMinutes
    },
    {
      headers: {
        ...headersBase,
        accept: "application/json",
        "content-type": "application/json",
        origin: BASE,
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty"
      }
    }
  );

  if (status < 200 || status >= 300 || data?.code !== 100000) {
    throw new Error(`Check quota gagal HTTP ${status}: ${JSON.stringify(data)}`);
  }

  if (!data?.data?.allowed) {
    throw new Error(`Quota tidak allowed: ${JSON.stringify(data)}`);
  }

  return data.data.allowed;
}

async function createTranscribe(audioUrl, fileName, guest, client) {
  const headersBase = {
    "user-agent": USER_AGENT,
    authorization: `Bearer ${guest.token}`,
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: PAGE_URL,
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": `"Android"`
  };

  const payload = {
    audio_url: audioUrl,
    language_code: LANGUAGE_CODE,
    file_name: fileName,
    scenario: SCENARIO
  };

  const { data, status } = await client.post(`${BASE}/api/transcribe/`, payload, {
    headers: {
      ...headersBase,
      accept: "application/json",
      "content-type": "application/json",
      origin: BASE,
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty"
    }
  });

  if (status < 200 || status >= 300 || data?.code !== 100000 || !data?.data?.id) {
    throw new Error(`Submit transcribe gagal HTTP ${status}: ${JSON.stringify(data)}`);
  }

  return data.data;
}

async function getTranscribe(taskId, guest, client) {
  const headersBase = {
    "user-agent": USER_AGENT,
    authorization: `Bearer ${guest.token}`,
    "accept-language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    referer: PAGE_URL,
    "sec-ch-ua": `"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"`,
    "sec-ch-ua-mobile": "?1",
    "sec-ch-ua-platform": `"Android"`
  };

  const { data, status } = await client.get(`${BASE}/api/transcribe/${taskId}`, {
    headers: {
      ...headersBase,
      accept: "*/*",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty"
    }
  });

  return { status, data };
}

function extractText(data) {
  const d = data?.data ?? data;

  if (!d) return null;

  if (typeof d === "string") return d;

  const value =
    d.text ??
    d.transcript ??
    d.result ??
    d.content ??
    d.transcription ??
    d.segments?.map((x) => x.text).filter(Boolean).join(" ") ??
    null;

  if (typeof value === "string") return value;

  if (value && typeof value === "object") {
    return (
      value.text ??
      value.transcript ??
      value.result ??
      value.content ??
      value.transcription ??
      null
    );
  }

  return null;
}

async function pollResult(taskId, guest, client) {
  for (let i = 0; i < 40; i++) {
    const { status, data } = await getTranscribe(taskId, guest, client);

    if (data?.code === 100001 || data?.message === "Need Login") {
      return {
        done: false,
        need_login: true,
        text: null
      };
    }

    if (status >= 200 && status < 300 && data?.code === 100000) {
      const task = data.data;
      const text = extractText(data);

      if (
        task?.status === "succeeded" ||
        task?.status === "success" ||
        task?.status === "completed" ||
        text
      ) {
        return {
          done: true,
          need_login: false,
          text
        };
      }

      if (task?.status === "failed" || task?.status === "error") {
        throw new Error(task?.error ?? data?.message ?? "Transcribe failed");
      }
    }

    await sleep(3000);
  }

  return {
    done: false,
    need_login: false,
    text: null
  };
}

async function audio2text(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File tidak ditemukan: ${filePath}`);
  }

  const guest = createGuestBearer();
  const client = axios.create({
    timeout: 30000,
    validateStatus: () => true
  });

  await warmup();

  const fileName = path.basename(filePath);
  const durationMinutes = await getDurationMinutes(filePath);

  const uploadUrl = await presign(fileName, guest, client);
  const audioUrl = await uploadToOss(uploadUrl, filePath);

  await checkGuestQuota(durationMinutes, guest, client);

  const task = await createTranscribe(audioUrl, fileName, guest, client);
  const poll = await pollResult(task.id, guest, client);

  return {
    success: !poll.need_login && !!poll.text,
    code: poll.need_login ? 401 : 200,
    file: filePath,
    text: poll.text,
    error: poll.need_login ? "Need Login" : null
  };
}

module.exports = { audio2text };
