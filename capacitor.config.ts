import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unnatigroup.app',
  appName: 'Unnati',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: ['*']
  }
};

export default config;
