/**
 * Toast Notification Service
 * Manages in-app toast notifications with smart batching and rate limiting
 */

import Toast from 'react-native-toast-message';
import { AppState } from 'react-native';
import { NotificationType, NotificationPriority } from '../types/betting';

interface QueuedToast {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  priority: NotificationPriority;
  timestamp: number;
  data?: any;
}

class ToastNotificationService {
  private static queue: QueuedToast[] = [];
  private static isProcessing = false;
  private static lastShownTime = 0;
  private static readonly MIN_INTERVAL = 3000; // 3 seconds between toasts
  private static readonly BATCH_THRESHOLD = 3; // Batch if 3+ same type
  private static readonly BATCH_WINDOW = 10000; // 10 seconds
  private static readonly MAX_QUEUE_SIZE = 5;
  private static navigationCallback: ((type: NotificationType, data?: any) => void) | null = null;

  /**
   * Set navigation callback for handling toast taps
   */
  static setNavigationCallback(callback: (type: NotificationType, data?: any) => void): void {
    this.navigationCallback = callback;
  }

  /**
   * Show toast notification if app is in foreground
   */
  static async showToast(
    type: NotificationType,
    title: string,
    message: string,
    priority: NotificationPriority,
    data?: any
  ): Promise<void> {
    // Only show toasts when app is in foreground
    if (AppState.currentState !== 'active') {
      console.log('[Toast] App not in foreground, skipping toast');
      return;
    }

    // Don't show toasts for LOW priority
    if (priority === 'LOW') {
      console.log('[Toast] Low priority notification, skipping toast (DB record only)');
      return;
    }

    // Add to queue
    this.queue.push({
      id: Date.now().toString() + Math.random(),
      type,
      title,
      message,
      priority,
      timestamp: Date.now(),
      data,
    });

    console.log(`[Toast] Added to queue. Queue size: ${this.queue.length}`);

    // Process queue
    this.processQueue();
  }

  /**
   * Process the toast queue with batching and rate limiting
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Check if we should batch due to queue overflow
      if (this.queue.length >= this.MAX_QUEUE_SIZE) {
        console.log(`[Toast] Queue overflow (${this.queue.length} items), showing batch toast`);
        this.showBatchToast(this.queue.length);
        this.queue = []; // Clear queue
        this.isProcessing = false;
        return;
      }

      // Check for same-type batching within time window
      const batchableTypes = this.findBatchableNotifications();
      if (batchableTypes) {
        console.log(`[Toast] Batching ${batchableTypes.count} ${batchableTypes.typeLabel}`);
        this.showBatchToast(
          batchableTypes.count,
          batchableTypes.type,
          batchableTypes.typeLabel
        );
        // Remove batched items from queue
        this.queue = this.queue.filter(t => t.type !== batchableTypes.type);

        // Continue processing queue after batching
        setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, this.getAutoDismissTime('MEDIUM') + 500);
        return;
      }

      // Show next toast with rate limiting
      const now = Date.now();
      const timeSinceLastToast = now - this.lastShownTime;

      if (timeSinceLastToast < this.MIN_INTERVAL) {
        // Wait before showing next toast
        const waitTime = this.MIN_INTERVAL - timeSinceLastToast;
        console.log(`[Toast] Rate limiting - waiting ${waitTime}ms before next toast`);
        setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, waitTime);
        return;
      }

      // Show next toast (highest priority first)
      const nextToast = this.getNextToast();
      if (nextToast) {
        this.displayToast(nextToast);
        this.lastShownTime = Date.now();

        // Remove from queue
        this.queue = this.queue.filter(t => t.id !== nextToast.id);

        // Wait for auto-dismiss duration, then process next
        const dismissTime = this.getAutoDismissTime(nextToast.priority);
        setTimeout(() => {
          this.isProcessing = false;
          this.processQueue();
        }, dismissTime + 500); // Add 500ms buffer between toasts
      } else {
        this.isProcessing = false;
      }
    } catch (error) {
      console.error('[Toast] Error processing queue:', error);
      this.isProcessing = false;
    }
  }

  /**
   * Find notifications that should be batched
   */
  private static findBatchableNotifications(): {
    type: NotificationType;
    count: number;
    typeLabel: string;
  } | null {
    const now = Date.now();
    const typeCounts = new Map<NotificationType, number>();

    // Count notifications of each type within the batch window
    this.queue.forEach(toast => {
      if (now - toast.timestamp <= this.BATCH_WINDOW) {
        typeCounts.set(toast.type, (typeCounts.get(toast.type) || 0) + 1);
      }
    });

    // Find types that should be batched
    for (const [type, count] of typeCounts.entries()) {
      if (count >= this.BATCH_THRESHOLD) {
        return {
          type,
          count,
          typeLabel: this.getNotificationTypeLabel(type),
        };
      }
    }

    return null;
  }

