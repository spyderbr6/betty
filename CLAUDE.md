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

## SideBet Design System Architecture

### Design System Overview
The app uses a comprehensive design system located in `src/styles/` that provides consistent styling across all platforms. **ALWAYS use design system tokens instead of hardcoded values.**

### Core Design Tokens
```typescript
import { colors, typography, spacing, shadows, textStyles, commonStyles } from '../styles';
```

#### Colors (`colors.*`)
- **Surface Colors**: `colors.background`, `colors.surface`, `colors.surfaceLight`
- **Text Colors**: `colors.textPrimary`, `colors.textSecondary`, `colors.textMuted`, `colors.textInverse`
- **Semantic Colors**: `colors.primary`, `colors.secondary`, `colors.success`, `colors.error`, `colors.warning`
- **Betting Colors**: `colors.live`, `colors.active`, `colors.pending`
- **UI Colors**: `colors.border`, `colors.divider`

#### Typography (`typography.*` and `textStyles.*`)
- **Font Scales**: `typography.fontSize.*` (xs, sm, base, lg, xl, 2xl, 3xl, 4xl)
- **Font Weights**: `typography.fontWeight.*` (normal, medium, semibold, bold, black)
- **Font Families**: `typography.fontFamily.*` (regular, bold, mono)
- **Pre-built Text Styles**: `textStyles.*` (h1-h4, body, bodySmall, caption, label, button, odds, amount, balance, pot, status)

#### Spacing (`spacing.*`)
- **Base Spacing**: `spacing.xs`, `spacing.sm`, `spacing.md`, `spacing.lg`, `spacing.xl`
- **Specialized Spacing**: `spacing.betting.*`, `spacing.card.*`, `spacing.button.*`, `spacing.padding.*`
- **Border Radius**: `spacing.radius.*` (xs, sm, md, lg, xl)

#### Shadows (`shadows.*`)
- **Component Shadows**: `shadows.card`, `shadows.betCard`, `shadows.liveBetCard`
- **Interactive Shadows**: `shadows.button`, `shadows.buttonPressed`
- **Layout Shadows**: `shadows.header`, `shadows.tabBar`

### Pre-built Component Styles (`commonStyles.*`)
**CRITICAL: Use these predefined patterns instead of creating custom styles**

#### Layout Patterns
```typescript
commonStyles.flexCenter       // Centered flex layout
commonStyles.flexBetween     // Space-between flex layout
commonStyles.backgroundCard  // Standard card background
commonStyles.border         // Standard border styling
```

#### Betting Components
```typescript
commonStyles.betCard         // Standard bet card layout
commonStyles.liveBetCard     // Live bet card with accent border
commonStyles.statusBadge     // Status indicator styling
```

#### Interactive Elements
```typescript
commonStyles.primaryButton   // Primary button styling
commonStyles.secondaryButton // Secondary button styling
commonStyles.textInput       // Standard text input styling
```

#### Navigation & Layout
```typescript
commonStyles.header          // Header component styling
commonStyles.tabBar          // Tab bar styling
commonStyles.screenContainer // Full screen container
commonStyles.safeArea        // Safe area container
```

### Design System Enforcement Rules

#### ✅ ALWAYS DO:
```typescript
// Use design system tokens
fontSize: typography.fontSize.base,
color: colors.textPrimary,
marginBottom: spacing.sm,
...textStyles.h4,
...commonStyles.betCard,
```

#### ❌ NEVER DO:
```typescript
// Hardcoded values
fontSize: 16,                    // Use typography.fontSize.base
color: '#333333',               // Use colors.textPrimary
marginBottom: 2,                // Use spacing.xs
fontWeight: '600',              // Use typography.fontWeight.semibold
fontFamily: 'System',           // Use typography.fontFamily.regular
gap: spacing.sm,                // NOT supported in React Native
paddingVertical: 2,             // Use spacing.xs/2 or similar
```

