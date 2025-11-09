const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Crypto polyfill for React Native compatibility
config.resolver.alias = {
  'crypto': 'react-native-get-random-values',
};

// Ensure platform extensions are properly resolved
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

// Fix for react-async-hook dependency issue
// The package.json points to a non-existent ESM file, so we redirect to the CJS build
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-async-hook') {
    return {
      filePath: path.resolve(
        __dirname,
        'node_modules/react-async-hook/dist/react-async-hook.cjs.js'
      ),
      type: 'sourceFile',
    };
  }

  // Default resolution
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;