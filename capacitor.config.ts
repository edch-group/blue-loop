import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Native iPhone / iPad (and later Android) builds: the web game in a native
 * shell. The iOS project (ios/) declares landscape as the only orientation,
 * so the app is locked to landscape like any App Store game.
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
