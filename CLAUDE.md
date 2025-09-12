# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the SideBet React Native app.

## Common Commands

- **Development**: `npm start` - Start Expo development server
- **Android**: `npm run android` - Run on Android device/emulator
- **iOS**: `npm run ios` - Run on iOS device/simulator
- **Web**: `npm run web` - Run in web browser (for testing)

## Architecture Overview

This is the SideBet app - a professional peer-to-peer betting platform built with React Native + Expo for Android and iOS deployment, using AWS Amplify Gen2 for backend services.

### Project Structure
- **App.tsx** - Main entry point with Amplify configuration and AuthProvider
- **src/MainApp.tsx** - Main app component with authentication routing and betting functionality
- **src/contexts/AuthContext.tsx** - Authentication context provider managing user state
- **src/hooks/useAuth.ts** - Custom hook for accessing authentication context  
- **src/components/Login.tsx** - Native login form using React Native components
- **src/components/SignUp.tsx** - Native signup form with email confirmation flow

### Authentication System
- **Custom Native UI**: Uses React Native components (TextInput, TouchableOpacity, etc.)
- **AWS Cognito**: Uses AWS Cognito for secure authentication
- **Native UX**: Uses Alert.alert() for error messages and native modals for bet creation
- **Loading States**: Native ActivityIndicator components
- **Form Validation**: Native keyboard types and input validation

### Backend Integration  
- **AWS Amplify Gen2**: Modern serverless backend with GraphQL API
- **Real-time Data**: GraphQL subscriptions with `observeQuery()` for live betting updates
- **DynamoDB**: NoSQL database for betting data, user profiles, and transactions
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
- **Lists**: FlatList for performant bet list rendering
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

## Systematic Debugging Process

When encountering runtime errors, compilation failures, or build issues, **ALWAYS** follow this systematic debugging process:

### 1. First Check: TypeScript Diagnostics
```
- Run `mcp__ide__getDiagnostics` IMMEDIATELY when encountering:
  - JavaScript bundle loading errors
  - AppRegistryBinding failures
  - Build/compilation issues
  - Runtime crashes
- Fix ALL TypeScript errors before proceeding with other debugging
- Never assume TypeScript compilation is clean without verification
```

### 2. Second Check: Dependency Compatibility  
```
- Check React/React Native version compatibility
- Verify all dependencies support current framework versions
- Look for peer dependency warnings in npm/yarn output
```

### 3. Third Check: Configuration Issues
```
- Verify app.json/expo configuration
- Check metro.config.js for resolver issues
- Ensure JavaScript engine (Hermes vs JSC) matches framework requirements
```

### 4. Fourth Check: Native Module Integration
```
- Verify react-native-gesture-handler imports
- Check SafeAreaProvider setup
- Ensure all native dependencies are properly installed
```

### Critical Rule: TypeScript First
**Never debug runtime errors without first running TypeScript diagnostics.** Compilation errors often manifest as confusing runtime failures like AppRegistryBinding errors, bundle loading failures, or mysterious crashes.

### Tools to Use Proactively
- `mcp__ide__getDiagnostics` - Check for compilation errors
- `npm run android` - Test builds end-to-end  
- `Bash` with build commands - Verify configuration changes
- `Read` - Examine error-prone files (App.tsx, navigation, etc.)

### Track your last few tasks in a file in case our sessions gets interrupted. 
claudelog.md

