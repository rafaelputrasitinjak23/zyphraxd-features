const axios = require("axios");
const FormData = require("form-data");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { CookieJar } = require("tough-cookie");
const { wrapper } = require("axios-cookiejar-support");

const BASE_URL = "https://wink.ai";
const STRATEGY_URL = "https://strategy.app.meitudata.com";

const CLIENT_ID = "1189857605";
const VERSION = "5.1.2";
const COUNTRY_CODE = "ID";
const CLIENT_LANGUAGE = "en_US";
const CLIENT_TIMEZONE = "Asia/Jakarta";

const TASK_TYPE = "12";
const CONTENT_TYPE = "1";
const EXT_VALUE = "2";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extToMime(file) {
  const ext = path.extname(file).toLowerCase();

  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";

  return "application/octet-stream";
}

function fileSuffix(file) {
  const ext = path.extname(file).toLowerCase();

  if (ext === ".jpeg") return ".jpg";
  if (ext) return ext;

  return ".jpg";
}

function makeTrace() {
  return `${crypto.randomBytes(16).toString("hex")}-${crypto.randomBytes(8).toString("hex")}-1`;
}

function traceHeaders(transaction = "GET%20%2F%5Blocale%5D%2Fimage-enhancer%2Fupload") {
  const trace = makeTrace();

  return {
    "sentry-trace": trace,
    baggage: [
      "sentry-environment=release",
      "sentry-release=5.1.2%20(b60d25c477f43c6dfac4107810f26d442320f4f1)",
      "sentry-public_key=e1bf914f3448d9bc8a10c7e499d17d54",
      `sentry-trace_id=${trace.split("-")[0]}`,
      `sentry-transaction=${transaction}`,
      "sentry-sampled=true",
      "sentry-sample_rate=0.75"
    ].join(",")
  };
}