  /**
   * Get next toast to display (highest priority first)
   */
  private static getNextToast(): QueuedToast | null {
    if (this.queue.length === 0) return null;

    // Sort by priority (URGENT > HIGH > MEDIUM)
    const priorityOrder = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    const sorted = [...this.queue].sort((a, b) => {
      const aPriority = priorityOrder[a.priority] ?? 999;
      const bPriority = priorityOrder[b.priority] ?? 999;
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      return a.timestamp - b.timestamp; // Older first if same priority
    });

    return sorted[0];
  }

  /**
   * Display a single toast
   */
  private static displayToast(toast: QueuedToast): void {
    const toastType = this.getToastType(toast.priority);

    Toast.show({
      type: toastType,
      text1: toast.title,
      text2: toast.message,
      position: 'bottom',
      visibilityTime: this.getAutoDismissTime(toast.priority),
      autoHide: true,
      bottomOffset: 100, // Above bottom tab bar
      onPress: () => this.handleToastPress(toast),
    });

    console.log(`[Toast] Displayed: ${toast.title} (${toast.priority})`);
  }

  /**
   * Display batch toast
   */
  private static showBatchToast(
    count: number,
    type?: NotificationType,
    typeLabel?: string
  ): void {
    const message = type
      ? `You have ${count} new ${typeLabel}`
      : `You have ${count} new notifications`;

    Toast.show({
      type: 'info',
      text1: 'New Notifications',
      text2: message,
      position: 'bottom',
      visibilityTime: 4000,
      autoHide: true,
      bottomOffset: 100,
      onPress: () => {
        // Navigate to notifications screen
        if (this.navigationCallback) {
          this.navigationCallback('SYSTEM_ANNOUNCEMENT', { action: 'view_all_notifications' });
        }
        Toast.hide();
      },
    });

    console.log(`[Toast] Showed batch toast for ${count} notifications`);
  }

  /**
   * Get auto-dismiss time based on priority
   */
  private static getAutoDismissTime(priority: NotificationPriority): number {
    switch (priority) {
      case 'URGENT':
        return 5000; // 5 seconds
      case 'HIGH':
        return 4000; // 4 seconds
      case 'MEDIUM':
        return 3000; // 3 seconds
      case 'LOW':
        return 2000; // 2 seconds (not used since LOW doesn't show toasts)
      default:
        return 4000;
    }
  }

  /**
   * Get toast visual type based on priority
   */
  private static getToastType(priority: NotificationPriority): 'success' | 'error' | 'info' {
    switch (priority) {
      case 'URGENT':
        return 'error'; // Red for urgent
      case 'HIGH':
        return 'success'; // Green for high
      case 'MEDIUM':
      case 'LOW':
      default:
        return 'info'; // Blue for medium/low
    }
  }

  /**
   * Get human-readable label for notification type
   */
  private static getNotificationTypeLabel(type: NotificationType): string {
    const labels: Record<NotificationType, string> = {
      'FRIEND_REQUEST_RECEIVED': 'friend requests',
      'FRIEND_REQUEST_ACCEPTED': 'friend acceptances',
      'FRIEND_REQUEST_DECLINED': 'friend declines',
      'BET_INVITATION_RECEIVED': 'bet invitations',
      'BET_INVITATION_ACCEPTED': 'bet invitation acceptances',
      'BET_INVITATION_DECLINED': 'bet invitation declines',
      'BET_JOINED': 'bet joins',
      'BET_RESOLVED': 'bet results',
      'BET_CANCELLED': 'bet cancellations',
      'BET_DISPUTED': 'bet disputes',
      'BET_DEADLINE_APPROACHING': 'bet deadline reminders',
      'DEPOSIT_COMPLETED': 'completed deposits',
      'DEPOSIT_FAILED': 'failed deposits',
      'WITHDRAWAL_COMPLETED': 'completed withdrawals',
      'WITHDRAWAL_FAILED': 'failed withdrawals',
      'PAYMENT_METHOD_VERIFIED': 'payment verifications',
      'SYSTEM_ANNOUNCEMENT': 'announcements',
      'SQUARES_GRID_LOCKED': 'grid locks',
      'SQUARES_PERIOD_WINNER': 'period wins',
      'SQUARES_GAME_LIVE': 'live games',
      'SQUARES_GAME_CANCELLED': 'game cancellations',
    };
    return labels[type] || 'notifications';
  }

  /**
   * Handle toast tap with type-specific navigation
   */
  private static handleToastPress(toast: QueuedToast): void {
    console.log('[Toast] Toast tapped:', toast.type, toast.data);

    if (this.navigationCallback) {
      this.navigationCallback(toast.type, toast.data);
    }

    Toast.hide();
  }

  /**
   * Clear the queue (useful when user navigates to notifications screen)
   */
  static clearQueue(): void {
    this.queue = [];
    console.log('[Toast] Queue cleared');
  }

  /**
   * Get current queue size (for debugging)
   */
  static getQueueSize(): number {
    return this.queue.length;
  }
}

export default ToastNotificationService;
