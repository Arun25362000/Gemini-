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
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  deleteDoc, 
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, Contribution } from './types';
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
  Mail
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';

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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<'contributions' | 'members'>('contributions');
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
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const notify = (type: 'success' | 'error' | 'info', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const isAdmin = profile?.role === 'admin';
  const myContributions = contributions.filter(c => c.userId === (user?.uid || 'local-admin'));
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const hasPaidCurrent = contributions.some(c => c.userId === (user?.uid || 'local-admin') && c.month === currentMonth && c.year === currentYear && c.status === 'paid');
  const hasPendingCurrent = contributions.some(c => c.userId === (user?.uid || 'local-admin') && c.month === currentMonth && c.year === currentYear && c.status === 'pending');
  const isLate = !hasPaidCurrent && !hasPendingCurrent && new Date().getDate() > DUE_DAY;

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
        await getDocFromServer(doc(db, 'test', 'connection'));
        
        // Also check server health/SMTP
        const healthRes = await fetch('/api/health');
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          console.log("Server Health:", healthData);
          setIsSmtpConfigured(healthData.smtpConfigured);
          if (!healthData.smtpConfigured) {
            console.warn("SMTP is not configured. Automated emails will not work.");
          }
        }
      } catch (err: any) {
        if (err.message?.includes('the client is offline')) {
          console.error("Firebase connection error. Check configuration.");
        }
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
          setProfile(profileData);
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

    return () => {
      unsubscribeContribs();
      unsubscribeUsers();
    };
  }, [user]);

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
      await updateDoc(doc(db, 'contributions', id), {
        status: 'paid'
      });
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
      await deleteDoc(doc(db, 'users', id));
      notify('success', "Member removed successfully.");
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

  const updateStatus = async (id: string, status: 'paid' | 'pending') => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'contributions', id), { status });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full"
        />
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
          className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <TrendingUp className="w-10 h-10 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Unnati</h1>
          <p className="text-gray-600 mb-8">Securely track your monthly savings group contributions.</p>
          
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
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-indigo-600">Unnati</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-sm font-bold text-slate-900">
                {profile?.displayName || user?.displayName || 'User'}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 flex items-center gap-1 font-medium uppercase tracking-wider">
                {isAdmin ? <Shield className="w-3 h-3 text-indigo-600" /> : <UserIcon className="w-3 h-3" />}
                {isAdmin ? 'Administrator' : 'Member'}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
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
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-900">
              {isAdmin 
                ? (activeTab === 'contributions' ? 'All Contributions' : 'Group Members') 
                : 'Your History'}
            </h2>
            {isAdmin && activeTab === 'members' && !isSmtpConfigured && (
              <div className="mt-1 flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 w-fit">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">SMTP Not Configured - Reminders Disabled</span>
              </div>
            )}
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
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
            {!hasPaidCurrent && !hasPendingCurrent && (
              <button 
                onClick={() => setIsAdding(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
              >
                <Plus className="w-5 h-5" /> Record Payment
              </button>
            )}
            {hasPendingCurrent && (
              <div className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold border border-amber-100 flex items-center gap-2">
                <Clock className="w-4 h-4" /> Verification Pending
              </div>
            )}
          </div>
        </div>

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
              onClick={() => setIsAdding(false)}
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
                    <label className="block text-sm font-bold text-slate-700 mb-2">Member</label>
                    <select 
                      value={selectedUserId || ''} 
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      {allUsers.map(u => (
                        <option key={u.uid || u.email} value={u.uid || u.email}>{u.displayName || u.email}</option>
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
                      {Array.from({ length: 12 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{format(new Date(2024, i), 'MMMM')}</option>
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
                
                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-indigo-900">Amount to Pay</span>
                    {getContributionAmount(selectedMonth, selectedYear) > MONTHLY_AMOUNT && (
                      <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider">Includes ₹{LATE_FEE} Late Fee</span>
                    )}
                  </div>
                  <span className="text-xl font-black text-indigo-600">₹{getContributionAmount(selectedMonth, selectedYear).toLocaleString()}</span>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  {isAdmin ? (
                    <button 
                      onClick={() => addContribution(selectedMonth, selectedYear, selectedUserId || undefined)}
                      className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                    >
                      Confirm Payment
                    </button>
                  ) : (
                    <button 
                      onClick={() => handleUPIPayment(selectedMonth, selectedYear)}
                      className="flex-2 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Plus className="w-5 h-5 rotate-45" /> Pay via UPI
                    </button>
                  )}
                </div>
              </div>
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
