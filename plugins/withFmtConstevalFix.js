/* eslint-disable @typescript-eslint/no-var-requires */
const { withPodfile } = require('expo/config-plugins');

/**
 * Xcode 26 ships Apple Clang 21, which enforces C++20 `consteval` strictly:
 * a consteval call site must itself be a constant expression. fmt turns on
 * `FMT_USE_CONSTEVAL` for any Apple clang >= 14, and the `FMT_STRING(...)`
 * uses inside its own `format-inl.h` are not constant expressions — so every
 * one of them is now a hard error:
 *
 *   call to consteval function 'fmt::basic_format_string<...>' is not a
 *   constant expression
 *
 * React Native 0.76 vendors fmt 11.0.2, which predates the upstream fix, and
 * we cannot bump it without moving React Native itself. Turning the flag off
 * makes fmt validate format strings at runtime instead of at compile time —
 * the same checks, later. Nothing in the app calls fmt directly; it is a
 * transitive dependency of RCT-Folly.
 *
 * REMOVE THIS when React Native ships a fmt that builds under Apple Clang 21:
 * check `node_modules/react-native/third-party-podspecs/fmt.podspec` after an
 * upgrade, and if the version has moved past 11.0.2, try a build without it.
 */
const MARKER = 'fmt-consteval-fix';

const SNIPPET = `
    # ${MARKER} — see plugins/withFmtConstevalFix.js
    fmt_base_h = File.join(installer.sandbox.root, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      fmt_source = File.read(fmt_base_h)
      fmt_patched = fmt_source.gsub(/^(\\s*#\\s*define\\s+FMT_USE_CONSTEVAL\\s+)1\\s*$/, '\\\\10')
      if fmt_patched != fmt_source
        File.write(fmt_base_h, fmt_patched)
        Pod::UI.puts '[${MARKER}] FMT_USE_CONSTEVAL disabled for Apple Clang 21'
      end
    end
`;

module.exports = function withFmtConstevalFix(config) {
  return withPodfile(config, (cfg) => {
    const contents = cfg.modResults.contents;

    // Idempotent: prebuild can run repeatedly against an existing Podfile.
    if (contents.includes(MARKER)) return cfg;

    const anchor = /post_install do \|installer\|\n/;
    if (!anchor.test(contents)) {
      // Fail at prebuild rather than 20 minutes into an EAS build with the
      // same fmt errors and no clue why the plugin did nothing.
      throw new Error(
        '[withFmtConstevalFix] no `post_install do |installer|` block in the ' +
          'Podfile — the Expo template changed, so this plugin needs updating.',
      );
    }

    cfg.modResults.contents = contents.replace(anchor, (m) => m + SNIPPET);
    return cfg;
  });
};
