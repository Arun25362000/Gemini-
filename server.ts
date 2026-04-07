import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = firebaseConfig.projectId;
  console.log('Initializing Firebase Admin with Project ID:', projectId);
  admin.initializeApp({
    projectId: projectId,
    credential: admin.credential.applicationDefault(),
  });
}

const app = admin.app();

// Initialize Client SDK as a fallback
const clientApp = initializeClientApp(firebaseConfig);
const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);

// Helper to get a Firestore instance, trying the named one first then falling back to default
async function getDb() {
  const namedDbId = firebaseConfig.firestoreDatabaseId;
  console.log(`[getDb] Attempting database selection. Configured ID: ${namedDbId || '(default)'}`);
  
  if (namedDbId) {
    try {
      const namedDb = getAdminFirestore(app, namedDbId);
      // Use 'users' collection for health check as it has 'allow read: if true' in rules
      await namedDb.collection('users').limit(1).get();
      console.log(`[getDb] Successfully connected to named database ${namedDbId} using Admin SDK.`);
      return { type: 'admin', db: namedDb };
    } catch (err: any) {
      console.warn(`[getDb] Admin SDK failed for database ${namedDbId}. Error Code: ${err.code}. Message: ${err.message}`);
      
      // If NOT_FOUND (5) or PERMISSION_DENIED (7), fallback to client SDK or default
      if (err.code === 5 || err.code === 7 || (err.message && (err.message.includes('NOT_FOUND') || err.message.includes('PERMISSION_DENIED')))) {
        console.log(`[getDb] Attempting Client SDK fallback for database ${namedDbId}...`);
        
        try {
          // Test Client SDK using 'users' collection
          await getDocs(query(collection(clientDb, 'users'), limit(1)));
          console.log(`[getDb] Successfully connected to database ${namedDbId} using Client SDK fallback.`);
          return { type: 'client', db: clientDb };
        } catch (clientErr: any) {
          console.warn(`[getDb] Client SDK fallback also failed: ${clientErr.message}. Falling back to Admin SDK (default).`);
          return { type: 'admin', db: getAdminFirestore(app) };
        }
      }
      console.error(`[getDb] Unexpected error accessing database ${namedDbId}:`, err.message);
      return { type: 'admin', db: getAdminFirestore(app) };
    }
  }
  
  console.log(`[getDb] No named database configured. Using Admin SDK (default).`);
  return { type: 'admin', db: getAdminFirestore(app) };
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
  const currentApp = admin.app();
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
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get('/api/health', async (req, res) => {
    let dbError = null;
    let usersCount = -1;
    let usedDatabase = 'unknown';
    let sdkType = 'none';
    
    try {
      const { type, db } = await getDb();
      sdkType = type;
      usedDatabase = type === 'admin' ? (db as admin.firestore.Firestore).databaseId || '(default)' : firebaseConfig.firestoreDatabaseId || 'client-default';
      
      try {
        if (type === 'admin') {
          const snapshot = await (db as admin.firestore.Firestore).collection('users').limit(1).get();
          usersCount = snapshot.size;
        } else {
          const snapshot = await getDocs(query(collection(db as any, 'users'), limit(1)));
          usersCount = snapshot.size;
        }
      } catch (dbErr: any) {
        dbError = dbErr.message;
        console.error(`Failed to access users collection in ${usedDatabase} (${type}):`, dbErr.message);
      }

      res.json({ 
        status: 'ok', 
        projectId: admin.app().options.projectId,
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
        projectId: admin.app().options.projectId,
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
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
