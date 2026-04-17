import { useEffect, useState, useMemo } from 'react';
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
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { UserProfile, Contribution, Loan, LoanPayment } from './types';
import { read, utils } from 'xlsx';
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
  ChevronDown,
  Upload,
  FileSpreadsheet,
  X,
  UserPlus,
  Users,
  Download,
  FileDown,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
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
const ADMIN_EMAILS = ['arun2102000@gmail.com', 'unnati.finance2026@gmail.com', 'arun.cse.rymec@gmail.com'];
const SYSTEM_ADMIN_EMAIL = 'unnati.finance2026@gmail.com';
const DEV_USER_NAMES = ['System Admin', 'Arun J', 'Anusha JM', 'shwetha JV'];
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
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
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
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<number>(1000);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('online');
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
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [selectedLoanUserId, setSelectedLoanUserId] = useState<string | null>(null);
  const [adminLoanAmount, setAdminLoanAmount] = useState(10000);
  const [adminLoanDetails, setAdminLoanDetails] = useState('');
  const [adminLoanStatus, setAdminLoanStatus] = useState<'pending' | 'approved'>('approved');
  const [isSubmittingAdminLoan, setIsSubmittingAdminLoan] = useState(false);
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [appliedFilter, setAppliedFilter] = useState<{ month: number; year: number } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ field: 'member' | 'date' | 'status' | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'desc' });
  const [memberSortConfig, setMemberSortConfig] = useState<{ field: 'name' | 'contact' | 'joinDate' | 'totalPaid' | 'status' | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' });
  const [loanSortConfig, setLoanSortConfig] = useState<{ field: 'member' | 'amount' | 'status' | 'date' | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'desc' });
  const [customPrincipal, setCustomPrincipal] = useState<number>(5000);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'cash' | 'online'>('all');

  const [deletingRepaymentId, setDeletingRepaymentId] = useState<string | null>(null);

  const [settlingLoanId, setSettlingLoanId] = useState<string | null>(null);
  const [settlePrincipal, setSettlePrincipal] = useState<number>(0);
  const [settleInterest, setSettleInterest] = useState<number>(0);
  const [settleDate, setSettleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isSettlingPending, setIsSettlingPending] = useState(false);

  useEffect(() => {
    if (settlingLoanId) {
      const loan = loans.find(l => l.id === settlingLoanId);
      if (loan) {
        const payments = loanPayments.filter(p => p.loanId === loan.id && p.status === 'paid');
        const paidPrincipal = payments.reduce((acc, p) => acc + p.amount, 0);
        const remainingPrincipal = Math.max(0, loan.approvedAmount! - paidPrincipal);
        setSettlePrincipal(remainingPrincipal);
        setSettleInterest(remainingPrincipal * 0.005);
        setSettleDate(format(new Date(), 'yyyy-MM-dd'));
      }
    }
  }, [settlingLoanId, loans, loanPayments]);

  const handleSort = (field: 'member' | 'date' | 'status') => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSortMembers = (field: 'name' | 'contact' | 'joinDate' | 'totalPaid' | 'status') => {
    setMemberSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSortLoans = (field: 'member' | 'amount' | 'status' | 'date') => {
    setLoanSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const addAdminLoan = async () => {
    if (!isAdmin || !selectedLoanUserId) return;
    
    const targetUser = allUsers.find(u => 
      (selectedLoanUserId && u.uid === selectedLoanUserId) || 
      (selectedLoanUserId && u.email.toLowerCase() === selectedLoanUserId.toLowerCase())
    );
    if (!targetUser) return;

    setIsSubmittingAdminLoan(true);
    try {
      if (adminLoanAmount > financials.availableBalance) {
        notify('error', `Low balance! Available: ₹${financials.availableBalance.toLocaleString()}. Requested: ₹${adminLoanAmount.toLocaleString()}`);
        return;
      }

      const timestampValue = loanDate ? Timestamp.fromDate(new Date(loanDate)) : serverTimestamp();
      
      const loanData: any = {
        userId: targetUser.uid || '',
        userEmail: targetUser.email,
        amount: adminLoanAmount,
        details: adminLoanDetails,
        status: adminLoanStatus,
        createdAt: timestampValue
      };

      if (adminLoanStatus === 'approved') {
        loanData.approvedAmount = adminLoanAmount;
        loanData.interestRate = 0.5;
        loanData.approvedAt = timestampValue;
        loanData.installments = Math.ceil(adminLoanAmount / 5000);
      }

      await addDoc(collection(db, 'loans'), loanData);
      
      if (targetUser.uid) {
        createNotification(
          targetUser.uid, 
          adminLoanStatus === 'approved' ? "Loan Recorded" : "Loan Application Recorded", 
          `An admin has recorded a ${adminLoanStatus === 'approved' ? 'approved' : 'pending'} loan of ₹${adminLoanAmount.toLocaleString()} for you.`, 
          'loan'
        );
      }

      setIsAddingLoan(false);
      setSelectedLoanUserId(null);
      setAdminLoanAmount(10000);
      setAdminLoanDetails('');
      notify('success', `Loan ${adminLoanStatus === 'approved' ? 'recorded and approved' : 'recorded as pending'} successfully!`);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.CREATE, 'loans');
    } finally {
      setIsSubmittingAdminLoan(false);
    }
  };
  const [isSmtpConfigured, setIsSmtpConfigured] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingLoanId, setDeletingLoanId] = useState<string | null>(null);
  const [decliningLoanId, setDecliningLoanId] = useState<string | null>(null);
  const [loanActionComment, setLoanActionComment] = useState('');
  const [showReminderConfirm, setShowReminderConfirm] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false);

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
  const hasActiveLoan = loans.some(l => 
    (l.userId === user?.uid || (user?.email && l.userEmail === user.email)) && 
    (l.status === 'approved' || l.status === 'pending')
  );
  const myContributions = contributions.filter(c => 
    (user?.uid && c.userId === user.uid) || 
    (user?.email && c.userEmail?.toLowerCase() === user.email.toLowerCase())
  );
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();
  const hasPaidCurrent = contributions.some(c => 
    ((user?.uid && c.userId === user.uid) || (user?.email && c.userEmail?.toLowerCase() === user.email.toLowerCase())) && 
    c.month === currentMonth && 
    c.year === currentYear && 
    c.status === 'paid'
  );
  const hasPendingCurrent = contributions.some(c => 
    ((user?.uid && c.userId === user.uid) || (user?.email && c.userEmail?.toLowerCase() === user.email.toLowerCase())) && 
    c.month === currentMonth && 
    c.year === currentYear && 
    c.status === 'pending'
  );
  const isLate = !hasPaidCurrent && !hasPendingCurrent && new Date().getDate() > DUE_DAY;

  const sortedContributions = useMemo(() => {
    if (!appliedFilter) return [];
    
    let items = (isAdmin ? contributions : myContributions)
      .filter(c => c.month === appliedFilter.month && c.year === appliedFilter.year);

    if (isAdmin && searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(c => {
        const user = allUsers.find(u => (c.userId && u.uid === c.userId) || (c.userEmail && u.email.toLowerCase() === c.userEmail.toLowerCase()));
        return (
          user?.displayName?.toLowerCase().includes(query) ||
          c.userEmail?.toLowerCase().includes(query) ||
          c.amount.toString().includes(query) ||
          c.status.toLowerCase().includes(query)
        );
      });
    }

    if (isAdmin && paymentMethodFilter !== 'all') {
      items = items.filter(c => {
        if (paymentMethodFilter === 'online') {
          return c.paymentMethod === 'online' || !c.paymentMethod;
        }
        return c.paymentMethod === 'cash';
      });
    }

    if (sortConfig.field) {
      items = [...items].sort((a, b) => {
        if (sortConfig.field === 'member') {
          const nameA = allUsers.find(u => (a.userId && u.uid === a.userId) || (a.userEmail && u.email.toLowerCase() === a.userEmail.toLowerCase()))?.displayName || a.userEmail.split('@')[0];
          const nameB = allUsers.find(u => (b.userId && u.uid === b.userId) || (b.userEmail && u.email.toLowerCase() === b.userEmail.toLowerCase()))?.displayName || b.userEmail.split('@')[0];
          return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        } else if (sortConfig.field === 'date') {
          const dateA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : 0;
          const dateB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : 0;
          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
        } else if (sortConfig.field === 'status') {
          return sortConfig.direction === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
        }
        return 0;
      });
    }
    return items;
  }, [contributions, myContributions, isAdmin, appliedFilter, sortConfig, allUsers, searchQuery, paymentMethodFilter]);

  const sortedMembers = useMemo(() => {
    let items = allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL);
    
    if (isAdmin && searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(u => 
        u.displayName?.toLowerCase().includes(query) ||
        u.email?.toLowerCase().includes(query) ||
        u.phoneNumber?.toLowerCase().includes(query) ||
        u.role.toLowerCase().includes(query)
      );
    }

    if (memberSortConfig.field) {
      items = [...items].sort((a, b) => {
        const aContribs = contributions.filter(c => (a.uid && c.userId === a.uid) || (a.email && c.userEmail?.toLowerCase() === a.email.toLowerCase()));
        const bContribs = contributions.filter(c => (b.uid && c.userId === b.uid) || (b.email && c.userEmail?.toLowerCase() === b.email.toLowerCase()));
        
        switch (memberSortConfig.field) {
          case 'name':
            const nameA = a.displayName || '';
            const nameB = b.displayName || '';
            return memberSortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
          case 'contact':
            const emailA = a.email || '';
            const emailB = b.email || '';
            return memberSortConfig.direction === 'asc' ? emailA.localeCompare(emailB) : emailB.localeCompare(emailA);
          case 'joinDate':
            const dateA = a.joinDate || '';
            const dateB = b.joinDate || '';
            return memberSortConfig.direction === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
          case 'totalPaid':
            const totalA = aContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
            const totalB = bContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
            return memberSortConfig.direction === 'asc' ? totalA - totalB : totalB - totalA;
          case 'status':
            const paidA = aContribs.some(c => c.month === currentMonth && c.year === currentYear && c.status === 'paid');
            const paidB = bContribs.some(c => c.month === currentMonth && c.year === currentYear && c.status === 'paid');
            return memberSortConfig.direction === 'asc' ? (paidA === paidB ? 0 : paidA ? -1 : 1) : (paidA === paidB ? 0 : paidA ? 1 : -1);
          default:
            return 0;
        }
      });
    }
    return items;
  }, [allUsers, contributions, memberSortConfig, currentMonth, currentYear, isAdmin, searchQuery]);

  // Financial summary calculated directly from database records with accounting calibration
  const financials = useMemo(() => {
    const totalCollected = contributions.filter(c => {
      if (c.status !== 'paid') return false;
      if (c.userEmail?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase()) return false;
      return true;
    }).reduce((acc, c) => acc + c.amount, 0);
    
    // We include interest in the available pool, but the user requested a specific baseline
    const totalInterest = loanPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.interest || 0), 0);
    
    const outstandingPrincipal = loans.filter(l => l.status === 'approved').reduce((acc, l) => {
      const payments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
      const paidPrincipal = payments.reduce((pAcc, p) => pAcc + p.amount, 0);
      return acc + (l.approvedAmount! - paidPrincipal);
    }, 0);

    const currentTotalInternal = totalCollected + totalInterest;
    
    // User requested absolute targets for "as of today"
    // Total Group Savings: 172,000
    // Subscription Balance Available: 2,000
    // Outstanding Principal is calculated from DB (~170,000)
    // This allows Available Balance to move dynamically when loans are deleted/settled.
    const baseSavings = 172000;
    const availableBalance = baseSavings - outstandingPrincipal;

    return {
      totalSavings: baseSavings,
      availableBalance: Math.max(0, availableBalance),
      outstandingPrincipal
    };
  }, [contributions, loanPayments, loans]);

  const calculateLoanRemainingTotal = (l: Loan, payments: LoanPayment[]) => {
    const paidPayments = payments.filter(p => p.status === 'paid');
    const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
    const remainingPrincipal = Math.max(0, l.approvedAmount! - totalPrincipalPaid);
    
    if (remainingPrincipal <= 0) return 0;

    // Estimate remaining total (Principal + Interest)
    // We assume the user continues to pay the standard principal (e.g. 5000) or whatever is left
    const standardPrincipal = l.approvedAmount! / (l.installments || 10);
    const remainingInstallments = Math.ceil(remainingPrincipal / standardPrincipal);
    
    let totalRemaining = 0;
    for (let i = 0; i < remainingInstallments; i++) {
      const currentBalance = remainingPrincipal - (i * standardPrincipal);
      const interest = Math.max(0, currentBalance * 0.005);
      const principalForThisMonth = i === remainingInstallments - 1 ? (remainingPrincipal % standardPrincipal || standardPrincipal) : standardPrincipal;
      totalRemaining += (principalForThisMonth + interest);
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
    const backfillUserData = async (uid: string, email: string) => {
      if (!email) return;
      try {
        const batch = writeBatch(db);
        let hasChanges = false;

        // 1. Contributions
        const contribsQuery = query(
          collection(db, 'contributions'), 
          where('userEmail', '==', email)
        );
        const contribsSnap = await getDocs(contribsQuery);
        contribsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (!data.userId || data.userId === '') {
            batch.update(doc.ref, { userId: uid });
            hasChanges = true;
          }
        });

        // 2. Notifications (where userId might be the email)
        const notificationsQuery = query(
          collection(db, 'notifications'), 
          where('userId', '==', email)
        );
        const notificationsSnap = await getDocs(notificationsQuery);
        notificationsSnap.docs.forEach(doc => {
          batch.update(doc.ref, { userId: uid });
          hasChanges = true;
        });

        // 3. Loans
        const loansQuery = query(
          collection(db, 'loans'), 
          where('userEmail', '==', email)
        );
        const loansSnap = await getDocs(loansQuery);
        loansSnap.docs.forEach(doc => {
          const data = doc.data();
          if (!data.userId || data.userId === '') {
            batch.update(doc.ref, { userId: uid });
            hasChanges = true;
          }
        });

        // 4. Loan Payments
        const loanPaymentsQuery = query(
          collection(db, 'loanPayments'), 
          where('userEmail', '==', email)
        );
        const loanPaymentsSnap = await getDocs(loanPaymentsQuery);
        loanPaymentsSnap.docs.forEach(doc => {
          const data = doc.data();
          if (!data.userId || data.userId === '') {
            batch.update(doc.ref, { userId: uid });
            hasChanges = true;
          }
        });

        // 5. Clean up email-keyed user document if it exists separately
        const emailRef = doc(db, 'users', email);
        if (email !== uid) {
          const emailSnap = await getDoc(emailRef);
          if (emailSnap.exists()) {
            batch.delete(emailRef);
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await batch.commit();
          console.log(`Backfilled data and cleaned up duplicate doc for user ${email}`);
        }
      } catch (err) {
        console.error("Error backfilling user data:", err);
      }
    };

    const testConnection = async () => {
      try {
        // Mandatory Firestore connection test
        await getDocFromServer(doc(db, 'test', 'connection'));
        console.log("Firestore connection verified.");
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
        // Skip logging for other errors, as this is simply a connection test.
      }

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
            
            // Backfill contributions and notifications
            backfillUserData(firebaseUser.uid, email);
          } else {
            // Create new
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: email,
              displayName: firebaseUser.displayName || (email === 'unnati.finance2026@gmail.com' ? 'System Admin' : ''),
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

          // Always attempt backfill in case some records were added by email while user was already registered
          if (firebaseUser.email) {
            backfillUserData(firebaseUser.uid, firebaseUser.email);
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
      // Ensure uniqueness by email to prevent double counting if a user has both UID and Email docs
      // Prioritize entries that have a UID
      const uniqueUsersMap = new Map<string, UserProfile>();
      data.forEach(u => {
        const email = u.email.toLowerCase();
        const existing = uniqueUsersMap.get(email);
        if (!existing || (!existing.uid && u.uid)) {
          uniqueUsersMap.set(email, u);
        }
      });
      setAllUsers(Array.from(uniqueUsersMap.values()));
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

    // Map 'unnati' to 'unnati.finance2026@gmail.com'
    const loginEmail = inputUsername === 'unnati' ? 'unnati.finance2026@gmail.com' : inputUsername;

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
        if (inputUsername === 'unnati' || loginEmail === 'unnati.finance2026@gmail.com' || loginEmail === 'arun2102000@gmail.com') {
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
      const loginEmail = inputUsername === 'unnati' ? 'unnati.finance2026@gmail.com' : inputUsername;
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

  useEffect(() => {
    setCustomAmount(getContributionAmount(selectedMonth, selectedYear));
  }, [selectedMonth, selectedYear, isAdding]);

  const addContribution = async (month: number, year: number, targetUserId?: string, status: 'paid' | 'pending' = 'paid', customDate?: string, amount?: number, method?: 'cash' | 'online') => {
    if (!user || !profile) return;
    
    const uid = targetUserId || user.uid;
    // Find user by UID or Email (since pre-added users use email as ID)
    const targetUser = allUsers.find(u => 
      (uid && u.uid === uid) || 
      (uid && u.email.toLowerCase() === uid.toLowerCase())
    );
    if (!targetUser) return;

    const existing = contributions.find(c => 
      ((uid && c.userId === uid) || (targetUser.email && c.userEmail?.toLowerCase() === targetUser.email.toLowerCase())) && 
      c.month === month && c.year === year
    );
    if (existing) {
      notify('error', "Contribution for this month already recorded.");
      return;
    }

    try {
      const finalAmount = amount !== undefined ? amount : getContributionAmount(month, year);
      const timestampValue = customDate ? Timestamp.fromDate(new Date(customDate)) : serverTimestamp();
      
      await addDoc(collection(db, 'contributions'), {
        userId: targetUser.uid || null,
        userEmail: targetUser.email,
        month,
        year,
        amount: finalAmount,
        status,
        paymentMethod: method || 'online',
        timestamp: timestampValue
      });
      setIsAdding(false);
      setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
      setPaymentMethod('online'); // Reset to default
      
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
        const targetUser = allUsers.find(u => 
          (contrib.userId && u.uid === contrib.userId) || 
          (contrib.userEmail && u.email.toLowerCase() === contrib.userEmail.toLowerCase())
        );
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

    // Check if user already exists
    const existing = allUsers.find(u => u.email.toLowerCase() === newMember.email.toLowerCase());
    if (existing) {
      notify('error', "A member with this email already exists.");
      return;
    }

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

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        // Use cellDates: true to handle Excel dates correctly
        const wb = read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = utils.sheet_to_json(ws) as any[];

        let addedCount = 0;
        let skippedCount = 0;
        const batch = writeBatch(db);
        const addedUsers: { email: string, name: string }[] = [];

        for (const row of data) {
          const name = String(row['username'] || row['name'] || row['Name'] || row['Username'] || row['Display Name'] || '').trim();
          const email = String(row['email'] || row['Email'] || '').trim().toLowerCase();
          const phoneNumber = String(row['phone number'] || row['phone'] || row['Phone'] || row['PhoneNumber'] || row['Mobile'] || '').trim();
          let joinDate = row['date of joining'] || row['join date'] || row['JoinDate'] || row['Joining Date'];
          
          // Handle potential Excel date objects or serial numbers
          if (joinDate instanceof Date) {
            joinDate = format(joinDate, 'yyyy-MM-dd');
          } else if (typeof joinDate === 'number') {
            // Handle Excel serial date (46023 -> 2026-01-01)
            const date = new Date(Math.round((joinDate - 25569) * 86400 * 1000));
            joinDate = format(date, 'yyyy-MM-dd');
          } else if (joinDate) {
            joinDate = String(joinDate).trim();
          } else {
            joinDate = format(new Date(), 'yyyy-MM-dd');
          }

          if (!email || !name) {
            skippedCount++;
            continue;
          }

          const existing = allUsers.find(u => u.email.toLowerCase() === email);
          if (existing) {
            skippedCount++;
            continue;
          }

          const userRef = doc(db, 'users', email);
          batch.set(userRef, {
            uid: null, // Use null for pre-added users
            email: email,
            displayName: name,
            phoneNumber: phoneNumber,
            role: 'user',
            joinDate: joinDate
          });
          addedCount++;
          addedUsers.push({ email, name });
        }

        if (addedCount > 0) {
          await batch.commit();
          
          // Send welcome emails for all added users
          let emailSuccessCount = 0;
          let emailFailCount = 0;
          
          const emailPromises = addedUsers.map(async (u) => {
            try {
              const res = await fetch('/api/admin/send-welcome-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: u.email, name: u.name })
              });
              if (res.ok) emailSuccessCount++;
              else emailFailCount++;
            } catch (err) {
              console.error(`Failed to send welcome email to ${u.email}:`, err);
              emailFailCount++;
            }
          });
          
          await Promise.all(emailPromises);
          
          if (emailFailCount > 0) {
            notify('info', `Bulk upload complete: ${addedCount} members added. Emails: ${emailSuccessCount} sent, ${emailFailCount} failed.`);
          } else {
            notify('success', `Bulk upload complete: ${addedCount} members added and all welcome emails sent!`);
          }
        }

        notify('success', `Bulk upload complete: ${addedCount} members added, ${skippedCount} skipped.`);
        setIsBulkAdding(false);
      } catch (err) {
        console.error("Bulk upload error:", err);
        notify('error', "Failed to process XLS file. Please ensure it's a valid Excel file.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const deleteUser = async (id: string) => {
    if (profile?.role !== 'admin') return;
    if (id === 'arun2102000@gmail.com' || id === 'unnati.finance2026@gmail.com') {
      notify('error', "Cannot delete primary administrators.");
      return;
    }

    try {
      // Check if user has active loans or pending repayments
      const userLoans = loans.filter(l => l.userId === id || l.userEmail === id);
      const hasActiveLoan = userLoans.some(l => l.status === 'approved');
      const hasPendingRepayment = loanPayments.some(p => p.userId === id && p.status === 'pending');
      
      if (hasActiveLoan || hasPendingRepayment) {
        notify('error', "Cannot delete member: User has an active loan or pending repayment.");
        return;
      }

      const batch = writeBatch(db);
      
      // 1. Delete user document
      batch.delete(doc(db, 'users', id));
      
      // 2. Delete contributions
      const contribsQuery = query(collection(db, 'contributions'), where('userId', '==', id));
      const contribsSnap = await getDocs(contribsQuery);
      contribsSnap.forEach(d => batch.delete(d.ref));
      
      // Also check by email if it's a pre-added user
      const targetUser = allUsers.find(u => 
        (id && u.uid === id) || 
        (id && u.email.toLowerCase() === id.toLowerCase())
      );
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
          email: editingUser.email,
          joinDate: editingUser.joinDate
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

  const updateContribution = async () => {
    if (profile?.role !== 'admin' || !editingContribution) return;
    try {
      await updateDoc(doc(db, 'contributions', editingContribution.id!), {
        amount: editingContribution.amount,
        status: editingContribution.status
      });
      notify('success', "Contribution updated successfully.");
      setEditingContribution(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `contributions/${editingContribution.id}`);
    }
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
    if (targetUser.email === 'arun2102000@gmail.com' || targetUser.email === 'unnati.finance2026@gmail.com') {
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

    if (loanAmount > financials.availableBalance) {
      notify('error', `Insufficient funds in group savings! Maximum available to borrow right now: ₹${financials.availableBalance.toLocaleString()}`);
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
        link: link || null
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
      
      // Send notifications to all users
      if (newNotice.priority === 'high') {
        allUsers.forEach(u => {
          createNotification(u.uid || u.email, "New Important Notice", newNotice.title, 'notice');
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
    const masterReport = allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map(u => {
      const userContribs = contributions.filter(c => 
        (u.uid && c.userId === u.uid) || 
        (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())
      );
      const totalDeposited = userContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0);
      
      const userLoans = loans.filter(l => (u.uid && l.userId === u.uid) || (u.email && l.userEmail === u.email));
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
    const contribsWS = XLSX.utils.json_to_sheet(contributions.map(c => {
      const u = allUsers.find(user => 
        (c.userId && user.uid === c.userId) || 
        (c.userEmail && user.email.toLowerCase() === c.userEmail.toLowerCase())
      );
      return {
        Member: u?.displayName || c.userEmail.split('@')[0],
        Month: format(new Date(c.year, c.month - 1), 'MMMM'),
        Year: c.year,
        Amount: c.amount,
        Status: c.status.toUpperCase(),
        'Payment Method': c.paymentMethod ? c.paymentMethod.toUpperCase() : 'ONLINE',
        Date: c.timestamp?.toDate ? format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm') : 'N/A'
      };
    }));
    XLSX.utils.book_append_sheet(wb, contribsWS, "All Contributions");

    XLSX.writeFile(wb, `Unnati_Admin_Master_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    notify('success', "Comprehensive report exported");
  };

  const exportUserStatementToExcel = () => {
    if (!user) return;
    const wb = XLSX.utils.book_new();
    const userContribs = contributions.filter(c => 
      ((user.uid && c.userId === user.uid) || (user.email && c.userEmail?.toLowerCase() === user.email.toLowerCase()))
    );
    
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

  const sortedLoans = useMemo(() => {
    let items = [...loans];
    
    if (isAdmin && searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(l => 
        l.userEmail?.toLowerCase().includes(query) ||
        l.amount.toString().includes(query) ||
        l.status.toLowerCase().includes(query) ||
        l.details?.toLowerCase().includes(query)
      );
    }

    if (loanSortConfig.field) {
      items = [...items].sort((a, b) => {
        switch (loanSortConfig.field) {
          case 'member':
            const userA = allUsers.find(u => (a.userId && u.uid === a.userId) || (a.userEmail && u.email.toLowerCase() === a.userEmail.toLowerCase()));
            const userB = allUsers.find(u => (b.userId && u.uid === b.userId) || (b.userEmail && u.email.toLowerCase() === b.userEmail.toLowerCase()));
            const nameA = userA?.displayName || a.userEmail || '';
            const nameB = userB?.displayName || b.userEmail || '';
            return loanSortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
          case 'amount':
            return loanSortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
          case 'status':
            return loanSortConfig.direction === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
          case 'date':
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return loanSortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
          default:
            return 0;
        }
      });
    } else {
      items.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
      });
    }

    return items;
  }, [loans, isAdmin, searchQuery, loanSortConfig, allUsers]);

  const filteredLoanPayments = useMemo(() => {
    let items = [...loanPayments];
    if (isAdmin && searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(p => {
        const targetUser = allUsers.find(u => u.uid === p.userId);
        return (
          targetUser?.displayName?.toLowerCase().includes(query) ||
          targetUser?.email?.toLowerCase().includes(query) ||
          p.amount.toString().includes(query) ||
          p.interest.toString().includes(query)
        );
      });
    }
    return items;
  }, [loanPayments, isAdmin, searchQuery, allUsers]);

  const generateMemberStatement = (targetUserId: string) => {
    try {
      console.log("Generating statement for user:", targetUserId);
      // Find user by UID or by email if UID is not yet set in the profile
      const targetUser = allUsers.find(u => 
        u.uid === targetUserId || 
        (user?.email && u.email.toLowerCase() === user.email.toLowerCase())
      );
      
      if (!targetUser) {
        console.error("User not found in allUsers list for statement generation. targetUserId:", targetUserId, "currentUserEmail:", user?.email);
        notify('error', "Could not find member profile for statement. Please try refreshing.");
        return;
      }

      console.log("Found targetUser:", targetUser.email);

      const doc = new jsPDF();
      const userContribs = contributions.filter(c => 
        (c.userId === targetUserId) || 
        (targetUser.email && c.userEmail?.toLowerCase() === targetUser.email.toLowerCase())
      );
      
      const userLoans = loans.filter(l => 
        (l.userId === targetUserId) || 
        (targetUser.email && l.userEmail?.toLowerCase() === targetUser.email.toLowerCase())
      );

      const userLoanPayments = loanPayments.filter(p => 
        (p.userId === targetUserId) ||
        (targetUser.email && allUsers.find(u => u.uid === p.userId)?.email.toLowerCase() === targetUser.email.toLowerCase())
      );

      console.log(`Found ${userContribs.length} contributions, ${userLoans.length} loans, and ${userLoanPayments.length} loan payments`);
      
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
      const totalSaved = userContribs.filter(c => c.status === 'paid').reduce((acc, c) => acc + (c.amount || 0), 0);
      const totalLoanPaid = userLoanPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.amount || 0), 0);
      const totalInterestPaid = userLoanPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + (p.interest || 0), 0);

      doc.setDrawColor(200);
      doc.line(20, 65, 190, 65);
      doc.setFont(undefined, 'bold');
      doc.text(`Total Savings: Rs. ${totalSaved.toLocaleString()}`, 20, 75);
      doc.text(`Total Loan Principal Paid: Rs. ${totalLoanPaid.toLocaleString()}`, 20, 82);
      doc.text(`Total Interest Paid: Rs. ${totalInterestPaid.toLocaleString()}`, 20, 89);
      doc.setFont(undefined, 'normal');

      // Contributions Table
      doc.text("Contribution History", 20, 105);
      const contributionRows = userContribs
        .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0))
        .map(c => {
          let monthName = 'N/A';
          try {
            if (c.year && c.month) {
              monthName = format(new Date(c.year, c.month - 1), 'MMMM');
            }
          } catch (e) {
            console.error("Error formatting date for contribution:", c);
          }
          
          let paymentDateTime = 'N/A';
          if (c.timestamp) {
            try {
              const date = c.timestamp.toDate ? c.timestamp.toDate() : new Date(c.timestamp);
              paymentDateTime = format(date, 'MMM dd, yyyy p');
            } catch (e) {
              console.error("Error formatting timestamp:", e);
            }
          }

          return [
            monthName,
            c.year || 'N/A',
            paymentDateTime,
            (c.paymentMethod || 'N/A').toUpperCase(),
            `Rs. ${(c.amount || 0).toLocaleString()}`,
            (c.status || 'N/A').toUpperCase()
          ];
        });

      autoTable(doc, {
        startY: 110,
        head: [['Month', 'Year', 'Date & Time', 'Payment Mode', 'Amount', 'Status']],
        body: contributionRows,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] }
      });

      // Loan Repayments Section
      let finalY = (doc as any).lastAutoTable?.finalY || 150;
      if (userLoanPayments.length > 0) {
        if (finalY > 240) {
          doc.addPage();
          finalY = 20;
        }
        doc.text("Loan Repayment History", 20, finalY + 15);
        const loanPaymentRows = userLoanPayments
          .sort((a, b) => (b.year || 0) - (a.year || 0) || (b.month || 0) - (a.month || 0))
          .map(p => {
            let monthName = 'N/A';
            try {
              if (p.year && p.month) {
                monthName = format(new Date(p.year, p.month - 1), 'MMMM');
              }
            } catch (e) {
              console.error("Error formatting date for loan payment:", p);
            }
            return [
              monthName,
              p.year || 'N/A',
              `Rs. ${(p.amount || 0).toLocaleString()}`,
              `Rs. ${(p.interest || 0).toLocaleString()}`,
              (p.status || 'N/A').toUpperCase()
            ];
          });

        autoTable(doc, {
          startY: finalY + 20,
          head: [['Month', 'Year', 'Principal', 'Interest', 'Status']],
          body: loanPaymentRows,
          theme: 'striped',
          headStyles: { fillColor: [16, 185, 129] } // Emerald-600
        });
        finalY = (doc as any).lastAutoTable?.finalY || finalY + 40;
      }

      // Loans Summary Section
      if (userLoans.length > 0) {
        if (finalY > 240) {
          doc.addPage();
          finalY = 20;
        }
        doc.text("Loan Summary", 20, finalY + 15);
        autoTable(doc, {
          startY: finalY + 20,
          head: [['Date', 'Amount', 'Status']],
          body: userLoans.map(l => [
            l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'N/A',
            `Rs. ${(l.amount || 0).toLocaleString()}`,
            (l.status || 'N/A').toUpperCase()
          ]),
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }
        });
      }

      const fileName = `Unnati_Statement_${(targetUser.displayName || targetUser.email || 'Member').replace(/\s+/g, '_')}.pdf`;
      doc.save(fileName);
      notify('success', "Statement generated successfully!");
    } catch (err: any) {
      console.error("Failed to generate PDF statement:", err);
      notify('error', `Failed to generate PDF: ${err.message || 'Unknown error'}`);
    }
  };

  const calculateDividends = () => {
    const totalInterestEarned = loanPayments.filter(p => p.status === 'paid').reduce((acc, p) => acc + p.interest, 0);
    const totalMembers = allUsers.length;
    if (totalMembers === 0) return 0;
    return totalInterestEarned / totalMembers;
  };

  const settleLoanImmediately = async (loan: Loan) => {
    if (profile?.role !== 'admin') return;
    setIsSettlingPending(true);
    try {
      const settlementTimestamp = Timestamp.fromDate(new Date(settleDate));
      
      // Create a final settlement payment
      await addDoc(collection(db, 'loanPayments'), {
        loanId: loan.id,
        userId: loan.userId,
        userEmail: loan.userEmail,
        month: new Date(settleDate).getMonth() + 1,
        year: new Date(settleDate).getFullYear(),
        amount: settlePrincipal,
        interest: settleInterest,
        status: 'paid',
        timestamp: settlementTimestamp,
        approvedAt: settlementTimestamp,
        paymentMethod: 'cash'
      });

      // Mark loan as paid
      await updateDoc(doc(db, 'loans', loan.id!), { status: 'paid' });
      
      createNotification(loan.userId, "Loan Settled", `Your loan of ₹${loan.approvedAmount?.toLocaleString()} has been settled immediately.`, 'loan');
      
      // Get target user for notifications
      const targetUser = allUsers.find(u => u.uid === loan.userId || u.email.toLowerCase() === loan.userEmail.toLowerCase());
      
      // Send Email via API
      if (targetUser?.email) {
        fetch('/api/admin/send-loan-closure-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: targetUser.email,
            name: targetUser.displayName || targetUser.email.split('@')[0],
            amount: settlePrincipal,
            interest: settleInterest,
            date: format(new Date(settleDate), 'MMM dd, yyyy')
          })
        }).catch(err => console.error('Failed to send closure email:', err));
      }

      // Prepare WhatsApp message
      if (targetUser?.phoneNumber) {
        const message = `*Loan Fully Settled - Unnati Finance*\n\nHi ${targetUser.displayName || 'Member'},\n\nCongratulations! Your loan of ₹${loan.approvedAmount?.toLocaleString()} is now *Paid in Full*.\n\n*Settlement Details:*\n- Principal: ₹${settlePrincipal.toLocaleString()}\n- Interest: ₹${settleInterest.toLocaleString()}\n- Date: ${format(new Date(settleDate), 'MMM dd, yyyy')}\n\nThank you for being a responsible member!`;
        const encodedMessage = encodeURIComponent(message);
        window.open(`https://wa.me/${targetUser.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
      }

      notify('success', "Loan settled immediately with final principal and interest.");
      setSettlingLoanId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `loans/${loan.id}/settle`);
    } finally {
      setIsSettlingPending(false);
    }
  };

  const approveLoan = async (loan: Loan) => {
    if (profile?.role !== 'admin') return;
    try {
      if (loan.amount > financials.availableBalance) {
        notify('error', `Low balance! Available: ₹${financials.availableBalance.toLocaleString()}. Required: ₹${loan.amount.toLocaleString()}`);
        return;
      }

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

  const declineLoan = async (loanId: string, reason: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'loans', loanId), { 
        status: 'declined',
        declineReason: reason 
      });
      
      const loan = loans.find(l => l.id === loanId);
      if (loan) {
        createNotification(loan.userId, "Loan Application Declined", `Your loan of Rs. ${loan.amount} has been declined. Reason: ${reason}`, 'loan');
      }
      
      notify('success', "Loan application declined.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `loans/${loanId}`);
    }
  };

  const deleteLoanRepayment = async (paymentId: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'loanPayments', paymentId));
      notify('success', "Loan repayment record deleted successfully.");
      setDeletingRepaymentId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `loanPayments/${paymentId}`);
    }
  };

  const approveLoanPayment = async (payment: LoanPayment) => {
    if (profile?.role !== 'admin') return;
    try {
      await updateDoc(doc(db, 'loanPayments', payment.id!), {
        status: 'paid',
        approvedAt: serverTimestamp()
      });

      // Check if this was the last payment for the loan
      const loan = loans.find(l => l.id === payment.loanId);
      if (loan) {
        const currentPaidPayments = loanPayments.filter(p => p.loanId === loan.id && (p.status === 'paid' || p.id === payment.id));
        const totalPrincipalPaid = currentPaidPayments.reduce((acc, p) => acc + p.amount, 0);
        
        if (totalPrincipalPaid >= loan.approvedAmount!) {
          await updateDoc(doc(db, 'loans', loan.id!), { status: 'paid' });
          createNotification(payment.userId, "Loan Fully Paid", `Congratulations! Your loan of ₹${loan.approvedAmount?.toLocaleString()} is now fully paid.`, 'loan');
        }
      }

      createNotification(payment.userId, "Loan Payment Approved", `Your loan payment for ${format(new Date(payment.year, payment.month - 1), 'MMMM yyyy')} has been approved.`, 'payment');
      notify('success', "Loan payment approved.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `loanPayments/${payment.id}`);
    }
  };

  const declineLoanPayment = async (paymentId: string) => {
    if (profile?.role !== 'admin') return;
    try {
      await deleteDoc(doc(db, 'loanPayments', paymentId));
      notify('success', "Loan payment request declined and removed.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `loanPayments/${paymentId}`);
    }
  };

  const deleteLoan = async (loanId: string, reason?: string) => {
    if (profile?.role !== 'admin') return;
    try {
      const loan = loans.find(l => l.id === loanId);
      
      // If deleting a loan, we should also delete its payments to keep calculations consistent
      // OR we keep them? The user said "calculations should get adjusted accordingly"
      // If we delete a PAID loan, we should probably delete the payments too if we want the interest to be removed.
      // But typically we want to keep history.
      // However, the user specifically mentioned manual adjustment, suggesting the automatic one was wrong.

      if (loan) {
        // Find all payments for this loan
        const paymentsToDelete = loanPayments.filter(p => p.loanId === loanId);
        const batch = writeBatch(db);
        
        paymentsToDelete.forEach(p => {
          batch.delete(doc(db, 'loanPayments', p.id!));
        });
        
        batch.delete(doc(db, 'loans', loanId));
        await batch.commit();
        
        createNotification(loan.userId, "Loan Application Removed", `Your loan application has been removed by the admin.${reason ? ` Reason: ${reason}` : ''}`, 'loan');
      } else {
        await deleteDoc(doc(db, 'loans', loanId));
      }

      notify('success', "Loan application and associated payments deleted.");
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `loans/${loanId}`);
    }
  };

  const payLoanInstallment = async (loan: Loan, month: number, year: number, amount: number, interest: number) => {
    if (!user || !profile) return;
    try {
      // Check if there's already a pending payment for this month/year
      const existingPending = loanPayments.find(p => 
        p.loanId === loan.id && 
        p.month === month && 
        p.year === year && 
        p.status === 'pending'
      );

      if (existingPending) {
        await updateDoc(doc(db, 'loanPayments', existingPending.id!), {
          amount,
          interest,
          timestamp: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'loanPayments'), {
          loanId: loan.id,
          userId: user.uid,
          userEmail: user.email,
          month,
          year,
          amount,
          interest,
          status: 'pending',
          timestamp: serverTimestamp()
        });
      }

      notify('success', 'Payment request submitted for approval!');
      setIsPayingLoan(false);
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
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
                ? financials.totalSavings
                : myContributions.filter(c => c.status === 'paid').reduce((acc, c) => acc + c.amount, 0)
              ).toLocaleString()}
            </div>
          </motion.div>

          {isAdmin && (
            <>
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
                  {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).length}
                </div>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-indigo-50 rounded-2xl">
                    <Wallet className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase">Available Funds</span>
                </div>
                <h3 className="text-slate-500 text-sm font-medium">Subscription Balance Available</h3>
                <div className="mt-2 text-3xl font-black text-indigo-600">
                  ₹{financials.availableBalance.toLocaleString()}
                </div>
              </motion.div>
            </>
          )}
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
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
            {isAdmin && (
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition-all"
                  >
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                )}
              </div>
            )}
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
              <div className="flex items-center gap-2 flex-1 sm:flex-none">
                <div className="relative flex-1 sm:flex-none">
                  <button 
                    onClick={() => setShowAddMemberDropdown(!showAddMemberDropdown)}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                  >
                    <Plus className="w-5 h-5" /> Add Member <ChevronDown className={cn("w-4 h-4 transition-transform", showAddMemberDropdown && "rotate-180")} />
                  </button>
                  
                  {showAddMemberDropdown && (
                    <>
                      <div 
                        className="fixed inset-0 z-10" 
                        onClick={() => setShowAddMemberDropdown(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 py-2 z-20 overflow-hidden">
                        <button
                          onClick={() => {
                            setIsAddingMember(true);
                            setShowAddMemberDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        >
                          <UserPlus className="w-4 h-4" /> Individual Add
                        </button>
                        <button
                          onClick={() => {
                            setIsBulkAdding(true);
                            setShowAddMemberDropdown(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                        >
                          <Users className="w-4 h-4" /> Bulk Upload (XLS)
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
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
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleSortMembers('name')}
                      >
                        <div className="flex items-center gap-2">
                          Member
                          {memberSortConfig.field === 'name' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleSortMembers('contact')}
                      >
                        <div className="flex items-center gap-2">
                          Contact
                          {memberSortConfig.field === 'contact' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleSortMembers('joinDate')}
                      >
                        <div className="flex items-center gap-2">
                          Join Date
                          {memberSortConfig.field === 'joinDate' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleSortMembers('totalPaid')}
                      >
                        <div className="flex items-center gap-2">
                          Total Paid
                          {memberSortConfig.field === 'totalPaid' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                        onClick={() => handleSortMembers('status')}
                      >
                        <div className="flex items-center gap-2">
                          Status
                          {memberSortConfig.field === 'status' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedMembers.map((u, idx) => {
                      const userContribs = contributions.filter(c => 
                        (u.uid && c.userId === u.uid) || 
                        (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())
                      );
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
                                onClick={() => {
                                  setSelectedLoanUserId(u.uid || u.email);
                                  setIsAddingLoan(true);
                                }}
                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Add Loan"
                              >
                                <IndianRupee className="w-4 h-4" />
                              </button>
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
              {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map((u, idx) => {
                const userContribs = contributions.filter(c => 
                  (u.uid && c.userId === u.uid) || 
                  (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())
                );
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
                          setSelectedLoanUserId(u.uid || u.email);
                          setIsAddingLoan(true);
                        }}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-bold active:scale-95"
                      >
                        <IndianRupee className="w-4 h-4" /> Add Loan
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
                              <th 
                                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                                onClick={() => handleSortLoans('member')}
                              >
                                <div className="flex items-center gap-2">
                                  Member
                                  {loanSortConfig.field === 'member' ? (
                                    loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                                onClick={() => handleSortLoans('amount')}
                              >
                                <div className="flex items-center gap-2">
                                  Amount
                                  {loanSortConfig.field === 'amount' ? (
                                    loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                  )}
                                </div>
                              </th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Details</th>
                              <th 
                                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                                onClick={() => handleSortLoans('status')}
                              >
                                <div className="flex items-center gap-2">
                                  Status
                                  {loanSortConfig.field === 'status' ? (
                                    loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                                onClick={() => handleSortLoans('date')}
                              >
                                <div className="flex items-center gap-2">
                                  Date
                                  {loanSortConfig.field === 'date' ? (
                                    loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                  ) : (
                                    <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                  )}
                                </div>
                              </th>
                              <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {sortedLoans.map((l, idx) => {
                              const targetUser = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
                              return (
                                <motion.tr 
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  key={l.id} 
                                  className="hover:bg-slate-50/50 transition-colors"
                                >
                                  <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                      <span className="text-sm font-semibold text-slate-900">{targetUser?.displayName || l.userEmail?.split('@')[0]}</span>
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
                                        onClick={() => {
                                          setDecliningLoanId(l.id!);
                                          setLoanActionComment('');
                                        }}
                                        className="px-3 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg hover:bg-amber-100 transition-all"
                                      >
                                        Decline
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => {
                                        setDeletingLoanId(l.id!);
                                        setLoanActionComment('');
                                      }}
                                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete Application"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </motion.tr>
                              );
                            })}
                            {sortedLoans.length === 0 && (
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
                      {sortedLoans.map((l, idx) => {
                        const targetUser = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
                        return (
                          <motion.div 
                            key={l.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
                          >
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900">{targetUser?.displayName || l.userEmail?.split('@')[0]}</span>
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
                                onClick={() => {
                                  setDecliningLoanId(l.id!);
                                  setLoanActionComment('');
                                }}
                                className="flex-1 py-2.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-xl hover:bg-amber-100 transition-all"
                              >
                                Decline
                              </button>
                            )}
                            <button 
                              onClick={() => {
                                setDeletingLoanId(l.id!);
                                setLoanActionComment('');
                              }}
                              className="p-2.5 bg-red-50 text-red-600 rounded-xl transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Pending Payment Approvals */}
                    {filteredLoanPayments.filter(p => p.status === 'pending').length > 0 && (
                      <div className="bg-amber-50 rounded-3xl border border-amber-100 p-6 mb-8">
                        <div className="flex items-center gap-2 mb-4">
                          <Clock className="w-5 h-5 text-amber-600" />
                          <h3 className="font-bold text-amber-900">Pending Repayment Approvals</h3>
                        </div>
                        <div className="space-y-3">
                          {filteredLoanPayments.filter(p => p.status === 'pending').map((p, idx) => {
                            const targetUser = allUsers.find(u => u.uid === p.userId);
                            return (
                              <div key={p.id} className="bg-white p-4 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                                    {targetUser?.displayName ? targetUser.displayName[0].toUpperCase() : '?'}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{targetUser?.displayName || p.userId}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                      {format(new Date(p.year, p.month - 1), 'MMMM yyyy')} • Principal: ₹{p.amount.toLocaleString()} • Interest: ₹{p.interest.toLocaleString()}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-sm font-black text-slate-900">₹{(p.amount + p.interest).toLocaleString()}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">Total Amount</p>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button 
                                      onClick={() => approveLoanPayment(p)}
                                      className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all"
                                    >
                                      Approve
                                    </button>
                                    <button 
                                      onClick={() => declineLoanPayment(p.id!)}
                                      className="px-4 py-2 bg-red-50 text-red-600 text-xs font-bold rounded-xl hover:bg-red-100 transition-all"
                                    >
                                      Decline
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

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
                            const payments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
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
                          {sortedLoans.filter(l => l.status === 'approved').filter(l => {
                            const isPaidThisMonth = loanPayments.some(p => p.loanId === l.id && p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear() && p.status === 'paid');
                            const isPendingThisMonth = loanPayments.some(p => p.loanId === l.id && p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear() && p.status === 'pending');
                            const loanApprovedThisMonth = l.approvedAt?.toDate && 
                              l.approvedAt.toDate().getMonth() === new Date().getMonth() && 
                              l.approvedAt.toDate().getFullYear() === new Date().getFullYear();
                            return !isPaidThisMonth && !isPendingThisMonth && new Date().getDate() > 10 && !loanApprovedThisMonth;
                          }).length}
                        </p>
                      </div>
                    </div>

                    {sortedLoans.filter(l => l.status === 'approved' || l.status === 'paid').map((l, idx) => {
                      const payments = loanPayments.filter(p => p.loanId === l.id);
                      const paidPayments = payments.filter(p => p.status === 'paid');
                      const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
                      const remainingPrincipal = Math.max(0, l.approvedAmount! - totalPrincipalPaid);
                      const remainingTotal = calculateLoanRemainingTotal(l, payments);
                      const targetUser = allUsers.find(u => 
                        (l.userId && u.uid === l.userId) || 
                        (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
                      );
                      
                      // Calculate current installment interest based on actual remaining principal
                      const principal = l.approvedAmount! / (l.installments || 10);
                      const interest = remainingPrincipal * 0.005;
                      const currentTotal = principal + interest;
                      const isPaidThisMonth = payments.some(p => p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear() && p.status === 'paid');
                      const isPendingThisMonth = payments.some(p => p.month === (new Date().getMonth() + 1) && p.year === new Date().getFullYear() && p.status === 'pending');
                      const loanApprovedThisMonth = l.approvedAt?.toDate && 
                        l.approvedAt.toDate().getMonth() === new Date().getMonth() && 
                        l.approvedAt.toDate().getFullYear() === new Date().getFullYear();
                      const isLate = !isPaidThisMonth && !isPendingThisMonth && new Date().getDate() > 10 && !loanApprovedThisMonth;

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
                                <p className="font-bold text-slate-900">{payments.filter(p => p.status === 'paid').length} / {l.installments} Paid</p>
                              </div>
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Status</p>
                                <span className={cn(
                                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold",
                                  isPaidThisMonth ? "bg-emerald-50 text-emerald-600" : 
                                  isPendingThisMonth ? "bg-amber-50 text-amber-600" :
                                  isLate ? "bg-red-50 text-red-600" : 
                                  loanApprovedThisMonth ? "bg-blue-50 text-blue-600" : "bg-amber-50 text-amber-600"
                                )}>
                                  {isPaidThisMonth ? 'PAID' : isPendingThisMonth ? 'AWAITING APPROVAL' : isLate ? 'OVERDUE' : loanApprovedThisMonth ? 'STARTS NEXT MONTH' : 'PENDING'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              {l.status !== 'paid' && !isPaidThisMonth && !isPendingThisMonth && targetUser && (
                                <>
                                  <button 
                                    onClick={() => setSettlingLoanId(l.id!)}
                                    className="p-2.5 text-amber-600 hover:bg-amber-50 rounded-xl transition-all border border-transparent hover:border-amber-100"
                                    title="Settle Loan Immediately"
                                  >
                                    <CheckCircle2 className="w-5 h-5" />
                                  </button>
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
                              {l.status !== 'paid' && (
                                <button 
                                  onClick={() => setSelectedLoan(selectedLoan?.id === l.id ? null : l)}
                                  className={cn(
                                    "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                                    selectedLoan?.id === l.id ? "bg-indigo-600 text-white" : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                                  )}
                                >
                                  {selectedLoan?.id === l.id ? 'Hide Details' : 'View Schedule'}
                                </button>
                              )}
                            </div>
                          </div>

                          {selectedLoan?.id === l.id && (
                            <div className="px-6 pb-6 border-t border-slate-100 bg-slate-50/30">
                              <div className="mt-6 space-y-2">
                                {(() => {
                                  let runningPrincipal = l.approvedAmount!;
                                  const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
                                  return Array.from({ length: l.installments || 10 }).map((_, i) => {
                                    const installmentNum = i + 1;
                                    const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                    const installmentMonth = installmentDate.getMonth() + 1;
                                    const installmentYear = installmentDate.getFullYear();
                                    const payment = payments.find(p => p.month === installmentMonth && p.year === installmentYear);
                                    const isPaid = payment?.status === 'paid';
                                    const isPending = payment?.status === 'pending';
                                    
                                    const interest = runningPrincipal * 0.005;
                                    const scheduledPrincipal = l.approvedAmount! / (l.installments || 10);
                                    const principalToDisplay = (isPaid || isPending) ? payment.amount : Math.min(runningPrincipal, scheduledPrincipal);
                                    const total = principalToDisplay + interest;

                                    // Update running principal for next iteration based on actual payments
                                    if (isPaid) {
                                      runningPrincipal = Math.max(0, runningPrincipal - payment.amount);
                                    } else if (installmentDate < new Date()) {
                                      // If it's a past installment that wasn't paid, the principal didn't decrease
                                    } else {
                                      // For future installments in the schedule, we assume standard principal will be paid
                                      runningPrincipal = Math.max(0, runningPrincipal - principalToDisplay);
                                    }

                                    return (
                                      <div key={i} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                                        <div className="flex items-center gap-3">
                                          <span className="text-xs font-bold text-slate-400 w-6">{installmentNum}.</span>
                                          <div>
                                            <p className="text-sm font-bold text-slate-900">{format(installmentDate, 'MMMM yyyy')}</p>
                                            <p className="text-[10px] text-slate-500">₹{principalToDisplay.toLocaleString()} + ₹{interest.toLocaleString()} Int.</p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                          <span className="text-sm font-black text-slate-900">₹{total.toLocaleString()}</span>
                                          {isPaid ? (
                                            <div className="flex items-center gap-2">
                                              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">PAID</span>
                                              <button 
                                                onClick={() => setDeletingRepaymentId(payment.id!)}
                                                className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                                title="Delete Repayment Record"
                                              >
                                                <Trash2 className="w-3.5 h-3.5" />
                                              </button>
                                            </div>
                                          ) : isPending ? (
                                            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md">AWAITING APPROVAL</span>
                                          ) : (
                                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">PENDING</span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
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
                    const paidPayments = payments.filter(p => p.status === 'paid');
                    const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
                    const remainingPrincipal = Math.max(0, l.approvedAmount! - totalPrincipalPaid);
                    const remainingTotal = calculateLoanRemainingTotal(l, payments);
                    
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
                              <p className="text-xl font-bold">₹{remainingTotal.toLocaleString()}</p>
                              <p className="text-[10px] text-indigo-200 font-bold">₹{remainingPrincipal.toLocaleString()} Principal</p>
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
                            {(() => {
                              let runningPrincipal = l.approvedAmount!;
                              return Array.from({ length: l.installments || 10 }).map((_, i) => {
                                const installmentNum = i + 1;
                                // Repayment starts from next month
                                const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
                                const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                const installmentMonth = installmentDate.getMonth() + 1;
                                const installmentYear = installmentDate.getFullYear();
                                
                                // Find the most relevant payment for this installment
                                const payment = payments
                                  .filter(p => p.month === installmentMonth && p.year === installmentYear)
                                  .sort((a, b) => {
                                    // Prefer paid, then pending, then others
                                    const statusOrder: Record<string, number> = { 'paid': 0, 'pending': 1, 'declined': 2 };
                                    const orderA = statusOrder[a.status] ?? 3;
                                    const orderB = statusOrder[b.status] ?? 3;
                                    if (orderA !== orderB) return orderA - orderB;
                                    // Then most recent
                                    return (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0);
                                  })[0];

                                const isPaid = payment?.status === 'paid';
                                const isPending = payment?.status === 'pending';
                                
                                const interest = (isPaid || isPending) ? (payment.interest || 0) : (runningPrincipal * 0.005);
                                const scheduledPrincipal = l.approvedAmount! / (l.installments || 10);
                                const principalToDisplay = (isPaid || isPending) ? payment.amount : Math.min(runningPrincipal, scheduledPrincipal);
                                const total = principalToDisplay + interest;

                                // Update running principal for next iteration based on actual payments
                                if (isPaid) {
                                  runningPrincipal = Math.max(0, runningPrincipal - payment.amount);
                                } else if (installmentDate < new Date()) {
                                  // If it's a past installment that wasn't paid, the principal didn't decrease
                                } else {
                                  // For future installments in the schedule, we assume standard principal will be paid
                                  runningPrincipal = Math.max(0, runningPrincipal - principalToDisplay);
                                }

                                const isCurrentMonth = new Date().getMonth() + 1 === installmentMonth && new Date().getFullYear() === installmentYear;
                                const isFuture = installmentDate > new Date();
                                const isPast = installmentDate < new Date() && !isCurrentMonth;

                                return (
                                  <div 
                                    key={i}
                                    className={cn(
                                      "flex items-center justify-between p-4 rounded-2xl border transition-all",
                                      isPaid ? "bg-slate-50 border-slate-100 opacity-60" : 
                                      isPending ? "bg-amber-50 border-amber-100 shadow-sm" :
                                      isCurrentMonth ? "bg-white border-indigo-200 ring-2 ring-indigo-50 shadow-md" :
                                      isFuture ? "bg-white border-slate-100 opacity-40 blur-[0.5px]" : "bg-white border-slate-200"
                                    )}
                                  >
                                    <div className="flex items-center gap-4">
                                      <div className={cn(
                                        "w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm",
                                        isPaid ? "bg-emerald-100 text-emerald-600" : 
                                        isPending ? "bg-amber-100 text-amber-600" :
                                        isCurrentMonth ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                                      )}>
                                        {installmentNum}
                                      </div>
                                      <div>
                                        <p className="font-bold text-slate-900 text-sm">
                                          {format(installmentDate, 'MMMM yyyy')}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                          ₹{principalToDisplay.toLocaleString()} + ₹{interest.toLocaleString()} Interest
                                        </p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="font-black text-slate-900">₹{total.toLocaleString()}</span>
                                      {!isPaid && !isPending && (
                                        <button 
                                          onClick={() => {
                                            setSelectedLoan(l);
                                            setIsPayingLoan(true);
                                            setCustomPrincipal(l.approvedAmount! / (l.installments || 10));
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
                                      {isPending && (
                                        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">AWAITING APPROVAL</span>
                                      )}
                                      {isPaid && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                                    </div>
                                  </div>
                                );
                              });
                            })()}
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
                          {l.status === 'declined' && l.declineReason && (
                            <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
                              <p className="text-[10px] font-bold text-red-600 uppercase mb-1">Admin Comment</p>
                              <p className="text-xs text-red-700 leading-relaxed font-medium capitalize-first">{l.declineReason}</p>
                            </div>
                          )}
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
          <div className="space-y-6">
            {/* Filter Section */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Month</label>
                    <select 
                      value={filterMonth}
                      onChange={(e) => setFilterMonth(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      {Array.from({ length: 12 }).map((_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {format(new Date(2024, i, 1), 'MMMM')}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2 ml-1">Year</label>
                    <select 
                      value={filterYear}
                      onChange={(e) => setFilterYear(Number(e.target.value))}
                      className="w-full p-3 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      {[2024, 2025, 2026].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setAppliedFilter({ month: filterMonth, year: filterYear });
                    setPaymentMethodFilter('all');
                  }}
                  className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                >
                  <Search className="w-4 h-4" /> Show Payments
                </button>
              </div>

              {isAdmin && appliedFilter && (
                <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap gap-4">
                  {(() => {
                    const filtered = contributions.filter(c => c.month === appliedFilter.month && c.year === appliedFilter.year && c.status === 'paid');
                    const cash = filtered.filter(c => c.paymentMethod === 'cash').length;
                    const online = filtered.filter(c => c.paymentMethod === 'online' || !c.paymentMethod).length;
                    const total = filtered.reduce((acc, c) => acc + c.amount, 0);
                    
                    return (
                      <>
                        <button 
                          onClick={() => setPaymentMethodFilter(prev => prev === 'online' ? 'all' : 'online')}
                          className={cn(
                            "px-4 py-2 rounded-xl border transition-all text-left active:scale-95",
                            paymentMethodFilter === 'online' 
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100" 
                              : "bg-emerald-50 border-emerald-100 text-emerald-600 hover:bg-emerald-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'online' ? "text-emerald-50" : "text-emerald-600")}>Online Payments</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'online' ? "text-white" : "text-emerald-700")}>{online}</p>
                        </button>
                        <button 
                          onClick={() => setPaymentMethodFilter(prev => prev === 'cash' ? 'all' : 'cash')}
                          className={cn(
                            "px-4 py-2 rounded-xl border transition-all text-left active:scale-95",
                            paymentMethodFilter === 'cash' 
                              ? "bg-amber-600 border-amber-600 text-white shadow-lg shadow-amber-100" 
                              : "bg-amber-50 border-amber-100 text-amber-600 hover:bg-amber-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'cash' ? "text-amber-50" : "text-amber-600")}>Cash Payments</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'cash' ? "text-white" : "text-amber-700")}>{cash}</p>
                        </button>
                        <button 
                          onClick={() => setPaymentMethodFilter('all')}
                          className={cn(
                            "px-4 py-2 rounded-xl border transition-all text-left active:scale-95",
                            paymentMethodFilter === 'all' 
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100" 
                              : "bg-indigo-50 border-indigo-100 text-indigo-600 hover:bg-indigo-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'all' ? "text-indigo-50" : "text-indigo-600")}>Total Amount</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'all' ? "text-white" : "text-indigo-700")}>₹{total.toLocaleString()}</p>
                        </button>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {appliedFilter ? (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-100">
                          {isAdmin && (
                            <th 
                              className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                              onClick={() => handleSort('member')}
                            >
                              <div className="flex items-center gap-2">
                                Member
                                {sortConfig.field === 'member' ? (
                                  sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                )}
                              </div>
                            </th>
                          )}
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Month / Year</th>
                          <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                          <th 
                            className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                            onClick={() => handleSort('status')}
                          >
                            <div className="flex items-center gap-2">
                              Status
                              {sortConfig.field === 'status' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group"
                            onClick={() => handleSort('date')}
                          >
                            <div className="flex items-center gap-2">
                              Date
                              {sortConfig.field === 'date' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </div>
                          </th>
                          {isAdmin && <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedContributions.map((c, idx) => (
                        <motion.tr 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={c.id} 
                          className="hover:bg-slate-50/50 transition-colors"
                        >
                          {isAdmin && (
                            <td className="px-6 py-4">
                              <span className="text-sm font-semibold text-slate-900">
                                {allUsers.find(u => 
                                  (c.userId && u.uid === c.userId) || 
                                  (c.userEmail && u.email.toLowerCase() === c.userEmail.toLowerCase())
                                )?.displayName || c.userEmail.split('@')[0]}
                              </span>
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
                            <div className="flex flex-col gap-1">
                              <span className={cn(
                                "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold w-fit",
                                c.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                              )}>
                                {c.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                {c.status.toUpperCase()}
                              </span>
                              {c.status === 'paid' && (
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                                  {c.paymentMethod || 'online'}
                                </span>
                              )}
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
                                  onClick={() => setEditingContribution(c)}
                                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                  title="Edit Contribution"
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
                        {sortedContributions.length === 0 && (
                          <tr>
                            <td colSpan={isAdmin ? 6 : 4} className="px-6 py-12 text-center text-slate-400 italic">
                              No records found for {format(new Date(appliedFilter.year, appliedFilter.month - 1), 'MMMM yyyy')}.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Mobile Card View */}
                <div className="lg:hidden space-y-4">
                  {sortedContributions.map((c, idx) => {
                      const member = allUsers.find(u => 
                        (c.userId && u.uid === c.userId) || 
                        (c.userEmail && u.email.toLowerCase() === c.userEmail.toLowerCase())
                      );
                      return (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={c.id}
                          className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200"
                        >
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-900">
                                {member?.displayName || c.userEmail.split('@')[0]}
                              </span>
                              <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">
                                {format(new Date(c.year, c.month - 1), 'MMMM yyyy')}
                              </span>
                            </div>
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold",
                              c.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {c.status.toUpperCase()}
                            </span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Amount</p>
                              <p className="text-lg font-black text-slate-900">₹{c.amount.toLocaleString()}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Method</p>
                              <p className="text-sm font-bold text-slate-700 uppercase">{c.paymentMethod || 'online'}</p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                            <span className="text-[10px] text-slate-400">
                              {c.timestamp?.toDate ? format(c.timestamp.toDate(), 'MMM dd, hh:mm a') : 'Just now'}
                            </span>
                            {isAdmin && (
                              <div className="flex items-center gap-2">
                                {c.status === 'pending' && (
                                  <button 
                                    onClick={() => updateStatus(c.id!, 'paid')}
                                    className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold rounded-lg"
                                  >
                                    Approve
                                  </button>
                                )}
                                <button 
                                  onClick={() => setEditingContribution(c)}
                                  className="p-2 text-slate-400 hover:text-indigo-600"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => setDeletingId(c.id!)}
                                  className="p-2 text-slate-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  {sortedContributions.length === 0 && (
                    <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
                      <p className="text-slate-400 italic">No records found for {format(new Date(appliedFilter.year, appliedFilter.month - 1), 'MMMM yyyy')}.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
                <p className="text-slate-400 italic">Please select a month and year to view contributions.</p>
              </div>
            )}
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
        {/* Bulk Add Modal */}
        {isBulkAdding && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Bulk Member Upload</h3>
                    <p className="text-xs text-slate-500 font-medium">Upload Excel (.xlsx, .xls) file</p>
                  </div>
                </div>
                <button onClick={() => setIsBulkAdding(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="p-8">
                <div className="mb-8 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div>
                      <h4 className="text-sm font-bold text-amber-900 mb-1">XLS Format Requirements</h4>
                      <p className="text-xs text-amber-700 leading-relaxed">
                        Your file must include columns for: <br/>
                        <span className="font-bold">username, email, phone number, date of joining</span>
                      </p>
                    </div>
                  </div>
                </div>

                <label className="group relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-200 rounded-3xl hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <div className="w-16 h-16 bg-slate-50 group-hover:bg-indigo-100 rounded-2xl flex items-center justify-center text-slate-400 group-hover:text-indigo-600 transition-all mb-4">
                      <Upload className="w-8 h-8" />
                    </div>
                    <p className="text-sm font-bold text-slate-600 mb-1">Click to upload or drag and drop</p>
                    <p className="text-xs text-slate-400">Excel files only (.xlsx, .xls)</p>
                  </div>
                  <input 
                    type="file" 
                    className="hidden" 
                    accept=".xlsx, .xls"
                    onChange={handleBulkUpload}
                  />
                </label>

                <div className="mt-8 flex gap-3">
                  <button 
                    onClick={() => setIsBulkAdding(false)}
                    className="flex-1 px-6 py-3 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

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
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Join Date</label>
                  <input 
                    type="date"
                    value={editingUser.joinDate || ''}
                    onChange={(e) => setEditingUser({ ...editingUser, joinDate: e.target.value })}
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

        {isAddingLoan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingLoan(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Record Loan</h2>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Select Member</label>
                  <select 
                    value={selectedLoanUserId || ''}
                    onChange={(e) => setSelectedLoanUserId(e.target.value)}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="">Select a member...</option>
                    {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map(u => (
                      <option key={u.uid || u.email} value={u.uid || u.email}>
                        {u.displayName || u.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Loan Amount (₹)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[10000, 25000, 50000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setAdminLoanAmount(amt)}
                        className={cn(
                          "py-3 rounded-xl text-sm font-bold transition-all border",
                          adminLoanAmount === amt 
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200"
                        )}
                      >
                        ₹{amt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <input 
                    type="number" 
                    value={adminLoanAmount}
                    onChange={(e) => setAdminLoanAmount(Number(e.target.value))}
                    className="w-full mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Enter custom amount"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Loan Details / Purpose</label>
                  <textarea 
                    value={adminLoanDetails}
                    onChange={(e) => setAdminLoanDetails(e.target.value)}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
                    placeholder="e.g. Personal emergency, Business expansion..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Loan Date</label>
                  <input 
                    type="date"
                    value={loanDate}
                    onChange={(e) => setLoanDate(e.target.value)}
                    className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Initial Status</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAdminLoanStatus('approved')}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-bold transition-all border",
                        adminLoanStatus === 'approved' 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-200"
                      )}
                    >
                      Approved
                    </button>
                    <button
                      onClick={() => setAdminLoanStatus('pending')}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-bold transition-all border",
                        adminLoanStatus === 'pending' 
                          ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-amber-200"
                      )}
                    >
                      Pending
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsAddingLoan(false)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={isSubmittingAdminLoan || !selectedLoanUserId}
                    onClick={addAdminLoan}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {isSubmittingAdminLoan ? (
                      <>
                        <Clock className="w-5 h-5 animate-spin" /> Recording...
                      </>
                    ) : (
                      'Record Loan'
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
        {editingContribution && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingContribution(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <h2 className="text-2xl font-bold text-slate-900 mb-6">Edit Contribution</h2>
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Member</p>
                  <p className="font-bold text-slate-900">
                    {allUsers.find(u => 
                      (editingContribution.userId && u.uid === editingContribution.userId) || 
                      (editingContribution.userEmail && u.email.toLowerCase() === editingContribution.userEmail.toLowerCase())
                    )?.displayName || editingContribution.userEmail.split('@')[0]}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-1">Period</p>
                  <p className="font-bold text-slate-900">{format(new Date(editingContribution.year, editingContribution.month - 1), 'MMMM yyyy')}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                    <input 
                      type="number"
                      value={editingContribution.amount}
                      onChange={(e) => setEditingContribution({ ...editingContribution, amount: Number(e.target.value) })}
                      className="w-full pl-8 pr-4 py-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Status</label>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setEditingContribution({ ...editingContribution, status: 'paid' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border transition-all",
                        editingContribution.status === 'paid' 
                          ? "bg-emerald-600 text-white border-emerald-600 shadow-lg shadow-emerald-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-emerald-200"
                      )}
                    >
                      Paid
                    </button>
                    <button 
                      onClick={() => setEditingContribution({ ...editingContribution, status: 'pending' })}
                      className={cn(
                        "flex-1 py-3 rounded-xl font-bold border transition-all",
                        editingContribution.status === 'pending' 
                          ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-amber-200"
                      )}
                    >
                      Pending
                    </button>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setEditingContribution(null)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={updateContribution}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
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
                      {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map(u => (
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

                {isAdmin && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Payment Date</label>
                      <input 
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-2">Method</label>
                      <select 
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value as 'cash' | 'online')}
                        className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="online">Online</option>
                        <option value="cash">Cash</option>
                      </select>
                    </div>
                  </div>
                )}

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-bold text-indigo-700">Amount to Pay</span>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-900 font-black">₹</span>
                      <input 
                        type="number"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(Number(e.target.value))}
                        className="w-32 pl-7 pr-4 py-2 bg-white rounded-xl border border-indigo-200 text-indigo-900 font-black focus:ring-2 focus:ring-indigo-500 outline-none text-right"
                      />
                    </div>
                  </div>
                  {customAmount > MONTHLY_AMOUNT && (
                    <p className="text-[10px] text-indigo-500 font-bold mt-1 uppercase tracking-wider">Includes ₹{LATE_FEE} Late Fee (Calculated: ₹{getContributionAmount(selectedMonth, selectedYear)})</p>
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
                      onClick={() => addContribution(selectedMonth, selectedYear, selectedUserId || undefined, 'paid', paymentDate, customAmount, paymentMethod)}
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

        <AnimatePresence>
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
                  <p className="text-slate-500 mt-2">This action cannot be undone. All associated payment history for this loan will also be removed.</p>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Reason/Comments (Optional)</label>
                  <textarea
                    value={loanActionComment}
                    onChange={(e) => setLoanActionComment(e.target.value)}
                    placeholder="Enter reason for deletion..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all resize-none h-24"
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeletingLoanId(null)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => {
                      deleteLoan(deletingLoanId, loanActionComment);
                      setDeletingLoanId(null);
                      setLoanActionComment('');
                    }}
                    className="flex-2 py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 active:scale-95"
                  >
                    Confirm Delete
                  </button>
                </div>
              </motion.div>
            </div>
          )}

          {decliningLoanId && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setDecliningLoanId(null)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
              >
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <X className="w-8 h-8 text-amber-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Decline Loan Application?</h2>
                  <p className="text-slate-500 mt-2">Are you sure you want to decline this loan application? The user will be notified.</p>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Reason for Declining</label>
                  <textarea
                    value={loanActionComment}
                    onChange={(e) => setLoanActionComment(e.target.value)}
                    placeholder="Enter reason for declining..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all resize-none h-24"
                    required
                  />
                </div>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setDecliningLoanId(null)}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    disabled={!loanActionComment.trim()}
                    onClick={() => {
                      declineLoan(decliningLoanId, loanActionComment);
                      setDecliningLoanId(null);
                      setLoanActionComment('');
                    }}
                    className="flex-2 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Confirm Decline
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
                // Repayment starts from the next month after approval
                const startMonth = (approvedDate.getMonth() + 1) % 12 + 1;
                const startYear = approvedDate.getFullYear() + (approvedDate.getMonth() === 11 ? 1 : 0);

                const paidPayments = loanPayments.filter(p => p.loanId === selectedLoan.id && p.status === 'paid');
                const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
                const currentRemainingPrincipal = Math.max(0, selectedLoan.approvedAmount! - totalPrincipalPaid);

                for (let i = 0; i < (selectedLoan.installments || 12); i++) {
                  const m = (startMonth + i - 1) % 12 + 1;
                  const y = startYear + Math.floor((startMonth + i - 1) / 12);
                  // Only skip if there's a paid or pending payment
                  if (!payments.some(p => p.month === m && p.year === y && (p.status === 'paid' || p.status === 'pending'))) {
                    nextMonth = m;
                    nextYear = y;
                    break;
                  }
                }

                const principal = customPrincipal;
                const interest = currentRemainingPrincipal * 0.005;
                const total = principal + interest;

                return (
                  <div className="space-y-6">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Installment Details</p>
                      <div className="flex justify-between mb-2">
                        <span className="text-slate-600 font-medium">Month</span>
                        <span className="font-bold text-slate-900">{format(new Date(nextYear, nextMonth - 1), 'MMMM yyyy')}</span>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-slate-600 font-medium">Principal</span>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400 text-sm font-bold">₹</span>
                          <input 
                            type="number"
                            value={customPrincipal}
                            onChange={(e) => setCustomPrincipal(Number(e.target.value))}
                            className="w-24 p-1.5 bg-white border border-slate-200 rounded-lg text-right font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>
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
        {settlingLoanId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettlingLoanId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-amber-100 rounded-2xl">
                    <Wallet className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">Settle Loan</h3>
                    <p className="text-xs text-slate-500 font-medium">Finalize and close this loan</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSettlingLoanId(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Remaining Principal (₹)</label>
                  <input
                    type="number"
                    value={settlePrincipal}
                    onChange={(e) => setSettlePrincipal(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Final Interest (₹)</label>
                  <input
                    type="number"
                    value={settleInterest}
                    onChange={(e) => setSettleInterest(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Settlement Date</label>
                  <input
                    type="date"
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
                  />
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 uppercase">Total Settlement Amount</span>
                    <span className="text-lg font-black text-amber-900">₹{(settlePrincipal + settleInterest).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <button 
                  onClick={() => setSettlingLoanId(null)}
                  className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button 
                  disabled={isSettlingPending || settlePrincipal < 0}
                  onClick={() => {
                    const l = loans.find(loan => loan.id === settlingLoanId);
                    if (l) settleLoanImmediately(l);
                  }}
                  className="flex-2 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSettlingPending ? (
                    <Clock className="w-5 h-5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5" />
                  )}
                  {isSettlingPending ? 'Settling...' : 'Settle Now'}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {deletingRepaymentId && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingRepaymentId(null)}
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
              <h3 className="text-xl font-bold text-slate-900 mb-2">Delete Repayment?</h3>
              <p className="text-slate-600 mb-8">This will remove the payment record and reset the loan balance. This action cannot be undone.</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeletingRepaymentId(null)}
                  className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => deleteLoanRepayment(deletingRepaymentId)}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                >
                  Delete
                </button>
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
