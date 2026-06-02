import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  limit,
  startAfter,
} from "firebase/firestore";
import { db } from "./config";

/** Returns today's date key in local timezone as YYYY-MM-DD */
export const getLocalDateKey = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// ─── Collection References ────────────────────────────────────────────────────
export const COLLECTIONS = {
  MEMBERS:    "members",
  PAYMENTS:   "payments",
  ATTENDANCE: "attendance",
  STAFF:      "staff",
  USERS:      "users",
};

// ─── Generic CRUD ─────────────────────────────────────────────────────────────

/** Add a document to a collection (auto-ID) */
export const addDocument = async (collectionName, data) => {
  const ref = await addDoc(collection(db, collectionName), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
};

/** Get a single document by ID */
export const getDocument = async (collectionName, id) => {
  const snap = await getDoc(doc(db, collectionName, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/** Get all documents in a collection */
export const getDocuments = async (collectionName) => {
  const snap = await getDocs(collection(db, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Update a document */
export const updateDocument = async (collectionName, id, data) => {
  await updateDoc(doc(db, collectionName, id), {
    ...data,
    updatedAt: serverTimestamp(),
  });
};

/** Delete a document */
export const deleteDocument = async (collectionName, id) => {
  await deleteDoc(doc(db, collectionName, id));
};

// ─── User Profiles ────────────────────────────────────────────────────────────

/**
 * Create or overwrite a user profile document keyed by Firebase Auth UID.
 * Called when admin creates a new member account.
 */
export const createUserProfile = async (uid, data) => {
  await setDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

/** Fetch a user profile once (used during login for role check) */
export const getUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

/** Real-time user profile listener */
export const subscribeToUserProfile = (uid, callback) => {
  return onSnapshot(doc(db, COLLECTIONS.USERS, uid), (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
};

// ─── Members ──────────────────────────────────────────────────────────────────

export const addMember = (data) => addDocument(COLLECTIONS.MEMBERS, data);
export const getMembers = () => getDocuments(COLLECTIONS.MEMBERS);
export const getMember = (id) => getDocument(COLLECTIONS.MEMBERS, id);
export const updateMember = (id, data) => updateDocument(COLLECTIONS.MEMBERS, id, data);
export const deleteMember = async (id) => {
  try {
    const memberDoc = await getMember(id);
    if (memberDoc && memberDoc.uid) {
      await deleteDocument(COLLECTIONS.USERS, memberDoc.uid);
    }
  } catch (err) {
    console.error("Error deleting associated user profile:", err);
  }
  await deleteDocument(COLLECTIONS.MEMBERS, id);
};

/** Real-time listener — returns unsubscribe fn */
export const subscribeToMembers = (gymId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.MEMBERS),
    where("gymId", "==", gymId)
  );
  return onSnapshot(q, (snap) => {
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    records.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    callback(records);
  });
};

/** Get members with an active membership */
export const getActiveMembers = async (gymId) => {
  const q = query(
    collection(db, COLLECTIONS.MEMBERS),
    where("gymId", "==", gymId),
    where("status", "==", "active")
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  records.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || 0;
    const tb = b.createdAt?.toMillis?.() || 0;
    return tb - ta;
  });
  return records;
};

// ─── Payments ─────────────────────────────────────────────────────────────────

export const addPayment = (data) => addDocument(COLLECTIONS.PAYMENTS, data);
export const getPayments = () => getDocuments(COLLECTIONS.PAYMENTS);

export const getPaymentsForMember = async (memberId) => {
  const q = query(
    collection(db, COLLECTIONS.PAYMENTS),
    where("memberId", "==", memberId),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Real-time payments listener for a member */
export const subscribeToMemberPayments = (memberId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.PAYMENTS),
    where("memberId", "==", memberId)
  );
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    data.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    callback(data);
  });
};

/** Real-time payments listener for a gym */
export const subscribeToGymPayments = (gymId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.PAYMENTS),
    where("gymId", "==", gymId)
  );
  return onSnapshot(q, (snap) => {
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    data.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || 0;
      const tb = b.createdAt?.toMillis?.() || 0;
      return tb - ta;
    });
    callback(data);
  });
};

/** Paginated payment fetcher — returns { records, lastDoc, hasMore } */
export const getPaymentsForMemberPaginated = async (memberId, limitCount = 5, lastDocSnap = null) => {
  const constraints = [
    collection(db, COLLECTIONS.PAYMENTS),
    where("memberId", "==", memberId),
    orderBy("createdAt", "desc"),
  ];
  if (lastDocSnap) constraints.push(startAfter(lastDocSnap));
  if (limitCount) constraints.push(limit(limitCount));

  const q = query(...constraints);
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  const hasMore = snap.docs.length === limitCount;

  return { records, lastDoc: newLastDoc, hasMore };
};

// ─── Attendance ───────────────────────────────────────────────────────────────

export const recordAttendance = (data) => addDocument(COLLECTIONS.ATTENDANCE, data);

export const getAttendanceForMember = async (memberId) => {
  const q = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("memberId", "==", memberId)
  );
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  
  // Sort client-side to prevent Firestore composite index requirements
  records.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || new Date(a.checkInTime || 0).getTime();
    const tb = b.createdAt?.toMillis?.() || new Date(b.checkInTime || 0).getTime();
    return tb - ta;
  });
  
  return records;
};

