import { useState } from "react"
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native"

export default function AuthScreen({
  defaultApiBaseUrl,
  defaultWebBaseUrl,
  onProceed
}) {
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl)
  const [webBaseUrl, setWebBaseUrl] = useState(defaultWebBaseUrl)
  const [email, setEmail] = useState("patient@test.com")
  const [name, setName] = useState("Mobile Tester")
  const [error, setError] = useState("")

  const handleNext = async () => {
    const normalizedApiBaseUrl = apiBaseUrl.trim()
    const normalizedWebBaseUrl = webBaseUrl.trim()
    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = name.trim()

    if (!normalizedApiBaseUrl) {
      setError("Please provide API base URL")
      return
    }
    if (!normalizedWebBaseUrl) {
      setError("Please provide Web base URL")
      return
    }
    if (!normalizedEmail) {
      setError("Please provide email")
      return
    }

    setError("")

    try {
      await onProceed({
        apiBaseUrl: normalizedApiBaseUrl,
        webBaseUrl: normalizedWebBaseUrl,
        email: normalizedEmail,
        name: normalizedName
      })
    } catch (nextError) {
      setError(nextError.message || "Failed to continue")
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>TakeCare Mobile (Expo Go)</Text>
        <Text style={styles.subtitle}>
          Node.js backend + React Native frontend
        </Text>

        <Text style={styles.label}>API Base URL</Text>
        <TextInput
          style={styles.input}
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          autoCapitalize="none"
          placeholder="http://192.168.x.x:5000"
        />
        <Text style={styles.hint}>
          Use your computer LAN IP, not localhost.
        </Text>

        <Text style={styles.label}>Web Base URL</Text>
        <TextInput
          style={styles.input}
          value={webBaseUrl}
          onChangeText={setWebBaseUrl}
          autoCapitalize="none"
          placeholder="http://192.168.x.x:5173"
        />
        <Text style={styles.hint}>
          This is your React web frontend URL for full modules.
        </Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="patient@test.com"
        />

        <Text style={styles.label}>Name (optional)</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Mobile Tester"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={styles.button} onPress={handleNext}>
          <Text style={styles.buttonText}>Next: Select Role</Text>
        </Pressable>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#f2f7ff",
    padding: 20,
    justifyContent: "center"
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#d8e6ff"
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#11355c"
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    color: "#4d6480"
  },
  label: {
    marginTop: 8,
    marginBottom: 6,
    color: "#244569",
    fontWeight: "600"
  },
  input: {
    borderWidth: 1,
    borderColor: "#c8d8ee",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#1b2a3d",
    backgroundColor: "#fbfdff"
  },
  hint: {
    marginTop: 6,
    marginBottom: 4,
    color: "#667d97",
    fontSize: 12
  },
  error: {
    marginTop: 12,
    color: "#b42318"
  },
  button: {
    marginTop: 14,
    backgroundColor: "#1f74d1",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700"
  }
})
