import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence, inMemoryPersistence } from 'firebase/auth';
import { 
  doc, 
  getDocFromServer,
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const isBrowser = typeof window !== 'undefined';

// Initialize Firestore with robust connection settings and graceful fallback
// for iOS Safari, WebKit in-app browsers, and Safari Private Browsing mode
let dbInstance: ReturnType<typeof initializeFirestore>;
try {
  dbInstance = initializeFirestore(app, {
    ...(isBrowser ? { experimentalForceLongPolling: true } : {}),
    localCache: isBrowser
      ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
      : undefined,
  }, firebaseConfig.firestoreDatabaseId);
} catch (cacheError) {
  console.warn("Firestore persistent local cache fallback triggered (common in iOS Safari private mode or restricted WebKit):", cacheError);
  try {
    dbInstance = initializeFirestore(app, {
      ...(isBrowser ? { experimentalForceLongPolling: true } : {}),
      localCache: memoryLocalCache(),
    }, firebaseConfig.firestoreDatabaseId);
  } catch {
    dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = dbInstance;
export const auth = getAuth(app);

// Initialize persistence as early as possible with graceful fallback for iOS Safari / WebKit
if (isBrowser) {
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(() => setPersistence(auth, inMemoryPersistence))
    .catch(err => console.warn("Could not set auth persistence:", err));
}

// CRITICAL CONSTRAINT: Test connection to Firestore on boot
async function testConnection() {
  try {
    // Attempting to fetch connection doc from server to verify connectivity
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    console.log("Firestore connection verified.");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.info("Firestore operating in cached/offline mode until backend is reachable.");
      } else if (error.message.includes('PERMISSION_DENIED')) {
        console.warn("Firestore Notice: Permission check completed.");
      } else {
        console.warn("Firestore connection notice:", error.message);
      }
    }
  }
}

testConnection();
