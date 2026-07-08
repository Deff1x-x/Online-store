export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export class MemoryStorage implements StorageAdapter {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

abstract class WebStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage | null) {}

  getItem(key: string) {
    return this.storage?.getItem(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.storage?.setItem(key, value);
  }

  removeItem(key: string) {
    this.storage?.removeItem(key);
  }

  clear() {
    this.storage?.clear();
  }
}

export class LocalStorageAdapter extends WebStorageAdapter {
  constructor(storage = getBrowserStorage("localStorage")) {
    super(storage);
  }
}

export class SessionStorageAdapter extends WebStorageAdapter {
  constructor(storage = getBrowserStorage("sessionStorage")) {
    super(storage);
  }
}

export class MirroredStorage implements StorageAdapter {
  constructor(
    private readonly primary: StorageAdapter,
    private readonly secondary: StorageAdapter,
  ) {}

  getItem(key: string) {
    return this.primary.getItem(key) ?? this.secondary.getItem(key);
  }

  setItem(key: string, value: string) {
    this.primary.setItem(key, value);
    this.secondary.setItem(key, value);
  }

  removeItem(key: string) {
    this.primary.removeItem(key);
    this.secondary.removeItem(key);
  }

  clear() {
    this.primary.clear();
    this.secondary.clear();
  }
}

function getBrowserStorage(name: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window[name];
  } catch {
    return null;
  }
}

export function createAuthTokenStorage() {
  return new MirroredStorage(new MemoryStorage(), new LocalStorageAdapter());
}