async function enhancer(imagePath) {
  try {
    if (!fs.existsSync(imagePath)) {
      throw new Error(`File tidak ditemukan: ${imagePath}`);
    }

    await fsp.stat(imagePath);

    const gnum = crypto.randomUUID();
    const jar = new CookieJar();

    await jar.setCookie(`_sm=${gnum}; Path=/; Domain=wink.ai`, BASE_URL);
    await jar.setCookie(
      `meitustat=${encodeURIComponent(JSON.stringify({ wgid: gnum }))}; Path=/; Domain=wink.ai`,
      BASE_URL
    );

    const api = wrapper(
      axios.create({
        baseURL: BASE_URL,
        jar,
        withCredentials: true,
        validateStatus: () => true,
        headers: {
          accept: "*/*",
          origin: BASE_URL,
          referer: `${BASE_URL}/image-enhancer/upload`,
          "user-agent": UA,
          "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": "\"Android\"",
          ab_info: JSON.stringify({
            ab_codes: [],
            version: "1.4.4"
          })
        }
      })
    );

    function baseParams(extra = {}) {
      return new URLSearchParams({
        client_id: CLIENT_ID,
        version: VERSION,
        country_code: COUNTRY_CODE,
        gnum,
        client_language: CLIENT_LANGUAGE,
        client_channel_id: "",
        client_timezone: CLIENT_TIMEZONE,
        ...extra
      });
    }

    async function getMaatSign() {
      const params = baseParams({
        suffix: fileSuffix(imagePath),
        type: "temp",
        count: "1"
      });

      const res = await api.get(`/api/file/get_maat_sign.json?${params.toString()}`, {
        headers: traceHeaders()
      });

      if (res.status >= 400 || res.data?.code !== 0) {
        throw new Error(`get_maat_sign gagal: ${JSON.stringify(res.data)}`);
      }

      return res.data.data;
    }

    async function getUploadPolicy(sign) {
      const params = new URLSearchParams({
        app: sign.app,
        count: String(sign.count),
        sig: sign.sig,
        sigTime: sign.sig_time,
        sigVersion: sign.sig_version,
        suffix: sign.suffix,
        type: sign.type
      });

      const res = await axios.get(`${STRATEGY_URL}/upload/policy?${params.toString()}`, {
        headers: {
          accept: "*/*",
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
          "user-agent": UA,
          "sec-ch-ua": "\"Google Chrome\";v=\"147\", \"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"147\"",
          "sec-ch-ua-mobile": "?1",
          "sec-ch-ua-platform": "\"Android\""
        },
        validateStatus: () => true
      });

      if (res.status >= 400 || !Array.isArray(res.data) || !res.data[0]?.qiniu) {
        throw new Error(`upload policy gagal: ${JSON.stringify(res.data)}`);
      }

      return res.data[0].qiniu;
    }

    async function uploadToQiniu(policy) {
      const form = new FormData();

      form.append("file", fs.createReadStream(imagePath), {
        filename: path.basename(imagePath),
        contentType: extToMime(imagePath)
      });

      form.append("token", policy.token);
      form.append("key", policy.key);
      form.append("fname", path.basename(imagePath));

      const res = await axios.post(policy.url, form, {
        headers: form.getHeaders({
          origin: BASE_URL,
          referer: `${BASE_URL}/`,
          "user-agent": UA,
          accept: "*/*"
        }),
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        validateStatus: () => true
      });

      if (res.status >= 400) {
        throw new Error(`upload qiniu gagal HTTP ${res.status}: ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`);
      }

      return {
        file_key: policy.key,
        source_url: res.data.url || res.data.data || policy.data
      };
    }

    async function getMetaInfo(fileKey) {
      const body = baseParams({
        file_key: fileKey
      });

      const res = await api.post("/api/file/meta_info.json", body.toString(), {
        headers: {
          ...traceHeaders(),
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        }
      });

      if (res.status >= 400 || res.data?.code !== 0) {
        throw new Error(`meta info gagal: ${JSON.stringify(res.data)}`);
      }

      return res.data.data;
    }

    async function calcNeedBeans() {
      const typeParams = JSON.stringify({
        is_mirror: 0,
        orientation_tag: 1,
        j_420_trans: "1",
        return_ext: "2"
      });

      const rightDetail = JSON.stringify({
        source: "1",
        touch_type: "4",
        function_id: "630",
        material_id: "63011",
        url: "https://wink.ai/image-enhancer/upload"
      });

      const itemList = JSON.stringify([
        {
          type: Number(TASK_TYPE),
          ext_value: EXT_VALUE,
          content_type: Number(CONTENT_TYPE),
          duration: 0,
          type_params: typeParams,
          right_detail: rightDetail
        }
      ]);

      const body = baseParams({
        item_list: itemList
      });

      const res = await api.post("/api/subscribe/batch_calc_need_beans.json", body.toString(), {
        headers: {
          ...traceHeaders(),
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        }
      });

      if (res.status >= 400 || res.data?.code !== 0) {
        throw new Error(`calc beans gagal: ${JSON.stringify(res.data)}`);
      }

      return res.data.data;
    }

    async function delivery(sourceUrl) {
      const body = baseParams({
        type: TASK_TYPE,
        content_type: CONTENT_TYPE,
        source_url: sourceUrl,
        type_params: JSON.stringify({
          is_mirror: 0,
          orientation_tag: 1,
          j_420_trans: "1",
          return_ext: "2"
        }),
        right_detail: JSON.stringify({
          source: "1",
          touch_type: "4",
          function_id: "630",
          material_id: "63011",
          url: "https://wink.ai/image-enhancer/upload"
        }),
        ext_params: JSON.stringify({
          task_name: `Enhancer-Ultra HD-${path.parse(imagePath).name}`,
          records: TASK_TYPE
        }),
        with_prepare: "1"
      });

      const res = await api.post("/api/meitu_ai/delivery.json", body.toString(), {
        headers: {
          ...traceHeaders(),
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
        }
      });

      if (res.status >= 400 || res.data?.code !== 0) {
        throw new Error(`delivery gagal: ${JSON.stringify(res.data)}`);
      }

      const data = res.data.data || {};

      return {
        msg_id: data.msg_id || "",
        prepare_msg_id: data.prepare_msg_id || "",
        raw: data
      };
    }

    async function queryBatch(msgId) {
      const params = baseParams({
        msg_ids: msgId
      });

      const res = await api.get(`/api/meitu_ai/query_batch.json?${params.toString()}`, {
        headers: {
          ...traceHeaders("%2F%3Alocale%2Feditor%2Frecent-task"),
          referer: `${BASE_URL}/image-enhancer/upload`
        }
      });

      if (res.status >= 400 || res.data?.code !== 0) {
        throw new Error(`query batch gagal: ${JSON.stringify(res.data)}`);
      }

      return res.data.data;
    }

    function extractResultUrl(data) {
      const item = data?.item_list?.[0];
      const media = item?.result?.media_info_list?.[0];

      return media?.media_data || "";
    }

    function extractNextMsgId(data, currentMsgId) {
      const item = data?.item_list?.[0];
      const resultValue = item?.result?.result || "";
      const realMsgId = item?.result?.msg_id || item?.msg_id || "";

      if (
        resultValue &&
        resultValue !== currentMsgId &&
        !resultValue.startsWith("http") &&
        !resultValue.startsWith("https")
      ) {
        return resultValue;
      }

      if (
        realMsgId &&
        realMsgId !== currentMsgId &&
        !realMsgId.startsWith("wpr_")
      ) {
        return realMsgId;
      }

      return "";
    }

    async function waitResult(firstMsgId, maxTry = 80, delayMs = 3000) {
      let msgId = firstMsgId;
      let last = null;

      for (let i = 1; i <= maxTry; i++) {
        const data = await queryBatch(msgId);
        last = data;

        const nextMsgId = extractNextMsgId(data, msgId);

        if (nextMsgId) {
          msgId = nextMsgId;
          await sleep(1000);
          continue;
        }

        const url = extractResultUrl(data);
        const errorCode = data?.item_list?.[0]?.result?.error_code;
        const errorMsg = data?.item_list?.[0]?.result?.error_msg;

        if (url && url.startsWith("http") && errorCode === 0) {
          return url;
        }

        if (errorCode && errorCode !== 29901 && errorCode !== 0) {
          throw new Error(`task gagal: ${errorCode} ${errorMsg || ""}`);
        }

        await sleep(delayMs);
      }

      throw new Error(`result belum selesai: ${JSON.stringify(last)}`);
    }

    const sign = await getMaatSign();
    const policy = await getUploadPolicy(sign);
    const uploaded = await uploadToQiniu(policy);

    await getMetaInfo(uploaded.file_key);
    await calcNeedBeans();

    const task = await delivery(uploaded.source_url);
    const firstMsgId = task.msg_id || task.prepare_msg_id;

    if (!firstMsgId) {
      throw new Error(`delivery tidak mengembalikan msg_id: ${JSON.stringify(task.raw)}`);
    }

    const resultUrl = await waitResult(firstMsgId);

    return {
      Status: true,
      Code: 200,
      Input: imagePath,
      Result_url: resultUrl
    };
  } catch (error) {
    return {
      Status: false,
      Code: 500,
      Input: imagePath,
      Result_url: "",
      Error: error.message
    };
  }
}

module.exports = enhancer;