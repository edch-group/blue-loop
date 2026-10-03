import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native iPhone / iPad (and later Android) builds: the web game in a native
 * shell. The iOS project (ios/) allows portrait for the landing and sign-in
 * pages; from the game mode menu on the app locks itself to landscape.
 */
const config: CapacitorConfig = {
  appId: 'com.coronalmassgames.blueloop',
  appName: 'Blue Loop',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#f3f2ee',
  },
};

export default config;
