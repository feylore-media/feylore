const STORAGE_KEY = "feylore-device-id";

export function getStoredDeviceId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredDeviceId(id: string): void {
  localStorage.setItem(STORAGE_KEY, id);
}

export function clearStoredDeviceId(): void {
  localStorage.removeItem(STORAGE_KEY);
}
