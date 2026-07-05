require("./lib/config");

const chalkFallback = new Proxy((value) => String(value), {
  get: () => chalkFallback
});
let chalk = chalkFallback;
try {
  const loaded = require("chalk");
  chalk = loaded.default || loaded;
} catch {}

const moment = require("moment-timezone");
const { database, normalizeJid } = require("./lib/database");
const cooldownManager = require("./lib/cooldownManager");
const taskQueue = require("./lib/taskQueue");
const downloaderCache = require("./lib/cacheManager");
const pluginManager = require("./lib/pluginManager");
const { getCommandPolicy } = require("./lib/commandPolicy");
const { processGroupMessage } = require("./lib/groupMiddleware");
const { checkAccess, createVerificationQuote } = require("./lib/pluginUtils");
const { parseCommandInput, shouldSuggestWithoutPrefix } = require("./lib/commandParser");
const { findCommandSuggestions, buildSuggestionMessage } = require("./lib/didYouMean");
const errorMonitor = require("./lib/errorMonitor");
const groupAccessManager = require("./lib/groupAccessManager");
const { buildOwnerRoles, canUseOwnerCommand, isGroupAccessCommand } = require("./lib/ownerAccess");

const REGISTRATION_BYPASS_COMMANDS = new Set([
  "daftar",
  "register",
  "menu",
  "help",
  "allmenu",
  "buttonlist",
  "listbutton",
  "buttons",
  "profile",
  "me",
  "limit",
  "premium",
  "downloadmenu",
  "createmenu",
  "stickermenu",
  "audiomenu",
  "channelmenu",
  "ownermenu",
  "toolsmenu",
  "othermenu",
  "groupmenu",
  "systemmenu",
  "botmenu",
  "gamemenu"
]);

function getNativeFlowSelection(m) {
  const raw =
    m?.msg?.nativeFlowResponseMessage?.paramsJson ||
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (!raw) return "";

  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return String(
      data?.id ||
      data?.selectedId ||
      data?.selectedRowId ||
      data?.rowId ||
      data?.command ||
      data?.single_select?.id ||
      ""
    );
  } catch {
    return "";
  }
}

function getBody(m) {
  return String(
    m.body ||
    m.text ||
    m.message?.conversation ||
    m.message?.imageMessage?.caption ||
    m.message?.documentMessage?.caption ||
    m.message?.videoMessage?.caption ||
    m.message?.extendedTextMessage?.text ||
    m.message?.buttonsResponseMessage?.selectedButtonId ||
    m.message?.templateButtonReplyMessage?.selectedId ||
    m.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    getNativeFlowSelection(m) ||
    ""
  );
}

function hasMinimumInput(plugin, context) {
  if (plugin.requiresText && !String(context.text || "").trim()) return false;
  if (plugin.requiresMedia && !String(context.mime || "").trim()) return false;
  if (plugin.requiresQuoted && !context.m?.quoted) return false;
  return true;
}

function canBypassRegistration(command, context) {
  if (context.isCreator || context.isMainOwner || context.isChildOwner) return true;
  return REGISTRATION_BYPASS_COMMANDS.has(String(command || "").toLowerCase());
}

async function logFeatureError(error, context) {
  const command = context.command || error?.pluginName || "unknown";
  database.recordError();

  const entry = await errorMonitor.capture(error, context, {
    source: "plugin",
    plugin: error?.pluginName || context?.plugin?.name || command
  });

  try {
    await context.Rafael.sendMessage(
      context.m.chat,
      {
        text: [
          `Terjadi kesalahan saat menjalankan ${command === "unknown" ? "fitur" : `.${command}`}.`,
          "Silakan coba kembali beberapa saat lagi.",
          entry?.id ? `\nID laporan: ${entry.id}` : ""
        ].filter(Boolean).join("\n")
      },
      { quoted: context.m }
    );
  } catch (replyError) {
    console.error("Gagal mengirim laporan error:", replyError.message);
  }
}

function logCommand(context) {
  if (!context.isCmd) return;
  const line = chalk.gray("┈━━━━━━━━━━━━━━━━━━┈");
  console.log(line);
  console.log(`${chalk.green.bold("📩 Message")}  : ${chalk.white(context.command)}`);
  console.log(`${chalk.yellow.bold("👤 User")}     : ${chalk.cyan(context.pushname)}`);
  console.log(`${chalk.blue.bold("⏰ Time")}     : ${chalk.white(context.time2)}`);
  console.log(`${chalk.magenta.bold(context.isGroup ? "👥 Group" : "💬 Chat")}    : ${chalk.green(context.isGroup ? "Group Chat" : "Private Chat")}`);
  console.log(`${line}\n`);
}

