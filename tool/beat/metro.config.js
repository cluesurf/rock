// Metro config.
//
// beat is a self-contained pnpm project (see
// pnpm-workspace.yaml) with its own node_modules holding a
// single React. The default Expo config resolves from the
// nearest node_modules (beat's), so no resolver overrides
// are needed.

const { getDefaultConfig } = require('expo/metro-config')

module.exports = getDefaultConfig(__dirname)
