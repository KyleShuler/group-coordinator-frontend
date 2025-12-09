import { useRouter } from "expo-router";
import { getAuth, signOut } from "firebase/auth";
import {
  arrayUnion, collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Button, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import WeekView from "react-native-week-view";
import { db } from "../firebase";

// Sunday as start of week
function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sun
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

// merge overlapping intervals into a union
function mergeIntervals(
  intervals: { start: Date; end: Date }[]
): { start: Date; end: Date }[] {
  if (intervals.length === 0) return [];

  const sorted = [...intervals].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );

  const merged: { start: Date; end: Date }[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    if (next.start <= current.end) {
      // overlap
      if (next.end > current.end) {
        current.end = new Date(next.end);
      }
    } else {
      merged.push(current);
      current = { ...next };
    }
  }
  merged.push(current);

  return merged;
}

export default function GroupEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(getStartOfWeek(new Date()));
  const [memberInput, setMemberInput] = useState("");
  const [initializing, setInitializing] = useState(true); 


  const [message, setMessage] = useState("");
    const router = useRouter();

  //list of free intervals
  const [freeSlots, setFreeSlots] = useState<
    { date: string; start: Date; end: Date }[]
  >([]);

  const handleLogout = async () => {
      try {
        await signOut;
        setMessage("Logged out");
        router.replace("/auth");
      } catch (error: any) {
        console.error("Logout error:", error.message);
        setMessage(error.message);
      }
    };

  // Load groups for logged in user
  useEffect(() => {
  const loadGroups = async () => {
    try {
      setInitializing(true);

      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        return;
      }

      const groupsSnap = await getDocs(
        collection(db, "users", user.uid, "groups")
      );

      const list: any[] = [];
      for (const g of groupsSnap.docs) {
        const groupDoc = await getDoc(doc(db, "groups", g.id));
        if (groupDoc.exists()) {
          list.push({
            id: g.id,
            name: groupDoc.data().name || "Unnamed Group",
          });
        }
      }

      setGroups(list);
      if (list.length > 0) setSelectedGroup(list[0].id);
    } catch (err) {
      console.error("Error loading groups:", err);
      Alert.alert("Error", "Could not load your groups.");
    } finally {
      setInitializing(false);
    }
  };

  loadGroups();
}, []);


  // Load group availability 
  useEffect(() => {
    if (!selectedGroup) return;
    loadGroupEventsOnly();
  }, [selectedGroup, selectedDate]);

  const loadGroupEventsOnly = async () => {
    
    setFreeSlots([]); 

    try {
      const groupRef = doc(db, "groups", selectedGroup!);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) {
        setEvents([]);
        setLoading(false);
        return;
      }

      const groupData = groupSnap.data();
      const groupName = groupData.name;
      const availability = groupData.availability || [];

      const weekStart = getStartOfWeek(selectedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weeklyBlocks = availability.filter((slot: any) => {
        const d = new Date(slot.date);
        return d >= weekStart && d <= weekEnd;
      });

      const orangeEvents: any[] = weeklyBlocks.map((slot: any) => ({
        id: "g-" + slot.date + "-" + slot.start,
        title: groupName,
        startDate: new Date(slot.start),
        endDate: new Date(slot.end),
        color: "#FF9F1C",
      }));

      setEvents(orangeEvents);
    } catch (err) {
      console.error("Error loading group events:", err);
      Alert.alert("Error", "Could not load events for this group.");
    } finally {
      
    }
  };

  // Find free times 
  const handleFindFreeTimes = async () => {
    if (!selectedGroup) {
      Alert.alert("Select a group first");
      return;
    }

    try {
      setLoading(true);
      setFreeSlots([]);

      const groupRef = doc(db, "groups", selectedGroup);
      const groupSnap = await getDoc(groupRef);
      if (!groupSnap.exists()) {
        Alert.alert("Error", "Group not found.");
        setLoading(false);
        return;
      }

      const groupData = groupSnap.data();
      const availability = groupData.availability || [];
      const members: string[] = groupData.members || [];

      const weekStart = getStartOfWeek(selectedDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      const weeklyBlocks = availability.filter((slot: any) => {
        const d = new Date(slot.date);
        return d >= weekStart && d <= weekEnd;
      });

      const free: { date: string; start: Date; end: Date }[] = [];

      // For each group block 
      for (const block of weeklyBlocks) {
        const blockDateStr = block.date as string;
        const blockStart = new Date(block.start);
        const blockEnd = new Date(block.end);

        // Day boundaries for queries
        const dayStart = new Date(blockStart);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(blockStart);
        dayEnd.setHours(23, 59, 59, 999);

        // Collect busy intervals from ALL members
        const busyIntervals: { start: Date; end: Date }[] = [];

        for (const uid of members) {
          const q = query(
            collection(db, "users", uid, "schedules"),
            where("start", ">=", dayStart),
            where("start", "<=", dayEnd)
          );

          const snap = await getDocs(q);

          snap.forEach((docu) => {
            const data: any = docu.data();

            // Handle Firestore Timestamp vs Date
            let s: any = data.start;
            let e: any = data.end;

            if (s && typeof s.toDate === "function") s = s.toDate();
            if (e && typeof e.toDate === "function") e = e.toDate();

            const start = new Date(s);
            const end = new Date(e);

            // Ignore invalid or zero-length
            if (!(start instanceof Date) || isNaN(start.getTime())) return;
            if (!(end instanceof Date) || isNaN(end.getTime())) return;
            if (end <= start) return;

            // Clip to inside the group block 
            if (end <= blockStart || start >= blockEnd) {
              
              return;
            }

            const clippedStart =
              start < blockStart ? new Date(blockStart) : new Date(start);
            const clippedEnd =
              end > blockEnd ? new Date(blockEnd) : new Date(end);

            busyIntervals.push({ start: clippedStart, end: clippedEnd });
          });
        }

        // If no members or no busy intervals, whole block is free
        if (members.length === 0 || busyIntervals.length === 0) {
          free.push({ date: blockDateStr, start: blockStart, end: blockEnd });
          continue;
        }

        // Merge busy intervals into union
        const mergedBusy = mergeIntervals(busyIntervals);

        // find gaps between blockStart blockEnd that are NOT busy
        let cursor = new Date(blockStart);

        for (const b of mergedBusy) {
          if (cursor < b.start) {
            // there is a free gap
            free.push({
              date: blockDateStr,
              start: new Date(cursor),
              end: new Date(b.start),
            });
          }

          if (cursor < b.end) {
            cursor = new Date(b.end);
          }
        }

        // Final gap after last interval
        if (cursor < blockEnd) {
          free.push({
            date: blockDateStr,
            start: new Date(cursor),
            end: new Date(blockEnd),
          });
        }
      }

      setFreeSlots(free);
      setLoading(false);
    } catch (err) {
      console.error("Error finding free times:", err);
      Alert.alert("Error", "Could not compute free time.");
      setLoading(false);
    }
  };

  // Add member 
  const handleAddMember = async () => {
  if (!selectedGroup) {
    Alert.alert("Select a Group", "Please select a group first.");
    return;
  }

  if (!memberInput.trim()) {
    Alert.alert("Missing Email", "Please enter a user's email address.");
    return;
  }

  try {
    const email = memberInput.trim().toLowerCase();

    // Find user by email
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);

    if (snap.empty) {
      Alert.alert("User Not Found", "No user found with that email.");
      return;
    }

    const userDoc = snap.docs[0];
    const userIdToAdd = userDoc.id;

    // Get group
    const groupRef = doc(db, "groups", selectedGroup);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      Alert.alert("Error", "Group not found.");
      return;
    }

    const groupData = groupSnap.data();
    const currentMembers = groupData.members || [];

    // Prevent dublicate memeber
    if (currentMembers.includes(userIdToAdd)) {
      Alert.alert("Already a Member", "This user is already in the group.");
      return;
    }

    //  Add to group
    await updateDoc(groupRef, {
      members: arrayUnion(userIdToAdd),
    });

    // Add reverse reference
    const userGroupRef = doc(db, "users", userIdToAdd, "groups", selectedGroup);
    await setDoc(userGroupRef, {
      groupId: selectedGroup,
      joinedAt: new Date(),
    });

    Alert.alert("Success", "Member added!");
    setMemberInput("");

  } catch (err) {
    console.error("Error adding member:", err);
    Alert.alert("Error", "Could not add member.");
  }
};


 if (initializing) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#FF9F1C" />
    </View>
  );
}


  return (
    <><View style {...styles.logoutHeader}>
      <Button
        title="                                                           Logout"
        onPress={handleLogout} />
    </View><View style={styles.container}>
        {/* Group selection */}
        {Platform.OS === "web" ? (
          <select
            value={selectedGroup || ""}
            onChange={(e) => setSelectedGroup(e.target.value)}
            style={styles.selectWeb}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        ) : (
          <View style={styles.pickerContainer}>
            {groups.map((g) => (
              <Button
                key={g.id}
                title={g.name}
                onPress={() => setSelectedGroup(g.id)}
                color={selectedGroup === g.id ? "#FF9F1C" : "#888"} />
            ))}
          </View>
        )}

        {/* Add member */}
        <View style={styles.addMemberSection}>
          <Text style={styles.label}>Add Member (UID)</Text>
          <TextInput
            style={styles.input}
            value={memberInput}
            onChangeText={setMemberInput}
            placeholder="Enter UID" />
          <Button title="Add Member" onPress={handleAddMember} />
        </View>

        {/* Free Times Button */}
        <View style={{ marginHorizontal: 10, marginBottom: 10 }}>
          <Button title="Find Free Times" onPress={handleFindFreeTimes} />
        </View>

        {/* WeekView for group blocks only  */}
        <WeekView
          events={events}
          selectedDate={selectedDate}
          numberOfDays={7}
          weekStartsOn={0}
          startHour={8}
          endHour={22}
          hoursInDisplay={16}
          timeColumnWidth={50}
          formatDateHeader="ddd MM/DD"
          formatTimeLabel="h:mm a"
          headerStyle={{ backgroundColor: "#f9f9f9" }}
          headerTextStyle={{
            fontWeight: "600",
            fontSize: 13,
            color: "#333",
          }}
          onSwipeNext={() =>
  setSelectedDate(prev => {
    const d = new Date(prev); 
    d.setDate(d.getDate() + 7);
    return getStartOfWeek(d);
  })
}
onSwipePrev={() =>
  setSelectedDate(prev => {
    const d = new Date(prev);
    d.setDate(d.getDate() - 7);
    return getStartOfWeek(d);
  })
}
 />


        <ScrollView style={styles.freeList}>
          <Text style={styles.freeTitle}>Common Free Times (This Week)</Text>
          {freeSlots.length === 0 ? (
            <Text style={styles.freeItem}>No free time found yet.</Text>
          ) : (
            freeSlots.map((slot, idx) => {
              const dateLabel = slot.start.toDateString();
              const startLabel = slot.start.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });
              const endLabel = slot.end.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <Text key={slot.date + "-" + idx} style={styles.freeItem}>
                  {dateLabel}: {startLabel} - {endLabel}
                </Text>
              );
            })
          )}
        </ScrollView>
      </View></>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 40,
    backgroundColor: "#fff",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerContainer: {
    marginBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6 as any,
    justifyContent: "center",
  },
  selectWeb: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    margin: 10,
  },
  addMemberSection: {
    padding: 12,
    marginHorizontal: 10,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    backgroundColor: "#fafafa",
    marginBottom: 16,
  },
  label: {
    fontWeight: "600",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  freeList: {
    flex: 1,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  freeTitle: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 6,
  },
  freeItem: {
    fontSize: 14,
    marginBottom: 4,
  },
   logoutHeader: {
    paddingTop: 50,
    backgroundColor: "black",
    
  },
});
