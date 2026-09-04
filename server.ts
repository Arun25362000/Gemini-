console.log('--- SERVER STARTING ---');
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { initializeApp as initializeClientApp } from 'firebase/app';
import { initializeFirestore, collection, getDocs, query, where, limit, doc, updateDoc } from 'firebase/firestore';
import { readFileSync, existsSync } from 'fs';
import * as XLSX from 'xlsx';

let firebaseConfig: any = {};
try {
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (existsSync(configPath)) {
    firebaseConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
  }
} catch (e: any) {
  console.warn('[Config] Warning reading firebase-applet-config.json:', e?.message || e);
}

// Initialize Firebase Admin
let firebaseAdminApp: admin.app.App;
try {
  if (!admin.apps.length) {
    // Determine the best project ID to use
    const envProjectId = process.env.GOOGLE_CLOUD_PROJECT;
    const configProjectId = firebaseConfig.projectId;
    
    console.log('[Firebase Admin] Initializing...');
    console.log('[Firebase Admin] Config Project ID:', configProjectId);
    console.log('[Firebase Admin] Env Project ID:', envProjectId);
    
    // Prioritize configProjectId if available to ensure we connect to the provisioned Firebase project
    if (configProjectId) {
      try {
        firebaseAdminApp = admin.initializeApp({
          projectId: configProjectId,
        });
        console.log('[Firebase Admin] Initialized with config projectId:', configProjectId);
      } catch (e: any) {
        if (e.code === 'app/duplicate-app') {
          firebaseAdminApp = admin.app();
        } else {
          console.warn('[Firebase Admin] Initialization with config projectId failed, trying default:', e.message);
          try {
            firebaseAdminApp = admin.initializeApp();
          } catch (e2) {
            console.error('[Firebase Admin] Final fallback failed');
          }
        }
      }
    } else {
      firebaseAdminApp = admin.initializeApp();
      console.log('[Firebase Admin] Initialized with default settings.');
    }
    console.log('[Firebase Admin] Actual Project ID:', firebaseAdminApp.options.projectId || 'unknown');
  } else {
    firebaseAdminApp = admin.app();
  }
} catch (error) {
  console.error('CRITICAL: Failed to initialize Firebase Admin:', error);
}

// Initialize Client SDK as a fallback
// For Node.js environments, we sometimes need to force long polling to avoid GRPC/WebSocket issues in restricted environments
const clientApp = initializeClientApp(firebaseConfig);
const clientDb = initializeFirestore(clientApp, {
  // Use long polling in the server environment to avoid potential GRPC/WebSocket issues in proxy environments
  experimentalForceLongPolling: true,
}, firebaseConfig.firestoreDatabaseId || '(default)');

// Strategy helper for DB access
let cachedDb: any = null;
async function getDb() {
  if (cachedDb) return cachedDb;

  const namedDbId = firebaseConfig.firestoreDatabaseId;
  const configProjectId = firebaseConfig.projectId;
  
  if (firebaseAdminApp) {
    // Strategy 1: Named Database (Admin SDK)
    if (namedDbId) {
      try {
        const db = getAdminFirestore(firebaseAdminApp, namedDbId);
        // Test query - using a limit(1) with 2-second timeout to avoid long connection checks
        const testPromise = db.collection('users').limit(1).get();
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
        await Promise.race([testPromise, timeoutPromise]);
        
        console.log(`[getDb] SUCCESS: Admin SDK connected to ${namedDbId}.`);
        cachedDb = { type: 'admin', db, dbId: namedDbId };
        return cachedDb;
      } catch (err: any) {
        // If it's a project mismatch or API not enabled, we expect this in some AI Studio scenarios
        const isExpectedEnvError = err.message?.includes('PERMISSION_DENIED') || 
                                   err.message?.includes('Cloud Firestore API') ||
                                   err.message?.includes('project ID') ||
                                   err.code === 7 ||
                                   err.message === 'Timeout';
        
        if (!isExpectedEnvError) {
          console.warn(`[getDb] Strategy 1 failed: ${err.message}`);
        }
      }
    }

    // Strategy 2: Default Database (Admin SDK)
    try {
      const db = getAdminFirestore(firebaseAdminApp);
      // Test query - using a limit(1) with 2-second timeout
      const testPromise = db.collection('users').limit(1).get();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
      await Promise.race([testPromise, timeoutPromise]);
      
      console.log(`[getDb] SUCCESS: Admin SDK connected to default DB.`);
      cachedDb = { type: 'admin', db, dbId: '(default)' };
      return cachedDb;
    } catch (err: any) {
       // Only log as warning if it's not a common "Not Found" or "Permission Denied" in this setup
       if (err.code !== 5 && err.code !== 7 && err.message !== 'Timeout' && !err.message?.includes('NOT_FOUND') && !err.message?.includes('PERMISSION_DENIED')) {
         console.warn(`[getDb] Strategy 2 failed: ${err.message}`);
       }
    }
  }

  // Strategy 3: Client SDK (Should use API Key and work regardless of project identity)
  console.log(`[getDb] FALLBACK: Strategy 3: Using Client SDK. (Project: ${firebaseConfig.projectId})`);
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

// Verify transporter on startup if credentials configured
if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter.verify((error, success) => {
    if (error) {
      console.warn('[SMTP] Verification failed:', error?.message || error);
    } else {
      console.log('[SMTP] Server is ready to send messages');
    }
  });
} else {
  console.log('[SMTP] No SMTP credentials configured. Email sending features will be disabled until credentials are added.');
}

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

