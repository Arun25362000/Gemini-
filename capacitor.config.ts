import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unnatigroup.app',
  appName: 'Unnati',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'ais-mob-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app',
    allowNavigation: [
      '*.firebaseapp.com',
      '*.googleapis.com',
      '*.asia-southeast1.run.app'
    ]
  }
};

export default config;
