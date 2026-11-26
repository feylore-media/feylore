import { useEffect } from "react";
import { useAuth } from "../app/auth-context";
import { useInstance } from "../app/instance-context";
import { useThemeContext } from "./ThemeProvider";
import type { ThemePreference } from "./useTheme";

function isThemePreference(value: string | undefined): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** Applies theme: authenticated user preference, else installation default. */
export function ThemeSync() {
  const { user } = useAuth();
  const { defaultTheme } = useInstance();
  const { syncFromServer } = useThemeContext();

  useEffect(() => {
    if (user?.theme && isThemePreference(user.theme)) {
      syncFromServer(user.theme);
      return;
    }
    if (!user) {
      syncFromServer(defaultTheme);
    }
  }, [user?.theme, user, defaultTheme, syncFromServer]);

  return null;
}