/** Real-time listener for today's attendance records, newest first */
export const subscribeToTodayAttendance = (gymId, callback) => {
  const todayKey = getLocalDateKey();
  const q = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("gymId", "==", gymId),
    where("dateKey", "==", todayKey)
  );
  return onSnapshot(q, (snap) => {
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // Client-side sort to avoid requiring a composite index in Firestore
    records.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || new Date(a.checkInTime).getTime();
      const tb = b.createdAt?.toMillis?.() || new Date(b.checkInTime).getTime();
      return tb - ta;
    });
    callback(records);
  });
};

/** Real-time listener for ALL attendance records, newest first (limit 200 for perf) */
export const subscribeToAllAttendance = (gymId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("gymId", "==", gymId)
  );
  return onSnapshot(q, (snap) => {
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    records.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || new Date(a.checkInTime).getTime();
      const tb = b.createdAt?.toMillis?.() || new Date(b.checkInTime).getTime();
      return tb - ta;
    });
    callback(records);
  });
};

/** Real-time listener for a specific member's full attendance history */
export const subscribeToMemberAttendance = (memberId, callback) => {
  const q = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("memberId", "==", memberId)
  );
  return onSnapshot(q, (snap) => {
    const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    records.sort((a, b) => {
      const ta = a.createdAt?.toMillis?.() || new Date(a.checkInTime).getTime();
      const tb = b.createdAt?.toMillis?.() || new Date(b.checkInTime).getTime();
      return tb - ta;
    });
    callback(records);
  });
};

/** Returns true if member already checked in today */
export const checkAlreadyCheckedIn = async (memberId) => {
  const todayKey = getLocalDateKey();
  const q = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("memberId", "==", memberId),
    where("dateKey", "==", todayKey)
  );
  const snap = await getDocs(q);
  return !snap.empty;
};

/** Paginated attendance fetcher — returns { records, lastDoc, hasMore } */
export const getAttendanceForMemberPaginated = async (memberId, limitCount = 5, lastDocSnap = null) => {
  const constraints = [
    collection(db, COLLECTIONS.ATTENDANCE),
    where("memberId", "==", memberId),
    orderBy("createdAt", "desc"),
  ];
  if (lastDocSnap) constraints.push(startAfter(lastDocSnap));
  if (limitCount) constraints.push(limit(limitCount));

  const q = query(...constraints);
  const snap = await getDocs(q);
  const records = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const newLastDoc = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;
  const hasMore = snap.docs.length === limitCount;

  return { records, lastDoc: newLastDoc, hasMore };
};

/** Get all gym owner accounts (role == 'gymowner') */
export const getAllGymOwners = async () => {
  const q = query(
    collection(db, COLLECTIONS.USERS),
    where("role", "==", "gymowner")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Get members of a specific gym */
export const getGymMembers = async (gymId) => {
  const q = query(
    collection(db, COLLECTIONS.MEMBERS),
    where("gymId", "==", gymId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/** Get global overview statistics across the platform */
export const getGlobalStats = async () => {
  // Get gyms count
  const gymsQ = query(
    collection(db, COLLECTIONS.USERS),
    where("role", "==", "gymowner")
  );
  const gymsSnap = await getDocs(gymsQ);
  const totalGyms = gymsSnap.size;

  // Get total members count
  const membersSnap = await getDocs(collection(db, COLLECTIONS.MEMBERS));
  const totalMembers = membersSnap.size;

  // Get total attendance count (checked in today)
  const todayKey = getLocalDateKey();
  const attendanceQ = query(
    collection(db, COLLECTIONS.ATTENDANCE),
    where("dateKey", "==", todayKey)
  );
  const attendanceSnap = await getDocs(attendanceQ);
  const todayAttendance = attendanceSnap.size;

  return {
    totalGyms,
    totalMembers,
    todayAttendance,
  };
};

/** Find a user in the USERS collection by contact number */
export const findUserByContact = async (contact) => {
  if (!contact) return null;
  const cleanContact = contact.trim().replace(/\+/g, "").replace(/[^0-9]/g, "");
  
  // Try querying direct matches
  const q1 = query(collection(db, COLLECTIONS.USERS), where("contact", "==", contact.trim()));
  const snap1 = await getDocs(q1);
  if (!snap1.empty) {
    const d = snap1.docs[0];
    return { id: d.id, ...d.data() };
  }
  
  // Fallback: search and compare cleaned digits
  const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    const docContactClean = data.contact?.replace(/\+/g, "").replace(/[^0-9]/g, "");
    if (docContactClean && docContactClean === cleanContact) {
      return { id: doc.id, ...data };
    }
  }
  return null;
};