#### Component Development Pattern:
```typescript
const styles = StyleSheet.create({
  container: {
    ...commonStyles.betCard,        // Start with predefined pattern
    // Only add specific overrides if absolutely necessary
  },
  title: {
    ...textStyles.h4,              // Use predefined text style
    color: colors.textPrimary,     // Use semantic colors
    marginBottom: spacing.xs,      // Use spacing scale
  },
});
```

### Platform Consistency Guidelines
- **Typography**: Use `textStyles.*` patterns for consistent font rendering across iOS/Android
- **Android Typography**: Add `includeFontPadding: false` to small text styles for tighter rendering
- **Spacing**: Use `spacing.*` scale to ensure proper touch targets and visual hierarchy
- **Layout**: NEVER use `gap` property - use margins on child elements instead
- **Text Inputs**: Always include `textAlignVertical: 'center'` for Android alignment
- **Colors**: Use semantic color names (`colors.textPrimary`) not hex values for theme consistency
- **Shadows**: Use `shadows.*` patterns for proper elevation on both platforms

### Design System Validation
Before any component work:
1. Check if `commonStyles.*` has a matching pattern
2. Use `textStyles.*` for all typography needs
3. Verify all colors exist in `colors.*`
4. Confirm spacing values exist in `spacing.*`
5. Never hardcode numeric values for fonts, colors, or spacing

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
- **Use Todo Lists**: For complex multi-step tasks, use the Todo.md file to track changes and progress towards future changes

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

## Comprehensive Error Detection Process

When encountering ANY errors, compilation failures, or build issues, **ALWAYS** follow this systematic debugging process:

### 1. Comprehensive TypeScript Check
```
- Run `mcp__ide__getDiagnostics` IMMEDIATELY for ALL scenarios:
  - Before starting any task
  - After making any code changes
  - When encountering runtime errors
  - JavaScript bundle loading errors
  - AppRegistryBinding failures
  - Build/compilation issues
  - Runtime crashes
  - Property access errors (like 'buttonPressed' does not exist)
- Fix ALL TypeScript errors AND warnings before proceeding
- Never assume TypeScript compilation is clean without verification
- Run diagnostics on ALL files, not just current working files
```

### 2. Build Error Monitoring
```
- Monitor ALL active background bash processes with BashOutput
- Check for compilation errors in Metro bundler output
- Look for runtime errors in build logs
- Check for property access errors in bundle compilation
- Verify all imported modules/properties exist in their respective files
```

### 3. Design System Consistency Check
```
- When using design tokens (colors, typography, shadows, spacing):
  - Verify the property exists in the design system file
  - Check for typos in property names (e.g., 'buttonPressed' vs 'button')
  - Ensure all referenced design tokens are exported properly
- Common design system files to verify:
  - src/styles/colors.ts
  - src/styles/typography.ts  
  - src/styles/shadows.ts
  - src/styles/spacing.ts
```

### 4. Dependency Compatibility Check
```
- Check React/React Native version compatibility
- Verify all dependencies support current framework versions
- Look for peer dependency warnings in npm/yarn output
```

### 5. Configuration Issues Check
```
- Verify app.json/expo configuration
- Check metro.config.js for resolver issues
- Ensure JavaScript engine (Hermes vs JSC) matches framework requirements
```

### 6. Native Module Integration Check
```
- Verify react-native-gesture-handler imports
- Check SafeAreaProvider setup
- Ensure all native dependencies are properly installed
```

### CRITICAL RULES for Error Prevention:
1. **Always run `mcp__ide__getDiagnostics` BEFORE and AFTER every change**
2. **Never assume design system properties exist - always verify**
3. **Check ALL build outputs with BashOutput for hidden errors**
4. **Test every property access against the actual exported object**
5. **Never skip error checking even for "simple" changes**

### Tools to Use Proactively (EVERY TIME):
- `mcp__ide__getDiagnostics` - Check for ALL compilation errors/warnings
- `BashOutput` - Monitor ALL background build processes for errors
- `Read` - Verify design system files contain referenced properties
- `npm run android` - Test builds end-to-end  
- `Bash` with build commands - Verify configuration changes

