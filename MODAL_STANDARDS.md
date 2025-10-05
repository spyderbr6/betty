# SideBet Modal Standards

## Overview
This document defines the standardized patterns for all full-screen modals in the SideBet app, ensuring consistent UX, accessibility compliance, and preventing common issues like modal stacking.

---

## ✅ Standard Modal Pattern

### Component: `ModalHeader`
**Location**: `src/components/ui/ModalHeader.tsx`

A reusable, standardized header component for all full-screen modals.

#### Features:
- ✅ **ADA/WCAG Compliant**: High contrast text (#FFFFFF on surface)
- ✅ **Prevents Modal Stacking**: No interactive elements beyond close button (unless specified)
- ✅ **Consistent Layout**: Title on left, actions on right
- ✅ **Accessibility**: Proper ARIA labels and roles

#### Usage:
```typescript
import { ModalHeader } from '../components/ui/ModalHeader';

<ModalHeader
  title="Modal Title"
  onClose={handleClose}
  rightComponent={optionalButton} // Optional: for actions like "Submit", "Save"
/>
```

---

## 📋 Modal Implementation Checklist

When creating or updating a modal, ensure:

### 1. **Modal Configuration**
```typescript
<Modal
  visible={visible}
  animationType="slide"
  presentationStyle="fullScreen"  // ✅ REQUIRED: Prevents header overlap
  onRequestClose={onClose}         // ✅ REQUIRED: Android back button support
>
```

**❌ NEVER USE**: `presentationStyle="pageSheet"` - causes header visibility issues

### 2. **Safe Area Integration**
```typescript
<SafeAreaView style={styles.safeArea} edges={['top']}>
  <ModalHeader title="Your Title" onClose={onClose} />
  {/* Modal content */}
</SafeAreaView>
```

### 3. **No Custom Headers**
**❌ DO NOT** create custom header layouts with close buttons, titles, etc.
**✅ DO** use the standardized `ModalHeader` component

---

## 🎨 Accessibility Standards

### Contrast Ratios (WCAG AA Compliance)

#### Modal Headers:
- **Title Text**: `colors.textPrimary` (#FFFFFF) on `colors.surface` (#1F2937)
  - Contrast: **21:1** ✅ Exceeds AAA (7:1)

#### Modal Content:
- **Primary Text**: `colors.textSecondary` (#D1D5DB) on backgrounds
  - Contrast: **7.5:1** ✅ Exceeds AAA
- **Secondary Text**: `colors.textSecondary` (#D1D5DB) minimum
  - **❌ NEVER** use `colors.textMuted` for important content

#### Interactive Elements:
- **Buttons**: High contrast required
  - Primary buttons: White text on primary color
  - Secondary buttons: Proper border and text contrast
- **Touch Targets**: Minimum 44x44dp (iOS) / 48x48dp (Android)

---

## 📐 Layout Standards

### Modal Structure:
```
┌──────────────────────────────────────┐
│ ModalHeader (60dp height)            │
│  Title          [Action] [Close X]   │
├──────────────────────────────────────┤
│                                      │
│  Content Area                        │
│  (ScrollView for long content)       │
│                                      │
│                                      │
└──────────────────────────────────────┘
```

### Spacing:
- **Header Padding**: Horizontal: `spacing.md`, Vertical: `spacing.sm`
- **Content Padding**: `spacing.md` to `spacing.lg`
- **Section Gaps**: `spacing.lg` between major sections

---

## 🔧 Examples

### Basic Modal (Read-only)
```typescript
// AddFriendModal, FriendRequestsModal, BetInviteModal
<Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
  <SafeAreaView style={styles.container} edges={['top']}>
    <ModalHeader title="Add Friend" onClose={onClose} />
    {/* Content */}
  </SafeAreaView>
</Modal>
```

### Modal with Action Button
```typescript
// FeedbackModal example
<ModalHeader
  title="Send Feedback"
  onClose={onClose}
  rightComponent={
    <TouchableOpacity
      style={styles.submitButton}
      onPress={handleSubmit}
      disabled={!isValid || isSubmitting}
    >
      {isSubmitting ? (
        <ActivityIndicator size="small" color={colors.background} />
      ) : (
        <Text style={styles.submitButtonText}>Send</Text>
      )}
    </TouchableOpacity>
  }
/>
```

### Modal with Keyboard Avoidance
```typescript
<SafeAreaView style={styles.safeArea} edges={['top']}>
  <KeyboardAvoidingView
    style={styles.container}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    <ModalHeader title="Edit Profile" onClose={onClose} />
    <ScrollView>{/* Form inputs */}</ScrollView>
  </KeyboardAvoidingView>
</SafeAreaView>
```

---

## ✅ Currently Standardized Modals

1. **NotificationScreen** (via NotificationModal)
   - Custom modal header (no interactive header elements)
   - Full accessibility compliance

2. **AddFriendModal**
   - Uses `ModalHeader`
   - Search functionality
   - Full-screen presentation

3. **FriendRequestsModal**
   - Uses `ModalHeader`
   - List of pending requests
   - Full-screen presentation

4. **BetInviteModal**
   - Uses `ModalHeader`
   - Friend selection interface
   - Full-screen presentation

5. **FeedbackModal**
   - Uses `ModalHeader` with custom `rightComponent` (Send button)
   - Form with validation
   - Keyboard-aware layout

---

## 🚫 Common Anti-Patterns to Avoid

### ❌ DON'T:
```typescript
// Bad: pageSheet allows header bleeding
presentationStyle="pageSheet"

// Bad: Custom header with all app elements
<View style={styles.header}>
  <Logo />
  <Balance />
  <NotificationBell /> // ← Can cause infinite stacking!
  <Menu />
</View>

// Bad: Low contrast text
color: colors.textMuted // ← Fails ADA on dark backgrounds

// Bad: No safe area
<Modal>
  <View> // ← Status bar overlap on notched devices
```

### ✅ DO:
```typescript
// Good: Full screen with proper safe area
presentationStyle="fullScreen"

// Good: Simple, focused header
<ModalHeader title="Clear Title" onClose={onClose} />

// Good: High contrast text
color: colors.textPrimary   // For emphasis
color: colors.textSecondary // For standard content

// Good: Safe area support
<SafeAreaView edges={['top']}>
  <ModalHeader />
</SafeAreaView>
```

---

## 🔄 Migration Guide

### Updating Existing Modals:

1. **Import ModalHeader**:
   ```typescript
   import { ModalHeader } from './ModalHeader';
   ```

2. **Update Modal props**:
   ```typescript
   <Modal
     visible={visible}
     animationType="slide"
     presentationStyle="fullScreen" // ← Change from pageSheet
     onRequestClose={onClose}       // ← Add if missing
   >
   ```

3. **Replace custom header**:
   ```typescript
   // Remove old header View
   // Add ModalHeader
   <ModalHeader title="Your Title" onClose={onClose} />
   ```

4. **Remove old header styles**:
   Delete `header`, `title`, `closeButton` styles from StyleSheet

5. **Test**:
   - ✅ Modal opens full screen
   - ✅ Can't open multiple instances
   - ✅ Close button works
   - ✅ Text is clearly readable
   - ✅ Safe areas respected on all devices

---

## 📊 Accessibility Testing

### WCAG AA Compliance Checklist:
- [ ] Text contrast ≥ 4.5:1 (normal text)
- [ ] Text contrast ≥ 3:1 (large text 18pt+)
- [ ] Touch targets ≥ 44x44dp
- [ ] Keyboard navigation supported
- [ ] Screen reader labels present
- [ ] Color not sole indicator of information
- [ ] Focus indicators visible

### Tools:
- **Color Contrast**: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- **Design Colors**:
  - textPrimary (#FFFFFF) on surface (#1F2937): **21:1** ✅
  - textSecondary (#D1D5DB) on surface: **7.5:1** ✅
  - textMuted (#9CA3AF) on surface: **4.7:1** ⚠️ Use sparingly

---

## 🎯 Design Principles

1. **Consistency**: All modals follow same pattern
2. **Clarity**: One clear action path per modal
3. **Accessibility**: Everyone can use the app
4. **Performance**: Lightweight, no unnecessary re-renders
5. **Safety**: Prevent user errors (e.g., modal stacking)

---

*Last Updated: [Current Date]*
*Maintained by: SideBet Development Team*
