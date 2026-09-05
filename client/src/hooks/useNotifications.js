import { useState, useEffect, useCallback } from 'react';

// Persists a small notification list to localStorage per storage key (e.g. per customer/role)
// so the bell icon survives a page reload — nothing was ever actually saved before this.
export function useNotifications(storageKey) {
  const [items, setItems] = useState(() => {
    try {
      const s = localStorage.getItem(storageKey);
      return s ? JSON.parse(s) : [];
    } catch { return []; }
  });

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(items.slice(0, 50))); } catch {}
  }, [items, storageKey]);

  const push = useCallback((notif) => {
    setItems(prev => {
      if (notif.dedupeKey && prev.some(p => p.dedupeKey === notif.dedupeKey)) return prev;
      return [{ id: `${Date.now()}_${Math.random().toString(36).slice(2)}`, time: Date.now(), read: false, ...notif }, ...prev].slice(0, 50);
    });
  }, []);

  const markAllRead = useCallback(() => {
    setItems(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const unreadCount = items.filter(n => !n.read).length;

  return { items, push, markAllRead, clear, unreadCount };
}
