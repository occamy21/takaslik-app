import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyCokMTBm9X72TGyey3zgQ_F0AKOwjHprb0",
  authDomain: "takaslik-app.firebaseapp.com",
  projectId: "takaslik-app",
  storageBucket: "takaslik-app.firebasestorage.app",
  messagingSenderId: "44606851164",
  appId: "1:44606851164:web:7c01a0a866aebf2117be99",
  measurementId: "G-81WTMQ6GJ2",
};

const app = initializeApp(firebaseConfig);
export const auth    = getAuth(app);
export const db      = getFirestore(app);
export const storage = getStorage(app);
