import { getAuth, signOut } from "firebase/auth";
import { collection, getDocs, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Button, StyleSheet, View } from "react-native";
import WeekView from "react-native-week-view";

import { useRouter } from "expo-router";
import { deleteDoc, doc } from "firebase/firestore";
import { db } from "../firebase";

 

// Sunday as start of week
function getStartOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay(); // Sunday = 0
  const diff = d.getDate() - day; // go back to Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function SchedulePage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(getStartOfWeek(new Date())); // Start week on Sunday
   const [message, setMessage] = useState("");
  const router = useRouter();

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





const loadMySchedule = async () => {
  const auth = getAuth();
  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDocs(
    collection(db, "users", user.uid, "schedules")
  );

  const loadedEvents = snap.docs.map((docu) => {
    const data: any = docu.data();

    let s: any = data.start;
    let e: any = data.end;
    if (s && typeof s.toDate === "function") s = s.toDate();
    if (e && typeof e.toDate === "function") e = e.toDate();

    return {
      id: docu.id,                
      firestoreId: docu.id,      
      title: data.title || "Busy",
      startDate: new Date(s),
      endDate: new Date(e),
      color: "#2E86DE",
    };
  });

  setEvents(loadedEvents);
};





const handleEventPress = (event: any) => {
  
  const startLabel = event.startDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const endLabel = event.endDate.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  Alert.alert(
    "Delete this block?",
    `Do you want to remove this block from your schedule?\n\n${startLabel} - ${endLabel}`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => confirmDeleteEvent(event),
      },
    ]
  );
};

const confirmDeleteEvent = async (event: any) => {
  try {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
      Alert.alert("Error", "You must be logged in.");
      return;
    }

    const id = event.firestoreId || event.id;  

    await deleteDoc(doc(db, "users", user.uid, "schedules", id));

    
    setEvents((prev) =>
      prev.filter((e) => (e.firestoreId || e.id) !== id)
    );
  } catch (err) {
    console.error("Error deleting schedule block:", err);
    Alert.alert("Error", "Could not delete this block.");
  }
};



  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;
    

    if (!user) {
      Alert.alert("Not Logged In", "Please sign in to view your schedule.");
      setLoading(false);
      return;
    }

    const startOfWeek = getStartOfWeek(selectedDate);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); 
    endOfWeek.setHours(23, 59, 59, 999);

    const q = query(
      collection(db, "users", user.uid, "schedules"),
      where("start", ">=", startOfWeek),
      where("start", "<=", endOfWeek)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const fetched: any[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        fetched.push({
          id: doc.id,
          title: data.title || "Untitled",
          description: data.title || "",
          startDate:
            data.start instanceof Timestamp ? data.start.toDate() : data.start,
          endDate:
            data.end instanceof Timestamp ? data.end.toDate() : data.end,
          color: data.color,
        });
      });
      setEvents(fetched);
      setLoading(false);
    });

    return () => unsub();
  }, [selectedDate]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4e9ffcfb" />
      </View>
    );
  }

  return (
    
    <><View style {...styles.logoutHeader}>
      <Button
        title="                                                           Logout"
        onPress={handleLogout} />
    </View><View style={styles.container}>

        {/* Add Event Button */}
        <Button
          title="Add Event"
          onPress={() => router.push("/(tabs)/add")} />


        {/* WeekView Calendar */}
        <WeekView
          events={events}
          selectedDate={selectedDate}
          numberOfDays={7}
          weekStartsOn={0}
          startHour={8}
          endHour={20}
          hoursInDisplay={16}
          timeColumnWidth={50}
          formatDateHeader="ddd MM/DD"
          formatTimeLabel="h:mm a"
          headerStyle={{ backgroundColor: "#f9f9f9" }}
          onEventPress={handleEventPress}
          headerTextStyle={{
            fontWeight: "600",
            fontSize: 13,
            color: "#333",
          }}
          onSwipeNext={() => setSelectedDate(
            new Date(selectedDate.setDate(selectedDate.getDate() + 7))
          )}
          onSwipePrev={() => setSelectedDate(
            new Date(selectedDate.setDate(selectedDate.getDate() - 7))
          )} />
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
  logoutHeader: {
    paddingTop: 50,
    backgroundColor: "black",
    
    
  },
});
