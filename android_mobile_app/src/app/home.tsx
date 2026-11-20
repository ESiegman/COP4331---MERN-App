import { useEffect, useState } from "react";
import { View, Text, TextInput, FlatList, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

const API = "https://mern.esiegman.dev/api";

export default function Home() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const res = await fetch(`${API}/templates`);
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Could not load templates");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const shown = items.filter((t) =>
    `${t.title} ${t.description ?? ""} ${t.category ?? ""}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Templates</Text>
      <TextInput style={styles.input} placeholder="Search templates" value={search} onChangeText={setSearch} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <FlatList
        data={shown}
        keyExtractor={(t, i) => String(t._id ?? t.id ?? i)}
        onRefresh={load}
        refreshing={false}
        ListEmptyComponent={<Text style={styles.empty}>No templates found.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {item.description ? <Text>{item.description}</Text> : null}
            {item.category ? <Text style={styles.meta}>{item.category}</Text> : null}
          </View>
        )}
      />
      <Pressable style={styles.button} onPress={() => router.replace("/")}>
        <Text style={styles.buttonText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "bold", marginBottom: 16 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 12 },
  card: { borderWidth: 1, borderColor: "#ddd", borderRadius: 8, padding: 12, marginBottom: 10, backgroundColor: "white" },
  cardTitle: { fontSize: 18, fontWeight: "600" },
  meta: { color: "#2563eb", marginTop: 4 },
  empty: { textAlign: "center", marginTop: 24, color: "#666" },
  error: { color: "crimson", marginBottom: 8 },
  button: { backgroundColor: "#2563eb", padding: 14, borderRadius: 8, alignItems: "center", marginTop: 8 },
  buttonText: { color: "white", fontSize: 16, fontWeight: "600" },
});