import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import sr from './locales/sr.json';

export const SUPPORTED_LANGUAGES = ['en', 'ru', 'uk', 'sr'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

const resources = {
  en: { translation: en },
  ru: { translation: ru },
  uk: { translation: uk },
  sr: { translation: sr },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'mtodo_lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
