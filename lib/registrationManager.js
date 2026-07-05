const crypto = require("crypto");

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const sessions = new Map();

function normalizeCode(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function generateCode(length = 5) {
  let code = "";
  for (let index = 0; index < length; index += 1) {
    code += CODE_CHARS[crypto.randomInt(0, CODE_CHARS.length)];
  }
  return code;
}

function parseRegistrationText(text) {
  const parts = String(text || "").split(",").map((item) => item.trim());
  const name = parts[0] || "";
  const age = Math.floor(Number(parts[1]) || 0);

  if (!name) throw new Error("Nama wajib diisi.");
  if (!parts[1]) throw new Error("Umur wajib diisi.");
  if (name.length < 2 || name.length > 60) throw new Error("Nama harus 2 sampai 60 karakter.");
  if (age < 5 || age > 120) throw new Error("Umur harus berupa angka 5 sampai 120.");

  return {
    name: name.replace(/\s+/g, " "),
    age
  };
}

function createCaptchaImage(code) {
  const { createCanvas } = require("canvas");
  const width = 720;
  const height = 280;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f7fbff";
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 70; i += 1) {
    ctx.fillStyle = `rgba(${crypto.randomInt(40, 180)}, ${crypto.randomInt(80, 210)}, ${crypto.randomInt(120, 240)}, 0.18)`;
    ctx.beginPath();
    ctx.arc(crypto.randomInt(0, width), crypto.randomInt(0, height), crypto.randomInt(2, 8), 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 8; i += 1) {
    ctx.strokeStyle = `rgba(${crypto.randomInt(20, 160)}, ${crypto.randomInt(80, 180)}, ${crypto.randomInt(120, 220)}, 0.32)`;
    ctx.lineWidth = crypto.randomInt(2, 5);
    ctx.beginPath();
    ctx.moveTo(crypto.randomInt(0, width), crypto.randomInt(0, height));
    ctx.bezierCurveTo(
      crypto.randomInt(0, width),
      crypto.randomInt(0, height),
      crypto.randomInt(0, width),
      crypto.randomInt(0, height),
      crypto.randomInt(0, width),
      crypto.randomInt(0, height)
    );
    ctx.stroke();
  }

  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.font = "bold 88px Sans";

  const gap = width / (code.length + 1);
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index];
    const x = gap * (index + 1);
    const y = height / 2 + crypto.randomInt(-18, 18);
    const angle = (crypto.randomInt(-18, 18) * Math.PI) / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = `rgb(${crypto.randomInt(20, 80)}, ${crypto.randomInt(60, 130)}, ${crypto.randomInt(120, 210)})`;
    ctx.fillText(char, 0, 0);
    ctx.restore();
  }

  ctx.strokeStyle = "rgba(35, 89, 170, 0.18)";
  ctx.lineWidth = 8;
  ctx.strokeRect(18, 18, width - 36, height - 36);

  return canvas.toBuffer("image/png");
}

function createSession(sender, profile) {
  cleanup();
  const code = generateCode();
  const session = {
    sender,
    code,
    profile,
    attempts: 0,
    createdAt: Date.now(),
    expiresAt: Date.now() + CAPTCHA_TTL_MS,
    image: createCaptchaImage(code)
  };
  sessions.set(sender, session);
  return session;
}

function getSession(sender) {
  const session = sessions.get(sender);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sender);
    return null;
  }
  return session;
}

function verify(sender, input) {
  const session = getSession(sender);
  if (!session) {
    return { ok: false, expired: true, message: "Captcha sudah kedaluwarsa. Silakan daftar ulang." };
  }

  const code = normalizeCode(input);
  if (code === session.code) {
    sessions.delete(sender);
    return { ok: true, profile: session.profile };
  }

  session.attempts += 1;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - session.attempts);
  if (attemptsLeft <= 0) {
    sessions.delete(sender);
    return { ok: false, failed: true, message: "Kode captcha salah 3 kali. Silakan daftar ulang." };
  }

  return {
    ok: false,
    message: `Kode captcha salah. Sisa percobaan: ${attemptsLeft}.`
  };
}

function cleanup() {
  const now = Date.now();
  for (const [sender, session] of sessions.entries()) {
    if (now > session.expiresAt) sessions.delete(sender);
  }
}

module.exports = {
  CAPTCHA_TTL_MS,
  MAX_ATTEMPTS,
  parseRegistrationText,
  createSession,
  getSession,
  verify,
  normalizeCode,
  cleanup
};
