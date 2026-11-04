/* Service worker của Debt Manager — sinh lúc build bởi pwa/vitePluginSw.ts (không sửa file trong dist). */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const CACHE = `debt-manager-${VERSION}`;
const REMINDER_TAG = 'debt-reminders';
const STALE_DAYS = 3;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('debt-manager-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Trang: ưu tiên mạng (lấy bản mới), mất mạng thì dùng bản đã cache. Tài nguyên có hash: cache trước.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        // App một trang: mọi đường dẫn đều dùng index.html (đã precache dưới khoá './')
        .catch(() => caches.match('./', { ignoreSearch: true })),
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ---------- Nhắc hạn khi app đóng ----------
// App ghi sẵn hàng đợi nhắc (đã tính) vào IndexedDB 'debt-manager' / store 'meta'; SW chỉ đọc và hiện.

function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('debt-manager');
    // DB chưa có (app chưa từng mở): không tạo DB rỗng, để app tự tạo đúng schema
    open.onupgradeneeded = () => open.transaction.abort();
    open.onerror = () => resolve(undefined);
    open.onsuccess = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('meta')) {
        db.close();
        return resolve(undefined);
      }
      const tx = db.transaction('meta', mode);
      let result;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => reject(tx.error);
      Promise.resolve(fn(tx.objectStore('meta'))).then((v) => (result = v));
    };
  });
}
const get = (store, key) => new Promise((res) => { const r = store.get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); });

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
};

// Cùng quy tắc với remindersDue/markShown trong src/domain/reminders.ts
async function checkReminders() {
  const today = localToday();
  const data = await idb('readonly', async (s) => ({
    enabled: await get(s, 'notifyEnabled'),
    queue: (await get(s, 'reminderQueue')) || [],
    shown: (await get(s, 'shownReminders')) || [],
  }));
  if (!data || !data.enabled || Notification.permission !== 'granted') return;
  const done = new Set(data.shown);
  const latest = new Map();
  for (const r of data.queue) {
    if (r.date > today || r.date < addDays(today, -STALE_DAYS)) continue;
    const cur = latest.get(r.itemKey);
    if (!cur || r.daysBefore < cur.daysBefore) latest.set(r.itemKey, r);
  }
  const due = [...latest.values()].filter((r) => !done.has(r.key));
  if (!due.length) return;
  for (const r of due) {
    await self.registration.showNotification(r.title, {
      body: r.body,
      tag: r.key,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      data: { url: './#/dashboard' },
    });
    for (const q of data.queue) if (q.itemKey === r.itemKey && q.daysBefore >= r.daysBefore) done.add(q.key);
  }
  await idb('readwrite', (s) => s.put([...done].slice(-500), 'shownReminders'));
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === REMINDER_TAG) event.waitUntil(checkReminders());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => c.url.startsWith(self.registration.scope));
      if (client) return client.focus().then((c) => c.navigate?.(url));
      return self.clients.openWindow(url);
    }),
  );
});
