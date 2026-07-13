// Expo varsayılan Babel yapılandırması
module.exports = function (api) {
  api.cache(true);
  return { presets: ["babel-preset-expo"] };
};
