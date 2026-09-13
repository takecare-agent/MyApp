import "./src/polyfillWindow"
import { AppRegistry } from "react-native"

import App from "./App"
import { name as appName } from "./app.json"
import { setBackgroundPushHandler } from "./src/lib/pushNotifications"

setBackgroundPushHandler()
AppRegistry.registerComponent(appName, () => App)
