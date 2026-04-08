console.log('--- SERVER STARTING ---');
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
import { readFileSync } from 'fs';
const firebaseConfig = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf-8'));

// Initialize Firebase Admin
let firebaseAdminApp: admin.app.App;
try {
  if (!admin.apps.length) {
    const projectId = firebaseConfig.projectId;
    console.log('Initializing Firebase Admin with Project ID:', projectId);
    firebaseAdminApp = admin.initializeApp({
      projectId: projectId,
    });
  } else {
    firebaseAdminApp = admin.app();
  }
} catch (error) {
  console.error('Failed to initialize Firebase Admin:', error);
}

// Initialize Client SDK as a fallback
const clientApp = initializeClientApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Helper to get a Firestore instance, trying the named one first then falling back to default
let cachedDb: any = null;
async function getDb() {
  if (cachedDb) return cachedDb;

  const namedDbId = firebaseConfig.firestoreDatabaseId;
  const defaultProjectId = firebaseConfig.projectId;
  
  console.log(`[getDb] Database Selection Start. Project: ${defaultProjectId}, Configured DB: ${namedDbId || '(default)'}`);
  
  if (namedDbId && firebaseAdminApp) {
    // 1. Try Admin SDK with Named Database
    try {
      const namedDb = getAdminFirestore(firebaseAdminApp, namedDbId);
      // Use a timeout for the health check to prevent hanging
      const healthCheck = namedDb.collection('users').limit(1).get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore Timeout')), 5000));
      
      await Promise.race([healthCheck, timeoutPromise]);
      
      console.log(`[getDb] SUCCESS: Connected to named database ${namedDbId} using Admin SDK.`);
      cachedDb = { type: 'admin', db: namedDb, dbId: namedDbId };
      return cachedDb;
    } catch (err: any) {
      console.warn(`[getDb] Admin SDK failed for named database ${namedDbId}. Code: ${err.code}. Msg: ${err.message}`);
      
      // 2. Try Client SDK with Named Database (as fallback for permission issues)
      if (err.code === 5 || err.code === 7 || (err.message && (err.message.includes('NOT_FOUND') || err.message.includes('PERMISSION_DENIED')))) {
        console.log(`[getDb] Attempting Client SDK fallback for named database ${namedDbId}...`);
        try {
          await getDocs(query(collection(clientDb, 'users'), limit(1)));
          console.log(`[getDb] SUCCESS: Connected to named database ${namedDbId} using Client SDK.`);
          cachedDb = { type: 'client', db: clientDb, dbId: namedDbId };
          return cachedDb;
        } catch (clientErr: any) {
          console.warn(`[getDb] Client SDK fallback failed for ${namedDbId}. Code: ${clientErr.code}. Msg: ${clientErr.message}`);
        }
      }
    }
  }
  
  // 3. Final Fallback: Admin SDK with Default Database
  if (firebaseAdminApp) {
    console.log(`[getDb] FALLBACK: Using Admin SDK with (default) database.`);
    const defaultDb = getAdminFirestore(firebaseAdminApp);
    cachedDb = { type: 'admin', db: defaultDb, dbId: '(default)' };
    return cachedDb;
  }

  // 4. Last Resort: Client SDK with Named Database
  console.log(`[getDb] LAST RESORT: Using Client SDK with named database ${namedDbId || '(default)'}.`);
  cachedDb = { type: 'client', db: clientDb, dbId: namedDbId || '(default)' };
  return cachedDb;
}

// Email Transporter (Using Gmail as default, can be changed via SMTP_SERVICE)
const transporter = nodemailer.createTransport({
  service: process.env.SMTP_SERVICE || 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Use App Password for Gmail
  },
});

