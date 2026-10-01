import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { enUS, id as idLocale, type Locale } from 'date-fns/locale'
import { en } from './locales/en'
import { id } from './locales/id'

export const LANGUAGES = ['en', 'id'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'language'

const DATE_LOCALES: Record<Language, Locale> = { en: enUS, id: idLocale }

function isLanguage(value: unknown): value is Language {
  return LANGUAGES.includes(value as Language)
}

/** The browser's language when it is Indonesian, otherwise English. */
export function browserLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? '' : navigator.language
  return preferred.toLowerCase().startsWith('id') ? 'id' : 'en'
}

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLanguage(value) ? value : null
  } catch {
    // No storage (tests, private mode): fall back to the browser language
    return null
  }
}

/** Switches the interface language and remembers it; `null` goes back to the browser language. */
export function setLanguage(language: Language | null) {
  try {
    if (language) localStorage.setItem(STORAGE_KEY, language)
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Preference is not persisted, but the switch below still applies
  }
  void i18n.changeLanguage(language ?? browserLanguage())
}

/** The active language, narrowed to the supported ones. */
export function currentLanguage(): Language {
  return isLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en'
}

/** date-fns locale for the active language. */
export function dateLocale(): Locale {
  return DATE_LOCALES[currentLanguage()]
}

i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = language
})

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, id: { translation: id } },
  lng: storedLanguage() ?? browserLanguage(),
  fallbackLng: 'en',
  supportedLngs: LANGUAGES,
  // React already escapes rendered text
  interpolation: { escapeValue: false },
  returnNull: false,
})

export default i18n
