import { useEffect, useState } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut, 
  User 
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
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';

// --- Constants ---
const MONTHLY_AMOUNT = 1000;
const DUE_DAY = 10;
const ADMIN_EMAIL = 'arun2102000@gmail.com';

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
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
          const newProfile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || '',
            role: firebaseUser.email === ADMIN_EMAIL ? 'admin' : 'user'
          };
          try {
            await setDoc(userRef, newProfile);
            setProfile(newProfile);
          } catch (err: any) {
            handleFirestoreError(err, OperationType.CREATE, `users/${firebaseUser.uid}`);
          }
        } else {
          setProfile(userSnap.data() as UserProfile);
        }
      } else {
        setProfile(null);
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

  const handleLogout = () => signOut(auth);

  const addContribution = async (month: number, year: number, targetUserId?: string) => {
    if (!user || !profile) return;
    
    const uid = targetUserId || user.uid;
    const targetUser = allUsers.find(u => u.uid === uid);
    if (!targetUser) return;

    const existing = contributions.find(c => c.userId === uid && c.month === month && c.year === year);
    if (existing) {
      alert("Contribution for this month already recorded.");
      return;
    }

    try {
      await addDoc(collection(db, 'contributions'), {
        userId: uid,
        userEmail: targetUser.email,
        month,
        year,
        amount: MONTHLY_AMOUNT,
        status: 'paid',
        timestamp: serverTimestamp()
      });
      setIsAdding(false);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'contributions');
    }
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
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      await deleteDoc(doc(db, 'contributions', id));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `contributions/${id}`);
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

  if (!user) {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">FinTrack</h1>
          <p className="text-gray-600 mb-8">Securely track your monthly savings group contributions.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6 bg-white rounded-full p-1" alt="Google" />
            Continue with Google
          </button>
          
          <div className="mt-8 pt-8 border-t border-gray-100 text-sm text-gray-400">
            Monthly contribution: ₹1,000 before 10th
          </div>
        </motion.div>
      </div>
    );
  }

  const isAdmin = profile?.role === 'admin';
  const myContributions = contributions.filter(c => c.userId === user.uid);
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const hasPaidCurrent = contributions.some(c => c.userId === user.uid && c.month === currentMonth && c.year === currentYear);
  const isLate = !hasPaidCurrent && new Date().getDate() > DUE_DAY;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">FinTrack</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold">{user.displayName}</span>
              <span className="text-xs text-slate-500 flex items-center gap-1">
                {isAdmin ? <Shield className="w-3 h-3 text-indigo-600" /> : <UserIcon className="w-3 h-3" />}
                {isAdmin ? 'Administrator' : 'Member'}
              </span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
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
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg uppercase">Total Savings</span>
            </div>
            <h3 className="text-slate-500 text-sm font-medium">Your Contributions</h3>
            <div className="mt-2 text-3xl font-black text-slate-900">
              ₹{(myContributions.length * MONTHLY_AMOUNT).toLocaleString()}
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

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            {isAdmin ? 'All Contributions' : 'Your History'}
          </h2>
          {!hasPaidCurrent && (
            <button 
              onClick={() => setIsAdding(true)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
            >
              <Plus className="w-5 h-5" /> Record Payment
            </button>
          )}
        </div>

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
                      <span className={cn(
                        "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold",
                        c.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                      )}>
                        {c.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {c.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500">
                        {c.timestamp?.toDate ? format(c.timestamp.toDate(), 'MMM dd, hh:mm a') : 'Just now'}
                      </span>
                    </td>
                    {isAdmin && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button 
                            onClick={() => updateStatus(c.id!, c.status === 'paid' ? 'pending' : 'paid')}
                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                            title="Toggle Status"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => deleteContribution(c.id!)}
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
      </main>

      <AnimatePresence>
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
                        <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
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
                  <span className="text-sm font-bold text-indigo-900">Amount to Pay</span>
                  <span className="text-xl font-black text-indigo-600">₹{MONTHLY_AMOUNT.toLocaleString()}</span>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAdding(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => addContribution(selectedMonth, selectedYear, selectedUserId || undefined)}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                  >
                    Confirm Payment
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
        <p className="text-sm text-slate-400">
          Rules: ₹1,000 contribution due before the 10th of every month.
        </p>
        <p className="text-xs text-slate-300 mt-2">
          &copy; {new Date().getFullYear()} FinTrack Services. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
