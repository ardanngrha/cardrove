export const preferences = $state({
  language: (localStorage.getItem('study-language') ||
    (navigator.language.startsWith('id') ? 'id' : 'en')) as 'en' | 'id',
  theme: localStorage.getItem('study-theme') || 'system',
});

export function t(english: string, indonesian: string) {
  return preferences.language === 'id' ? indonesian : english;
}

export function locale() {
  return preferences.language === 'id' ? 'id-ID' : 'en-US';
}

export function number(value: number) {
  return value.toLocaleString(locale());
}

export function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function applyPreferences() {
  document.documentElement.lang = preferences.language;
  document.documentElement.dataset.theme = preferences.theme;
  localStorage.setItem('study-language', preferences.language);
  localStorage.setItem('study-theme', preferences.theme);
}
