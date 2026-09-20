import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDh3aaJZwIPGh8JIDu3x63Zb_dXZKzmMh0",
  authDomain: "elated-pagoda-tc9s2.firebaseapp.com",
  projectId: "elated-pagoda-tc9s2",
  storageBucket: "elated-pagoda-tc9s2.firebasestorage.app",
  messagingSenderId: "409324533283",
  appId: "1:409324533283:web:194c6d2588c173a5e76396",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db = getFirestore(app, "ai-studio-idaratalawliyat-079a9967-1370-43d6-8add-07c07949ff1f");