// Helper to generate Excel Buffer and Mail Options from Data
async function generateBackupMail(data: {
  users?: any[],
  contributions?: any[],
  loans?: any[],
  payments?: any[],
  notices?: any[]
}, source: string) {
  const now = new Date();
  const wb = XLSX.utils.book_new();

  const safeUsers = data?.users || [];
  const safeContribs = data?.contributions || [];
  const safeLoans = data?.loans || [];
  const safeNotices = data?.notices || [];

  const isSystemAdminEmail = (email?: string) => {
    if (!email) return false;
    const e = email.toLowerCase().trim();
    return e === 'unnati.finance2026@gmail.com';
  };

  const safePayments = (data?.payments || []).map(p => {
    const parentLoan = safeLoans.find(l => l.id === p.loanId);

    const borrower = safeUsers.find(u => 
      !isSystemAdminEmail(u.email) && (
        (u.id && parentLoan?.userId && u.id === parentLoan.userId) ||
        (u.uid && parentLoan?.userId && u.uid === parentLoan.userId) ||
        (u.email && parentLoan?.userEmail && u.email.toLowerCase().trim() === parentLoan.userEmail.toLowerCase().trim()) ||
        (u.id && p.userId && u.id === p.userId) ||
        (u.uid && p.userId && u.uid === p.userId) ||
        (u.email && p.userEmail && u.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
      )
    );

    const borrowerName = borrower?.displayName || 
      borrower?.name || 
      parentLoan?.userName || 
      (parentLoan?.userEmail && !isSystemAdminEmail(parentLoan.userEmail) ? parentLoan.userEmail.split('@')[0] : null) || 
      p.userName || 
      (p.userEmail && !isSystemAdminEmail(p.userEmail) ? p.userEmail.split('@')[0] : null) || 
      'Member';

    const borrowerEmail = borrower?.email || 
      (parentLoan?.userEmail && !isSystemAdminEmail(parentLoan.userEmail) ? parentLoan.userEmail : null) || 
      (!isSystemAdminEmail(p.userEmail) ? p.userEmail : null) || 
      (parentLoan?.userEmail || p.userEmail || 'N/A');

    return {
      ...p,
      userName: borrowerName,
      userEmail: borrowerEmail
    };
  });

  // Helper to format currency
  const formatCurrency = (val: any) => typeof val === 'number' ? `₹${val.toLocaleString('en-IN')}` : val;

  // Calculate Summary Data
  const totalCollected = safeContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + (Number(c.amount) || 0), 0);
  const totalInterest = safePayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (Number(p.interest) || 0), 0);
  
  // Sheet with trust header helper
  const createSheetWithTrustHeader = (sheetTitle: string, headers: string[], rows: any[][]) => {
    const aoa = [
      ['UNNATI TRUST (R)'],
      [sheetTitle],
      [`Backup Timestamp: ${now.toLocaleString()} | Data Source: ${source}`],
      [],
      headers,
      ...rows
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const maxCol = Math.max(0, headers.length - 1);
    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: maxCol } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: maxCol } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: maxCol } },
    ];
    return ws;
  };

  const summaryRows = [
    ['Report Generation Date', now.toLocaleString()],
    ['Data Source', source],
    ['Total Registered Members', safeUsers.length],
    ['Total Collected Savings (Paid)', formatCurrency(totalCollected)],
    ['Total Interest Earned (Paid)', formatCurrency(totalInterest)],
    ['Total Group Savings Pool', formatCurrency(totalCollected + totalInterest)],
    ['Total Loan Applications', safeLoans.length]
  ];
  const summaryWS = createSheetWithTrustHeader('FINANCIAL SYSTEM BACKUP SUMMARY', ['Metric', 'Value'], summaryRows);
  summaryWS['!cols'] = [{ wch: 35 }, { wch: 35 }];
  XLSX.utils.book_append_sheet(wb, summaryWS, "Financial_Summary");

  // Transform data for better Excel readability
  const sanitizeItem = (item: any) => {
    if (!item || typeof item !== 'object') return item;
    const newItem = { ...item };
    Object.keys(newItem).forEach(key => {
      // Handle Firebase timestamps (objects with _seconds or seconds or toDate)
      if (newItem[key] && typeof newItem[key] === 'object') {
        if (typeof newItem[key].toDate === 'function') {
          try { newItem[key] = newItem[key].toDate().toLocaleString(); } catch {}
        } else if (newItem[key]._seconds !== undefined) {
          newItem[key] = new Date(newItem[key]._seconds * 1000).toLocaleString();
        } else if (newItem[key].seconds !== undefined) {
          newItem[key] = new Date(newItem[key].seconds * 1000).toLocaleString();
        }
      }
      
      // Formatting for financial values
      if (['amount', 'interest', 'approvedAmount', 'totalInterestPaid', 'balance'].includes(key)) {
        newItem[key] = formatCurrency(newItem[key]);
      }
    });
    return newItem;
  };

  const createTableSheet = (title: string, items: any[]) => {
    if (!items || items.length === 0) {
      return createSheetWithTrustHeader(title, ['Message'], [['No records available']]);
    }
    const sanitized = items.map(sanitizeItem);
    const keys = Array.from(new Set(sanitized.flatMap(it => Object.keys(it))));
    const rows = sanitized.map(it => keys.map(k => (it[k] !== undefined && it[k] !== null ? it[k] : '')));
    const ws = createSheetWithTrustHeader(title, keys, rows);
    ws['!cols'] = keys.map(() => ({ wch: 22 }));
    return ws;
  };

  XLSX.utils.book_append_sheet(wb, createTableSheet("MEMBERS DATABASE", safeUsers), "Members");
  XLSX.utils.book_append_sheet(wb, createTableSheet("CONTRIBUTIONS DATABASE", safeContribs), "Contributions");
  XLSX.utils.book_append_sheet(wb, createTableSheet("LOANS DATABASE", safeLoans), "Loans");
  XLSX.utils.book_append_sheet(wb, createTableSheet("LOAN REPAYMENTS DATABASE", safePayments), "Loan_Repayments");
  XLSX.utils.book_append_sheet(wb, createTableSheet("NOTICES DATABASE", safeNotices), "Notices");

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const monthName = now.toLocaleString('default', { month: 'long' });
  const year = now.getFullYear();

  return {
    from: `"Unnati Automated Backup" <${process.env.SMTP_USER}>`,
    to: 'jpvenu2000@gmail.com',
    subject: `Full Backup Report - UNNATI TRUST (R) - ${monthName} ${year}`,
    html: `
      <div style="font-family: sans-serif; padding: 24px; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 12px; max-width: 650px; background-color: #ffffff;">
        <div style="background-color: #1e1b4b; padding: 16px 20px; border-radius: 8px; margin-bottom: 20px; text-align: center;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px; letter-spacing: 0.5px;">UNNATI TRUST (R)</h2>
          <p style="color: #e0e7ff; margin: 4px 0 0 0; font-size: 13px;">System Data & Financial Backup Report</p>
        </div>
        <p>This is a data backup for <b>UNNATI TRUST (R) Finance System</b> generated on <b>${now.toLocaleString()}</b>.</p>
        <p><b>Data Source:</b> ${source}</p>
        <p>The attached Excel document contains a complete snapshot of all system data with all sheets starting with the trust header.</p>
        <div style="margin-top: 20px; padding: 12px 16px; background-color: #fefce8; border-left: 4px solid #facc15; font-size: 14px; border-radius: 4px;">
          <b>Security Note:</b> This document contains sensitive financial information. Please ensure it is stored securely.
        </div>
        <p style="margin-top: 20px; font-size: 13px; color: #64748b;">
          Recipient: jpvenu2000@gmail.com
        </p>
      </div>
    `,
    attachments: [
      {
        filename: `Unnati_Trust_Backup_${monthName}_${year}.xlsx`,
        content: buffer
      }
    ]
  };
}

