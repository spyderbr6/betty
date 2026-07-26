const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Crypto polyfill for React Native compatibility
config.resolver.alias = {
  'crypto': 'react-native-get-random-values',
};

// Ensure platform extensions are properly resolved
config.resolver.platforms = ['native', 'android', 'ios', 'web'];

// Redirect @stripe/stripe-react-native to a web stub on web builds.
// The native SDK imports codegen native modules that Metro cannot bundle for web.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
    return {
      filePath: path.resolve(__dirname, 'src/mocks/stripe-react-native.web.tsx'),
      type: 'sourceFile',
    };
  }
  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;