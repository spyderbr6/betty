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

## Claude Workflow Instructions

### Solution Proposal Process
When given a task or request, Claude should:

1. **Analyze & Plan**: First understand the full scope of the request and break it down into logical steps
2. **Propose Solution**: Present a clear, numbered plan of what will be done, including:
   - What files will be modified/created
   - What changes will be made to each file
   - Any potential risks or considerations
   - Expected outcome
3. **Wait for Approval**: Always wait for explicit user approval before proceeding with implementation
4. **Implement Step-by-Step**: Execute each step methodically, explaining what's being done
5. **Verify Results**: Test and verify the implementation works as expected

### Communication Style
- **Be Explicit**: Always explain what you're going to do before doing it
- **Show Context**: When making changes, show the relevant code sections being modified
- **Ask Before Major Changes**: Never make significant architectural decisions without discussion
- **Provide Options**: When multiple approaches are possible, present options with pros/cons
- **Use Todo Lists**: For complex multi-step tasks, use the TodoWrite tool to track progress

### Progress Reporting Guidelines
- **Long-running processes**: For builds, installs, or compilation that take >30 seconds, start the process and only report key milestones (start, major progress points, completion)
- **Avoid excessive monitoring**: Don't provide real-time updates for every build task or command output line
- **Background processes**: Run long processes in background and check periodically, not continuously
- **Key milestones only**: Report when processes begin, encounter errors, reach major checkpoints, or complete
- **Quiet work**: Work silently on routine tasks unless there are issues or completion notifications needed

### When to Pause for Approval
- Any file creation or deletion
- Significant code refactoring
- Dependency changes (package.json, etc.)
- Configuration changes (app.json, metro.config.js, etc.)
- Database schema or API changes
- Build or deployment related changes

### Implementation Guidelines
- Always read existing code first to understand patterns and conventions
- Maintain consistent code style with the existing codebase
- Test changes immediately after implementation when possible
- Explain any trade-offs or limitations of the chosen approach