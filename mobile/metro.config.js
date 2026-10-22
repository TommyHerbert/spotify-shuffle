const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../shared");

const config = getDefaultConfig(projectRoot);
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

module.exports = config;
