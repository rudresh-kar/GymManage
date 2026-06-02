// Authentication helpers — sign in, sign up, sign out
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  updateEmail,
  verifyBeforeUpdateEmail,
} from "firebase/auth";
import { auth, secondaryAuth } from "./config";

/**
 * Register a new admin/staff user (primary app)
 */
export const registerUser = async (email, password, displayName) => {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName });
  return credential.user;
};

/**
 * Create a Firebase Auth account for a gym member.
 * Uses the secondary app so the admin stays signed in.
 * Returns the new user's UID.
 */
export const createMemberAccount = async (email, password) => {
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  const uid = credential.user.uid;
  // Sign out of the secondary app immediately — admin isn't affected
  await signOut(secondaryAuth);
  return uid;
};

/**
 * Sign in an existing user (works for both admin and members)
 */
export const loginUser = async (email, password) => {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
};

/**
 * Sign out the current user
 */
export const logoutUser = () => signOut(auth);

/**
 * Subscribe to auth state changes
 */
export const onAuthChange = (callback) => onAuthStateChanged(auth, callback);

/**
 * Resets a user's password client-side by temporarily authenticating
 * using their old password, updating to the new password, and signing out.
 */
export const resetUserPassword = async (email, oldPassword, newPassword) => {
  const credential = await signInWithEmailAndPassword(auth, email, oldPassword);
  await updatePassword(credential.user, newPassword);
  await signOut(auth);
};

/**
 * Updates the current logged-in user's email in Firebase Auth
 */
export const updateUserEmail = async (newEmail) => {
  if (auth.currentUser) {
    try {
      await updateEmail(auth.currentUser, newEmail);
      return { verified: true };
    } catch (err) {
      if (err.code === "auth/operation-not-allowed" || err.message?.includes("verify the new email")) {
        if (newEmail.endsWith("@flexpro.in") || (auth.currentUser.email && auth.currentUser.email.endsWith("@flexpro.in"))) {
          throw new Error("Email change verification is enabled in your Firebase project. To allow updating phone numbers/dummy emails, you must go to Firebase Console > Authentication > Settings > User actions, and disable 'Verify email before changing'.");
        }
        await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
        return { verified: false };
      }
      throw err;
    }
  }
  return { verified: false };
};

/**
 * Updates the contact/phone number for the logged-in user.
 * If they are currently using a dummy email (ending in @flexpro.in),
 * it also updates their Firebase Auth email to [newPhone]@flexpro.in.
 */
export const updateUserPhone = async (newPhone) => {
  if (!auth.currentUser) throw new Error("No user is currently logged in.");
  
  const cleanPhone = newPhone.replace(/[^0-9]/g, "");
  if (cleanPhone.length !== 10) throw new Error("Phone number must be exactly 10 digits.");
  
  const currentEmail = auth.currentUser.email || "";
  if (currentEmail.endsWith("@flexpro.in")) {
    const newDummyEmail = `${cleanPhone}@flexpro.in`;
    return await updateUserEmail(newDummyEmail);
  }
  return { verified: true };
};


