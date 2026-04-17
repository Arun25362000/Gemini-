console.log('--- SERVER STARTING ---');
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, collection, getDocs, query, where, limit, doc, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';
import * as XLSX from 'xlsx';
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
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore Admin SDK Timeout')), 8000));
      
      await Promise.race([healthCheck, timeoutPromise]);
      
      console.log(`[getDb] SUCCESS: Connected to named database ${namedDbId} using Admin SDK.`);
      cachedDb = { type: 'admin', db: namedDb, dbId: namedDbId };
      return cachedDb;
    } catch (err: any) {
      // If it's a permission issue or not found, try to use the client SDK as a fallback
      if (err.code === 7 || err.code === 5 || (err.message && (err.message.includes('PERMISSION_DENIED') || err.message.includes('NOT_FOUND')))) {
        // 2. Try Client SDK with Named Database (as fallback for permission issues)
        try {
          const q = query(collection(clientDb, 'users'), limit(1));
          await getDocs(q);
          console.log(`[getDb] SUCCESS: Connected to named database ${namedDbId} using Client SDK fallback.`);
          cachedDb = { type: 'client', db: clientDb, dbId: namedDbId };
          return cachedDb;
        } catch (clientErr: any) {
          console.warn(`[getDb] Admin SDK failed (${err.message}) and Client SDK fallback failed for ${namedDbId}. Code: ${clientErr.code}. Msg: ${clientErr.message}`);
        }
      } else {
        console.warn(`[getDb] Admin SDK failed for named database ${namedDbId}. Code: ${err.code}. Msg: ${err.message}`);
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
  pool: true, // Use pooling for multiple emails
  maxConnections: 5,
  maxMessages: 100,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Use App Password for Gmail
  },
});

// Helper for sending mail with retry logic for transient errors
async function sendMailWithRetry(mailOptions: any, maxRetries = 3) {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await transporter.sendMail(mailOptions);
    } catch (err: any) {
      lastError = err;
      const errorCode = err.responseCode || (err.response && err.response.split(' ')[0]);
      const isTransient = errorCode && errorCode.startsWith('4');
      const isSystemProblem = err.message && err.message.includes('Temporary System Problem');

      if (i < maxRetries - 1 && (isTransient || isSystemProblem)) {
        const delay = Math.pow(2, i) * 2000; // Exponential backoff: 2s, 4s, 8s
        console.warn(`[SMTP] Transient error detected (${errorCode || 'unknown'}). Retrying in ${delay}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

// Verify transporter on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('[SMTP] Verification failed:', error);
  } else {
    console.log('[SMTP] Server is ready to take our messages');
  }
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
              <br/>
              <p>Thank you,<br/>Unnati Administration</p>
            </div>
          `
        };
        
        try {
          const info = await sendMailWithRetry(mailOptions);
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

async function sendMonthlyFullReport() {
  console.log('Generating monthly full report automation...');
  const { type, db } = await getDb();
  
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[Automation] SMTP configuration missing for full report');
    return { success: false, message: 'SMTP configuration missing' };
  }

  try {
    console.log(`[Automation] Fetching all data for report using ${type} SDK...`);
    let usersData: any[] = [];
    let contributionsData: any[] = [];
    let loansData: any[] = [];
    let paymentsData: any[] = [];

    if (type === 'admin') {
      const adminDb = db as admin.firestore.Firestore;
      const [uSnap, cSnap, lSnap, pSnap] = await Promise.all([
        adminDb.collection('users').get(),
        adminDb.collection('contributions').get(),
        adminDb.collection('loans').get(),
        adminDb.collection('loanPayments').get()
      ]);
      usersData = uSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      contributionsData = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loansData = lSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      paymentsData = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } else {
      const [uSnap, cSnap, lSnap, pSnap] = await Promise.all([
        getDocs(collection(db as any, 'users')),
        getDocs(collection(db as any, 'contributions')),
        getDocs(collection(db as any, 'loans')),
        getDocs(collection(db as any, 'loanPayments'))
      ]);
      usersData = uSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      contributionsData = cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loansData = lSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      paymentsData = pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    console.log(`[Automation] Data fetched: ${usersData.length} members, ${contributionsData.length} contributions, ${loansData.length} loans, ${paymentsData.length} payments.`);

    // Create Excel Workbook
    const wb = XLSX.utils.book_new();

    // Transform data for better Excel readability
    const formatData = (data: any[]) => data.map(item => {
      const newItem = { ...item };
      // Convert timestamps to readable strings if they exist
      Object.keys(newItem).forEach(key => {
        if (newItem[key] && typeof newItem[key] === 'object' && newItem[key].toDate) {
          newItem[key] = newItem[key].toDate().toLocaleString();
        } else if (newItem[key] && typeof newItem[key] === 'object' && newItem[key]._seconds) {
           newItem[key] = new Date(newItem[key]._seconds * 1000).toLocaleString();
        }
      });
      return newItem;
    });

    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(usersData)), "Members");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(contributionsData)), "Contributions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(loansData)), "Loans");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(formatData(paymentsData)), "Loan_Repayments");

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const now = new Date();
    const monthName = now.toLocaleString('default', { month: 'long' });
    const year = now.getFullYear();

    const mailOptions = {
      from: `"Unnati Automated Reports" <${process.env.SMTP_USER}>`,
      to: 'unnati.finance2026@gmail.com',
      subject: `Monthly Full Financial Report - Unnati - ${monthName} ${year}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #4f46e5;">Monthly Automated Report</h2>
          <p>Please find attached the detailed Excel report for <b>${monthName} ${year}</b>.</p>
          <p>This report includes:</p>
          <ul>
            <li>Member Profiles</li>
            <li>Savings Contributions</li>
            <li>Active & Past Loans</li>
            <li>Loan Repayment History</li>
          </ul>
          <br/>
          <p>Sent automatically by Unnati Finance System.</p>
        </div>
      `,
      attachments: [
        {
          filename: `Unnati_Full_Report_${monthName}_${year}.xlsx`,
          content: buffer
        }
      ]
    };

    const info = await sendMailWithRetry(mailOptions);
    console.log(`[Automation] Monthly full report sent: ${info.messageId}`);
    return { success: true, message: 'Full report sent successfully' };
  } catch (err: any) {
    console.error('[Automation] Failed to generate/send full report:', err);
    return { success: false, message: err.message };
  }
}