module.exports = async (Rafael, m) => {
  let context = null;
  let queueRelease = null;
  let consumedLimit = 0;
  let queueSucceeded = true;

  try {
    const body = getBody(m);
    const budy = typeof m.text === "string" ? m.text : body;
    const parsedCommand = parseCommandInput(body, pluginManager);
    const {
      prefix,
      usedPrefix,
      hasExplicitPrefix,
      isDirectCommand,
      isCmd,
      command,
      rawCommand,
      args,
      text
    } = parsedCommand;
    const from = m.key?.remoteJid || m.chat || "";
    const sender = m.sender || (m.key?.fromMe
      ? Rafael.decodeJid(Rafael.user?.id)
      : m.key?.participant || from);
    const botNumber = Rafael.decodeJid(Rafael.user?.id || "");
    const senderNumber = String(sender || "").split("@")[0];
    const dynamicOwnerJids = [
      Rafael.childOwnerJid,
      ...(Array.isArray(Rafael.childOwnerJids) ? Rafael.childOwnerJids : [])
    ].filter(Boolean);
    const ownerRoles = buildOwnerRoles({ Rafael, sender, botNumber, dynamicOwnerJids });
    const { isMainOwner, isChildOwner, isCreator, ownerJids, mainOwnerJids, childOwnerJids } = ownerRoles;
    const pushname = m.pushName || senderNumber || "Unknown";
    const quoted = m.quoted || m;
    const isGroup = from.endsWith("@g.us");
    const mime = (quoted.msg || quoted).mimetype || "";
    const isMedia = /image|video|sticker|audio/i.test(mime);
    const jakartaTime = moment().tz("Asia/Jakarta");
    const currentHour = jakartaTime.hour();
    const ucapanWaktu = currentHour >= 4 && currentHour < 11
      ? "Selamat Pagi🏙️"
      : currentHour < 15
        ? "Selamat Siang🏞️"
        : currentHour < 19
          ? "Selamat Sore🌄"
          : "Selamat Malam🌃";

    const user = database.touchUser(sender, pushname);
    const group = isGroup ? database.getGroup(from) : null;
    const isAllowed = checkAccess(sender);

    let groupMetadata = null;
    let participants = [];
    let groupAdmins = [];
    let isAdmin = false;
    let isBotAdmin = false;

    if (isGroup) {
      const groupAccessAllowed = groupAccessManager.canRespond(botNumber, from);
      const canBypassGroupAccess = isGroupAccessCommand(command) && canUseOwnerCommand({ isCreator, isMainOwner, isChildOwner, command });
      if (!groupAccessAllowed && !canBypassGroupAccess) {
        return;
      }

      try {
        groupMetadata = await Rafael.groupMetadata(from);
        participants = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : [];
        groupAdmins = participants
          .filter((participant) => participant.admin)
          .flatMap((participant) => [participant.phoneNumber, participant.id, participant.jid, participant.lid])
          .map(normalizeJid)
          .filter(Boolean);
        isAdmin = groupAdmins.includes(normalizeJid(sender));
        isBotAdmin = groupAdmins.includes(normalizeJid(botNumber));
      } catch (error) {
        console.error("Gagal mengambil metadata grup:", error.message);
      }

      const moderation = await processGroupMessage({
        Rafael,
        m,
        body,
        isGroup,
        isAdmin,
        isBotAdmin,
        isCreator
      });
      if (moderation.blocked) return;
    }

    if (user?.banned && !isCreator) {
      return m.reply(`Akun kamu diblokir dari bot.${user.banReason ? `\nAlasan: ${user.banReason}` : ""}`);
    }

    context = {
      Rafael,
      m,
      command,
      rawCommand,
      args,
      text,
      prefix,
      usedPrefix,
      hasExplicitPrefix,
      isDirectCommand,
      body,
      budy,
      from,
      sender,
      pushname,
      isCmd,
      isGroup,
      isCreator,
      isMainOwner,
      isChildOwner,
      canUseOwnerCommand: (targetCommand = command) => canUseOwnerCommand({ isCreator, isMainOwner, isChildOwner, command: targetCommand }),
      isAdmin,
      isBotAdmin,
      participants,
      groupAdmins,
      groupMetadata,
      user,
      group,
      database,
      downloaderCache,
      taskQueue,
      pluginManager,
      mime,
      quoted,
      isMedia,
      isAllowed,
      botNumber,
      senderNumber,
      ownerJids,
      mainOwnerJids,
      childOwnerJids,
      time2: jakartaTime.format("HH:mm:ss"),
      ucapanWaktu,
      wib: jakartaTime.locale("id").format("HH:mm:ss z"),
      wita: moment().tz("Asia/Makassar").locale("id").format("HH:mm:ss z"),
      wit: moment().tz("Asia/Jayapura").locale("id").format("HH:mm:ss z"),
      salam2: jakartaTime.locale("id").format("a"),
      fVerif: createVerificationQuote(m.chat)
    };

    logCommand(context);

    if (await pluginManager.executeMessageHooks(context)) return;

    if (!isCmd || !command) {
      if (shouldSuggestWithoutPrefix(body, rawCommand)) {
        const suggestions = findCommandSuggestions(pluginManager, rawCommand, context, {
          minimum: 65,
          limit: 1
        });
        if (suggestions.length) {
          return m.reply(buildSuggestionMessage(rawCommand, suggestions, "."));
        }
      }
      return;
    }

    const plugin = pluginManager.get(command);
    if (!plugin) {
      const suggestions = findCommandSuggestions(pluginManager, command, context, {
        minimum: hasExplicitPrefix ? 35 : 65,
        limit: 3
      });
      if (suggestions.length) {
        return m.reply(buildSuggestionMessage(command, suggestions, prefix || "."));
      }
      return m.reply(`Command *${prefix || "."}${command}* tidak ditemukan.\nKetik *${prefix || "."}menu* atau *menu* untuk melihat daftar fitur.`);
    }

    if (!user?.registered && !canBypassRegistration(command, context)) {
      return m.reply([
        "Kamu belum terdaftar.",
        "",
        `Daftar dulu dengan format:`,
        `${prefix || "."}daftar nama,umur`,
        "",
        `Contoh: ${prefix || "."}daftar Rafael,18`
      ].join("\n"));
    }

    const denial = pluginManager.authorize(plugin, context);
    if (denial) return m.reply(denial);

    let policy = getCommandPolicy(command, plugin, Boolean(user?.premium), isCreator);
    if (!hasMinimumInput(plugin, context)) {
      policy = { ...policy, limit: 0, heavy: false, cooldown: 1000 };
    }

    const cooldown = cooldownManager.check(sender, command, policy.cooldown);
    if (!cooldown.ok) {
      return m.reply(`Tunggu ${(cooldown.remainingMs / 1000).toFixed(1)} detik sebelum menggunakan .${command} lagi.`);
    }

    const limitResult = database.consumeLimit(sender, policy.limit, pushname, isCreator);
    if (!limitResult.ok) {
      cooldownManager.clear(sender, command);
      return m.reply(`Limit harian kamu tidak cukup.\nSisa limit: ${limitResult.remaining}\nBiaya command: ${policy.limit}\nLimit akan direset setiap hari.`);
    }

    consumedLimit = policy.limit;
    database.recordCommand(sender, command, pushname);

    if (policy.heavy) {
      try {
        const ticket = taskQueue.enqueue({ userId: sender, label: command });
        if (ticket.position > taskQueue.concurrency) {
          await m.reply(`Permintaan masuk antrean. Posisi saat ini: ${ticket.position - taskQueue.concurrency}.`);
        }
        queueRelease = await ticket.wait;
      } catch (error) {
        if (consumedLimit > 0) database.refundLimit(sender, consumedLimit);
        consumedLimit = 0;
        cooldownManager.clear(sender, command);
        return m.reply(error.message || "Antrean bot sedang tidak tersedia.");
      }
    }

    await pluginManager.execute(command, context);
    const expResult = database.addExperience(sender, command, pushname);
    if (expResult?.levelUp) {
      await m.reply([
        `Level naik ke ${expResult.newLevel}.`,
        `EXP kamu sekarang: ${expResult.user.exp}/${expResult.nextLevelExp}`,
        `Bonus limit: +5`
      ].join("\n"));
    }
  } catch (error) {
    queueSucceeded = false;
    if (consumedLimit > 0 && context?.sender) database.refundLimit(context.sender, consumedLimit);
    if (context?.command && context?.sender) cooldownManager.clear(context.sender, context.command);
    await logFeatureError(error, context || { Rafael, m, command: "unknown" });
  } finally {
    if (typeof queueRelease === "function") queueRelease(queueSucceeded);
  }
};
