const path = require("path")

module.exports = {
  presets: [
    path.join(
      process.env.HOME || "",
      "Library/Application Support/TakeCare/mobile-expo-deps/node_modules/@react-native/babel-preset"
    ),
  ],
}
