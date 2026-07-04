const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const crypto = require("crypto");

const CONFIG = {
  BASE_URL: "https://apiv1.deepfakemaker.io/api/img/v2/free/task",
  APP_ID: "ai_df",
  SECRET_STRING: "NHGNy5YFz7HeFb",
  PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDa2oPxMZe71V4dw2r8rHWt59gH
W5INRmlhepe6GUanrHykqKdlIB4kcJiu8dHC/FJeppOXVoKz82pvwZCmSUrF/1yr
rnmUDjqUefDu8myjhcbio6CnG5TtQfwN2pz3g6yHkLgp8cFfyPSWwyOCMMMsTU9s
snOjvdDb4wiZI8x3UwIDAQAB
-----END PUBLIC KEY-----`,
  HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36",
    Accept: "application/json",
    origin: "https://deepfakemaker.io",
    referer: "https://deepfakemaker.io/"
  }
};

const deepfakeMaker = {
  _currentUserId: null,

  _generateRandomString(length) {
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    let result = "";

    for (let i = 0; i < length; i++) {
      result += chars.charAt(
        Math.floor(Math.random() * chars.length)
      );
    }

    return result;
  },

  _getUserId() {
    if (!deepfakeMaker._currentUserId) {
      const randomString =
        crypto.randomBytes(16).toString("hex");

      const timestamp =
        Date.now().toString();

      deepfakeMaker._currentUserId =
        crypto
          .createHash("sha256")
          .update(randomString + timestamp)
          .digest("hex");
    }

    return deepfakeMaker._currentUserId;
  },

  _getTimestamp() {
    const a = new Date();

    const l = new Date(
      a.getUTCFullYear(),
      a.getUTCMonth(),
      a.getUTCDate(),
      a.getUTCHours(),
      a.getUTCMinutes(),
      a.getUTCSeconds()
    );

    return Math.floor(l.getTime() / 1000);
  },

  _generateSecurityTokens() {
    const t = deepfakeMaker._getTimestamp();
    const nonce = crypto.randomUUID();
    const i = deepfakeMaker._generateRandomString(16);
    const userId = deepfakeMaker._getUserId();

    const secret_key = crypto
      .publicEncrypt(
        {
          key: CONFIG.PUBLIC_KEY,
          padding: crypto.constants.RSA_PKCS1_PADDING
        },
        Buffer.from(i, "utf8")
      )
      .toString("base64");

    const rawString = [
      CONFIG.APP_ID,
      CONFIG.SECRET_STRING,
      t,
      nonce,
      secret_key
    ].join(":");

    const cipher = crypto.createCipheriv(
      "aes-128-cbc",
      Buffer.from(i, "utf8"),
      Buffer.from(i, "utf8")
    );

    let sign = cipher.update(
      rawString,
      "utf8",
      "base64"
    );

    sign += cipher.final("base64");

    return {
      t,
      nonce,
      sign,
      secret_key,
      user_id: userId,
      app_id: CONFIG.APP_ID
    };
  },

  async _submitTask(sourceImagePath, targetImagePath) {
    deepfakeMaker._currentUserId = null;

    const tokens =
      deepfakeMaker._generateSecurityTokens();

    const form = new FormData();

    form.append(
      "swap_image",
      fs.createReadStream(sourceImagePath)
    );

    form.append(
      "target_image",
      fs.createReadStream(targetImagePath)
    );

    form.append("user_id", tokens.user_id);

    const params = new URLSearchParams({
      app_id: tokens.app_id,
      t: tokens.t,
      nonce: tokens.nonce,
      sign: tokens.sign,
      secret_key: tokens.secret_key
    });

    const res = await axios.post(
      `${CONFIG.BASE_URL}?${params.toString()}`,
      form,
      {
        headers: {
          ...CONFIG.HEADERS,
          ...form.getHeaders()
        }
      }
    );

    if (res.data?.code !== 200) {
      throw new Error(
        `Submit failed: ${
          res.data?.msg || JSON.stringify(res.data)
        }`
      );
    }

    return res.data.data.job_id;
  },

  async _checkStatus(jobId) {
    const tokens =
      deepfakeMaker._generateSecurityTokens();

    const params = new URLSearchParams({
      user_id: tokens.user_id,
      job_id: jobId,
      app_id: tokens.app_id,
      t: tokens.t,
      nonce: tokens.nonce,
      sign: tokens.sign,
      secret_key: tokens.secret_key
    });

    const res = await axios.get(
      `${CONFIG.BASE_URL}?${params.toString()}`,
      {
        headers: CONFIG.HEADERS
      }
    );

    return res.data;
  },

  async swapFace(
    sourceImage,
    targetImage,
    options = {
      maxRetries: 25,
      delayMs: 3000
    }
  ) {
    try {
      const jobId =
        await deepfakeMaker._submitTask(
          sourceImage,
          targetImage
        );

      let attempt = 0;

      while (attempt < options.maxRetries) {
        attempt++;

        await new Promise(resolve =>
          setTimeout(resolve, options.delayMs)
        );

        const result =
          await deepfakeMaker._checkStatus(jobId);

        if (
          result.code === 200 &&
          result.data?.status === 0 &&
          result.data?.face_swap_url
        ) {
          return {
            status: true,
            url: result.data.face_swap_url
          };
        }

        if (
          result.code === 200 &&
          result.data?.status === 2
        ) {
          throw new Error(
            "Task failed to process on server."
          );
        }
      }

      throw new Error(
        "Timeout: Server processing took too long."
      );
    } catch (error) {
      return {
        status: false,
        message:
          error.response?.data?.msg ||
          error.message ||
          "Unknown error occurred"
      };
    }
  }
};

module.exports = deepfakeMaker;