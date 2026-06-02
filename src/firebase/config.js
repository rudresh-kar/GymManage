// Firebase configuration for Gym Management App
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBIhfIrRantyqlhu-ovrTVjDekMzF4F1h4",
  authDomain: "gym-management-app-a7034.firebaseapp.com",
  projectId: "gym-management-app-a7034",
  storageBucket: "gym-management-app-a7034.firebasestorage.app",
  messagingSenderId: "913435117657",
  appId: "1:913435117657:web:e568f0ded8de657a298948",
};

// ─── Primary App (Admin) ──────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// ─── Secondary App (Member account creation) ──────────────────────────────────
// Using a separate instance so creating a member auth account doesn't sign
// out the currently logged-in admin from the primary app.
const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);

export default app;
