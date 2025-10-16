/**
 * Payment Method Service
 * Manage user payment methods (Venmo, PayPal, etc.)
 */

import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

const client = generateClient<Schema>();

export type PaymentMethodType = 'VENMO' | 'PAYPAL' | 'BANK_ACCOUNT' | 'CASH_APP';
export type VerificationMethod = 'MANUAL' | 'MICRO_DEPOSIT' | 'TRANSACTION_ID';

export interface PaymentMethod {
  id: string;
  userId: string;
  type: PaymentMethodType;
  venmoUsername?: string;
  venmoPhone?: string;
  venmoEmail?: string;
  isVerified: boolean;
  verifiedAt?: string;
  verificationMethod?: VerificationMethod;
  isDefault: boolean;
  isActive: boolean;
  displayName: string;
  lastUsed?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreatePaymentMethodParams {
  userId: string;
  type: PaymentMethodType;
  venmoUsername?: string;
  venmoPhone?: string;
  venmoEmail?: string;
  isDefault?: boolean;
}

export class PaymentMethodService {
  /**
   * Create a new payment method
   */
  static async createPaymentMethod(params: CreatePaymentMethodParams): Promise<PaymentMethod | null> {
    try {
      console.log('[PaymentMethod] Creating payment method:', params);

      // Generate display name based on type
      let displayName = '';
      if (params.type === 'VENMO' && params.venmoUsername) {
        displayName = `Venmo (${params.venmoUsername})`;
      } else if (params.type === 'PAYPAL' && params.venmoEmail) {
        displayName = `PayPal (${params.venmoEmail})`;
      } else {
        displayName = params.type;
      }

      // If setting as default, unset other defaults first
      if (params.isDefault) {
        await this.clearDefaultPaymentMethods(params.userId);
      }

      const result = await client.models.PaymentMethod.create({
        userId: params.userId,
        type: params.type,
        venmoUsername: params.venmoUsername || null,
        venmoPhone: params.venmoPhone || null,
        venmoEmail: params.venmoEmail || null,
        isVerified: false,
        isDefault: params.isDefault || false,
        isActive: true,
        displayName,
      });

      const paymentMethod = result.data;
      const errors = result.errors;

      if (errors || !paymentMethod) {
        console.error('[PaymentMethod] Error creating payment method:', errors);
        return null;
      }

      console.log('[PaymentMethod] Payment method created successfully:', paymentMethod.id);

      return {
        id: paymentMethod.id!,
        userId: paymentMethod.userId!,
        type: paymentMethod.type as PaymentMethodType,
        venmoUsername: paymentMethod.venmoUsername || undefined,
        venmoPhone: paymentMethod.venmoPhone || undefined,
        venmoEmail: paymentMethod.venmoEmail || undefined,
        isVerified: paymentMethod.isVerified || false,
        verifiedAt: paymentMethod.verifiedAt || undefined,
        verificationMethod: paymentMethod.verificationMethod as VerificationMethod | undefined,
        isDefault: paymentMethod.isDefault || false,
        isActive: paymentMethod.isActive || true,
        displayName: paymentMethod.displayName!,
        lastUsed: paymentMethod.lastUsed || undefined,
        createdAt: paymentMethod.createdAt!,
        updatedAt: paymentMethod.updatedAt || undefined,
      };
    } catch (error) {
      console.error('[PaymentMethod] Error creating payment method:', error);
      return null;
    }
  }

  /**
   * Get all payment methods for a user
   */
  static async getUserPaymentMethods(
    userId: string,
    activeOnly: boolean = true
  ): Promise<PaymentMethod[]> {
    try {
      const filter: any = { userId: { eq: userId } };

      if (activeOnly) {
        filter.isActive = { eq: true };
      }

      const { data } = await client.models.PaymentMethod.list({ filter });

      const methods = (data || []).map(pm => ({
        id: pm.id!,
        userId: pm.userId!,
        type: pm.type as PaymentMethodType,
        venmoUsername: pm.venmoUsername || undefined,
        venmoPhone: pm.venmoPhone || undefined,
        venmoEmail: pm.venmoEmail || undefined,
        isVerified: pm.isVerified || false,
        verifiedAt: pm.verifiedAt || undefined,
        verificationMethod: pm.verificationMethod as VerificationMethod | undefined,
        isDefault: pm.isDefault || false,
        isActive: pm.isActive || true,
        displayName: pm.displayName!,
        lastUsed: pm.lastUsed || undefined,
        createdAt: pm.createdAt!,
        updatedAt: pm.updatedAt || undefined,
      }));

      // Sort by default first, then by createdAt descending
      return methods.sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    } catch (error) {
      console.error('[PaymentMethod] Error fetching payment methods:', error);
      return [];
    }
  }

