const util = require("util");
const { exec } = require("child_process");

module.exports = {
  name: "owner-console",
  category: "owner",
  commands: [],
  async onMessage(ctx) {
    if (process.env.ENABLE_OWNER_CONSOLE !== "true") return false;
    const { budy, isCreator, m } = ctx;
    if (!isCreator || typeof budy !== "string") return false;

    if (budy.startsWith("$")) {
      const shellCommand = budy.slice(1).trim();
      if (!shellCommand) {
        await m.reply("Masukkan command shell setelah tanda $.");
        return true;
      }

      await new Promise((resolve) => {
        exec(
          shellCommand,
          { timeout: 120_000, maxBuffer: 5 * 1024 * 1024 },
          async (error, stdout, stderr) => {
            try {
              if (error) await m.reply(String(error));
              else {
                const output = [stdout, stderr].filter(Boolean).join("\n").trim();
                await m.reply(output || "Command selesai tanpa output.");
              }
            } finally {
              resolve();
            }
          }
        );
      });
      return true;
    }

    if (budy.startsWith(">")) {
      const evalCode = budy.slice(1).trim();
      if (!evalCode) {
        await m.reply("Masukkan kode JavaScript setelah tanda >.");
        return true;
      }

      try {
        const executor = new Function(
          "ctx",
          "require",
          "module",
          "exports",
          `return (async () => { with (ctx) { return await eval(${JSON.stringify(evalCode)}); } })();`
        );
        let evaluated = await executor(ctx, require, module, exports);
        if (typeof evaluated !== "string") evaluated = util.inspect(evaluated, { depth: 3 });
        await m.reply(evaluated);
      } catch (error) {
        await m.reply(String(error));
      }
      return true;
    }

    return false;
  }
};