async function sendMonthlyFullReport() {
  console.log('Generating monthly full report automation...');
  const { type, db, dbId } = await getDb();
  
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[Automation] SMTP configuration missing');
    return { success: false, message: 'SMTP configuration missing' };
  }

  try {
    if (type === 'client') {
       throw new Error('Automation failed: Server using Client SDK. Admin access required for automated backup.');
    }

    const adminDb = db as admin.firestore.Firestore;
    const [uSnap, cSnap, lSnap, pSnap, nSnap] = await Promise.all([
      adminDb.collection('users').get(),
      adminDb.collection('contributions').get(),
      adminDb.collection('loans').get(),
      adminDb.collection('loanPayments').get(),
      adminDb.collection('notices').get()
    ]);

    const data = {
      users: uSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      contributions: cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      loans: lSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      payments: pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
      notices: nSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    };

    const mailOptions = await generateBackupMail(data, `Server Automation (DB: ${dbId})`);
    const info = await sendMailWithRetry(mailOptions);
    console.log(`[Automation] Monthly report sent: ${info.messageId}`);
    return { success: true, message: 'Backup sent successfully' };
  } catch (err: any) {
    console.error('[Automation] Failed:', err);
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

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

  // Manual trigger for testing full report (server-side fetch)
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

  // New endpoint to receive data from client and send backup email
  app.post('/api/admin/send-backup-report-data', async (req, res) => {
    const data = req.body;
    console.log(`[API] Received backup data from client to email...`);
    
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(400).json({ message: 'SMTP is not configured' });
    }

    try {
      const mailOptions = await generateBackupMail(data, 'Admin Client (Authenticated)');
      const info = await sendMailWithRetry(mailOptions);
      console.log(`[SMTP] Backup email sent via client data: ${info.messageId}`);
      res.json({ message: 'Full backup report sent to jpvenu2000@gmail.com successfully', messageId: info.messageId });
    } catch (err: any) {
      console.error('[SMTP] Failed to send backup report:', err);
      res.status(500).json({ message: 'Failed to send report: ' + err.message });
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
    
    // Warm up database strategy cache and trigger initial handshake/connection asynchronously
    console.log('[Startup] Warming up database connection and cached strategy...');
    getDb()
      .then(async (dbInfo) => {
        console.log(`[Startup] DB warmed up. Selected Strategy: ${dbInfo.type}, DB ID/Path: ${dbInfo.dbId}`);
        // If it's the client SDK strategy, invoke a warm-up query to force the connection handshake
        if (dbInfo.type === 'client') {
          console.log('[Startup] Conducting professional Client SDK query warm-up/handshake...');
          try {
            await getDocs(query(collection(dbInfo.db, 'users'), limit(1)));
            console.log('[Startup] Firestore Client SDK handshake completed successfully!');
          } catch (walkErr: any) {
            console.warn('[Startup] Firestore Client SDK handshake warning:', walkErr.message);
          }
        }
      })
      .catch((err: any) => {
        console.error('[Startup] DB warm up failed:', err?.message || err);
      });
  });
}

startServer();
