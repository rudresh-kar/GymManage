// Authentication helpers — sign in, sign up, sign out
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
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
