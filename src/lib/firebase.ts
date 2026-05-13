import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, indexedDBLocalPersistence, browserLocalPersistence } from 'firebase/auth';
import { 
  getFirestore, 
  enableIndexedDbPersistence, 
  doc, 
  getDocFromServer,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Initialize Firestore with settings optimized for mobile WebViews
// Using experimentalForceLongPolling avoids websocket issues in some Android environments
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager()
  })
}, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

// Initialize persistence as early as possible
if (typeof window !== 'undefined') {
  // Use indexedDBLocalPersistence as primary - it is much more reliable at preserving 
  // auth state through the redirect cycle in mobile WebView/Capacitor environments.
  setPersistence(auth, indexedDBLocalPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(err => console.error("Could not set auth persistence:", err));

  // No longer need explicit enableIndexedDbPersistence(db) 
  // as it is handled by initializeFirestore with persistentLocalCache
}

// CRITICAL CONSTRAINT: Test connection to Firestore on boot
async function testConnection() {
  try {
    // Attempting to fetch a non-existent doc from server to verify connectivity and API status
    await getDocFromServer(doc(db, 'system', 'connection_test'));
    console.log("Firestore connection verified.");
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error("Firestore Error: The client is offline. Please check your internet connection.");
      } else if (error.message.includes('PERMISSION_DENIED')) {
        console.error("Firestore Error: Permission Denied. Please ensure the Firestore API is enabled and rules are deployed.");
      } else {
        console.error("Firestore connection test failed:", error.message);
      }
    }
  }
}

testConnection();
