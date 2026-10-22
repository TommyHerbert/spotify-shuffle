import { totalPoolSize, type LibraryStats } from "../shared";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

const sampleLibrary: LibraryStats = {
  likedTracksCount: 2,
  albums: [{ id: "demo-album", name: "Demo", trackCount: 1 }],
  playlists: [],
};

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Spotify Shuffle</Text>
      <Text style={styles.body}>
        Shared shuffle code is loaded. Sample pool size:{" "}
        {totalPoolSize(sampleLibrary)}.
      </Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    color: "#fafafa",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 12,
  },
  body: {
    color: "#b3b3b3",
    fontSize: 16,
    textAlign: "center",
  },
});