async function sendMonthlyReminders() {
  console.log('Running monthly email reminder task...');
  const currentApp = firebaseAdminApp;
  const { type, db } = await getDb();
  console.log(`Using ${type} SDK for reminders.`);
  
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    const msg = 'SMTP configuration is missing (SMTP_USER/SMTP_PASS). Please configure them in the Settings > Secrets menu.';
    console.error(msg);
    return { success: false, message: msg };
  }

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  let sentCount = 0;
  let errorCount = 0;
  let skippedCount = 0;

  try {
    // 1. Get all users
    console.log(`Attempting to fetch users...`);
    let users: any[] = [];
    
    if (type === 'admin') {
      const usersSnapshot = await (db as admin.firestore.Firestore).collection('users').get();
      users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      const usersSnapshot = await getDocs(collection(db as any, 'users'));
      users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    console.log(`Found ${users.length} users in database.`);

    if (users.length === 0) {
      return { success: true, message: 'No users found to remind.' };
    }

    // 2. Get all contributions for the current month
    console.log(`Checking contributions for ${currentMonth}/${currentYear}...`);
    let paidUserIds = new Set<string>();
    let paidUserEmails = new Set<string>();

    if (type === 'admin') {
      const contributionsSnapshot = await (db as admin.firestore.Firestore).collection('contributions')
        .where('month', '==', currentMonth)
        .where('year', '==', currentYear)
        .where('status', '==', 'paid')
        .get();
      paidUserIds = new Set(contributionsSnapshot.docs.map(doc => doc.data().userId).filter(id => !!id));
      paidUserEmails = new Set(contributionsSnapshot.docs.map(doc => doc.data().userEmail).filter(email => !!email));
    } else {
      const q = query(
        collection(db as any, 'contributions'),
        where('month', '==', currentMonth),
        where('year', '==', currentYear),
        where('status', '==', 'paid')
      );
      const contributionsSnapshot = await getDocs(q);
      paidUserIds = new Set(contributionsSnapshot.docs.map(doc => doc.data().userId).filter(id => !!id));
      paidUserEmails = new Set(contributionsSnapshot.docs.map(doc => doc.data().userEmail).filter(email => !!email));
    }
    
    console.log('Paid User IDs:', Array.from(paidUserIds));
    console.log('Paid User Emails:', Array.from(paidUserEmails));

    // 3. Find users who haven't paid
    for (const user of users as any) {
      const hasPaid = (user.uid && paidUserIds.has(user.uid)) || (user.email && paidUserEmails.has(user.email));
      
      if (!hasPaid && user.email) {
        console.log(`User ${user.email} (UID: ${user.uid || 'N/A'}) has not paid. Sending reminder...`);
        const monthName = now.toLocaleString('default', { month: 'long' });
        const mailOptions = {
          from: `"Unnati Savings Group" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: `Payment Reminder: Unnati Contribution - ${monthName} ${currentYear}`,
          html: `
            <div style="font-family: sans-serif; padding: 20px; color: #333;">
              <h2 style="color: #4f46e5;">Unnati Savings Group</h2>
              <p>Hi ${user.displayName || 'Member'},</p>
              <p>This is a friendly reminder for your monthly contribution for <b>${monthName} ${currentYear}</b>.</p>
              <p>Please contribute <b>₹1,000</b> before the 10th of this month to avoid the ₹100 late fee.</p>
              <p>You can record your payment directly on the app: <a href="${process.env.APP_URL || '#'}" style="color: #4f46e5; font-weight: bold;">Open Unnati App</a></p>
              <br/>
              <p>Thank you,<br/>Unnati Administration</p>
            </div>
          `
        };
        
        try {
          const info = await transporter.sendMail(mailOptions);
          console.log(`Reminder email sent to ${user.email}: ${info.messageId}`);
          sentCount++;
        } catch (err) {
          console.error(`Failed to send email to ${user.email}:`, err);
          errorCount++;
        }
      } else {
        if (hasPaid) {
          console.log(`User ${user.email} has already paid.`);
        } else if (!user.email) {
          console.log(`User ${user.id} has no email address. Skipping.`);
        }
        skippedCount++;
      }
    }
    return { 
      success: true, 
      message: `Reminders processed. Sent: ${sentCount}, Failed: ${errorCount}, Skipped/Already Paid: ${skippedCount}` 
    };
  } catch (err: any) {
    console.error('Error in sendMonthlyReminders:', err);
    return { success: false, message: 'Database error: ' + err.message };
  }
}

// Schedule task for the 1st of every month at 9:00 AM
cron.schedule('0 9 1 * *', () => {
  sendMonthlyReminders();
});

async function startServer() {
  const PORT = 3000;
  console.log('--- SERVER STARTING ---');
  console.log('NODE_ENV:', process.env.NODE_ENV);
  console.log('PORT:', PORT);
  const app = express();

  app.use(express.json());

  // Disable caching for all routes to prevent "blank screen" issues
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });

  // API Routes
  app.get('/api/health', async (req, res) => {
    let dbError = null;
    let usersCount = -1;
    let usedDatabase = 'unknown';
    let sdkType = 'none';
    
    try {
      const dbPromise = getDb();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('getDb Timeout')), 7000));
      const { type, db, dbId } = await Promise.race([dbPromise, timeoutPromise]) as any;
      
      sdkType = type;
      usedDatabase = dbId;
      
      try {
        const queryPromise = type === 'admin' 
          ? (db as admin.firestore.Firestore).collection('users').limit(1).get()
          : getDocs(query(collection(db as any, 'users'), limit(1)));
          
        const queryTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Query Timeout')), 5000));
        const snapshot = await Promise.race([queryPromise, queryTimeout]) as any;
        
        usersCount = snapshot.size;
      } catch (dbErr: any) {
        dbError = dbErr.message;
        console.error(`Failed to access users collection in ${usedDatabase} (${type}):`, dbErr.message);
      }

      res.json({ 
        status: 'ok', 
        projectId: firebaseAdminApp?.options?.projectId || firebaseConfig.projectId,
        databaseId: usedDatabase,
        sdkType: sdkType,
        configDatabaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        firestoreConnected: usersCount >= 0,
        firestoreError: dbError,
        usersFound: usersCount >= 0,
        smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
        envProjectId: process.env.GOOGLE_CLOUD_PROJECT
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        message: error instanceof Error ? error.message : String(error),
        projectId: firebaseAdminApp?.options?.projectId || firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
        firestoreConnected: false
      });
    }
  });

  // Welcome Email API
  app.post('/api/admin/send-welcome-email', async (req, res) => {
    const { email, name } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(400).json({ message: 'SMTP is not configured' });
    }

    const mailOptions = {
      from: `"Unnati Savings Group" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Welcome to Unnati Savings Group!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Welcome to Unnati!</h2>
          <p>Hi ${name || 'Member'},</p>
          <p>We are excited to have you as a member of the <b>Unnati Savings Group</b>.</p>
          <p>You can now log in to the app using your email to track your contributions and view group progress.</p>
          <p><b>Monthly Contribution:</b> ₹1,000 (Due before 10th of every month)</p>
          <p><a href="${process.env.APP_URL || '#'}" style="display: inline-block; padding: 10px 20px; background-color: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Access the App</a></p>
          <br/>
          <p>Best regards,<br/>Unnati Administration</p>
        </div>
      `
    };

    try {
      await transporter.sendMail(mailOptions);
      res.json({ message: 'Welcome email sent' });
    } catch (err: any) {
      console.error('Failed to send welcome email:', err);
      res.status(500).json({ message: 'Failed to send email: ' + err.message });
    }
  });

  // Manual trigger for testing reminders
  app.post('/api/admin/trigger-reminders', async (req, res) => {
    try {
      const result = await sendMonthlyReminders();
      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(500).json({ message: result.message });
      }
    } catch (err: any) {
      console.error('API Error in trigger-reminders:', err);
      res.status(500).json({ message: 'Internal server error: ' + err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    try {
      console.log('Initializing Vite middleware...');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('Vite middleware initialized.');
    } catch (viteError) {
      console.error('Failed to initialize Vite middleware:', viteError);
    }
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
