// Date formatting utilities to prevent hydration errors
// Always use consistent formatting between server and client

export const formatDate = (date: Date | string, locale = 'en-US'): string => {
  const parsed = toValidDate(date);
  if (!parsed) return '--/--/----';
  return parsed.toLocaleDateString(locale);
};

export const formatTime = (date: Date | string, locale = 'en-US'): string => {
  const parsed = toValidDate(date);
  if (!parsed) return '--:--:--';
  return parsed.toLocaleTimeString(locale);
};

export const formatDateTime = (date: Date | string, locale = 'en-US'): string => {
  const parsed = toValidDate(date);
  if (!parsed) return '--';
  return parsed.toLocaleString(locale);
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

export const toIsoDateString = (date: Date | string | null | undefined): string | null => {
  if (!date) return null;
  const parsed = toValidDate(date);
  if (!parsed) return null;
  return parsed.toISOString();
};

function toValidDate(value: Date | string): Date | null {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}
