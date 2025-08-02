# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Betty React Native app.

## Common Commands

- **Development**: `npm start` - Start Expo development server
- **Android**: `npm run android` - Run on Android device/emulator
- **iOS**: `npm run ios` - Run on iOS device/simulator
- **Web**: `npm run web` - Run in web browser (for testing)

## Architecture Overview

This is the Betty app built with React Native + Expo for Android and iOS deployment, using AWS Amplify for backend services.

### Project Structure
- **App.tsx** - Main entry point with Amplify configuration and AuthProvider
- **src/MainApp.tsx** - Main app component with authentication routing and Todo functionality
- **src/contexts/AuthContext.tsx** - Authentication context provider managing user state
- **src/hooks/useAuth.ts** - Custom hook for accessing authentication context  
- **src/components/Login.tsx** - Native login form using React Native components
- **src/components/SignUp.tsx** - Native signup form with email confirmation flow

### Authentication System
- **Custom Native UI**: Uses React Native components (TextInput, TouchableOpacity, etc.)
- **AWS Cognito**: Uses AWS Cognito for secure authentication
- **Native UX**: Uses Alert.alert() for error messages and Alert.prompt() for todo creation
- **Loading States**: Native ActivityIndicator components
- **Form Validation**: Native keyboard types and input validation

### Backend Integration  
- **AWS Amplify Gen2**: Modern serverless backend with GraphQL API
- **Real-time Data**: GraphQL subscriptions with `observeQuery()` for live todo updates
- **DynamoDB**: NoSQL database for todo storage
- **Mobile Optimizations**: Uses `@aws-amplify/react-native` for native performance

### Native Features
- **Platform-specific Styling**: Uses StyleSheet for native performance
- **Touch Interactions**: TouchableOpacity for button interactions  
- **Native Navigation**: Ready for React Navigation if needed
- **Keyboard Handling**: Proper keyboard types for email/password inputs
- **Native Alerts**: Platform-appropriate alert dialogs

### Development Notes
- **Hot Reload**: Expo provides fast refresh during development
- **Platform Testing**: Test on both iOS and Android simulators/devices
- **Backend Sync**: Any changes to Amplify backend automatically sync to mobile app
- **Deployment**: Ready for Android Play Store and iOS App Store submission

### Key Differences from Web Version
- **Components**: React Native components instead of HTML elements
- **Styling**: StyleSheet instead of CSS
- **User Interaction**: TouchableOpacity instead of button clicks
- **Text Input**: TextInput with native keyboard support
- **Lists**: FlatList for performant todo list rendering
- **Alerts**: Native Alert API instead of web alerts

### Android Deployment Preparation
- Expo handles most Android configuration automatically
- APK/AAB generation ready through Expo Application Services (EAS)
- Native app store optimization built-in