// IndexedDB 的薄包裝。資料只存在這台裝置的瀏覽器裡。

const DB_NAME = 'price-tracker';
const DB_VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      db.createObjectStore('categories', { keyPath: 'id' });
      db.createObjectStore('products', { keyPath: 'id' });
      db.createObjectStore('purchases', { keyPath: 'id' }).createIndex('productId', 'productId');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  return dbPromise;
}

function done(t) {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function put(store, ...items) {
  const t = (await open()).transaction(store, 'readwrite');
  for (const item of items) t.objectStore(store).put(item);
  return done(t);
}

export async function del(store, id) {
  const t = (await open()).transaction(store, 'readwrite');
  t.objectStore(store).delete(id);
  return done(t);
}

export const setMeta = (key, value) => put('meta', { key, value });

// 刪除商品時連同底下的購買紀錄一起刪
export async function deleteProduct(id) {
  const t = (await open()).transaction(['products', 'purchases'], 'readwrite');
  t.objectStore('products').delete(id);
  const cursor = t.objectStore('purchases').index('productId').openCursor(IDBKeyRange.only(id));
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (c) { c.delete(); c.continue(); }
  };
  return done(t);
}

// 從備份還原：清空後整批寫入，同一個交易內完成
export async function replaceAll(data) {
  const stores = ['categories', 'products', 'purchases'];
  const t = (await open()).transaction(stores, 'readwrite');
  for (const s of stores) {
    const os = t.objectStore(s);
    os.clear();
    for (const item of data[s]) os.put(item);
  }
  return done(t);
}
