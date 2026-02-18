// Date formatting utilities to prevent hydration errors
// Always use consistent formatting between server and client

export const formatDate = (date: Date | string, locale = 'en-US'): string => {
  return new Date(date).toLocaleDateString(locale);
};

export const formatTime = (date: Date | string, locale = 'en-US'): string => {
  return new Date(date).toLocaleTimeString(locale);
};

export const formatDateTime = (date: Date | string, locale = 'en-US'): string => {
  return new Date(date).toLocaleString(locale);
};

// Safe date formatting that handles potential null/undefined values
export const safeDateFormat = (date: Date | string | null | undefined, locale = 'en-US'): string => {
  if (!date) return '-';
  try {
    return formatDate(date, locale);
  } catch {
    return '-';
  }
};

export const safeTimeFormat = (date: Date | string | null | undefined, locale = 'en-US'): string => {
  if (!date) return '-';
  try {
    return formatTime(date, locale);
  } catch {
    return '-';
  }
};
