/* Number and date formatting. The locale tag comes from the caller, so this module stays free of
   UI state (see src/i18n/index.js for the versions bound to the current language). */
export const formatNumber = (value, digits = 0, tag = 'es-CO') => (
  Number(value).toLocaleString(tag, { minimumFractionDigits: digits, maximumFractionDigits: digits })
);

export const formatDate = (ms, tag = 'es-CO') => (
  new Date(ms).toLocaleString(tag, { dateStyle: 'medium', timeStyle: 'short' })
);
