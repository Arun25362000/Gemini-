import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  doc, 
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

const isBrowser = typeof window !== 'undefined';

// Initialize Firestore with robust connection settings for iframe and webview environments
// Using experimentalForceLongPolling eliminates the 10-second WebChannel streaming timeout behind proxies
export const db = initializeFirestore(app, {
  ...(isBrowser ? { experimentalForceLongPolling: true } : {}),
  localCache: isBrowser
    ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    : undefined,
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Initialize persistence as early as possible
if (isBrowser) {
  // Use indexedDBLocalPersistence as primary - reliable at preserving auth state
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
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
