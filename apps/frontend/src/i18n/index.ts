import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { common } from './locales/common';
import { dashboard } from './locales/dashboard';
import { payments } from './locales/payments';
import { providers } from './locales/providers';
import { services } from './locales/services';
import { settings } from './locales/settings';

export const SUPPORTED_LANGS = ['en', 'ru'] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

const resources = {
  en: {
    translation: {
      ...common.en,
      dashboard: dashboard.en,
      providers: providers.en,
      services: services.en,
      payments: payments.en,
      settings: settings.en,
    },
  },
  ru: {
    translation: {
      ...common.ru,
      dashboard: dashboard.ru,
      providers: providers.ru,
      services: services.ru,
      payments: payments.ru,
      settings: settings.ru,
    },
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGS,
    // Map regional variants (e.g. ru-RU → ru) to a supported language.
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false }, // React already escapes
    detection: {
      // Browser autodetect, with the user's explicit choice persisted in localStorage.
      order: ['localStorage', 'navigator', 'htmlTag'],
      lookupLocalStorage: 'lang',
      caches: ['localStorage'],
    },
  });

export default i18n;
