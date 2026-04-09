import { useEffect, useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  onSnapshot, 
  setDoc, 
  getDoc, 
  query, 
  orderBy, 
  where,
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  deleteDoc, 
  getDocs,
  writeBatch,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, Contribution, Loan, LoanPayment } from './types';
import { 
  LogOut, 
  Plus, 
  Shield, 
  User as UserIcon, 
  TrendingUp, 
  Calendar, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Trash2,
  Edit2,
  MessageSquare,
  Mail,
  Wallet,
  ArrowRight,
  History as HistoryIcon,
  FileText,
  IndianRupee,
  Bell,
  Megaphone,
  Download,
  FileSpreadsheet,
  FileDown,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Notice, AppNotification } from './types';

// --- Constants ---
const MONTHLY_AMOUNT = 1000;
const LATE_FEE = 100;
const DUE_DAY = 10;

const getContributionAmount = (month: number, year: number) => {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentDay = now.getDate();

  // If paying for a past year
  if (year < currentYear) return MONTHLY_AMOUNT + LATE_FEE;
  // If paying for a past month in the current year
  if (year === currentYear && month < currentMonth) return MONTHLY_AMOUNT + LATE_FEE;
  // If paying for the current month after the due day
  if (year === currentYear && month === currentMonth && currentDay > DUE_DAY) return MONTHLY_AMOUNT + LATE_FEE;
  
  // Early or on-time payment
  return MONTHLY_AMOUNT;
};
const ADMIN_EMAILS = ['arun2102000@gmail.com', 'unnati@gmail.com', 'arun.cse.rymec@gmail.com'];
const UPI_VPA = "megha24.anand@ybl"; // Payee UPI ID
const GROUP_NAME = "Unnati Savings Group";

// --- Types ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // Don't throw if it's a background sync error to prevent app crash
  if (operationType === OperationType.GET) {
    return errInfo;
  }
  throw new Error(JSON.stringify(errInfo));
}

// --- Components ---

function ErrorBoundary({ error }: { error: string }) {
  return (
    <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100">
        <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Something went wrong</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors"
        >
          Reload Application
        </button>
      </div>
    </div>
  );
}

