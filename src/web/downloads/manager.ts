const DOWNLOADS_CACHE = "feylore-downloads";

export interface DownloadRecord {
  id: string;
  fileId: string;
  urls: string[];
  createdAt: string;
}

export class DownloadManager {
  async fetchAndCache(
    downloadId: string,
    fileId: string,
    urls: string[],
    onProgress?: (bytesDownloaded: number) => void | Promise<void>,
  ): Promise<void> {
    const cache = await caches.open(DOWNLOADS_CACHE);
    let bytesDownloaded = 0;

    for (const url of urls) {
      const absolute = toAbsoluteUrl(url);
      const response = await fetch(absolute, { credentials: "include" });
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      await cache.put(absolute, response.clone());
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      bytesDownloaded += contentLength > 0 ? contentLength : 0;
      await onProgress?.(bytesDownloaded);
    }

    await this.registerDownload({
      id: downloadId,
      fileId,
      urls: urls.map(toAbsoluteUrl),
      createdAt: new Date().toISOString(),
    });
  }

  async registerDownload(record: DownloadRecord): Promise<void> {
    const db = await openRegistry();
    const tx = db.transaction("downloads", "readwrite");
    tx.objectStore("downloads").put(record, record.id);
    await txComplete(tx);
    db.close();
  }

  async removeDownload(id: string): Promise<void> {
    const db = await openRegistry();
    const tx = db.transaction("downloads", "readwrite");
    const store = tx.objectStore("downloads");
    const record = await idbRequest<DownloadRecord | undefined>(store.get(id));
    if (record) {
      const cache = await caches.open(DOWNLOADS_CACHE);
      for (const url of record.urls) {
        await cache.delete(url);
      }
    }
    store.delete(id);
    await txComplete(tx);
    db.close();
  }

  async listDownloads(): Promise<DownloadRecord[]> {
    const db = await openRegistry();
    const tx = db.transaction("downloads", "readonly");
    const records = await idbRequest<DownloadRecord[]>(
      tx.objectStore("downloads").getAll(),
    );
    await txComplete(tx);
    db.close();
    return records;
  }

  async hasCachedUrl(url: string): Promise<boolean> {
    const absolute = toAbsoluteUrl(url);
    const cache = await caches.open(DOWNLOADS_CACHE);
    const match = await cache.match(absolute);
    return match != null;
  }

  async getCachedResponse(url: string): Promise<Response | undefined> {
    const absolute = toAbsoluteUrl(url);
    const cache = await caches.open(DOWNLOADS_CACHE);
    return cache.match(absolute);
  }
}

function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return new URL(url, window.location.origin).href;
}

function openRegistry(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("feylore-downloads-registry", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("downloads")) {
        db.createObjectStore("downloads");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export { DOWNLOADS_CACHE };

export const downloadManager = new DownloadManager();
