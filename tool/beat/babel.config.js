// Expo's babel preset. This preset wires up expo-router
// automatically, so no extra router plugin is needed. The
// `@/` path alias is resolved by Metro from tsconfig.json
// `paths`, not by babel.

module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
  }
}
