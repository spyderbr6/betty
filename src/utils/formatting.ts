/**
 * SideBet Formatting Utilities
 * Functions for formatting data display
 */

// Currency formatting
export const formatCurrency = (
  amount: number,
  currency = 'USD',
  showCents = true
): string => {
  // Fallback for environments without Intl support
  if (typeof Intl === 'undefined' || !Intl.NumberFormat) {
    const fixed = showCents ? amount.toFixed(2) : Math.round(amount).toString();
    return `$${fixed}`;
  }
  
  const options: Intl.NumberFormatOptions = {
    style: 'currency',
    currency,
    minimumFractionDigits: showCents ? 2 : 0,
    maximumFractionDigits: showCents ? 2 : 0,
  };
  
  return new Intl.NumberFormat('en-US', options).format(amount);
};

// Large number formatting (1000 -> 1K, 1000000 -> 1M)
export const formatLargeNumber = (num: number): string => {
  if (num < 1000) return num.toString();
  if (num < 1000000) return `${(num / 1000).toFixed(1)}K`;
  if (num < 1000000000) return `${(num / 1000000).toFixed(1)}M`;
  return `${(num / 1000000000).toFixed(1)}B`;
};

// Percentage formatting
export const formatPercentage = (
  value: number,
  decimals = 1,
  includeSign = true
): string => {
  const formatted = value.toFixed(decimals);
  return includeSign ? `${formatted}%` : formatted;
};

// Date and time formatting
export const dateFormatting = {
  // Format date for betting deadlines
  formatDeadline: (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    // Past deadline
    if (diffMs < 0) {
      return 'Expired';
    }

    // Less than 1 hour
    if (diffMins < 60) {
      return `${diffMins}m`;
    }

    // Less than 24 hours
    if (diffHours < 24) {
      return `${diffHours}h ${diffMins % 60}m`;
    }

    // Less than 7 days
    if (diffDays < 7) {
      return `${diffDays}d ${diffHours % 24}h`;
    }

    // Format as date
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  },

  // Format relative time (2 hours ago, 3 days ago)
  formatRelativeTime: (date: string | Date): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
    
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffDays > 365 ? 'numeric' : undefined,
    });
  },

  // Format duration (for bet lifetime)
  formatDuration: (startDate: string | Date, endDate?: string | Date): string => {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = endDate ? (typeof endDate === 'string' ? new Date(endDate) : endDate) : new Date();
    
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffDays > 0) return `${diffDays}d ${diffHours}h`;
    if (diffHours > 0) return `${diffHours}h ${diffMins}m`;
    return `${diffMins}m`;
  },
};

// Status formatting
export const formatStatus = (status: string): string => {
  return status
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// Username/display name formatting
export const formatUsername = (username: string, maxLength = 12): string => {
  if (username.length <= maxLength) return username;
  return `${username.substring(0, maxLength - 1)}…`;
};

// Trust score formatting
export const formatTrustScore = (score: number): string => {
  return score.toFixed(1);
};

// Win rate formatting with color indication
export const formatWinRate = (winRate: number) => {
  const formatted = formatPercentage(winRate, 1);
  let color: 'success' | 'warning' | 'error';
  
  if (winRate >= 60) color = 'success';
  else if (winRate >= 40) color = 'warning';
  else color = 'error';
  
  return { formatted, color };
};

// Bet category formatting
export const formatCategory = (category: string): string => {
  const categoryMap: Record<string, string> = {
    SPORTS: 'Sports',
    ENTERTAINMENT: 'Entertainment',
    WEATHER: 'Weather',
    STOCKS: 'Stocks',
    CUSTOM: 'Custom',
  };
  
  return categoryMap[category] || category;
};

// Participant count formatting
export const formatParticipantCount = (count: number): string => {
  if (count === 0) return 'No participants';
  if (count === 1) return '1 participant';
  return `${count} participants`;
};

// Betting side name formatting
export const formatSideName = (side: string, betTitle?: string): string => {
  // If it's just A/B, try to make it more descriptive
  if (side === 'A' && betTitle) {
    // Extract first part before vs/against/-
    const parts = betTitle.split(/\s+(vs|against|-)\s+/i);
    if (parts.length > 0) return parts[0].trim();
  }
  
  if (side === 'B' && betTitle) {
    // Extract second part after vs/against/-
    const parts = betTitle.split(/\s+(vs|against|-)\s+/i);
    if (parts.length > 2) return parts[2].trim();
  }
  
  return side;
};

// File size formatting
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Text truncation with ellipsis
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
};

// Phone number formatting
export const formatPhoneNumber = (phone: string): string => {
  const cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  return phone;
};

// Error message formatting
export const formatErrorMessage = (error: any): string => {
  if (typeof error === 'string') return error;
  if (error?.message) return error.message;
  if (error?.code) return `Error: ${error.code}`;
  return 'An unexpected error occurred';
};

// Team name formatting - extracts short name for display
export const formatTeamName = (fullTeamName: string, teamCode?: string): string => {
  // Use team code if available (e.g., "LAL", "GSW")
  if (teamCode && teamCode.trim()) {
    return teamCode.trim();
  }

  // Extract last word from full team name (e.g., "Pittsburgh Steelers" -> "Steelers")
  const words = fullTeamName.trim().split(/\s+/);
  return words[words.length - 1];
};