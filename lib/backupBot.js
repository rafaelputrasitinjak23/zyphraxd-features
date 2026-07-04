const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DEFAULT_IGNORED = new Set([
  "node_modules",
  "session",
  "sessions",
  "jadibot-sessions",
  "tmp",
  "temp",
  "cache",
  "logs",
  "backup",
  "backups",
  ".git",
  ".github",
  ".env"
]);

let archiverModulePromise = null;

async function loadArchiverModule() {
  if (archiverModulePromise) {
    return archiverModulePromise;
  }

  archiverModulePromise = (async () => {
    try {
      return require("archiver");
    } catch (error) {
      if (
        error.code === "ERR_REQUIRE_ESM" ||
        error.code === "ERR_REQUIRE_ASYNC_MODULE"
      ) {
        return import("archiver");
      }

      throw error;
    }
  })();

  return archiverModulePromise;
}

async function createZipInstance(options = {}) {
  const archiverModule = await loadArchiverModule();

  if (typeof archiverModule === "function") {
    return archiverModule("zip", options);
  }

  if (typeof archiverModule.default === "function") {
    return archiverModule.default("zip", options);
  }

  if (typeof archiverModule.ZipArchive === "function") {
    return new archiverModule.ZipArchive(options);
  }

  if (
    archiverModule.default &&
    typeof archiverModule.default.ZipArchive === "function"
  ) {
    return new archiverModule.default.ZipArchive(options);
  }

  throw new TypeError(
    "Format export package archiver tidak dikenali. Coba install ulang package archiver."
  );
}

function normalizeIgnoredItems(additionalIgnored = []) {
  return new Set([
    ...DEFAULT_IGNORED,
    ...additionalIgnored.map(item =>
      String(item).trim().toLowerCase()
    )
  ]);
}

function isIgnored(name, ignoredItems) {
  const normalizedName = String(name || "").toLowerCase();

  if (!normalizedName) return true;

  // Jangan pernah sertakan file/folder tersembunyi, session, env, atau cache runtime.
  if (name.startsWith(".")) return true;
  if (ignoredItems.has(normalizedName)) return true;
  if (/^(creds|session-|sender-key-|app-state-sync|pre-key-|sender-key-memory)/i.test(name)) return true;
  if (/\.(tmp|temp|log|bak)$/i.test(name)) return true;

  return false;
}

async function collectFiles(
  rootDirectory,
  additionalIgnored = []
) {
  const files = [];
  const ignoredItems = normalizeIgnoredItems(
    additionalIgnored
  );

  async function scan(currentDirectory) {
    let entries;

    try {
      entries = await fsp.readdir(currentDirectory, {
        withFileTypes: true
      });
    } catch (error) {
      if (
        error.code === "EACCES" ||
        error.code === "EPERM" ||
        error.code === "ENOENT"
      ) {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      if (isIgnored(entry.name, ignoredItems)) {
        continue;
      }

      const fullPath = path.join(
        currentDirectory,
        entry.name
      );

      const relativePath = path
        .relative(rootDirectory, fullPath)
        .split(path.sep)
        .join("/");

      let stat;

      try {
        stat = await fsp.lstat(fullPath);
      } catch (error) {
        if (
          error.code === "EACCES" ||
          error.code === "EPERM" ||
          error.code === "ENOENT"
        ) {
          continue;
        }

        throw error;
      }

      if (stat.isSymbolicLink()) {
        continue;
      }

      if (stat.isDirectory()) {
        await scan(fullPath);
        continue;
      }

      if (stat.isFile()) {
        files.push({
          fullPath,
          relativePath,
          size: stat.size
        });
      }
    }
  }

  await scan(rootDirectory);

  return files;
}

async function createArchive(files, outputPath) {
  const archive = await createZipInstance({
    zlib: {
      level: 9
    }
  });

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    let finished = false;

    function rejectOnce(error) {
      if (finished) {
        return;
      }

      finished = true;

      try {
        output.destroy();
      } catch {}

      reject(error);
    }

    output.on("close", () => {
      if (finished) {
        return;
      }

      finished = true;
      resolve();
    });

    output.on("error", rejectOnce);
    archive.on("error", rejectOnce);

    archive.on("warning", error => {
      if (error.code !== "ENOENT") {
        rejectOnce(error);
      }
    });

    archive.pipe(output);

    for (const file of files) {
      archive.file(file.fullPath, {
        name: file.relativePath
      });
    }

    Promise.resolve(archive.finalize()).catch(
      rejectOnce
    );
  });
}

function createTimestamp() {
  const date = new Date();

  const year = date.getFullYear();
  const month = String(
    date.getMonth() + 1
  ).padStart(2, "0");
  const day = String(date.getDate()).padStart(
    2,
    "0"
  );
  const hours = String(date.getHours()).padStart(
    2,
    "0"
  );
  const minutes = String(
    date.getMinutes()
  ).padStart(2, "0");
  const seconds = String(
    date.getSeconds()
  ).padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function sanitizeBotName(botName) {
  const sanitized = String(botName || "WhatsApp-Bot")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized || "WhatsApp-Bot";
}

async function createBotBackup(options = {}) {
  const rootDirectory = path.resolve(
    options.rootDirectory || process.cwd()
  );

  const botName = sanitizeBotName(
    options.botName
  );

  const additionalIgnored = Array.isArray(
    options.additionalIgnored
  )
    ? options.additionalIgnored
    : [];

  const timestamp = createTimestamp();
  const randomId = crypto
    .randomBytes(4)
    .toString("hex");

  const fileName = `${botName}-${timestamp}.zip`;

  const outputDirectory = options.outputDirectory
    ? path.resolve(options.outputDirectory)
    : os.tmpdir();

  await fsp.mkdir(outputDirectory, { recursive: true });

  const outputPath = path.join(
    outputDirectory,
    options.outputDirectory
      ? fileName
      : `${botName}-${timestamp}-${randomId}.zip`
  );

  const files = await collectFiles(
    rootDirectory,
    additionalIgnored
  );

  if (files.length === 0) {
    throw new Error(
      "Tidak ada file yang dapat dimasukkan ke dalam ZIP."
    );
  }

  await createArchive(files, outputPath);

  const archiveStat = await fsp.stat(outputPath);

  const originalSize = files.reduce(
    (total, file) => total + file.size,
    0
  );

  return {
    outputPath,
    fileName,
    totalFiles: files.length,
    size: archiveStat.size,
    originalSize
  };
}

async function deleteBotBackup(filePath) {
  if (!filePath) {
    return;
  }

  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

module.exports = {
  createBotBackup,
  deleteBotBackup
};