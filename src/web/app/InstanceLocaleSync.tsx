import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../app/auth-context";
import { useInstance } from "../app/instance-context";

/** Applies locale: authenticated user preference, else installation default. */
export function InstanceLocaleSync() {
  const { user } = useAuth();
  const { defaultLocale } = useInstance();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (user?.locale) {
      void i18n.changeLanguage(user.locale);
      return;
    }
    if (!user) {
      void i18n.changeLanguage(defaultLocale);
    }
  }, [user?.locale, user, defaultLocale, i18n]);

  return null;
}
