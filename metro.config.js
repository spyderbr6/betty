const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Crypto polyfill for React Native compatibility
// Fix for react-async-hook dependency issue - redirect to working file
config.resolver.alias = {
  'crypto': 'react-native-get-random-values',
  'react-async-hook': path.resolve(__dirname, 'node_modules/react-async-hook/dist/index.js'),
};

// Ensure platform extensions are properly resolved
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

module.exports = config;