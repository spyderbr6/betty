// Library entry for design-sync: re-exports the SideBet app's real components,
// design tokens, and the react-native(-web) primitives they are built from, so
// claude.ai/design can compose with them. Built by ./build.mjs.

// -- Design tokens ---------------------------------------------------------
export {
  colors, semantic, typography, textStyles, spacing, responsiveSpacing,
  shadows, innerShadows, commonStyles,
} from '../../src/styles';

// -- Canvas provider (sample auth / bet data for data-bound components) -----
export { SideBetProvider, SAMPLE_USER } from './SideBetProvider';

// -- React Native primitives (react-native-web on the design canvas) -------
export {
  View, Text, ScrollView, FlatList, Image, TextInput, Pressable,
  TouchableOpacity, Switch, ActivityIndicator, StyleSheet, Platform,
} from 'react-native';
export { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
export { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

// -- UI --------------------------------------------------------------------
export { AddFriendModal } from '../../src/components/ui/AddFriendModal';
export { AddFundsModal } from '../../src/components/ui/AddFundsModal';
export { AddPaymentMethodModal } from '../../src/components/ui/AddPaymentMethodModal';
export { BetInviteModal } from '../../src/components/ui/BetInviteModal';
export { BetQRCodeModal } from '../../src/components/ui/BetQRCodeModal';
export { CustomAlert, CustomAlertController, showAlert } from '../../src/components/ui/CustomAlert';
export { EventBadge } from '../../src/components/ui/EventBadge';
export { EventDiscoveryModal } from '../../src/components/ui/EventDiscoveryModal';
export { FeedbackModal } from '../../src/components/ui/FeedbackModal';
export { FileDisputeModal } from '../../src/components/ui/FileDisputeModal';
export { FriendRequestsModal } from '../../src/components/ui/FriendRequestsModal';
export { FriendSelector } from '../../src/components/ui/FriendSelector';
export { Header } from '../../src/components/ui/Header';
export { LiveGameBanner } from '../../src/components/ui/LiveGameBanner';
export { ModalHeader } from '../../src/components/ui/ModalHeader';
export { NotificationModal } from '../../src/components/ui/NotificationModal';
export { PhoneInput } from '../../src/components/ui/PhoneInput';
export { PolicyModal } from '../../src/components/ui/PolicyModal';
export { ProfileEditor } from '../../src/components/ui/ProfileEditor';
export { QRScannerModal } from '../../src/components/ui/QRScannerModal';
export { SquaresInviteModal } from '../../src/components/ui/SquaresInviteModal';
export { TabBar } from '../../src/components/ui/TabBar';
export { toastConfig } from '../../src/components/ui/ToastConfig';
export { UserBalance } from '../../src/components/ui/UserBalance';
export { VerifyPhoneModal } from '../../src/components/ui/VerifyPhoneModal';
export { WithdrawFundsModal } from '../../src/components/ui/WithdrawFundsModal';

// -- Betting ---------------------------------------------------------------
export { BetCard } from '../../src/components/betting/BetCard';
export { BetInvitationCard } from '../../src/components/betting/BetInvitationCard';
export { BetList } from '../../src/components/betting/BetList';
export { CreateSquaresForm } from '../../src/components/betting/CreateSquaresForm';
export { LiveBetCard } from '../../src/components/betting/LiveBetCard';
export { PendingInvitations } from '../../src/components/betting/PendingInvitations';
export { PeriodResultsCard } from '../../src/components/betting/PeriodResultsCard';
export { SquaresGameCard } from '../../src/components/betting/SquaresGameCard';
export { SquaresGrid } from '../../src/components/betting/SquaresGrid';

// -- Modals ----------------------------------------------------------------
export { EventPickerModal } from '../../src/components/modals/EventPickerModal';
export { PurchaseSquaresModal } from '../../src/components/modals/PurchaseSquaresModal';

// -- Onboarding ------------------------------------------------------------
export { OnboardingAddFriendsStep } from '../../src/components/onboarding/OnboardingAddFriendsStep';
export { OnboardingAddFundsStep } from '../../src/components/onboarding/OnboardingAddFundsStep';
export { OnboardingProfilePictureStep } from '../../src/components/onboarding/OnboardingProfilePictureStep';

// -- Settings --------------------------------------------------------------
export { NotificationPreferencesPanel } from '../../src/components/settings/NotificationPreferencesPanel';
export { PushSoftAsk } from '../../src/components/settings/PushSoftAsk';
export { SecuritySection } from '../../src/components/settings/SecuritySection';

// -- Auth ------------------------------------------------------------------
export { Login } from '../../src/components/Login';
export { SignUp } from '../../src/components/SignUp';
export { ForgotPassword } from '../../src/components/ForgotPassword';
export { UpdateRequired } from '../../src/components/UpdateRequired';
