import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.unnatigroup.app',
  appName: 'Unnati',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    hostname: 'localhost',
    allowNavigation: [
      'gen-lang-client-0691055733.firebaseapp.com',
      'ais-pre-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app'
    ]
  }
};

export default config;
