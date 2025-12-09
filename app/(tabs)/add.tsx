import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { getAuth, signOut } from "firebase/auth";
import {
  collection, doc, setDoc, writeBatch,
} from "firebase/firestore";
import React, { useState } from "react";
import {
  Alert, Button, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from "react-native";
import { db } from "../firebase";

 


function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours());
  combined.setMinutes(time.getMinutes());
  combined.setSeconds(0);
  combined.setMilliseconds(0);
  return combined;
}


function createFifteenMinuteBlocks(start: Date, end: Date): { start: Date; end: Date }[] {
  const blocks: { start: Date; end: Date }[] = [];
  const blockMs = 15 * 60 * 1000;

  let cursor = new Date(start);
  while (cursor < end) {
    const next = new Date(Math.min(end.getTime(), cursor.getTime() + blockMs));
    blocks.push({ start: new Date(cursor), end: next });
    cursor = next;
  }

  return blocks;
}

export default function AddEventPage() {

  const COLOR_OPTIONS = [
  { label: "Blue", value: "#2E86DE" },
  { label: "Green", value: "#27AE60" },
  { label: "Orange", value: "#E67E22" },
  { label: "Purple", value: "#8E44AD" },
  { label: "Red", value: "#C0392B" },
];


  const [message, setMessage] = useState("");
  const router = useRouter();

  const [color, setColor] = useState<string>(COLOR_OPTIONS[0].value);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  // Date & time pickers
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [endTime, setEndTime] = useState(new Date());

  
  const [showStartDate, setShowStartDate] = useState(true);
  const [showEndDate, setShowEndDate] = useState(false);
  const [showStartTime, setShowStartTime] = useState(false);
  const [showEndTime, setShowEndTime] = useState(false);

  // Repeat Days
  const [repeatDays, setRepeatDays] = useState({
    Monday: false,
    Tuesday: false,
    Wednesday: false,
    Thursday: false,
    Friday: false,
  });

  // Group toggle
  const [isGroupEvent, setIsGroupEvent] = useState(false);

  const handleLogout = async () => {
      try {
        await signOut;
        setMessage("Logged in");
        router.replace("/auth");
      } catch (error: any) {
        console.error("Logout error:", error.message);
        postMessage(error.message);
      }
    };

  // Save events
  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert("Missing Title", "Please enter an event title.");
      return;
    }

    try {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        Alert.alert("Not logged in", "You must be signed in to add an event.");
        return;
      }

      const batch = writeBatch(db);
      const recurrenceDays = Object.keys(repeatDays).filter(
        (d) => repeatDays[d as keyof typeof repeatDays]
      );

      // GROUP EVENT 15 minute blocks
      if (isGroupEvent) {
        const groupRef = doc(collection(db, "groups"));
        const groupId = groupRef.id;

        const availability: {
          date: string;
          start: string;
          end: string;
        }[] = [];

        const groupBlockWrites: Promise<void>[] = [];

        let current = new Date(startDate);
        while (current <= endDate) {
          const weekday = current.toLocaleDateString("en-US", {
            weekday: "long",
          });

          if (recurrenceDays.length === 0 || recurrenceDays.includes(weekday)) {
            const s = combineDateAndTime(current, startTime);
            const e = combineDateAndTime(current, endTime);

            const dateStr = current.toISOString().split("T")[0];

            // Original availability array 
            availability.push({
              date: dateStr,
              start: s.toISOString(),
              end: e.toISOString(),
            });

            //15 minute blocks into groups
            const blocks = createFifteenMinuteBlocks(s, e);
            const groupBlocksCol = collection(db, "groups", groupId, "groupBlocks");

            blocks.forEach((block) => {
              const blockRef = doc(groupBlocksCol);
              groupBlockWrites.push(
                setDoc(blockRef, {
                  date: dateStr,
                  start: block.start,
                  end: block.end,
                })
              );
            });
          }

          current.setDate(current.getDate() + 1);
        }

        // Save group doc itself
        await setDoc(groupRef, {
          name: title,
          description,
          createdBy: user.uid,
          members: [user.uid],
          createdAt: new Date(),
          availability,
        });

        // Link group to user profile
        await setDoc(doc(db, "users", user.uid, "groups", groupId), {
          groupId,
          joinedAt: new Date(),
        });

        // Commit all 15 min block writes
        await Promise.all(groupBlockWrites);

        Alert.alert("Group Created", "Your group event was added!");
        router.replace("/(tabs)/events");
        return;
      }

      // PERSONAL SCHEDULE 15 minute blocks
      const scheduleBlocksCol = collection(db, "users", user.uid, "scheduleBlocks");

      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const weekday = currentDate.toLocaleDateString("en-US", {
          weekday: "long",
        });

        if (recurrenceDays.length === 0 || recurrenceDays.includes(weekday)) {
          const s = combineDateAndTime(currentDate, startTime);
          const e = combineDateAndTime(currentDate, endTime);
          const dateStr = currentDate.toISOString().split("T")[0];

          
          const ref = doc(collection(db, "users", user.uid, "schedules"));
          batch.set(ref, {
            title,
            description,
            start: s,
            end: e,
            color,
            createdAt: new Date(),
          });

          //15 minute blocks for this personal schedule
          const blocks = createFifteenMinuteBlocks(s, e);
          blocks.forEach((block) => {
            const blockRef = doc(scheduleBlocksCol);
            batch.set(blockRef, {
              date: dateStr,
              start: block.start,
              end: block.end,
              createdAt: new Date(),
            });
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      await batch.commit();
      Alert.alert("Success", "Event(s) added to your schedule!");
      router.replace("/(tabs)/schedule");
    } catch (err: any) {
      console.error("Error saving event:", err);
      Alert.alert("Error", "Could not save event.");
    }
  };

  return (

    <><View style {...styles.logoutHeader}>
      <Button
        title="                                                           Logout"
        onPress={handleLogout} />
    </View><ScrollView style={styles.container}>
        <Text style={styles.heading}>Add Event</Text>


        <Text>Event Title</Text>
        {/* Event Title */}
        <TextInput
          style={styles.input}
          placeholder="Title"
          value={title}
          onChangeText={setTitle} />

        <Text>Description</Text>
        {/* Description */}
        <TextInput
          style={styles.input}
          placeholder="Description"
          value={description}
          onChangeText={setDescription}
          multiline />



        {/* Start Date */}
        <Text style={styles.heading}>Select Start and End Days</Text>
        <Text style={styles.label}>Start Date: {startDate.toDateString()}</Text>
        
          <DateTimePicker
            value={startDate}
            mode="date"
            display="default"
            onChange={(_, date) => {
              setShowStartDate(Platform.OS === "ios");
              if (date) setStartDate(date);
            } } />
        

        {/* End Date */}

        <Text style={styles.label}>End Date: {endDate.toDateString()}</Text>
        
          <DateTimePicker
            value={endDate}
            mode="date"
            display="default"
            onChange={(_, date) => {
              setShowEndDate(Platform.OS === "ios");
              if (date) setEndDate(date);
            } } />
        

        {/* Start Time */}
        <Text style={styles.heading}>Select Start and End Times</Text>
        <Text style={styles.label}>
          Start Time:{" "}
          {startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        
          <DateTimePicker
            value={startTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(_, date) => {
              setShowStartTime(Platform.OS === "ios");
              if (date) setStartTime(date);
            } } />
        

        {/* End Time */}
        <Text style={styles.label}>
          End Time:{" "}
          {endTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </Text>
        
          <DateTimePicker
            value={endTime}
            mode="time"
            is24Hour={false}
            display="default"
            onChange={(_, date) => {
              setShowEndTime(Platform.OS === "ios");
              if (date) setEndTime(date);
            } } />
        

        {/* Repeat Days */}
        <Text style={styles.heading}>Select The Days For Your Event</Text>
        <View style={styles.section}>

          {Object.keys(repeatDays).map((day) => (
            <View key={day} style={styles.switchRow}>
              <Text>{day}</Text>
              <Switch
                value={repeatDays[day as keyof typeof repeatDays]}
                onValueChange={(val) => setRepeatDays((prev) => ({ ...prev, [day]: val }))} />
            </View>
          ))}
        </View>

        {/* Group Toggle */}

        <View style={styles.section}>
          <Text style={styles.heading}>Select as Geoup Event</Text>
          <View style={styles.switchRow}>
            <Text>Create as Group Event</Text>
            <Switch
              value={isGroupEvent}
              onValueChange={(val) => setIsGroupEvent(val)} />
          </View>

          {/* Color Picker */}
          <View style={styles.section}>
            <Text style={styles.heading}>Select Color</Text>

            {Platform.OS === "web" ? (
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={styles.selectWeb}
             >
             {COLOR_OPTIONS.map((opt) => (
               <option key={opt.value} value={opt.value}>
            {opt.label}
            </option>
           ))}
            </select>
           ) : (
    
            <View style={styles.dropdownBox}>
              {COLOR_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                title={opt.label}
                onPress={() => setColor(opt.value)}
                color={color === opt.value ? "#1c51ffff" : "#888"}
               />
              ))}
          </View>
    
          )}

        <Text style={styles.selectedColorText}>
           Selected color: <Text style={{ fontWeight: "bold" }}>{color}</Text>
        </Text>
      </View>
    </View>

        <Button title="Save Event" onPress={handleSave} />
      </ScrollView></>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  heading: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 16,
    marginTop: 50
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginVertical: 8,
  },
  section: {
    marginTop: 16,
    marginBottom: 20,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
   logoutHeader: {
    paddingTop: 50,
    backgroundColor: "black",
    
  },
 
  selectWeb: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    minWidth: 180,
  },
  dropdownBox: {
    gap: 6 as any,
  },
  selectedColorText: {
    marginTop: 6,
    fontSize: 14,
  },
});
