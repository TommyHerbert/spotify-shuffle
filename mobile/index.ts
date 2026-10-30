import { getRandomValues } from "expo-crypto";
import { registerRootComponent } from "expo";

import App from "./App";

// shared/shuffle uses Web Crypto; React Native does not provide it.
const globalCrypto = globalThis as typeof globalThis & {
  crypto?: { getRandomValues: typeof getRandomValues };
};
if (!globalCrypto.crypto?.getRandomValues) {
  globalCrypto.crypto = { getRandomValues };
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