  /**
   * Get default payment method for a user
   */
  static async getDefaultPaymentMethod(userId: string): Promise<PaymentMethod | null> {
    try {
      const methods = await this.getUserPaymentMethods(userId);
      return methods.find(m => m.isDefault) || null;
    } catch (error) {
      console.error('[PaymentMethod] Error fetching default payment method:', error);
      return null;
    }
  }

  /**
   * Get payment method by ID
   */
  static async getPaymentMethod(paymentMethodId: string): Promise<PaymentMethod | null> {
    try {
      const { data: pm } = await client.models.PaymentMethod.get({
        id: paymentMethodId
      });

      if (!pm) {
        return null;
      }

      return {
        id: pm.id!,
        userId: pm.userId!,
        type: pm.type as PaymentMethodType,
        venmoUsername: pm.venmoUsername || undefined,
        venmoPhone: pm.venmoPhone || undefined,
        venmoEmail: pm.venmoEmail || undefined,
        isVerified: pm.isVerified || false,
        verifiedAt: pm.verifiedAt || undefined,
        verificationMethod: pm.verificationMethod as VerificationMethod | undefined,
        isDefault: pm.isDefault || false,
        isActive: pm.isActive || true,
        displayName: pm.displayName!,
        lastUsed: pm.lastUsed || undefined,
        createdAt: pm.createdAt!,
        updatedAt: pm.updatedAt || undefined,
      };
    } catch (error) {
      console.error('[PaymentMethod] Error fetching payment method:', error);
      return null;
    }
  }

  /**
   * Set a payment method as default
   */
  static async setDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<boolean> {
    try {
      console.log('[PaymentMethod] Setting default payment method:', paymentMethodId);

      // First, unset all defaults for this user
      await this.clearDefaultPaymentMethods(userId);

      // Set the new default
      const result = await client.models.PaymentMethod.update({
        id: paymentMethodId,
        isDefault: true,
      });

      if (result.errors || !result.data) {
        console.error('[PaymentMethod] Error setting default payment method:', result.errors);
        return false;
      }

      console.log('[PaymentMethod] Default payment method updated successfully:', paymentMethodId);
      return true;
    } catch (error) {
      console.error('[PaymentMethod] Error setting default payment method:', error);
      return false;
    }
  }

  /**
   * Clear all default payment methods for a user
   */
  static async clearDefaultPaymentMethods(userId: string): Promise<void> {
    try {
      const methods = await this.getUserPaymentMethods(userId, false);
      const defaults = methods.filter(m => m.isDefault);

      await Promise.all(
        defaults.map(pm =>
          client.models.PaymentMethod.update({
            id: pm.id,
            isDefault: false,
          })
        )
      );
    } catch (error) {
      console.error('[PaymentMethod] Error clearing default payment methods:', error);
    }
  }

  /**
   * Remove (deactivate) a payment method
   */
  static async removePaymentMethod(paymentMethodId: string): Promise<boolean> {
    try {
      console.log('[PaymentMethod] Removing payment method:', paymentMethodId);

      // Soft delete - just mark as inactive
      const result = await client.models.PaymentMethod.update({
        id: paymentMethodId,
        isActive: false,
      });

      if (result.errors || !result.data) {
        console.error('[PaymentMethod] Error removing payment method:', result.errors);
        return false;
      }

      console.log('[PaymentMethod] Payment method removed successfully:', paymentMethodId);
      return true;
    } catch (error) {
      console.error('[PaymentMethod] Error removing payment method:', error);
      return false;
    }
  }

  /**
   * Verify a payment method (admin action)
   */
  static async verifyPaymentMethod(
    paymentMethodId: string,
    verificationMethod: VerificationMethod
  ): Promise<boolean> {
    try {
      await client.models.PaymentMethod.update({
        id: paymentMethodId,
        isVerified: true,
        verifiedAt: new Date().toISOString(),
        verificationMethod,
      });

      console.log('[PaymentMethod] Payment method verified:', paymentMethodId);
      return true;
    } catch (error) {
      console.error('[PaymentMethod] Error verifying payment method:', error);
      return false;
    }
  }

  /**
   * Update last used timestamp
   */
  static async updateLastUsed(paymentMethodId: string): Promise<void> {
    try {
      await client.models.PaymentMethod.update({
        id: paymentMethodId,
        lastUsed: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[PaymentMethod] Error updating last used:', error);
    }
  }

  /**
   * Validate Venmo username format
   */
  static validateVenmoUsername(username: string): boolean {
    // Venmo usernames can be 5-30 characters, alphanumeric, hyphens, underscores
    // Must start with @ or be provided without @
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
    const regex = /^[a-zA-Z0-9_-]{5,30}$/;
    return regex.test(cleanUsername);
  }

  /**
   * Format Venmo username with @ prefix
   */
  static formatVenmoUsername(username: string): string {
    const cleanUsername = username.startsWith('@') ? username.slice(1) : username;
    return `@${cleanUsername}`;
  }
}

export default PaymentMethodService;