export default function App() {
  console.log("App component rendering...");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanPayments, setLoanPayments] = useState<LoanPayment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'contributions' | 'members' | 'loans' | 'notices'>('contributions');
  const [loanSubTab, setLoanSubTab] = useState<'applications' | 'repayments'>('applications');
  const [isApplyingLoan, setIsApplyingLoan] = useState(false);
  const [loanAmount, setLoanAmount] = useState(10000);
  const [loanDetails, setLoanDetails] = useState('');
  const [isSubmittingLoan, setIsSubmittingLoan] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [isPayingLoan, setIsPayingLoan] = useState(false);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isAddingNotice, setIsAddingNotice] = useState(false);
  const [newNotice, setNewNotice] = useState({ title: '', content: '', priority: 'normal' as 'normal' | 'high' });
  const [approvedLoanPopup, setApprovedLoanPopup] = useState<Loan | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingNotification, setPendingNotification] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', phoneNumber: '', joinDate: format(new Date(), 'yyyy-MM-dd') });
  const [loginMethod, setLoginMethod] = useState<'google' | 'password'>('google');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showInitButton, setShowInitButton] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [isTriggeringReminders, setIsTriggeringReminders] = useState(false);
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const [activeNoticeToast, setActiveNoticeToast] = useState<Notice | null>(null);
  const [activeNotificationToast, setActiveNotificationToast] = useState<AppNotification | null>(null);
  const [showNoticeBoard, setShowNoticeBoard] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);

  // PWA Install Prompt Handler
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setShowInstallButton(false);
    }
  };

  // Notice Toast Trigger (with localStorage to show on login/refresh)
  useEffect(() => {
    if (notices.length > 0 && user) {
      const latest = notices[0];
      const lastSeenId = localStorage.getItem(`last_seen_notice_${user.uid}`);
      
      if (latest.id !== lastSeenId) {
        setActiveNoticeToast(latest);
        localStorage.setItem(`last_seen_notice_${user.uid}`, latest.id!);
        const timer = setTimeout(() => setActiveNoticeToast(null), 30000);
        return () => clearTimeout(timer);
      }
    }
  }, [notices, user]);

  // Notification Toast Trigger
  useEffect(() => {
    if (notifications.length > 0 && user) {
      const latest = notifications[0];
      const lastSeenId = localStorage.getItem(`last_seen_notification_${user.uid}`);
      
      if (latest.id !== lastSeenId && !latest.read) {
        setActiveNotificationToast(latest);
        localStorage.setItem(`last_seen_notification_${user.uid}`, latest.id!);
        const timer = setTimeout(() => setActiveNotificationToast(null), 15000);
        return () => clearTimeout(timer);
      }
    }
  }, [notifications, user]);

  const notify = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const isAdmin = !!user && profile?.role === 'admin';

  // Safety timeout for loading state
  useEffect(() => {
    if (loading) {
      const timer = setTimeout(() => {
        console.warn("Loading timed out after 10s. Forcing UI to show.");
        setLoading(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  useEffect(() => {
    console.log("App mounted. User:", user?.email, "isAdmin:", isAdmin);
  }, [user, isAdmin]);
  const hasActiveLoan = loans.some(l => l.userId === user?.uid && (l.status === 'approved' || l.status === 'pending'));
  const myContributions = contributions.filter(c => c.userId === (user?.uid || 'local-admin'));
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const hasPaidCurrent = contributions.some(c => c.userId === (user?.uid || 'local-admin') && c.month === currentMonth && c.year === currentYear && c.status === 'paid');
  const hasPendingCurrent = contributions.some(c => c.userId === (user?.uid || 'local-admin') && c.month === currentMonth && c.year === currentYear && c.status === 'pending');
  const isLate = !hasPaidCurrent && !hasPendingCurrent && new Date().getDate() > DUE_DAY;

  const calculateLoanRemainingTotal = (l: Loan, payments: LoanPayment[]) => {
    const principalPerMonth = l.approvedAmount! / (l.installments || 10);
    let totalRemaining = 0;
    
    for (let i = 0; i < (l.installments || 10); i++) {
      const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
      const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
      const m = installmentDate.getMonth() + 1;
      const y = installmentDate.getFullYear();
      
      const isPaid = payments.some(p => p.month === m && p.year === y);
      if (!isPaid) {
        const remainingPrincipalAtStart = l.approvedAmount! - (i * principalPerMonth);
        const interest = remainingPrincipalAtStart * 0.005;
        totalRemaining += (principalPerMonth + interest);
      }
    }
    return totalRemaining;
  };

  useEffect(() => {
    if (isAdmin) {
      const pending = contributions.filter(c => c.status === 'pending');
      if (pending.length > 0) {
        setPendingNotification(`${pending.length} payment(s) awaiting your approval.`);
      } else {
        setPendingNotification(null);
      }
    }
  }, [contributions, isAdmin]);

  // --- Auth & Profile ---
  useEffect(() => {
    if (user) {
      setSelectedUserId(user.uid);
    }
  }, [user]);

  useEffect(() => {
    const testConnection = async () => {
      try {
        // Use a timeout for the health check to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // Check server health/SMTP
        const healthRes = await fetch('/api/health', { signal: controller.signal });
        clearTimeout(timeoutId);

        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setIsSmtpConfigured(healthData.smtpConfigured);
        }
      } catch (err: any) {
        console.warn("Health check failed or timed out:", err.message);
      }
    };
    testConnection();

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userRef = doc(db, 'users', firebaseUser.uid);
        let userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          // Check if admin pre-added this user by email
          const email = firebaseUser.email || '';
          const emailRef = doc(db, 'users', email);
          const emailSnap = await getDoc(emailRef);

          if (emailSnap.exists()) {
            // Link UID to existing record
            const existingData = emailSnap.data() as UserProfile;
            const updatedProfile = { ...existingData, uid: firebaseUser.uid, displayName: firebaseUser.displayName || existingData.displayName };
            await setDoc(userRef, updatedProfile);
            await deleteDoc(emailRef); // Remove the email-keyed doc
            setProfile(updatedProfile);
          } else {
            // Create new
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: email,
              displayName: firebaseUser.displayName || (email === 'unnati@gmail.com' ? 'System Admin' : ''),
              role: ADMIN_EMAILS.includes(email) ? 'admin' : 'user',
              joinDate: format(new Date(), 'yyyy-MM-dd')
            };
            try {
              await setDoc(userRef, newProfile);
              setProfile(newProfile);

              // Trigger Welcome Email for self-registering users
              if (newProfile.email) {
                fetch('/api/admin/send-welcome-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: newProfile.email, name: newProfile.displayName })
                }).catch(err => console.error('Failed to send self-reg welcome email:', err));
              }
            } catch (err: any) {
              handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
            }
          }
        } else {
          const profileData = userSnap.data() as UserProfile;
          
          // Auto-promote to admin if email is in ADMIN_EMAILS but role is 'user'
          if (firebaseUser.email && ADMIN_EMAILS.includes(firebaseUser.email) && profileData.role !== 'admin') {
            const updatedProfile = { ...profileData, role: 'admin' as const };
            try {
              await updateDoc(userRef, { role: 'admin' });
              setProfile(updatedProfile);
            } catch (err) {
              console.error("Failed to auto-promote user to admin:", err);
              setProfile(profileData);
            }
          } else {
            setProfile(profileData);
          }

          if (!profileData.phoneNumber) {
            setShowPhonePrompt(true);
          }
        }
      } else {
        setProfile(null);
        setShowPhonePrompt(false);
      }
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // --- Data Sync ---
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'contributions'), orderBy('timestamp', 'desc'));
    const unsubscribeContribs = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contribution));
      setContributions(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'contributions');
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as UserProfile);
      setAllUsers(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    const loansQuery = isAdmin 
      ? collection(db, 'loans') 
      : query(collection(db, 'loans'), where('userId', '==', user.uid));

    const unsubscribeLoans = onSnapshot(loansQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Loan));
      setLoans(data);
      
      // Check for newly approved loans for current user
      const newlyApproved = data.find(l => 
        l.userId === user.uid && 
        l.status === 'approved' && 
        !localStorage.getItem(`loan_popup_${l.id}`)
      );
      if (newlyApproved) {
        setApprovedLoanPopup(newlyApproved);
        localStorage.setItem(`loan_popup_${newlyApproved.id}`, 'shown');
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'loans');
    });

    const paymentsQuery = isAdmin
      ? collection(db, 'loanPayments')
      : query(collection(db, 'loanPayments'), where('userId', '==', user.uid));

    const unsubscribeLoanPayments = onSnapshot(paymentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as LoanPayment));
      setLoanPayments(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'loanPayments');
    });

    const unsubscribeNotices = onSnapshot(query(collection(db, 'notices'), orderBy('createdAt', 'desc')), (snapshot) => {
      setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));
    });

    const unsubscribeNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AppNotification)));
      }
    );

    return () => {
      unsubscribeContribs();
      unsubscribeUsers();
      unsubscribeLoans();
      unsubscribeLoanPayments();
      unsubscribeNotices();
      unsubscribeNotifications();
    };
  }, [user, isAdmin]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const inputUsername = credentials.username.toLowerCase().trim();
    const password = credentials.password.trim();

    if (!inputUsername || !password) {
      notify('error', "Please enter both username and password.");
      return;
    }

    // Map 'unnati' to 'unnati@gmail.com'
    const loginEmail = inputUsername === 'unnati' ? 'unnati@gmail.com' : inputUsername;

    setIsLoggingIn(true);
    setShowInitButton(false);
    try {
      await signInWithEmailAndPassword(auth, loginEmail, password);
      setIsLocalAdmin(true);
      notify('success', "Welcome back, Admin!");
    } catch (err: any) {
      console.error("Login error:", err);
      const errorCode = err.code || '';
      const errorMessage = err.message || '';
      
      if (errorCode === 'auth/operation-not-allowed') {
        notify('error', "Email/Password login is not enabled in your Firebase Console. Please go to Authentication > Sign-in method and enable 'Email/Password'.");
      } else if (
        errorCode.includes('user-not-found') || 
        errorCode.includes('invalid-credential') || 
        errorCode.includes('invalid-login-credentials') ||
        errorCode.includes('invalid-email') ||
        errorCode.includes('wrong-password') ||
        errorMessage.includes('auth/invalid-credential') ||
        errorMessage.includes('auth/user-not-found')
      ) {
        if (inputUsername === 'unnati') {
          setShowInitButton(true);
          notify('error', "Admin account not found or wrong password. If you haven't initialized the admin account yet, you can do so below.");
        } else {
          notify('error', "Invalid credentials. Please check your email and password.");
        }
      } else {
        notify('error', "Login error: " + errorMessage);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const initializeAdminAccount = async () => {
    setIsLoggingIn(true);
    try {
      const inputUsername = credentials.username.toLowerCase().trim();
      const loginEmail = inputUsername === 'unnati' ? 'unnati@gmail.com' : inputUsername;
      const password = credentials.password.trim();
      
      const userCredential = await createUserWithEmailAndPassword(auth, loginEmail, password);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: loginEmail,
        displayName: 'Unnati Admin',
        role: 'admin',
        joinDate: format(new Date(), 'yyyy-MM-dd'),
        isApproved: true
      });
      notify('success', "Admin account created successfully! You are now logged in.");
      setShowInitButton(false);
      setIsLocalAdmin(true);
    } catch (err: any) {
      console.error("Initialization error:", err);
      if (err.code === 'auth/operation-not-allowed') {
        notify('error', "Email/Password login is not enabled in your Firebase Console. Please enable it first.");
      } else if (err.code === 'auth/email-already-in-use') {
        notify('error', "This email is already in use. Please try logging in instead.");
      } else {
        notify('error', "Error creating account: " + err.message);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const triggerAutomatedReminders = async () => {
    if (!isAdmin) return;
    
    if (!isSmtpConfigured) {
      notify('error', "SMTP is not configured. Please set SMTP_USER and SMTP_PASS in your environment variables.");
      setShowReminderConfirm(false);
      return;
    }

    setIsTriggeringReminders(true);
    setShowReminderConfirm(false);
    try {
      const response = await fetch('/api/admin/trigger-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json();
      const message = data.message || data.error || (response.ok ? "Reminders triggered successfully!" : "Failed to trigger reminders");
      notify(response.ok ? 'success' : 'error', message);
    } catch (err: any) {
      notify('error', "Failed to trigger reminders: " + err.message);
    } finally {
      setIsTriggeringReminders(false);
    }
  };

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !phoneInput.trim()) return;

    setIsUpdatingPhone(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, {
        phoneNumber: phoneInput.trim()
      });
      setProfile(prev => prev ? { ...prev, phoneNumber: phoneInput.trim() } : null);
      setShowPhonePrompt(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setIsUpdatingPhone(false);
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsLocalAdmin(false);
    setProfile(null);
  };

  const toggleAdminRole = async (targetUser: UserProfile) => {
    if (!isAdmin || !targetUser.uid) {
      notify('error', "Cannot update role: Missing UID or permissions.");
      return;
    }
    
    if (targetUser.uid === user?.uid && targetUser.role === 'admin') {
      const otherAdmins = allUsers.filter(u => u.role === 'admin' && (u.uid !== user?.uid));
      if (otherAdmins.length === 0) {
        notify('error', "You are the only admin. You cannot remove your own admin access.");
        return;
      }
    }

    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    try {
      const userRef = doc(db, 'users', targetUser.uid);
      await updateDoc(userRef, { role: newRole });
      notify('success', `${targetUser.displayName || 'User'} is now a ${newRole}.`);
    } catch (err: any) {
      console.error("Error toggling admin role:", err);
      notify('error', "Failed to update role. Check permissions.");
    }
  };

  const handleForceRefresh = async () => {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
      }
    }
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      await caches.delete(name);
    }
    window.location.reload();
  };

  const addContribution = async (month: number, year: number, targetUserId?: string, status: 'paid' | 'pending' = 'paid') => {
    if (!user || !profile) return;
    
    const uid = targetUserId || user.uid;
    // Find user by UID or Email (since pre-added users use email as ID)
    const targetUser = allUsers.find(u => u.uid === uid || u.email === uid);
    if (!targetUser) return;

    const existing = contributions.find(c => (c.userId === uid || c.userEmail === targetUser.email) && c.month === month && c.year === year);
    if (existing) {
      notify('error', "Contribution for this month already recorded.");
      return;
    }

    try {
      const amount = getContributionAmount(month, year);
      await addDoc(collection(db, 'contributions'), {
        userId: targetUser.uid || '',
        userEmail: targetUser.email,
        month,
        year,
        amount,
        status,
        timestamp: serverTimestamp()
      });
      setIsAdding(false);
      
      if (status === 'pending') {
        notify('success', "Payment recorded as pending! The administrator will verify and approve your payment shortly.");
      } else if (!isAdmin) {
        notify('success', "Payment recorded successfully!");
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'contributions');
    }
  };

  const approveContribution = async (id: string) => {
    if (profile?.role !== 'admin') return;
    try {
      const contrib = contributions.find(c => c.id === id);
      await updateDoc(doc(db, 'contributions', id), {
        status: 'paid'
      });
      
      // Send WhatsApp confirmation if possible (PWC feature)
      if (contrib) {
        const targetUser = allUsers.find(u => u.uid === contrib.userId || u.email === contrib.userEmail);
        if (targetUser && targetUser.phoneNumber) {
          const monthName = format(new Date(contrib.year, contrib.month - 1), 'MMMM');
          const message = `Hi ${targetUser.displayName || 'Member'}, your Unnati contribution of ₹${contrib.amount.toLocaleString()} for ${monthName} ${contrib.year} has been successfully verified and approved. Thank you!`;
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${targetUser.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
        }
      }
      
      notify('success', "Contribution approved!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `contributions/${id}`);
    }
  };

  const addMember = async () => {
    if (profile?.role !== 'admin') return;
    if (!newMember.email || !newMember.name) return;

    try {
      // Use email as ID for pre-added users
      await setDoc(doc(db, 'users', newMember.email), {
        email: newMember.email,
        displayName: newMember.name,
        phoneNumber: newMember.phoneNumber,
        role: 'user',
        joinDate: newMember.joinDate
      });
      setIsAddingMember(false);
      setNewMember({ name: '', email: '', phoneNumber: '', joinDate: format(new Date(), 'yyyy-MM-dd') });
      
      // Send Welcome Email
      try {
        const emailRes = await fetch('/api/admin/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newMember.email, name: newMember.name })
        });
        const emailData = await emailRes.json();
        if (emailRes.ok) {
          notify('success', "Member added and welcome email sent!");
        } else {
          notify('info', `Member added, but welcome email failed: ${emailData.message}`);
        }
      } catch (err: any) {
        console.error('Failed to trigger welcome email:', err);
        notify('info', "Member added, but failed to trigger welcome email.");
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, `users/${newMember.email}`);
    }
  };

  const deleteUser = async (id: string) => {
    if (profile?.role !== 'admin') return;
    if (id === 'arun2102000@gmail.com' || id === 'unnati@gmail.com') {
      notify('error', "Cannot delete primary administrators.");
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // 1. Delete user document
      batch.delete(doc(db, 'users', id));
      
      // 2. Delete contributions
      const contribsQuery = query(collection(db, 'contributions'), where('userId', '==', id));
      const contribsSnap = await getDocs(contribsQuery);
      contribsSnap.forEach(d => batch.delete(d.ref));
      
      // Also check by email if it's a pre-added user
      const targetUser = allUsers.find(u => u.uid === id || u.email === id);
      if (targetUser && targetUser.email) {
        const contribsEmailQuery = query(collection(db, 'contributions'), where('userEmail', '==', targetUser.email));
        const contribsEmailSnap = await getDocs(contribsEmailQuery);
        contribsEmailSnap.forEach(d => batch.delete(d.ref));
      }

      // 3. Delete loans
      const loansQuery = query(collection(db, 'loans'), where('userId', '==', id));
      const loansSnap = await getDocs(loansQuery);
      loansSnap.forEach(d => batch.delete(d.ref));

      // 4. Delete loan payments
      const paymentsQuery = query(collection(db, 'loanPayments'), where('userId', '==', id));
      const paymentsSnap = await getDocs(paymentsQuery);
      paymentsSnap.forEach(d => batch.delete(d.ref));

      await batch.commit();
      notify('success', "Member and all related data removed successfully.");
      setDeletingUserId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    }
  };

  const handleUPIPayment = (month: number, year: number) => {
    if (!user || !profile) return;
    
    const monthName = format(new Date(year, month - 1), 'MMMM');
    const amount = getContributionAmount(month, year);
    const note = `Unnati Contribution - ${monthName} ${year}`;
    // Standard UPI Deep Link format
    const upiUrl = `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(GROUP_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;
    
    // Attempt to open UPI app
    window.location.href = upiUrl;
    
    // Record as pending after redirect
    setTimeout(() => {
      addContribution(month, year, undefined, 'pending');
    }, 1000);
  };

  const updateMember = async () => {
    if (profile?.role !== 'admin' || !editingUser) return;
    try {
      const oldId = editingUser.uid || editingUser.email;
      const userRef = doc(db, 'users', oldId);
      
      // If the user hasn't logged in yet (ID is email) and the email is being changed
      if (!editingUser.uid && editingUser.email !== oldId) {
        // Create new doc with new email as ID
        const newRef = doc(db, 'users', editingUser.email);
        await setDoc(newRef, {
          ...editingUser,
          email: editingUser.email
        });
        // Delete old doc
        await deleteDoc(userRef);
      } else {
        // Just update existing doc
        await updateDoc(userRef, {
          displayName: editingUser.displayName,
          phoneNumber: editingUser.phoneNumber,
          email: editingUser.email
        });
      }
      setEditingUser(null);
      notify('success', 'Member updated successfully');
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${editingUser.uid || editingUser.email}`);
    }
  };

  const sendWhatsAppReminder = (u: UserProfile) => {
    if (!u.phoneNumber) {
      notify('error', "No phone number found for this user.");
      return;
    }
    const message = `Hi ${u.displayName || 'Member'}, this is a reminder for your Unnati contribution of ₹1,000 for ${format(new Date(), 'MMMM yyyy')}. Please record your payment. Thanks!`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${u.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
  };

  const sendEmailReminder = (u: UserProfile) => {
    const subject = `Payment Reminder: Unnati Contribution - ${format(new Date(), 'MMMM yyyy')}`;
    const body = `Hi ${u.displayName || 'Member'},\n\nThis is a reminder for your monthly Unnati contribution of ₹1,000 for ${format(new Date(), 'MMMM yyyy')}. Please record your payment on the app.\n\nThanks!`;
    const mailtoUrl = `mailto:${u.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };
  
  const sendLoanWhatsAppReminder = (u: UserProfile, amount: number, month: string) => {
    if (!u.phoneNumber) {
      notify('error', "No phone number found for this user.");
      return;
    }
    const message = `Hi ${u.displayName || 'Member'}, this is a reminder for your Unnati Loan Repayment of ₹${amount.toLocaleString()} for ${month}. Please pay before the 10th to avoid late fees. Thanks!`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${u.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
  };

  const sendLoanEmailReminder = (u: UserProfile, amount: number, month: string) => {
    const subject = `Loan Repayment Reminder: Unnati - ${month}`;
    const body = `Hi ${u.displayName || 'Member'},\n\nThis is a reminder for your Unnati loan repayment of ₹${amount.toLocaleString()} for ${month}. Please ensure the payment is made before the 10th.\n\nThanks!`;
    const mailtoUrl = `mailto:${u.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
  };

  const updateStatus = async (id: string, status: 'paid' | 'pending') => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'contributions', id), { status });
      
      if (status === 'paid') {
        const contrib = contributions.find(c => c.id === id);
        if (contrib && contrib.userId) {
          createNotification(contrib.userId, "Payment Verified", `Your contribution for ${format(new Date(contrib.year, contrib.month - 1), 'MMMM')} has been verified.`, 'payment');
        }
      }
      notify('success', "Status updated successfully.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `contributions/${id}`);
    }
  };

  const deleteContribution = async (id: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'contributions', id));
      setDeletingId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `contributions/${id}`);
    }
  };

  const toggleUserRole = async (targetUser: UserProfile) => {
    if (profile?.role !== 'admin') return;
    if (targetUser.email === 'arun2102000@gmail.com' || targetUser.email === 'unnati@gmail.com') {
      notify('error', "Cannot change role of the primary administrators.");
      return;
    }

    const newRole = targetUser.role === 'admin' ? 'user' : 'admin';
    const id = targetUser.uid || targetUser.email;
    
    try {
      await updateDoc(doc(db, 'users', id), { role: newRole });
      notify('success', `User role updated to ${newRole}`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${id}`);
    }
  };

  const applyLoan = async () => {
    if (!user || !profile || isAdmin) return;
    
    const activeLoan = loans.find(l => l.userId === user.uid && (l.status === 'approved' || l.status === 'pending'));
    if (activeLoan) {
      notify('error', "You already have an active or pending loan application.");
      return;
    }

    if (loanAmount > 50000) {
      notify('error', "Maximum loan amount is ₹50,000");
      return;
    }

    setIsSubmittingLoan(true);
    try {
      await addDoc(collection(db, 'loans'), {
        userId: user.uid,
        userEmail: user.email,
        amount: loanAmount,
        details: loanDetails,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setIsApplyingLoan(false);
      setLoanAmount(10000);
      setLoanDetails('');
      notify('success', "Loan application submitted successfully!");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'loans');
    } finally {
      setIsSubmittingLoan(false);
    }
  };

  const createNotification = async (userId: string, title: string, message: string, type: AppNotification['type'], link?: string) => {
    try {
      await addDoc(collection(db, 'notifications'), {
        userId,
        title,
        message,
        type,
        read: false,
        createdAt: serverTimestamp(),
        link
      });
    } catch (err) {
      console.error("Failed to create notification:", err);
    }
  };

  const addNotice = async () => {
    if (!profile || profile.role !== 'admin') return;
    if (!newNotice.title || !newNotice.content) return;

    try {
      await addDoc(collection(db, 'notices'), {
        ...newNotice,
        authorName: profile.displayName || profile.email,
        createdAt: serverTimestamp()
      });
      
      // Notify all users about new high priority notice
      if (newNotice.priority === 'high') {
        allUsers.forEach(u => {
          if (u.uid) createNotification(u.uid, "New Important Notice", newNotice.title, 'notice');
        });
      }

      setIsAddingNotice(false);
      setNewNotice({ title: '', content: '', priority: 'normal' });
      notify('success', "Notice posted successfully");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'notices');
    }
  };

  const deleteNotice = async (id: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'notices', id));
      notify('success', "Notice deleted");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `notices/${id}`);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const exportAllDataToExcel = () => {
    if (profile?.role !== 'admin') return;

    const wb = XLSX.utils.book_new();

    // Master Report
    const masterReport = allUsers.map(u => {
      const userContribs = contributions.filter(c => c.userId === u.uid || c.userEmail === u.email);
      const totalDeposited = userContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
      
      const userLoans = loans.filter(l => l.userId === u.uid || l.userEmail === u.email);
      const activeLoan = userLoans.find(l => l.status === 'approved' || l.status === 'paid');
      const hasLoan = !!activeLoan;
      
      const userPayments = loanPayments.filter(p => p.userId === u.uid);
      const totalLoanPaid = userPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.amount, 0);
      const totalLoanInterestPaid = userPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.interest, 0);
      
      const approvedAmount = activeLoan?.approvedAmount || 0;
      const loanPending = approvedAmount > 0 ? (approvedAmount - totalLoanPaid) : 0;

      return {
        'Member Name': u.displayName || 'N/A',
        'Email': u.email,
        'Phone': u.phoneNumber || 'N/A',
        'Join Date': u.joinDate,
        'Total Deposited (₹)': totalDeposited,
        'Has Taken Loan?': hasLoan ? 'Yes' : 'No',
        'Loan Amount (₹)': approvedAmount,
        'Loan Principal Paid (₹)': totalLoanPaid,
        'Loan Interest Paid (₹)': totalLoanInterestPaid,
        'Loan Pending Principal (₹)': loanPending,
        'Loan Status': activeLoan ? activeLoan.status.toUpperCase() : 'N/A'
      };
    });

    const masterWS = XLSX.utils.json_to_sheet(masterReport);
    XLSX.utils.book_append_sheet(wb, masterWS, "Master Report");

    // All Contributions
    const contribsWS = XLSX.utils.json_to_sheet(contributions.map(c => ({
      Member: c.userEmail,
      Month: format(new Date(c.year, c.month - 1), 'MMMM'),
      Year: c.year,
      Amount: c.amount,
      Status: c.status,
      Date: c.timestamp?.toDate ? format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A'
    })));
    XLSX.utils.book_append_sheet(wb, contribsWS, "All Contributions");

    XLSX.writeFile(wb, `Unnati_Admin_Master_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    notify('success', "Comprehensive report exported");
  };

  const exportUserStatementToExcel = () => {
    if (!user) return;
    const wb = XLSX.utils.book_new();
    const userContribs = contributions.filter(c => c.userId === user.uid && c.status === 'paid');
    
    const statementData = userContribs.sort((a,b) => b.year - a.year || b.month - a.month).map(c => ({
      'Date': c.timestamp?.toDate ? format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A',
      'Month': format(new Date(c.year, c.month - 1), 'MMMM'),
      'Year': c.year,
      'Amount (₹)': c.amount,
      'Status': c.status.toUpperCase()
    }));

    const ws = XLSX.utils.json_to_sheet(statementData);
    XLSX.utils.book_append_sheet(wb, ws, "My Statement");
    XLSX.writeFile(wb, `My_Unnati_Statement_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    notify('success', "Statement exported to Excel");
  };

  const generateMemberStatement = (targetUserId: string) => {
    const targetUser = allUsers.find(u => u.uid === targetUserId);
    if (!targetUser) return;

    const doc = new jsPDF();
    const userContribs = contributions.filter(c => c.userId === targetUserId && c.status === 'paid');
    const userLoans = loans.filter(l => l.userId === targetUserId);
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(79, 70, 229); // Indigo-600
    doc.text("UNNATI - Member Statement", 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generated on: ${format(new Date(), 'PPP p')}`, 105, 28, { align: 'center' });

    // Member Info
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`Member Name: ${targetUser.displayName || 'N/A'}`, 20, 45);
    doc.text(`Email: ${targetUser.email}`, 20, 52);
    doc.text(`Join Date: ${targetUser.joinDate || 'N/A'}`, 20, 59);

    // Summary
    const totalSaved = userContribs.reduce((acc, c) => acc + c.amount, 0);
    doc.setDrawColor(200);
    doc.line(20, 65, 190, 65);
    doc.setFont(undefined, 'bold');
    doc.text(`Total Contributions: Rs. ${totalSaved.toLocaleString()}`, 20, 75);
    doc.setFont(undefined, 'normal');

    // Contributions Table
    doc.text("Recent Contributions", 20, 90);
    (doc as any).autoTable({
      startY: 95,
      head: [['Month', 'Year', 'Amount', 'Status']],
      body: userContribs.sort((a,b) => b.year - a.year || b.month - a.month).slice(0, 12).map(c => [
        format(new Date(c.year, c.month - 1), 'MMMM'),
        c.year,
        `Rs. ${c.amount}`,
        c.status.toUpperCase()
      ]),
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229] }
    });

    // Loans Section
    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.text("Loan Summary", 20, finalY + 15);
    (doc as any).autoTable({
      startY: finalY + 20,
      head: [['Amount', 'Status', 'Date']],
      body: userLoans.map(l => [
        `Rs. ${l.amount}`,
        l.status.toUpperCase(),
        l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'N/A'
      ]),
      theme: 'grid',
      headStyles: { fillColor: [79, 70, 229] }
    });

    doc.save(`Unnati_Statement_${targetUser.displayName?.replace(/\s+/g, '_')}.pdf`);
    notify('success', "Statement generated");
  };

  const calculateDividends = () => {
    const totalInterestEarned = loanPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.interest, 0);
    const totalMembers = allUsers.length;
    if (totalMembers === 0) return 0;
    return totalInterestEarned / totalMembers;
  };

  const approveLoan = async (loan: Loan) => {
    if (profile?.role !== 'admin') return;
    try {
      // Approve this loan
      await updateDoc(doc(db, 'loans', loan.id!), {
        status: 'approved',
        approvedAmount: loan.amount,
        interestRate: 0.5,
        approvedAt: serverTimestamp(),
        installments: Math.ceil(loan.amount / 5000) // 10 months for 50k
      });

      // Automatically decline other pending loans for this user
      const otherPending = loans.filter(l => l.userId === loan.userId && l.status === 'pending' && l.id !== loan.id);
      for (const l of otherPending) {
        await updateDoc(doc(db, 'loans', l.id!), { status: 'declined' });
      }

      // Notify user
      createNotification(loan.userId, "Loan Approved", `Your loan of Rs. ${loan.amount} has been approved.`, 'loan');

      notify('success', "Loan approved and others declined.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `loans/${loan.id}`);
    }
  };

  const declineLoan = async (loanId: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'loans', loanId), { status: 'declined' });
      notify('success', "Loan application declined.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `loans/${loanId}`);
    }
  };

  const deleteLoan = async (loanId: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'loans', loanId));
      notify('success', "Loan application deleted.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `loans/${loanId}`);
    }
  };

  const payLoanInstallment = async (loan: Loan, month: number, year: number, amount: number, interest: number) => {
    if (!user || !profile) return;
    try {
      await addDoc(collection(db, 'loanPayments'), {
        loanId: loan.id,
        userId: user.uid,
        month,
        year,
        amount,
        interest,
        status: 'paid',
        timestamp: serverTimestamp()
      });

      // Check if this was the last payment
      const currentPayments = loanPayments.filter(p => p.loanId === loan.id);
      if (currentPayments.length + 1 >= (loan.installments || 10)) {
        await updateDoc(doc(db, 'loans', loan.id!), { status: 'paid' });
        notify('success', "Congratulations! Your loan is fully paid.");
      } else {
        notify('success', "Loan installment paid successfully!");
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'loanPayments');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center"
        >
          <div className="relative mb-12">
            {/* Unnati Logo Image */}
            <div className="w-48 h-48 bg-white rounded-[3rem] flex items-center justify-center shadow-2xl shadow-indigo-100 relative overflow-hidden border border-slate-100">
              <img 
                src="/logo.png" 
                alt="Unnati Logo" 
                className="w-full h-full object-contain p-2"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  // Fallback if logo.png is missing
                  e.currentTarget.src = "https://picsum.photos/seed/growth/512/512";
                }}
              />
            </div>
          </div>
          
          <motion.h1 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-4xl font-black tracking-tighter text-indigo-600 mb-2"
          >
            UNNATI
          </motion.h1>
          
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: 120 }}
            transition={{ delay: 0.6, duration: 1 }}
            className="h-1 bg-slate-100 rounded-full overflow-hidden"
          >
            <motion.div
              animate={{ x: [-120, 120] }}
              transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
              className="w-full h-full bg-indigo-600"
            />
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="mt-4 text-slate-400 font-medium text-sm tracking-widest uppercase"
          >
            Growing Together
          </motion.p>
        </motion.div>
      </div>
    );
  }

  if (error) return <ErrorBoundary error={error} />;

  if (!user && !isLocalAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-2xl text-center border border-slate-100"
        >
          <div className="relative w-40 h-40 mx-auto mb-8">
            <div className="w-full h-full bg-white rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-indigo-50 relative z-10 overflow-hidden border border-slate-50">
              <img 
                src="/logo.png" 
                alt="Unnati Logo" 
                className="w-full h-full object-contain p-2"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = "https://picsum.photos/seed/growth/512/512";
                }}
              />
            </div>
          </div>
          
          <h1 className="text-4xl font-black text-gray-900 mb-2 tracking-tighter">UNNATI</h1>
          <p className="text-slate-500 mb-8 font-medium">Financial Prosperity Through Community Savings.</p>
          
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-2xl">
            <button 
              onClick={() => setLoginMethod('google')}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                loginMethod === 'google' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
            >
              Google
            </button>
            <button 
              onClick={() => setLoginMethod('password')}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold transition-all",
                loginMethod === 'password' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
              )}
            >
              Password
            </button>
          </div>

          {loginMethod === 'google' ? (
            <button 
              onClick={handleLogin}
              className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
              Continue with Google
            </button>
          ) : (
            <form onSubmit={handlePasswordLogin} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Username</label>
                <input 
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials({...credentials, username: e.target.value})}
                  className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Enter username"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">Password</label>
                <input 
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                  className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Enter password"
                />
              </div>
              <button 
                type="submit"
                disabled={isLoggingIn}
                className={cn(
                  "w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2",
                  isLoggingIn && "opacity-70 cursor-not-allowed"
                )}
              >
                {isLoggingIn ? (
                  <>
                    <motion.div 
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                    />
                    Logging in...
                  </>
                ) : 'Login'}
              </button>

              {showInitButton && (
                <button 
                  type="button"
                  onClick={initializeAdminAccount}
                  className="w-full py-3 bg-emerald-50 text-emerald-700 rounded-2xl font-bold hover:bg-emerald-100 transition-all border border-emerald-100 mt-2 text-sm"
                >
                  Initialize Admin Account
                </button>
              )}
            </form>
          )}
          
          <div className="mt-8 pt-8 border-t border-gray-100 text-sm text-gray-400">
            Monthly contribution: ₹1,000 before 10th
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 bg-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-50 overflow-hidden border border-slate-100">
              <img 
                src="/logo.png" 
                alt="Unnati Logo" 
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.src = "https://picsum.photos/seed/growth/512/512";
                }}
              />
            </div>
            <span className="text-xl font-black tracking-tighter text-indigo-600">UNNATI</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            {/* Notification Bell */}
            <div className="relative">
              <button 
                onClick={() => setShowNoticeBoard(true)}
                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all relative"
              >
                <Bell className="w-5 h-5 sm:w-6 sm:h-6" />
                {(notifications.some(n => !n.read) || notices.length > 0) && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 border-2 border-white rounded-full"></span>
                )}
              </button>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">
                {profile?.displayName || user?.displayName || 'User'}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 font-medium uppercase tracking-wider">
                {isAdmin ? <Shield className="w-3 h-3 text-indigo-600" /> : <UserIcon className="w-3 h-3" />}
                {isAdmin ? 'Administrator' : 'Member'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {showInstallButton && (
                <button 
                  onClick={handleInstallClick}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] sm:text-xs font-bold hover:bg-indigo-100 transition-all border border-indigo-100"
                >
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Install</span>
                </button>
              )}
              <button 
                onClick={handleForceRefresh}
                className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
                title="Refresh App & Clear Cache"
              >
                <HistoryIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={handleLogout}
                className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            Welcome back, {profile?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'User'}!
          </h1>
          <p className="text-slate-500 font-medium mt-1">Here's what's happening with your Unnati savings.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-indigo-50 rounded-2xl">
                <Calendar className="w-6 h-6 text-indigo-600" />
              </div>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase">Current Month</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">Status for {format(new Date(), 'MMMM yyyy')}</h3>
            <div className="mt-2 flex items-center gap-2">
              {hasPaidCurrent ? (
                <div className="flex items-center gap-2 text-emerald-600 font-bold text-lg">
                  <CheckCircle2 className="w-5 h-5" /> Paid
                </div>
              ) : hasPendingCurrent ? (
                <div className="flex items-center gap-2 text-amber-600 font-bold text-lg">
                  <Clock className="w-5 h-5" /> Pending Verification
                </div>
              ) : isLate ? (
                <div className="flex items-center gap-2 text-red-600 font-bold text-lg">
                  <AlertCircle className="w-5 h-5" /> Overdue
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-600 font-bold text-lg">
                  <Clock className="w-5 h-5" /> Pending
                </div>
              )}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-emerald-50 rounded-2xl">
                <TrendingUp className="w-6 h-6 text-emerald-600" />
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase">
                {isAdmin ? 'Total Group Savings' : 'Your Total Savings'}
              </span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">
              {isAdmin ? 'Total Collected' : 'Your Contributions'}
            </h3>
            <div className="mt-2 text-3xl font-black text-slate-900">
              ₹{(isAdmin 
                ? contributions.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0) 
                : myContributions.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0)
              ).toLocaleString()}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <UserIcon className="w-6 h-6 text-slate-600" />
              </div>
              <span className="text-xs font-bold text-slate-600 bg-slate-50 px-2 py-1 rounded-lg uppercase">Group Size</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">Active Members</h3>
            <div className="mt-2 text-3xl font-black text-slate-900">
              {allUsers.length}
            </div>
          </motion.div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 mb-8 p-1 bg-slate-100 rounded-2xl w-fit">
            <button 
              onClick={() => setActiveTab('contributions')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'contributions' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Contributions
              {isAdmin && contributions.some(c => c.status === 'pending') && (
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab('members')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                activeTab === 'members' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Members
            </button>
            <button 
              onClick={() => setActiveTab('loans')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'loans' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Loans
              {isAdmin && loans.some(l => l.status === 'pending') && (
                <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab('notices')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'notices' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Notices
            </button>
          </div>
        )}

        {!isAdmin && (
          <div className="flex gap-2 mb-8 p-1 bg-slate-100 rounded-2xl w-fit">
            <button 
              onClick={() => setActiveTab('contributions')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                activeTab === 'contributions' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Contributions
            </button>
            <button 
              onClick={() => setActiveTab('loans')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
                activeTab === 'loans' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Loan Dashboard
              {loans.some(l => l.userId === user?.uid && l.status === 'approved') && (
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-900">
              {isAdmin 
                ? (activeTab === 'contributions' ? 'All Contributions' : activeTab === 'members' ? 'Group Members' : activeTab === 'loans' ? 'Loan Applications' : 'Notice Board') 
                : (activeTab === 'contributions' ? 'Your History' : 'Loan Dashboard')}
            </h2>
            {isAdmin && activeTab === 'members' && !isSmtpConfigured && (
              <div className="mt-1 flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 w-fit">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">SMTP Not Configured - Reminders Disabled</span>
              </div>
            )}
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            {isAdmin && activeTab === 'contributions' && (
              <button 
                onClick={exportAllDataToExcel}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-emerald-600 border border-emerald-100 rounded-2xl font-bold hover:bg-emerald-50 transition-all active:scale-95"
              >
                <FileSpreadsheet className="w-5 h-5" /> Export All
              </button>
            )}
            {!isAdmin && activeTab === 'contributions' && (
              <button 
                onClick={() => generateMemberStatement(user!.uid)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-bold hover:bg-indigo-50 transition-all active:scale-95"
              >
                <FileDown className="w-5 h-5" /> PDF Statement
              </button>
            )}
            {isAdmin && activeTab === 'notices' && (
              <button 
                onClick={() => setIsAddingNotice(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
              >
                <Plus className="w-5 h-5" /> Post Notice
              </button>
            )}
            {isAdmin && activeTab === 'members' && (
              <button 
                onClick={() => setIsAddingMember(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-600 border border-indigo-100 rounded-2xl font-bold hover:bg-indigo-50 transition-all active:scale-95"
              >
                <Plus className="w-5 h-5" /> Add Member
              </button>
            )}
            {isAdmin && activeTab === 'members' && (
              <button 
                onClick={() => setShowReminderConfirm(true)}
                disabled={isTriggeringReminders}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50"
              >
                {isTriggeringReminders ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Mail className="w-5 h-5" />
                )}
                {isTriggeringReminders ? 'Sending...' : 'Send Reminders'}
              </button>
            )}
            {activeTab === 'loans' && !isAdmin && (
              <button 
                onClick={() => setIsApplyingLoan(true)}
                disabled={hasActiveLoan}
                className={cn(
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                  hasActiveLoan ? "bg-slate-100 text-slate-400 shadow-none" : "bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700"
                )}
              >
                <Plus className="w-5 h-5" /> {hasActiveLoan ? 'Loan Active' : 'Apply for Loan'}
              </button>
            )}
            {activeTab === 'contributions' && !hasPaidCurrent && !hasPendingCurrent && (
              <button 
                onClick={() => setIsAdding(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
              >
                <Wallet className="w-5 h-5" /> Pay Now
              </button>
            )}
            {hasPendingCurrent && (
              <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Verification Pending
              </div>
            )}
          </div>
        </div>

        {isAdmin && activeTab === 'loans' && (
          <div className="flex gap-2 mb-6 p-1 bg-slate-100 rounded-2xl w-fit">
            <button 
              onClick={() => setLoanSubTab('applications')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-bold transition-all",
                loanSubTab === 'applications' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Applications
            </button>
            <button 
              onClick={() => setLoanSubTab('repayments')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-bold transition-all",
                loanSubTab === 'repayments' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Repayment Dashboard
            </button>
          </div>
        )}

        {isAdmin && activeTab === 'members' ? (
          <div className="space-y-4">
            {/* Desktop Table View */}
            <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-100">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contact</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Join Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Total Paid</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allUsers.map((u, idx) => {
                      const userContribs = contributions.filter(c => c.userId === u.uid || c.userEmail === u.email);
                      const totalPaid = userContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
                      const paidThisMonth = userContribs.some(c => c.month === currentMonth && c.year === currentYear && c.status === 'paid');
                      
                      return (
                        <motion.tr 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={u.uid || u.email} 
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                                {u.displayName ? u.displayName[0].toUpperCase() : '?'}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-900">{u.displayName || 'Unnamed'}</span>
                                <span className="text-xs text-slate-500">{u.role.toUpperCase()}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-sm text-slate-600">{u.email}</span>
                              <span className="text-xs text-slate-400">{u.phoneNumber || 'No phone'}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm text-slate-500">{u.joinDate}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-sm font-bold text-slate-900">₹{totalPaid.toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                              paidThisMonth ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {paidThisMonth ? 'Active' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => toggleAdminRole(u)}
                                className={cn(
                                  "p-2 rounded-lg transition-all",
                                  u.role === 'admin' ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                )}
                                title={u.role === 'admin' ? "Remove Admin Access" : "Grant Admin Access"}
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              {!paidThisMonth && (
                                <>
                                  <button 
                                    onClick={() => sendWhatsAppReminder(u)}
                                    className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="WhatsApp Reminder"
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => sendEmailReminder(u)}
                                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                    title="Email Reminder"
                                  >
                                    <Mail className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => setEditingUser(u)}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setDeletingUserId(u.uid || u.email)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  setSelectedUserId(u.uid || u.email);
                                  setIsAdding(true);
                                }}
                                className="ml-2 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
                              >
                                Record
                              </button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden grid grid-cols-1 gap-4">
              {allUsers.map((u, idx) => {
                const userContribs = contributions.filter(c => c.userId === u.uid || c.userEmail === u.email);
                const totalPaid = userContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
                const paidThisMonth = userContribs.some(c => c.month === currentMonth && c.year === currentYear && c.status === 'paid');

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={u.uid || u.email}
                    className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                          {u.displayName ? u.displayName[0].toUpperCase() : '?'}
                        </div>
                        <div>
                          <h4 className="font-bold text-slate-900">{u.displayName || 'Unnamed'}</h4>
                          <p className="text-xs text-slate-500">{u.email}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider",
                        paidThisMonth ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {paidThisMonth ? 'Active' : 'Pending'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Paid</p>
                        <p className="font-bold text-slate-900">₹{totalPaid.toLocaleString()}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Joined</p>
                        <p className="font-bold text-slate-900 text-sm">{u.joinDate}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!paidThisMonth && (
                        <>
                          <button 
                            onClick={() => sendWhatsAppReminder(u)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-bold active:scale-95"
                          >
                            <MessageSquare className="w-4 h-4" /> WhatsApp
                          </button>
                          <button 
                            onClick={() => sendEmailReminder(u)}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold active:scale-95"
                          >
                            <Mail className="w-4 h-4" /> Email
                          </button>
                        </>
                      )}
                      <div className="w-full h-px bg-slate-100 my-1" />
                      <button 
                        onClick={() => toggleAdminRole(u)}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold active:scale-95",
                          u.role === 'admin' ? "bg-indigo-600 text-white" : "bg-indigo-50 text-indigo-600"
                        )}
                      >
                        <Shield className="w-4 h-4" /> {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                      </button>
                      <button 
                        onClick={() => setEditingUser(u)}
                        className="p-2.5 bg-slate-50 text-slate-600 rounded-xl active:scale-95"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeletingUserId(u.uid || u.email)}
                        className="p-2.5 bg-red-50 text-red-600 rounded-xl active:scale-95"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => {
                          setSelectedUserId(u.uid || u.email);
                          setIsAdding(true);
                        }}
                        className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-100 active:scale-95"
                      >
                        Record Payment
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        ) : activeTab === 'loans' ? (
          <div className="space-y-6">
            {isAdmin ? (
              <>
                {loanSubTab === 'applications' ? (
                  <div className="space-y-4">
                    {/* Desktop Table View */}
                    <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {loans.sort((a, b) => {
                              const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                              const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                              return dateB - dateA;
                            }).map((l, idx) => (
                              <motion.tr 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                key={l.id} 
                                className="hover:bg-slate-50/50 transition-colors"
                              >
                                <td className="px-6 py-4">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-semibold text-slate-900">{l.userEmail?.split('@')[0]}</span>
                                    <span className="text-xs text-slate-500">{l.userEmail}</span>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-sm font-bold text-slate-900">₹{l.amount.toLocaleString()}</span>
                                </td>
                                <td className="px-6 py-4">
                                  <p className="text-xs text-slate-500 max-w-[200px] truncate" title={l.details}>
                                    {l.details || 'No details'}
                                  </p>
                                </td>
                                <td className="px-6 py-4">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                                    l.status === 'approved' ? "bg-emerald-50 text-emerald-600" : 
                                    l.status === 'pending' ? "bg-amber-50 text-amber-600" : 
                                    l.status === 'paid' ? "bg-indigo-50 text-indigo-600" :
                                    "bg-red-50 text-red-600"
                                  )}>
                                    {l.status.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-6 py-4">
                                  <span className="text-xs text-slate-500">
                                    {l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {l.status === 'pending' && (
                                      <button 
                                        onClick={() => approveLoan(l)}
                                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    {(l.status === 'pending' || l.status === 'approved') && (
                                      <button 
                                        onClick={() => declineLoan(l.id!)}
                                        className="px-3 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg hover:bg-amber-100 transition-all"
                                      >
                                        Decline
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => setDeletingLoanId(l.id!)}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete Application"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                            ))}
                            {loans.length === 0 && (
                              <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                  No loan applications found.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Mobile Card View */}
                    <div className="lg:hidden space-y-4">
                      {loans.map((l, idx) => (
                        <motion.div 
                          key={l.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">{l.userEmail?.split('@')[0]}</span>
                              <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                                {l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}
                              </span>
                            </div>
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold",
                              l.status === 'approved' ? "bg-emerald-50 text-emerald-600" : 
                              l.status === 'pending' ? "bg-amber-50 text-amber-600" : 
                              l.status === 'paid' ? "bg-indigo-50 text-indigo-600" :
                              "bg-red-50 text-red-600"
                            )}>
                              {l.status.toUpperCase()}
                            </span>
                          </div>
                          
                          <div className="mb-4">
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Amount Requested</p>
                            <p className="text-xl font-black text-slate-900">₹{l.amount.toLocaleString()}</p>
                          </div>

                          {l.details && (
                            <div className="mb-6 p-3 bg-slate-50 rounded-xl">
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Details</p>
                              <p className="text-xs text-slate-600 leading-relaxed">{l.details}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            {l.status === 'pending' && (
                              <button 
                                onClick={() => approveLoan(l)}
                                className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all"
                              >
                                Approve
                              </button>
                            )}
                            {(l.status === 'pending' || l.status === 'approved') && (
                              <button 
                                onClick={() => declineLoan(l.id!)}
                                className="flex-1 py-2.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all"
                              >
                                Decline
                              </button>
                            )}
                            <button 
                              onClick={() => setDeletingLoanId(l.id!)}
                              className="p-2.5 bg-red-50 text-red-600 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Summary Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Active Loans</p>
                        <p className="text-2xl font-black text-slate-900">
                          {loans.filter(l => l.status === 'approved').length}
                        </p>
                      </div>
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Outstanding Principal</p>
                        <p className="text-2xl font-black text-slate-900">
                          ₹{loans.filter(l => l.status === 'approved').reduce((acc, l) => {
                            const payments = loanPayments.filter(p => p.loanId === l.id);
                            const paidPrincipal = payments.reduce((pAcc, p) => pAcc + p.amount, 0);
                            return acc + (l.approvedAmount! - paidPrincipal);
                          }, 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Outstanding</p>
                        <p className="text-2xl font-black text-indigo-600">
                          ₹{loans.filter(l => l.status === 'approved').reduce((acc, l) => {
                            const payments = loanPayments.filter(p => p.loanId === l.id);
                            return acc + calculateLoanRemainingTotal(l, payments);
                          }, 0).toLocaleString()}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">Incl. Interest</p>
                      </div>
                      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Overdue Repayments</p>
                        <p className="text-2xl font-black text-red-600">
                          {loans.filter(l => l.status === 'approved').filter(l => {
                            const isPaidThisMonth = loanPayments.some(p => p.loanId === l.id && p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear());
                            return !isPaidThisMonth && new Date().getDate() > 10;
                          }).length}
                        </p>
                      </div>
                    </div>

                    {loans.filter(l => l.status === 'approved' || l.status === 'paid').map((l, idx) => {
                      const payments = loanPayments.filter(p => p.loanId === l.id);
                      const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
                      const remainingPrincipal = l.approvedAmount! - totalPaid;
                      const remainingTotal = calculateLoanRemainingTotal(l, payments);
                      const targetUser = allUsers.find(u => u.uid === l.userId || u.email === l.userEmail);
                      
                      // Calculate current installment
                      const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
                      const currentMonthIndex = (new Date().getFullYear() - approvedDate.getFullYear()) * 12 + (new Date().getMonth() - approvedDate.getMonth());
                      const currentInstallmentIdx = Math.max(0, currentMonthIndex);
                      
                      const principal = l.approvedAmount! / (l.installments || 10);
                      const remainingPrincipalAtStart = l.approvedAmount! - (currentInstallmentIdx * principal);
                      const interest = remainingPrincipalAtStart * 0.005;
                      const currentTotal = principal + interest;
                      
                      const isPaidThisMonth = payments.some(p => p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear());
                      const isLate = !isPaidThisMonth && new Date().getDate() > 10;

                      return (
                        <motion.div 
                          key={l.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden"
                        >
                          <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                                {targetUser?.displayName ? targetUser.displayName[0].toUpperCase() : '?'}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-900">{targetUser?.displayName || l.userEmail}</h4>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                  Approved: {l.approvedAt?.toDate ? format(l.approvedAt.toDate(), 'MMM dd, yyyy') : 'N/A'}
                                </p>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 flex-1">
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Loan</p>
                                <p className="font-bold text-slate-900">₹{l.approvedAmount?.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium">@ 0.5% Interest</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Remaining</p>
                                <p className="font-bold text-indigo-600">₹{remainingTotal.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-medium">₹{remainingPrincipal.toLocaleString()} Principal</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Progress</p>
                                <p className="font-bold text-slate-900">{payments.length} / {l.installments} Paid</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                                  isPaidThisMonth ? "bg-emerald-50 text-emerald-600" : 
                                  isLate ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                                )}>
                                  {isPaidThisMonth ? 'PAID' : isLate ? 'OVERDUE' : 'PENDING'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {!isPaidThisMonth && targetUser && (
                                <>
                                  <button 
                                    onClick={() => sendLoanWhatsAppReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                    className="p-2.5 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all border border-transparent hover:border-emerald-100"
                                    title="WhatsApp Reminder"
                                  >
                                    <MessageSquare className="w-5 h-5" />
                                  </button>
                                  <button 
                                    onClick={() => sendLoanEmailReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                    className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100"
                                    title="Email Reminder"
                                  >
                                    <Mail className="w-5 h-5" />
                                  </button>
                                </>
                              )}
                              <button 
                                onClick={() => setSelectedLoan(selectedLoan?.id === l.id ? null : l)}
                                className={cn(
                                  "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                  selectedLoan?.id === l.id ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                )}
                              >
                                {selectedLoan?.id === l.id ? 'Hide Details' : 'View Schedule'}
                              </button>
                            </div>
                          </div>

                          {selectedLoan?.id === l.id && (
                            <div className="px-6 pb-6 border-t border-slate-100 bg-slate-50/30">
                              <div className="mt-6 space-y-2">
                                {Array.from({ length: l.installments || 10 }).map((_, i) => {
                                  const installmentNum = i + 1;
                                  const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                  const installmentMonth = installmentDate.getMonth() + 1;
                                  const installmentYear = installmentDate.getFullYear();
                                  const isPaid = payments.some(p => p.month === installmentMonth && p.year === installmentYear);
                                  
                                  const principal = l.approvedAmount! / (l.installments || 10);
                                  const remainingPrincipalAtStart = l.approvedAmount! - (i * principal);
                                  const interest = remainingPrincipalAtStart * 0.005;
                                  const total = principal + interest;

                                  return (
                                    <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                                      <div className="flex items-center gap-3">
                                        <span className="text-xs font-bold text-slate-400 w-6">{installmentNum}.</span>
                                        <div>
                                          <p className="text-sm font-bold text-slate-900">{format(installmentDate, 'MMMM yyyy')}</p>
                                          <p className="text-[10px] text-slate-500">₹{principal.toLocaleString()} + ₹{interest.toLocaleString()} Int.</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4">
                                        <span className="text-sm font-black text-slate-900">₹{total.toLocaleString()}</span>
                                        {isPaid ? (
                                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">PAID</span>
                                        ) : (
                                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">PENDING</span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                    {loans.filter(l => l.status === 'approved' || l.status === 'paid').length === 0 && (
                      <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
                        <p className="text-slate-400 italic">No active loans to track.</p>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}

            {/* User Loan View (Only for members) */}
            {!isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Active Loan Info */}
                  {loans.filter(l => l.userId === user?.uid && (l.status === 'approved' || l.status === 'paid')).map(l => {
                    const payments = loanPayments.filter(p => p.loanId === l.id);
                    const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
                    const remaining = l.approvedAmount! - totalPaid;
                    
                    return (
                      <motion.div 
                        key={l.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden"
                      >
                        <div className="p-8 bg-indigo-600 text-white">
                          <div className="flex items-center justify-between mb-6">
                            <div className="p-3 bg-white/10 rounded-2xl">
                              <Wallet className="w-8 h-8 text-white" />
                            </div>
                            <span className="px-4 py-1.5 bg-white/20 rounded-full text-xs font-black uppercase tracking-widest">Active Loan</span>
                          </div>
                          <h3 className="text-indigo-100 font-bold uppercase tracking-widest text-xs mb-1">Approved Amount</h3>
                          <div className="text-5xl font-black mb-6">₹{l.approvedAmount?.toLocaleString()}</div>
                          
                          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-white/10">
                            <div>
                              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">Monthly Interest</p>
                              <p className="text-xl font-bold">0.5%</p>
                            </div>
                            <div>
                              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">Remaining Due</p>
                              <p className="text-xl font-bold">₹{remaining.toLocaleString()}</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-8">
                          <div className="flex items-center justify-between mb-6">
                            <h4 className="text-lg font-bold text-slate-900">Repayment Schedule</h4>
                            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg text-xs font-bold">
                              <CheckCircle2 className="w-4 h-4" />
                              {payments.length} / {l.installments} Paid
                            </div>
                          </div>

                          <div className="space-y-3">
                            {Array.from({ length: l.installments || 10 }).map((_, i) => {
                              const installmentNum = i + 1;
                              // Repayment starts from next month
                              const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
                              const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                              const installmentMonth = installmentDate.getMonth() + 1;
                              const installmentYear = installmentDate.getFullYear();
                              
                              const isPaid = payments.some(p => p.month === installmentMonth && p.year === installmentYear);
                              const principal = l.approvedAmount! / (l.installments || 10);
                              
                              // Interest = 0.5% of remaining principal
                              const remainingPrincipalAtStart = l.approvedAmount! - (i * principal);
                              const interest = remainingPrincipalAtStart * 0.005;
                              const total = principal + interest;

                              const isCurrentMonth = new Date().getMonth() + 1 === installmentMonth && new Date().getFullYear() === installmentYear;
                              const isFuture = installmentDate > new Date();
                              const isPast = installmentDate < new Date() && !isCurrentMonth;

                              return (
                                <div 
                                  key={i}
                                  className={cn(
                                    "flex items-center justify-between p-4 rounded-2xl border transition-all",
                                    isPaid ? "bg-slate-50 border-slate-100 opacity-60" : 
                                    isCurrentMonth ? "bg-white border-indigo-200 ring-2 ring-indigo-50 shadow-md" :
                                    isFuture ? "bg-white border-slate-100 opacity-40 blur-[0.5px]" : "bg-white border-slate-200"
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <div className={cn(
                                      "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                                      isPaid ? "bg-emerald-100 text-emerald-600" : 
                                      isCurrentMonth ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                                    )}>
                                      {installmentNum}
                                    </div>
                                    <div>
                                      <p className="font-bold text-slate-900 text-sm">
                                        {format(installmentDate, 'MMMM yyyy')}
                                      </p>
                                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                        ₹{principal.toLocaleString()} + ₹{interest.toLocaleString()} Interest
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-black text-slate-900">₹{total.toLocaleString()}</span>
                                    {!isPaid && (
                                      <button 
                                        onClick={() => {
                                          setSelectedLoan(l);
                                          setIsPayingLoan(true);
                                        }}
                                        disabled={!isCurrentMonth}
                                        className={cn(
                                          "p-2 rounded-lg transition-all",
                                          isCurrentMonth ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                                        )}
                                      >
                                        <Plus className="w-4 h-4" />
                                      </button>
                                    )}
                                    {isPaid && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}

                  {loans.filter(l => l.userId === user?.uid && (l.status === 'approved' || l.status === 'paid')).length === 0 && (
                    <div className="bg-white p-12 rounded-[2.5rem] border-2 border-dashed border-slate-200 text-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <Wallet className="w-10 h-10 text-slate-300" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">No Active Loans</h3>
                      <p className="text-slate-500 max-w-xs mx-auto mb-8">You don't have any active loans at the moment. Apply for a loan to see it here.</p>
                      {!isAdmin && (
                        <button 
                          onClick={() => setIsApplyingLoan(true)}
                          disabled={hasActiveLoan}
                          className={cn(
                            "px-8 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                            hasActiveLoan ? "bg-slate-100 text-slate-400 shadow-none" : "bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700"
                          )}
                        >
                          {hasActiveLoan ? 'Loan Active' : 'Apply Now'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                    <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                      <HistoryIcon className="w-5 h-5 text-indigo-600" />
                      Application History
                    </h3>
                    <div className="space-y-4">
                      {loans.filter(l => l.userId === user?.uid).sort((a, b) => {
                        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
                        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
                        return dateB - dateA;
                      }).map(l => (
                        <div key={l.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-900">₹{l.amount.toLocaleString()}</span>
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md",
                              l.status === 'approved' ? "bg-emerald-100 text-emerald-700" : 
                              l.status === 'pending' ? "bg-amber-100 text-amber-700" : 
                              l.status === 'paid' ? "bg-indigo-100 text-indigo-700" :
                              "bg-red-100 text-red-700"
                            )}>
                              {l.status === 'pending' ? 'Verification Pending' : 
                               l.status === 'approved' ? 'Approved' : 
                               l.status === 'paid' ? 'Fully Paid' : 
                               l.status === 'declined' ? 'Declined' : l.status}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                            Applied on {l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}
                          </p>
                        </div>
                      ))}
                      {loans.filter(l => l.userId === user?.uid).length === 0 && (
                        <p className="text-sm text-slate-400 italic text-center py-4">No history found.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : activeTab === 'notices' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notices.map((notice, idx) => (
                <motion.div 
                  key={notice.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "bg-white p-6 rounded-3xl shadow-sm border overflow-hidden relative",
                    notice.priority === 'high' ? "border-red-200" : "border-slate-200"
                  )}
                >
                  {notice.priority === 'high' && (
                    <div className="absolute top-0 left-0 right-0 h-1 bg-red-500"></div>
                  )}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-xl",
                        notice.priority === 'high' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
                      )}>
                        <Megaphone className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900">{notice.title}</h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Posted by {notice.authorName} • {notice.createdAt?.toDate ? format(notice.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}
                        </p>
                      </div>
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={() => deleteNotice(notice.id!)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                    {notice.content}
                  </p>
                </motion.div>
              ))}
              {notices.length === 0 && (
                <div className="col-span-full bg-white p-12 rounded-3xl border border-slate-200 text-center">
                  <p className="text-slate-400 italic">No notices have been posted yet.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 border-b border-slate-100">
                    {isAdmin && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Member</th>}
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Month / Year</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Date</th>
                    {isAdmin && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(isAdmin ? contributions : myContributions).map((c, idx) => (
                    <motion.tr 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={c.id} 
                      className="hover:bg-slate-50/50 transition-colors"
                    >
                      {isAdmin && (
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-900">{c.userEmail.split('@')[0]}</span>
                            <span className="text-xs text-slate-500">{c.userEmail}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-slate-700">
                          {format(new Date(c.year, c.month - 1), 'MMMM yyyy')}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-bold text-slate-900">₹{c.amount.toLocaleString()}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={cn(
                            "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                            c.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                          )}>
                            {c.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                            {c.status.toUpperCase()}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs text-slate-500">
                          {c.timestamp?.toDate ? format(c.timestamp.toDate(), 'MMM dd, hh:mm a') : 'Just now'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {c.status === 'pending' && (
                              <button 
                                onClick={() => updateStatus(c.id!, 'paid')}
                                className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100"
                                title="Approve Payment"
                              >
                                Approve
                              </button>
                            )}
                            <button 
                              onClick={() => updateStatus(c.id!, c.status === 'paid' ? 'pending' : 'paid')}
                              className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Toggle Status"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => setDeletingId(c.id!)}
                              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </motion.tr>
                  ))}
                  {(isAdmin ? contributions : myContributions).length === 0 && (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 4} className="px-6 py-12 text-center text-slate-400 italic">
                        No records found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <AnimatePresence>
        {activeNoticeToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4">
            <motion.div 
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.9 }}
              className={cn(
                "bg-white rounded-3xl shadow-2xl border-2 p-6 relative overflow-hidden",
                activeNoticeToast.priority === 'high' ? "border-red-500 shadow-red-100" : "border-indigo-500 shadow-indigo-100"
              )}
            >
              <button 
                onClick={() => setActiveNoticeToast(null)}
                className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-start gap-4 pr-8">
                <div className={cn(
                  "p-3 rounded-2xl shrink-0",
                  activeNoticeToast.priority === 'high' ? "bg-red-50 text-red-600" : "bg-indigo-50 text-indigo-600"
                )}>
                  <Megaphone className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg leading-tight mb-1">{activeNoticeToast.title}</h4>
                  <p className="text-sm text-slate-600 line-clamp-3 mb-3">{activeNoticeToast.content}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {activeNoticeToast.authorName} • {activeNoticeToast.createdAt?.toDate ? format(activeNoticeToast.createdAt.toDate(), 'HH:mm') : 'Just now'}
                    </span>
                    <button 
                      onClick={() => {
                        setShowNoticeBoard(true);
                        setActiveNoticeToast(null);
                      }}
                      className="text-xs font-black text-indigo-600 hover:underline"
                    >
                      View Board
                    </button>
                  </div>
                </div>
              </div>
              
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 30, ease: "linear" }}
                className={cn(
                  "absolute bottom-0 left-0 h-1",
                  activeNoticeToast.priority === 'high' ? "bg-red-500" : "bg-indigo-500"
                )}
              />
            </motion.div>
          </div>
        )}

        {activeNotificationToast && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4">
            <motion.div 
              initial={{ opacity: 0, y: -50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -50, scale: 0.9 }}
              className="bg-white rounded-3xl shadow-2xl border-2 border-amber-500 shadow-amber-100 p-6 relative overflow-hidden"
            >
              <button 
                onClick={() => setActiveNotificationToast(null)}
                className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div className="flex items-start gap-4 pr-8">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl shrink-0">
                  <Bell className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900 text-lg leading-tight mb-1">{activeNotificationToast.title}</h4>
                  <p className="text-sm text-slate-600 line-clamp-3 mb-3">{activeNotificationToast.message}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {activeNotificationToast.createdAt?.toDate ? format(activeNotificationToast.createdAt.toDate(), 'HH:mm') : 'Just now'}
                    </span>
                    <button 
                      onClick={() => {
                        markNotificationAsRead(activeNotificationToast.id!);
                        if (activeNotificationToast.link) setActiveTab(activeNotificationToast.link as any);
                        setShowNoticeBoard(true);
                        setActiveNotificationToast(null);
                      }}
                      className="text-xs font-black text-amber-600 hover:underline"
                    >
                      View Details
                    </button>
                  </div>
                </div>
              </div>
              
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 15, ease: "linear" }}
                className="absolute bottom-0 left-0 h-1 bg-amber-500"
              />
            </motion.div>
          </div>
        )}

        {showNoticeBoard && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoticeBoard(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-slate-50 w-full max-w-2xl h-[80vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-8 bg-white border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 rounded-2xl">
                    <Bell className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Notice Board</h3>
                    <p className="text-sm text-slate-500 font-medium">Stay updated with group announcements</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowNoticeBoard(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-8 space-y-8">
                {/* Notices Section */}
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Announcements</h4>
                  <div className="space-y-4">
                    {notices.map(notice => (
                      <div 
                        key={notice.id}
                        className={cn(
                          "bg-white p-6 rounded-3xl border shadow-sm relative overflow-hidden",
                          notice.priority === 'high' ? "border-red-100" : "border-slate-100"
                        )}
                      >
                        {notice.priority === 'high' && <div className="absolute top-0 left-0 right-0 h-1 bg-red-500" />}
                        <div className="flex items-start justify-between mb-3">
                          <h5 className="font-bold text-slate-900">{notice.title}</h5>
                          {isAdmin && (
                            <button onClick={() => deleteNotice(notice.id!)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed mb-4 whitespace-pre-wrap">{notice.content}</p>
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <span>{notice.authorName}</span>
                          <span>{notice.createdAt?.toDate ? format(notice.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}</span>
                        </div>
                      </div>
                    ))}
                    {notices.length === 0 && (
                      <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 italic text-sm">No announcements yet</p>
                      </div>
                    )}
                  </div>
                </section>

                {/* Notifications Section */}
                <section>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 ml-1">Your Notifications</h4>
                  <div className="space-y-3">
                    {notifications.map(n => (
                      <div 
                        key={n.id}
                        onClick={() => {
                          markNotificationAsRead(n.id!);
                          if (n.link) setActiveTab(n.link as any);
                          setShowNoticeBoard(false);
                        }}
                        className={cn(
                          "bg-white p-4 rounded-2xl border transition-all cursor-pointer hover:border-indigo-200",
                          !n.read ? "border-indigo-100 bg-indigo-50/30" : "border-slate-100"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className={cn(
                            "p-2 rounded-xl shrink-0",
                            !n.read ? "bg-indigo-100 text-indigo-600" : "bg-slate-100 text-slate-400"
                          )}>
                            <Bell className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">{n.title}</p>
                            <p className="text-xs text-slate-500 line-clamp-1">{n.message}</p>
                            <p className="text-[10px] text-slate-400 mt-1 font-medium">
                              {n.createdAt?.toDate ? format(n.createdAt.toDate(), 'MMM dd, HH:mm') : 'Just now'}
                            </p>
                          </div>
                          {!n.read && <div className="w-2 h-2 bg-indigo-500 rounded-full mt-2" />}
                        </div>
                      </div>
                    ))}
                    {notifications.length === 0 && (
                      <div className="bg-white p-8 rounded-3xl border border-dashed border-slate-200 text-center">
                        <p className="text-slate-400 italic text-sm">No notifications yet</p>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        )}

        {isAddingNotice && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingNotice(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-indigo-50 rounded-2xl">
                    <Megaphone className="w-6 h-6 text-indigo-600" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Post New Notice</h3>
                </div>
                <button 
                  onClick={() => setIsAddingNotice(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Notice Title</label>
                  <input 
                    type="text" 
                    value={newNotice.title}
                    onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                    placeholder="e.g., Monthly Meeting Update"
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Content</label>
                  <textarea 
                    value={newNotice.content}
                    onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                    placeholder="Write your message here..."
                    rows={4}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-slate-900 font-medium resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">Priority</label>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setNewNotice({ ...newNotice, priority: 'normal' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                        newNotice.priority === 'normal' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      Normal
                    </button>
                    <button 
                      onClick={() => setNewNotice({ ...newNotice, priority: 'high' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold text-sm transition-all",
                        newNotice.priority === 'high' ? "bg-red-600 text-white shadow-lg shadow-red-100" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                      )}
                    >
                      High Priority
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex gap-3">
                <button 
                  onClick={() => setIsAddingNotice(false)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={addNotice}
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
                >
                  Post Notice
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deletingUserId && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingUserId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Remove Member?</h3>
              <p className="text-slate-600 mb-8">This will permanently remove this member from the group. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingUserId(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteUser(deletingUserId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showReminderConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReminderConfirm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm rounded-3xl shadow-2xl p-8 text-center"
            >
              <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Mail className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Send Reminders?</h3>
              <p className="text-slate-600 mb-8">This will send automated email reminders to all members who haven't paid for the current month.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowReminderConfirm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={triggerAutomatedReminders}
                  className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
                >
                  Send Now
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {notification && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-4">
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 50, scale: 0.9 }}
              className={cn(
                "p-4 rounded-2xl shadow-2xl flex items-center gap-3 border backdrop-blur-md",
                notification.type === 'success' ? "bg-emerald-50/90 border-emerald-100 text-emerald-800" : 
                notification.type === 'error' ? "bg-red-50/90 border-red-100 text-red-800" : 
                "bg-indigo-50/90 border-indigo-100 text-indigo-800"
              )}
            >
              {notification.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : 
               notification.type === 'error' ? <AlertCircle className="w-5 h-5" /> : 
               <Mail className="w-5 h-5" />}
              <p className="text-sm font-bold flex-1">{notification.message}</p>
              <button onClick={() => setNotification(null)} className="p-1 hover:bg-black/5 rounded-lg">
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </motion.div>
          </div>
        )}

        {approvedLoanPopup && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-indigo-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-10 text-center overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-emerald-400 to-indigo-600" />
              <div className="w-24 h-24 bg-emerald-50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 ring-8 ring-emerald-50/50">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-4 tracking-tight">Loan Approved!</h2>
              <p className="text-slate-600 font-medium leading-relaxed mb-8">
                Your loan application for <span className="text-indigo-600 font-bold">₹{approvedLoanPopup.amount.toLocaleString()}</span> has been approved. The amount will be disbursed soon.
              </p>
              <button 
                onClick={() => setApprovedLoanPopup(null)}
                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-200 active:scale-95"
              >
                Got it!
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAddingMember && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingMember(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Add New Member</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                  <input 
                    type="text"
                    value={newMember.name}
                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                    placeholder="John Doe"
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                  <input 
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                    placeholder="john@example.com"
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Phone Number (for WhatsApp)</label>
                  <input 
                    type="tel"
                    value={newMember.phoneNumber}
                    onChange={(e) => setNewMember({ ...newMember, phoneNumber: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Join Date</label>
                  <input 
                    type="date"
                    value={newMember.joinDate}
                    onChange={(e) => setNewMember({ ...newMember, joinDate: e.target.value })}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAddingMember(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addMember}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                  >
                    Add Member
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingUser(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Edit Member</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Full Name</label>
                  <input 
                    type="text"
                    value={editingUser.displayName || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, displayName: e.target.value })}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                  <input 
                    type="email"
                    value={editingUser.email || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Phone Number (for WhatsApp)</label>
                  <input 
                    type="tel"
                    value={editingUser.phoneNumber || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, phoneNumber: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setEditingUser(null)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={updateMember}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {pendingNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-8 right-8 z-50 bg-amber-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border border-amber-500"
          >
            <div className="p-2 bg-amber-500 rounded-xl">
              <Clock className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold">Pending Approvals</p>
              <p className="text-sm text-amber-100">{pendingNotification}</p>
            </div>
            <button 
              onClick={() => {
                setActiveTab('contributions');
                setPendingNotification(null);
              }}
              className="ml-4 px-4 py-2 bg-white text-amber-600 rounded-xl text-sm font-bold hover:bg-amber-50 transition-all"
            >
              View
            </button>
          </motion.div>
        )}

        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsAdding(false);
                setSelectedUserId(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Record Contribution</h2>
              <div className="space-y-6">
                {isAdmin && (
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Select Member</label>
                    <select 
                      value={selectedUserId || ''}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">Select a member...</option>
                      {allUsers.map(u => (
                        <option key={u.uid || u.email} value={u.uid || u.email}>
                          {u.displayName || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Month</label>
                    <select 
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(Number(e.target.value))}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {format(new Date(2024, i, 1), 'MMMM')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-2">Year</label>
                    <select 
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(Number(e.target.value))}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-indigo-700">Amount to Pay</span>
                    <span className="text-xl font-black text-indigo-900">₹{getContributionAmount(selectedMonth, selectedYear).toLocaleString()}</span>
                  </div>
                  {getContributionAmount(selectedMonth, selectedYear) > MONTHLY_AMOUNT && (
                    <p className="text-[10px] text-indigo-500 font-bold mt-1 uppercase tracking-wider">Includes ₹{LATE_FEE} Late Fee</p>
                  )}
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => {
                      setIsAdding(false);
                      setSelectedUserId(null);
                    }}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  {isAdmin ? (
                    <button 
                      onClick={() => addContribution(selectedMonth, selectedYear, selectedUserId || undefined, 'paid')}
                      className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                    >
                      Record Payment
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUPIPayment(selectedMonth, selectedYear)}
                      className="flex-2 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <IndianRupee className="w-5 h-5" /> Pay via UPI
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {deletingLoanId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingLoanId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Delete Loan Application?</h2>
                <p className="text-slate-500 mt-2">This action cannot be undone. Are you sure you want to delete this loan application?</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setDeletingLoanId(null)}
                  className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    deleteLoan(deletingLoanId);
                    setDeletingLoanId(null);
                  }}
                  className="flex-2 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {isApplyingLoan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsApplyingLoan(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Apply for Loan</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Required Amount (Max ₹50,000)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400">₹</span>
                    <input 
                      type="number"
                      max={50000}
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(Math.min(50000, Number(e.target.value)))}
                      className="w-full pl-8 pr-4 py-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold text-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="mt-4 flex gap-2">
                    {[10000, 25000, 50000].map(amt => (
                      <button 
                        key={amt}
                        onClick={() => setLoanAmount(amt)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                          loanAmount === amt ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        ₹{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Details (Optional)</label>
                  <textarea 
                    value={loanDetails}
                    onChange={(e) => setLoanDetails(e.target.value)}
                    placeholder="Reason for loan..."
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none h-32 resize-none"
                  />
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800 leading-relaxed font-medium">
                    Loan approval is subject to group admin verification. Interest rate is <span className="font-bold">0.5% monthly</span>.
                  </p>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsApplyingLoan(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={applyLoan}
                    disabled={isSubmittingLoan || loanAmount <= 0}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmittingLoan ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {isPayingLoan && selectedLoan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setIsPayingLoan(false);
                setSelectedLoan(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Loan Repayment</h2>
              
              {/* Find first unpaid installment */}
              {(() => {
                const payments = loanPayments.filter(p => p.loanId === selectedLoan.id);
                let nextMonth = 1;
                let nextYear = 2024;
                
                const approvedDate = selectedLoan.approvedAt?.toDate ? selectedLoan.approvedAt.toDate() : new Date();
                const startMonth = approvedDate.getMonth() + 1;
                const startYear = approvedDate.getFullYear();

                for (let i = 0; i < (selectedLoan.installments || 12); i++) {
                  const m = (startMonth + i - 1) % 12 + 1;
                  const y = startYear + Math.floor((startMonth + i - 1) / 12);
                  if (!payments.some(p => p.month === m && p.year === y)) {
                    nextMonth = m;
                    nextYear = y;
                    break;
                  }
                }

                const principal = selectedLoan.approvedAmount! / (selectedLoan.installments || 12);
                const interest = selectedLoan.approvedAmount! * 0.005;
                const total = principal + interest;

                return (
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Installment Details</p>
                      <div className="flex justify-between mb-2">
                        <span className="text-slate-600 font-medium">Month</span>
                        <span className="font-bold text-slate-900">{format(new Date(nextYear, nextMonth - 1), 'MMMM yyyy')}</span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span className="text-slate-600 font-medium">Principal</span>
                        <span className="font-bold text-slate-900">₹{principal.toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between mb-4">
                        <span className="text-slate-600 font-medium">Interest (0.5%)</span>
                        <span className="font-bold text-emerald-600">+₹{interest.toFixed(0)}</span>
                      </div>
                      <div className="pt-4 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-lg font-bold text-slate-900">Total Amount</span>
                        <span className="text-2xl font-black text-indigo-600">₹{total.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                      <button 
                        onClick={() => {
                          setIsPayingLoan(false);
                          setSelectedLoan(null);
                        }}
                        className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={async () => {
                          const note = `Loan Payment - ${format(new Date(nextYear, nextMonth - 1), 'MMM yyyy')}`;
                          const upiUrl = `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(GROUP_NAME)}&am=${total.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
                          window.location.href = upiUrl;
                          
                          // Record as paid after a delay
                          setTimeout(async () => {
                            await payLoanInstallment(selectedLoan, nextMonth, nextYear, principal, interest);
                            setIsPayingLoan(false);
                            setSelectedLoan(null);
                          }, 1000);
                        }}
                        className="flex-2 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 flex items-center justify-center gap-2"
                      >
                        <IndianRupee className="w-5 h-5" /> Pay via UPI
                      </button>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          </div>
        )}
        {deletingId && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Delete Record?</h2>
                <p className="text-slate-500 mt-2">This action cannot be undone. Are you sure you want to delete this contribution record?</p>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={() => setDeletingId(null)}
                  className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteContribution(deletingId)}
                  className="flex-2 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
        {showPhonePrompt && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
              
              <div className="flex flex-col items-center text-center mb-8">
                <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6 ring-8 ring-indigo-50/50">
                  <MessageSquare className="w-10 h-10 text-indigo-600" />
                </div>
                <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tight">Stay Connected!</h2>
                <p className="text-slate-600 font-medium leading-relaxed">
                  Please provide your WhatsApp number to receive important group updates and payment reminders.
                </p>
              </div>

              <form onSubmit={handleUpdatePhone} className="space-y-6">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none">
                    <span className="text-slate-400 font-bold group-focus-within:text-indigo-500 transition-colors">+91</span>
                  </div>
                  <input 
                    type="tel"
                    required
                    pattern="[0-9]{10}"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="9876543210"
                    className="w-full pl-16 pr-6 py-5 bg-slate-50 rounded-2xl border-2 border-transparent text-slate-900 font-bold text-lg focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all placeholder:text-slate-300"
                  />
                </div>

                <button 
                  type="submit"
                  disabled={isUpdatingPhone || phoneInput.length !== 10}
                  className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xl shadow-indigo-200 flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  {isUpdatingPhone ? (
                    <div className="w-6 h-6 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Save Number</span>
                      <CheckCircle2 className="w-6 h-6" />
                    </>
                  )}
                </button>
                
                <p className="text-center text-xs text-slate-400 font-bold uppercase tracking-widest">
                  Secure & Private
                </p>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-sm text-slate-400">
          Rules: ₹1,000 contribution due before the 10th of every month.
        </p>
        <p className="text-xs text-slate-300 mt-2">
          &copy; {new Date().getFullYear()} Unnati Services. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
