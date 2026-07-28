import { logger } from '@/src/services/logging';

export function getItem<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setItem<T>(key: string, value: T): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    logger.error('session storage write failed', { 'event.name': 'session.storage_write_failed', 'db.system': 'web_storage', 'db.operation.name': 'setItem', 'db.collection.name': key, 'error.type': e instanceof Error ? e.name : typeof e });
  }
}

export function removeItem(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch (e) {
    logger.error('session storage remove failed', { 'event.name': 'session.storage_remove_failed', 'db.system': 'web_storage', 'db.operation.name': 'removeItem', 'db.collection.name': key, 'error.type': e instanceof Error ? e.name : typeof e });
  }
}
