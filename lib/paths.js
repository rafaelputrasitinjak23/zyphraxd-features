const path = require("path");

function getRuntimeRoot() {
  return path.resolve(process.env.ZYPHRA_ROOT_DIR || process.cwd());
}

function runtimePath(...segments) {
  return path.join(getRuntimeRoot(), ...segments);
}

function packageRoot() {
  return path.resolve(__dirname, "..");
}

function packagePath(...segments) {
  return path.join(packageRoot(), ...segments);
}

module.exports = {
  getRuntimeRoot,
  runtimePath,
  packageRoot,
  packagePath
};
