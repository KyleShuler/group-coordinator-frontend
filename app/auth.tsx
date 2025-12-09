import { useRouter } from "expo-router";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import React, { useState } from "react";
import { Button, StyleSheet, Text, TextInput, View } from "react-native";
import { createUserProfile } from "../firebaseHelpers";
import { auth } from "./firebase";

export default function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();

  
  const handleSignup = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Create Firestore user profile
      await createUserProfile(uid, email.split("@")[0], email);

      setMessage("Account created");
      router.replace("/(tabs)/schedule"); // redirect to main page
    } catch (error: any) {
      console.error("Signup error:", error.message);
      setMessage(error.message);
    }
  };

  
  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setMessage("Logged in");
      router.replace("/(tabs)/schedule");
    } catch (error: any) {
      console.error("Login error:", error.message);
      setMessage(error.message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Group Coordinator</Text>

      <Text style={styles.label}>Email</Text>
      <TextInput placeholder="Enter email" value={email} onChangeText={setEmail} autoCapitalize="none" style={styles.input}/>

      <Text style={styles.label}>Password</Text>
      <TextInput placeholder="Enter password" secureTextEntry value={password} onChangeText={setPassword} style={styles.input}/>

      <View style={styles.buttonContainer}>
        <Button title="Sign Up" onPress={handleSignup} />
        <Button title="Login" onPress={handleLogin} />
      </View>

      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#f7f7f7",
  },
  title: {
    fontSize: 26,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 20,
  },
  label: {
    fontWeight: "600",
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    marginBottom: 15,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  message: {
    textAlign: "center",
    marginTop: 15,
    color: "green",
  },
});
