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
// The package.json incorrectly points to "module": "react-async-hook.esm.js"
// but the file is actually at "dist/react-async-hook.esm.js"
// We override the module resolution to point to the correct file
const defaultResolver = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'react-async-hook') {
    // Point directly to the working dist/index.js file
    return context.resolveRequest(
      context,
      path.join(moduleName, 'dist', 'index.js'),
      platform
    );
  }

  // Use default resolver for all other modules
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;