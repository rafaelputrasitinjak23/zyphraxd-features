const fs = require("fs");
const path = require("path");
const { canUseOwnerCommand } = require("./ownerAccess");
const { packagePath } = require("./paths");

class PluginManager {
  constructor(directory = process.env.ZYPHRA_PLUGIN_DIR || packagePath("plugins")) {
    this.directory = directory;
    this.commands = new Map();
    this.plugins = [];
    this.messageHooks = [];
    this.errors = [];
    this.load();
  }

  walk(directory) {
    if (!fs.existsSync(directory)) return [];
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...this.walk(fullPath));
      else if (entry.isFile() && entry.name.endsWith(".js")) files.push(fullPath);
    }
    return files.sort((a, b) => a.localeCompare(b));
  }

  normalizePlugin(plugin, file) {
    if (!plugin || typeof plugin !== "object") {
      throw new Error("Plugin harus mengekspor object.");
    }

    const commands = (Array.isArray(plugin.commands)
      ? plugin.commands
      : [plugin.command || plugin.name])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);

    const hasRun = typeof plugin.run === "function";
    const hasMessageHook = typeof plugin.onMessage === "function";

    if (!hasRun && !hasMessageHook) {
      throw new Error("Plugin harus memiliki fungsi run atau onMessage.");
    }
    if (hasRun && !commands.length) {
      throw new Error("Plugin command tidak memiliki nama command.");
    }

    return {
      ...plugin,
      name: plugin.name || commands[0] || path.basename(file, ".js"),
      commands: [...new Set(commands)],
      category: plugin.category || "other",
      file
    };
  }

  load() {
    this.commands.clear();
    this.plugins = [];
    this.messageHooks = [];
    this.errors = [];
    fs.mkdirSync(this.directory, { recursive: true });

    for (const file of this.walk(this.directory)) {
      try {
        delete require.cache[require.resolve(file)];
        const plugin = this.normalizePlugin(require(file), file);

        for (const command of plugin.commands) {
          if (this.commands.has(command)) {
            const existing = this.commands.get(command);
            throw new Error(`Command .${command} duplikat dengan ${existing.file}`);
          }
        }

        this.plugins.push(plugin);
        if (typeof plugin.onMessage === "function") this.messageHooks.push(plugin);
        for (const command of plugin.commands) this.commands.set(command, plugin);
      } catch (error) {
        this.errors.push({ file, error: error.message });
        console.error(`[PLUGIN] Gagal memuat ${path.relative(this.directory, file)}:`, error.message);
      }
    }

    return this.summary();
  }

  reload() {
    return this.load();
  }

  get(command) {
    return this.commands.get(String(command || "").toLowerCase()) || null;
  }

  has(command) {
    return this.commands.has(String(command || "").toLowerCase());
  }

  authorize(plugin, context) {
    if (plugin.owner && !canUseOwnerCommand(context)) {
      return context.isChildOwner
        ? "Owner jadibot hanya boleh memakai command tertentu. Command owner ini tidak diizinkan."
        : "Command ini hanya dapat digunakan oleh owner bot.";
    }
    if (plugin.group && !context.isGroup) return "Command ini hanya dapat digunakan di dalam grup.";
    if (plugin.private && context.isGroup) return "Command ini hanya dapat digunakan di private chat.";
    if (plugin.admin && !context.isAdmin && !context.isCreator) return "Command ini hanya dapat digunakan admin grup.";
    if (plugin.botAdmin && !context.isBotAdmin) return "Bot harus menjadi admin grup untuk menjalankan command ini.";
    if (plugin.premium && !context.user?.premium && !context.isCreator) return "Command ini hanya tersedia untuk pengguna premium.";
    return null;
  }

  async execute(command, context) {
    const plugin = this.get(command);
    if (!plugin) return false;
    const denial = this.authorize(plugin, context);
    if (denial) {
      await context.m.reply(denial);
      return true;
    }
    try {
      await plugin.run({ ...context, plugin });
      return true;
    } catch (error) {
      error.pluginName = plugin.name;
      throw error;
    }
  }

  async executeMessageHooks(context) {
    for (const plugin of this.messageHooks) {
      try {
        const handled = await plugin.onMessage({ ...context, plugin });
        if (handled === true) return true;
      } catch (error) {
        error.pluginName = plugin.name;
        throw error;
      }
    }
    return false;
  }

  summary() {
    return {
      plugins: this.plugins.length,
      commands: this.commands.size,
      hooks: this.messageHooks.length,
      errors: this.errors.length,
      errorList: [...this.errors]
    };
  }
}

module.exports = new PluginManager();
module.exports.PluginManager = PluginManager;
