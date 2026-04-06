import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

// Initialize Firebase Admin
if (!admin.apps.length) {
  const projectId = firebaseConfig.projectId;
  console.log('Initializing Firebase Admin with Project ID:', projectId);
  admin.initializeApp({
    projectId: projectId,
  });
}

// Use the correct database ID from config if available, otherwise use default
const app = admin.app();
const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);
console.log(`Firestore initialized with database: ${firebaseConfig.firestoreDatabaseId || '(default)'} in project: ${admin.app().options.projectId}`);

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
  console.log('Using Project ID:', currentApp.options.projectId || 'Default (Auto)');
  
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
    console.log('Fetching users from collection: users');
    const usersSnapshot = await db.collection('users').get().catch(err => {
      console.error('Failed to fetch users collection:', err);
      throw err;
    });
    const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    console.log(`Found ${users.length} users in database.`);

    if (users.length === 0) {
      return { success: true, message: 'No users found to remind.' };
    }

    // 2. Get all contributions for the current month
    console.log(`Checking contributions for ${currentMonth}/${currentYear}...`);
    const contributionsSnapshot = await db.collection('contributions')
      .where('month', '==', currentMonth)
      .where('year', '==', currentYear)
      .where('status', '==', 'paid')
      .get();
    
    console.log(`Found ${contributionsSnapshot.docs.length} paid contributions for this month.`);
    const paidUserIds = new Set(contributionsSnapshot.docs.map(doc => doc.data().userId).filter(id => !!id));
    const paidUserEmails = new Set(contributionsSnapshot.docs.map(doc => doc.data().userEmail).filter(email => !!email));
    
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
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      smtpConfigured: !!(process.env.SMTP_USER && process.env.SMTP_PASS),
      smtpUser: process.env.SMTP_USER ? 'Configured' : 'Missing',
      projectId: admin.app().options.projectId || 'Default (Auto)',
      databaseId: firebaseConfig.firestoreDatabaseId || '(default)',
      envProjectId: process.env.GOOGLE_CLOUD_PROJECT
    });
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
