const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Crypto polyfill for React Native compatibility
config.resolver.alias = {
  'crypto': 'react-native-get-random-values',
};

// Ensure platform extensions are properly resolved
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

// Fix for react-async-hook dependency issue
// The package.json incorrectly points to "module": "react-async-hook.esm.js"
// but the file is actually at "dist/react-async-hook.esm.js"
// We configure Metro to prefer the "main" field over "module" field
config.resolver.resolverMainFields = ['react-native', 'browser', 'main'];

module.exports = config;