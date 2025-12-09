import { addDoc, collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./app/firebase";

// Add a user to Firestore
export const createUserProfile = async (uid, name, email) => {
  await setDoc(doc(db, "users", uid), {
    name,
    email,
  });
};

// Add a schedule entry for the current user
export const addSchedule = async (uid, day, startTime, endTime, note) => {
  await addDoc(collection(db, "users", uid, "schedules"), {
    day,
    startTime,
    endTime,
    note,
  });
};

// Get all schedules for the current user
export const getSchedules = async (uid) => {
  const snapshot = await getDocs(collection(db, "users", uid, "schedules"));
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

// Get all users in a group
export const getGroupMembers = async (groupId) => {
  const q = query(collection(db, "groups"), where("id", "==", groupId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => doc.data());
};
