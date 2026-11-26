import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PUBLIC_INSTANCE,
  type PublicInstance,
} from "@shared/application-config";
import type { ThemePreference } from "../theme/useTheme";

type InstanceContextValue = PublicInstance & {
  refresh: () => Promise<void>;
};

const InstanceContext = createContext<InstanceContextValue>({
  ...DEFAULT_PUBLIC_INSTANCE,
  refresh: async () => {},
});

async function fetchInstance(): Promise<PublicInstance> {
  const res = await fetch("/api/v1/instance");
  if (!res.ok) return DEFAULT_PUBLIC_INSTANCE;
  const json = (await res.json()) as { data?: PublicInstance };
  return json.data ?? DEFAULT_PUBLIC_INSTANCE;
}

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<PublicInstance>(DEFAULT_PUBLIC_INSTANCE);

  const refresh = useCallback(async () => {
    const next = await fetchInstance();
    setInstance(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    document.title = instance.displayName;
  }, [instance.displayName]);

  useEffect(() => {
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="icon"][data-instance]') ??
      (() => {
        const el = document.createElement("link");
        el.rel = "icon";
        el.setAttribute("data-instance", "true");
        document.head.appendChild(el);
        return el;
      })();

    if (instance.faviconUrl) {
      link.href = instance.faviconUrl;
      link.type = instance.faviconUrl.endsWith(".svg")
        ? "image/svg+xml"
        : "image/png";
    } else {
      link.href = "/favicon.svg";
      link.type = "image/svg+xml";
    }
  }, [instance.faviconUrl]);

  return (
    <InstanceContext.Provider value={{ ...instance, refresh }}>
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance(): InstanceContextValue {
  return useContext(InstanceContext);
}

export function useRefreshInstance(): () => Promise<void> {
  return useContext(InstanceContext).refresh;
}

export function useInstanceDefaultTheme(): ThemePreference {
  return useInstance().defaultTheme;
}

export function useInstanceDefaultLocale(): string {
  return useInstance().defaultLocale;
}

export function useInstanceDisplayName(): string {
  return useInstance().displayName;
}

export function useInstanceLogoUrl(): string | null {
  return useInstance().logoUrl;
}
