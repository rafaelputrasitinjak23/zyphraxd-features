const axios = require("axios");
const FormData = require("form-data");
const fs = require("node:fs");
const path = require("node:path");

const API = "https://uguu.se/upload.php";

const UA =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

async function uguu(input) {
  try {
    if (!input) {
      return {
        Status: false,
        Code: 400,
        Result_url: "Input kosong"
      };
    }

    const form = new FormData();

    if (Buffer.isBuffer(input)) {
      form.append("files[]", input, {
        filename: `upload-${Date.now()}.png`,
        contentType: "application/octet-stream"
      });
    } else {
      form.append("files[]", fs.createReadStream(input), {
        filename: path.basename(input),
        contentType: "application/octet-stream"
      });
    }

    const res = await axios.post(API, form, {
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
      validateStatus: () => true,
      headers: {
        ...form.getHeaders(),
        accept: "*/*",
        origin: "https://uguu.se",
        referer: "https://uguu.se/",
        "user-agent": UA,
        "sec-ch-ua":
          '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
        "sec-ch-ua-mobile": "?1",
        "sec-ch-ua-platform": '"Android"',
        "sec-fetch-site": "same-origin",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language":
          "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7"
      }
    });

    const resultUrl =
      res.data?.files?.[0]?.url || null;

    return {
      Status:
        res.status === 200 &&
        res.data?.success === true &&
        !!resultUrl,
      Code: res.status,
      Result_url: resultUrl || res.data
    };

  } catch (err) {
    return {
      Status: false,
      Code: err.response?.status || 500,
      Result_url: err.message
    };
  }
}

module.exports = uguu;