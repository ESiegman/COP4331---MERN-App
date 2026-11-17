import { StatusBar, View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

export default function Index() {
  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: "https://mern.esiegman.dev" }}
        javaScriptEnabled
        domStorageEnabled
        style={styles.web}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: StatusBar.currentHeight ?? 0, backgroundColor: "#12131a" },
  web: { flex: 1 },
});