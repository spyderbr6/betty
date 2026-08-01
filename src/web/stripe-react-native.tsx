/**
 * Web implementation of the @stripe/stripe-react-native surface we use.
 *
 * The native SDK is iOS/Android only, so Metro aliases '@stripe/stripe-react-native'
 * to this file for web builds (see metro.config.js).
 *
 * Stripe on web works differently from native: instead of a native Payment Sheet,
 * you render a <PaymentElement> and call stripe.confirmPayment(). To keep callers
 * platform-agnostic, this module exposes the SAME initPaymentSheet/presentPaymentSheet
 * API and drives a modal behind the scenes — the same controller-singleton pattern
 * used by CustomAlert.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { loadStripe, type Stripe as StripeJs } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe as useStripeJs,
  useElements,
} from '@stripe/react-stripe-js';
import { colors, spacing, textStyles, typography } from '../styles';

// ---------------------------------------------------------------------------
// Shared types — mirror the native SDK's shapes closely enough for our callers
// ---------------------------------------------------------------------------

interface InitPaymentSheetParams {
  paymentIntentClientSecret: string;
  merchantDisplayName?: string;
  [key: string]: unknown;
}

interface StripeError {
  code: string;
  message?: string;
}

interface SheetResult {
  error?: StripeError;
}

// ---------------------------------------------------------------------------
// Controller singleton — lets the hook talk to the mounted host component
// ---------------------------------------------------------------------------

let pendingClientSecret: string | null = null;
let openSheet: ((clientSecret: string) => Promise<SheetResult>) | null = null;

// ---------------------------------------------------------------------------
// Public API — matches @stripe/stripe-react-native
// ---------------------------------------------------------------------------

export const useStripe = () => ({
  initPaymentSheet: async (params: InitPaymentSheetParams): Promise<SheetResult> => {
    if (!params?.paymentIntentClientSecret) {
      return { error: { code: 'Failed', message: 'Missing payment client secret.' } };
    }
    pendingClientSecret = params.paymentIntentClientSecret;
    return {};
  },

  presentPaymentSheet: async (): Promise<SheetResult> => {
    if (!pendingClientSecret) {
      return { error: { code: 'Failed', message: 'Payment was not initialized.' } };
    }
    if (!openSheet) {
      return { error: { code: 'Failed', message: 'Payment form is not ready. Please reload the page.' } };
    }
    const clientSecret = pendingClientSecret;
    pendingClientSecret = null;
    return openSheet(clientSecret);
  },
});

interface StripeProviderProps {
  publishableKey?: string;
  children: React.ReactNode;
  [key: string]: unknown;
}

export const StripeProvider: React.FC<StripeProviderProps> = ({ publishableKey, children }) => (
  <>
    {children}
    <PaymentSheetHost publishableKey={publishableKey} />
  </>
);

// ---------------------------------------------------------------------------
// Modal host — renders the Stripe Payment Element when presentPaymentSheet runs
// ---------------------------------------------------------------------------

const PaymentSheetHost: React.FC<{ publishableKey?: string }> = ({ publishableKey }) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const resolverRef = useRef<((result: SheetResult) => void) | null>(null);

  const stripePromise = useMemo<Promise<StripeJs | null> | null>(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey]
  );

  useEffect(() => {
    openSheet = (secret: string) =>
      new Promise<SheetResult>((resolve) => {
        resolverRef.current = resolve;
        setClientSecret(secret);
      });
    return () => {
      openSheet = null;
    };
  }, []);

  const finish = (result: SheetResult) => {
    setClientSecret(null);
    const resolve = resolverRef.current;
    resolverRef.current = null;
    resolve?.(result);
  };

  if (!clientSecret) return null;

  if (!stripePromise) {
    // Publishable key missing — fail loudly rather than showing an empty form
    finish({ error: { code: 'Failed', message: 'Payments are not configured for web.' } });
    return null;
  }

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => finish({ error: { code: 'Canceled' } })}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Payment Details</Text>
          <TouchableOpacity
            onPress={() => finish({ error: { code: 'Canceled' } })}
            style={styles.closeButton}
            accessibilityLabel="Cancel payment"
          >
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable so the Pay button stays reachable on short viewports
            and once the card form expands. */}
        <ScrollView
          style={styles.formScroll}
          contentContainerStyle={styles.formWrapper}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: {
                theme: 'night',
                variables: {
                  colorPrimary: colors.primary,
                  colorBackground: colors.surface,
                  colorText: colors.textPrimary,
                  borderRadius: '8px',
                },
              },
            }}
          >
            <CheckoutForm onFinish={finish} />
          </Elements>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ---------------------------------------------------------------------------
// The actual card form
// ---------------------------------------------------------------------------

const CheckoutForm: React.FC<{ onFinish: (result: SheetResult) => void }> = ({ onFinish }) => {
  const stripe = useStripeJs();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    // redirect: 'if_required' keeps card payments inline; only redirect-based
    // methods (e.g. 3DS challenge pages) will navigate away.
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message ?? 'Payment failed. Please try another card.');
      setIsSubmitting(false);
      return;
    }

    onFinish({});
  };

  return (
    <View style={styles.form}>
      <PaymentElement />

      {errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

      <TouchableOpacity
        style={[styles.payButton, (!stripe || isSubmitting) && styles.payButtonDisabled]}
        onPress={handleSubmit}
        disabled={!stripe || isSubmitting}
        activeOpacity={0.8}
      >
        {isSubmitting ? (
          <ActivityIndicator size="small" color={colors.background} />
        ) : (
          <Text style={styles.payButtonText}>Pay Now</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.secureNote}>Payments are securely processed by Stripe.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    ...textStyles.h4,
    color: colors.textPrimary,
  },
  closeButton: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  closeButtonText: {
    ...textStyles.button,
    color: colors.textSecondary,
  },
  formScroll: {
    flex: 1,
  },
  formWrapper: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  form: {
    width: '100%',
  },
  errorText: {
    ...textStyles.bodySmall,
    color: colors.error,
    marginTop: spacing.md,
  },
  payButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: spacing.radius.md,
    marginTop: spacing.lg,
  },
  payButtonDisabled: {
    backgroundColor: colors.border,
  },
  payButtonText: {
    ...textStyles.button,
    color: colors.background,
    fontWeight: typography.fontWeight.bold,
  },
  secureNote: {
    ...textStyles.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
