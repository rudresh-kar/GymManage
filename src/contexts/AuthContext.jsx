import { createContext, useContext, useEffect, useState } from "react";
import { onAuthChange } from "../firebase/auth";
import { subscribeToUserProfile } from "../firebase/firestore";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,        setUser]        = useState(undefined); // undefined = auth loading
  const [userProfile, setUserProfile] = useState(undefined); // undefined = profile loading

  useEffect(() => {
    let profileUnsub = null;

    const authUnsub = onAuthChange((firebaseUser) => {
      // Cancel any previous profile listener
      if (profileUnsub) { profileUnsub(); profileUnsub = null; }

      if (firebaseUser) {
        setUser(firebaseUser);
        setUserProfile(undefined); // reset — loading new profile
        profileUnsub = subscribeToUserProfile(firebaseUser.uid, (profile) => {
          if (profile === null) {
            // Profile document is missing/deleted (e.g. member deleted by gym owner).
            // Sign out the user automatically.
            import("../firebase/auth").then(({ logoutUser }) => logoutUser());
            setUserProfile(null);
          } else {
            setUserProfile(profile);
          }
        });
      } else {
        setUser(null);
        setUserProfile(null); // logged out — no profile
      }
    });

    return () => {
      authUnsub();
      if (profileUnsub) profileUnsub();
    };
  }, []);

  // Still loading if auth hasn't resolved OR user is logged in but profile not yet fetched
  const loading = user === undefined || (user !== null && userProfile === undefined);

  // role: "admin" (super-admin) | "gymowner" | "member" | null
  const role = userProfile?.role ?? null;

  // Fallback to user UID if gymId is missing
  const gymId = userProfile?.gymId || user?.uid || null;

  return (
    <AuthContext.Provider value={{ user, userProfile, role, gymId, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access current auth state */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