// Schedule Full Report for the end of every month at 11:55 PM
cron.schedule('55 23 28-31 * *', () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDate() === 1) {
    console.log('Today is the last day of the month. Triggering full report...');
    sendMonthlyFullReport();
  }
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
    console.log(`[API] Received request to send welcome email to: ${email} (${name})`);
    
    if (!email) {
      console.warn('[API] Email is missing in request body');
      return res.status(400).json({ message: 'Email is required' });
    }
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('[API] SMTP configuration missing');
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
          <br/>
          <p>Best regards,<br/>Unnati Administration</p>
        </div>
      `
    };

    try {
      console.log(`[SMTP] Attempting to send welcome email to ${email}...`);
      const info = await sendMailWithRetry(mailOptions);
      console.log(`[SMTP] Welcome email sent: ${info.messageId}`);
      res.json({ message: 'Welcome email sent', messageId: info.messageId });
    } catch (err: any) {
      console.error('[SMTP] Failed to send welcome email:', err);
      res.status(500).json({ message: 'Failed to send email: ' + err.message });
    }
  });

  // Loan Closure Email API
  app.post('/api/admin/send-loan-closure-email', async (req, res) => {
    const { email, name, amount, interest, date } = req.body;
    console.log(`[API] Received request to send loan closure email to: ${email}`);
    
    if (!email) return res.status(400).json({ message: 'Email is required' });
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(400).json({ message: 'SMTP is not configured' });
    }

    const mailOptions = {
      from: `"Unnati Savings Group" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `Loan Fully Settled - Unnati Savings Group`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; rounded: 12px;">
          <h2 style="color: #059669; margin-bottom: 16px;">Congratulations! Your Loan is Settled</h2>
          <p>Hi ${name || 'Member'},</p>
          <p>We are pleased to inform you that your loan has been fully settled and closed on <b>${date}</b>.</p>
          
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 4px 0;"><b>Principal Paid:</b> ₹${Number(amount).toLocaleString()}</p>
            <p style="margin: 4px 0;"><b>Interest Paid:</b> ₹${Number(interest).toLocaleString()}</p>
            <p style="margin: 4px 0; color: #059669;"><b>Total Settlement:</b> ₹${(Number(amount) + Number(interest)).toLocaleString()}</p>
          </div>

          <p>Your loan record in the system has been updated to <b>PAID IN FULL</b>. No further installments are due for this loan.</p>
          <p>Thank you for being a responsible member of the Unnati Savings Group.</p>
          <br/>
          <p>Best regards,<br/>Unnati Administration</p>
        </div>
      `
    };

    try {
      const info = await sendMailWithRetry(mailOptions);
      res.json({ message: 'Loan closure email sent', messageId: info.messageId });
    } catch (err: any) {
      console.error('[SMTP] Failed to send loan closure email:', err);
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

  // Manual trigger for testing full report
  app.post('/api/admin/trigger-full-report', async (req, res) => {
    try {
      const result = await sendMonthlyFullReport();
      if (result.success) {
        res.json({ message: result.message });
      } else {
        res.status(500).json({ message: result.message });
      }
    } catch (err: any) {
      console.error('API Error in trigger-full-report:', err);
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
