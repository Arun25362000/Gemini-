import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Enable persistence for offline support if possible
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      // Multiple tabs open, persistence can only be enabled in one tab at a a time.
      console.warn('Firestore persistence failed: Multiple tabs open');
    } else if (err.code === 'unimplemented') {
      // The current browser doesn't support all of the features required to enable persistence
      console.warn('Firestore persistence failed: Browser not supported');
    }
  });
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
