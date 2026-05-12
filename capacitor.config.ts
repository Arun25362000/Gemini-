import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unnatigroup.app',
  appName: 'Unnati',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: [
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.asia-southeast1.run.app'
    ]
  }
};

export default config;
