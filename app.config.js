// MapMeet — dynamic Expo config.
//
// The static values live in app.base.json — deliberately NOT named
// app.json, because Expo would then treat it as a second config source
// and `expo-doctor` flags the ambiguity. This file is the only config.
//
// It exists for one reason: `experiments.baseUrl`.
//
// baseUrl tells the web export that the site is served from a subpath —
// GitHub Pages publishes us at hamuud.github.io/mapmeet, so every asset
// URL needs the /mapmeet prefix. It is meaningless on iOS and Android,
// but Expo applies it to the native asset copy anyway: the bundler tries
// to write into `MapMeet.app/mapmeet/assets/node_modules/…` and the
// archive dies with ENOTDIR at the very last build step, after
// everything has already compiled.
//
// So: set it only when we are actually exporting for the web. The
// `build:web` script sets EXPO_WEB_BUILD=1; nothing else does, which
// means `eas build` and `expo start` get a config with no baseUrl at all.

const base = require('./app.base.json');

/** Subpath GitHub Pages serves the web build from. Must match the repo
 *  name, and the `/mapmeet` check in services/auth.service.ts. */
const WEB_BASE_URL = '/mapmeet';

module.exports = () => {
  const config = { ...base.expo };
  const forWeb = process.env.EXPO_WEB_BUILD === '1';

  config.experiments = { ...config.experiments };
  if (forWeb) {
    config.experiments.baseUrl = WEB_BASE_URL;
  } else {
    delete config.experiments.baseUrl;
  }

  return config;
};
