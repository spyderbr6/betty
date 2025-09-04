const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Crypto polyfill for React Native compatibility
config.resolver.alias = {
  'crypto': 'react-native-get-random-values',
};

// Ensure platform extensions are properly resolved
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

module.exports = config;