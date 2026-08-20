import React, { useEffect, useState, useMemo, useCallback, Fragment } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { AppLauncher } from '@capacitor/app-launcher';
import { 
  signInWithPopup, 
  signInWithRedirect,
  getRedirectResult,
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
import { QRCodeCanvas } from 'qrcode.react';
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
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Upload,
  FileSpreadsheet,
  X,
  PlusCircle,
  UserPlus,
  Users,
  Download,
  FileDown,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Copy,
  PieChart as GraphIcon,
  QrCode,
  Banknote,
  CreditCard,
  Zap,
  Star,
  Phone,
  Percent,
  Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Graphs from './components/Graphs';
import { MonthWiseLoanBreakdown } from './components/MonthWiseLoanBreakdown';
import { MobileQuickSort } from './components/MobileQuickSort';
import { format } from 'date-fns';
import { cn } from './lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Notice, AppNotification } from './types';

// --- Helper for Capacitor Mobile File Saving/Downloading ---
const downloadFileMobile = async (fileName: string, base64Data: string) => {
  try {
    // Attempt to request permissions for better storage access on some Android versions
    try {
      const status = await Filesystem.checkPermissions();
      if (status.publicStorage !== 'granted') {
        await Filesystem.requestPermissions();
      }
    } catch (pe) {
      console.warn("Permission request failed, continuing anyway...", pe);
    }

    // On Android, Directory.Documents usually maps to app-specific external storage 
    // which is "/storage/emulated/0/Android/data/[package]/files/Documents".
    // Users often cannot find this. We try Directory.ExternalStorage which is broader.
    
    // We will try ExternalStorage first as it's more "local" and accessible to users
    // We try to prepend "Download/" to hit the public Downloads folder if permissions allow
    try {
      const result = await Filesystem.writeFile({
        path: `Download/${fileName}`,
        data: base64Data,
        directory: Directory.ExternalStorage,
        recursive: true
      });
      console.log("Capacitor download success (ExternalStorage/Download):", result.uri);
      return { success: true, uri: result.uri };
    } catch (extDownloadErr) {
      console.warn("Download to ExternalStorage/Download failed, trying root ExternalStorage...", extDownloadErr);
      try {
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.ExternalStorage,
          recursive: true
        });
        console.log("Capacitor download success (ExternalStorage):", result.uri);
        return { success: true, uri: result.uri };
      } catch (extErr) {
        console.warn("Download to ExternalStorage failed, trying Documents...", extErr);
        const result = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Documents,
          recursive: true
        });
        console.log("Capacitor download success (Documents):", result.uri);
        return { success: true, uri: result.uri };
      }
    }
  } catch (error: any) {
    console.error("Capacitor download failed completely", error);
    return { success: false, error: error.message || "Unknown error" };
  }
};

// --- Constants ---
const MONTHLY_AMOUNT = 1000;
const LATE_FEE = 100;
const DUE_DAY = 10;

// API Base URL for Capacitor/Android support
const API_BASE_URL = (typeof window !== 'undefined' && (window.location.origin.includes('localhost') || window.location.origin.includes('capacitor')))
  ? 'https://ais-pre-b3p2r2pdo3w65e5qjebwlf-552793991303.asia-southeast1.run.app'
  : '';

const getContributionAmount = (month: number, year: number, dateStr?: string) => {
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      if (!isNaN(day)) {
        return day > DUE_DAY ? MONTHLY_AMOUNT + LATE_FEE : MONTHLY_AMOUNT;
      }
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.getDate() > DUE_DAY ? MONTHLY_AMOUNT + LATE_FEE : MONTHLY_AMOUNT;
    }
  }
  const day = new Date().getDate();
  return day > DUE_DAY ? MONTHLY_AMOUNT + LATE_FEE : MONTHLY_AMOUNT;
};
const ADMIN_EMAILS = ['arun2102000@gmail.com', 'unnati.finance2026@gmail.com', 'arun.cse.rymec@gmail.com'];
const SYSTEM_ADMIN_EMAIL = 'unnati.finance2026@gmail.com';
const DEV_USER_NAMES = ['System Admin', 'Arun J', 'Anusha JM', 'shwetha JV'];
const getUPIConfig = () => {
  const isMobileApp = typeof window !== 'undefined' && 
    (window.location.hostname === 'localhost' || 
     window.location.protocol === 'file:' || 
     /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) &&
    !window.location.hostname.includes('asia-southeast1.run.app');

  if (isMobileApp && /Android/i.test(navigator.userAgent)) {
    return {
      vpa: "arun2102000@oksbi",
      name: "Arun J",
      mcc: "0000",
      isPersonal: true
    };
  }
  return {
    vpa: "9535173734@okbizaxis",
    name: "Unnati Trust",
    mcc: "6012",
    isPersonal: false
  };
};

const { vpa: UPI_VPA, name: PI_NAME, mcc: MERCHANT_CODE, isPersonal: IS_PERSONAL_UPI } = getUPIConfig();
const MERCHANT_ID = "BCR2DN5TQ322VPIY"; // Merchant ID for Google Pay
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

/**
 * Creates a Firestore Timestamp from a YYYY-MM-DD string,
 * but combines it with the current local time to make it dynamic.
 * If the provided date matches today's local date, we return serverTimestamp()
 * or Timestamp.now() to ensure full precision.
 */
function getTimestampFromDateString(dateStr: string): Timestamp {
  if (!dateStr) return serverTimestamp() as Timestamp;
  
  try {
    const [year, month, day] = dateStr.split('-').map(Number);
    const now = new Date();
    
    // Check if the selected date is today
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const currentDay = now.getDate();
    
    if (year === currentYear && month === currentMonth && day === currentDay) {
      // If it's today, use Timestamp.now() for full real-time precision
      // We use now() instead of serverTimestamp() here because we often need 
      // the value immediately for local state or approval logic
      return Timestamp.now();
    }
    
    // If it's a different date, we still want the "time of recording"
    // so we set the date parts but keep current hours/minutes/seconds
    const targetDate = new Date();
    targetDate.setFullYear(year);
    targetDate.setMonth(month - 1);
    targetDate.setDate(day);
    // hours, minutes, seconds are already from 'new Date()' above
    
    return Timestamp.fromDate(targetDate);
  } catch (e) {
    console.error("Error creating timestamp from date string:", dateStr, e);
    return serverTimestamp() as Timestamp;
  }
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

const LOGO_SRC = "/brand-unnati-official.png?v=5000";

export default function App() {
  const isMobileApp = useMemo(() => {
    return Capacitor.isNativePlatform() || 
           ((window.location.hostname === 'localhost' || 
             window.location.protocol === 'file:' || 
             window.location.protocol === 'capacitor:' ||
             /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) &&
            !window.location.hostname.includes('asia-southeast1.run.app'));
  }, []);

  const [isMobileScreen, setIsMobileScreen] = useState(false);
  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobileVisual = isMobileApp || isMobileScreen;

  console.log("App component rendering...", { isMobileApp, isMobileVisual });
  const buildUPIUrl = useCallback((amount: number, note: string, prefix: string) => {
    const am = amount.toFixed(2);
    const tn = encodeURIComponent(note || GROUP_NAME);
    const tr = `${prefix}${Date.now()}`;
    
    let url = `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(PI_NAME)}&am=${am}&cu=INR&tn=${tn}`;
    
    // For personal accounts, skip mc and tr to avoid security flags/limits in apps
    if (!IS_PERSONAL_UPI) {
      url += `&mc=${MERCHANT_CODE}&tr=${tr}`;
    }
    
    return url;
  }, []);

  const openUPI = useCallback(async (url: string) => {
    console.log("Opening UPI URL:", url);
    const isNative = Capacitor.isNativePlatform();
    
    if (isNative) {
      try {
        // AppLauncher is the most direct way to trigger an intent
        await AppLauncher.openUrl({ url });
      } catch (err) {
        console.error("AppLauncher primary failed:", err);
        
        // Fallback: try to format for Android Intent specifically if it's Android
        if (Capacitor.getPlatform() === 'android') {
           try {
             // Convert upi://pay?... to intent://pay?...#Intent;scheme=upi;end
             const intentUrl = url.replace('upi://', 'intent://') + '#Intent;scheme=upi;end';
             await AppLauncher.openUrl({ url: intentUrl });
           } catch (intentErr) {
             console.error("Intent fallback failed:", intentErr);
           }
        }

        // Final fallbacks
        try {
          await Browser.open({ url });
        } catch (innerErr) {
          window.open(url, '_system');
        }
      }
    } else {
      // For standard browser
      window.location.href = url;
    }
  }, []);

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
  const [isBulkAdding, setIsBulkAdding] = useState(false);
  const [showAddMemberDropdown, setShowAddMemberDropdown] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [originalEditingEmail, setOriginalEditingEmail] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState<Contribution | null>(null);
  const [activeTab, setActiveTab] = useState<'contributions' | 'members' | 'loans' | 'notices' | 'graphs' | 'monthlyCollection'>('contributions');
  const [loanSubTab, setLoanSubTab] = useState<'applications' | 'repayments' | 'breakdown'>('applications');
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
  const [customFine, setCustomFine] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'online'>('online');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingNotification, setPendingNotification] = useState<string | null>(null);
  const [newMember, setNewMember] = useState({ name: '', email: '', phoneNumber: '', joinDate: format(new Date(), 'yyyy-MM-dd') });
  const [isSubmittingMember, setIsSubmittingMember] = useState(false);
  const [loginMethod, setLoginMethod] = useState<'google' | 'password'>('google');
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isLocalAdmin, setIsLocalAdmin] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showInitButton, setShowInitButton] = useState(false);
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [isUpdatingPhone, setIsUpdatingPhone] = useState(false);
  const [isTriggeringReminders, setIsTriggeringReminders] = useState(false);
  const [isSendingReport, setIsSendingReport] = useState(false);
  const [isAddingLoan, setIsAddingLoan] = useState(false);
  const [selectedLoanUserId, setSelectedLoanUserId] = useState<string | null>(null);
  const [adminLoanAmount, setAdminLoanAmount] = useState(10000);
  const [adminLoanDetails, setAdminLoanDetails] = useState('');
  const [adminLoanStatus, setAdminLoanStatus] = useState<'pending' | 'approved'>('approved');
  const [adminLoanPaymentMode, setAdminLoanPaymentMode] = useState<'Online' | 'Cash'>('Online');
  const [isSubmittingAdminLoan, setIsSubmittingAdminLoan] = useState(false);
  const [loanDate, setLoanDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [repaymentMonth, setRepaymentMonth] = useState(new Date().getMonth() + 1);
  const [repaymentYear, setRepaymentYear] = useState(new Date().getFullYear());
  const [collectionMonth, setCollectionMonth] = useState(new Date().getMonth() + 1);
  const [collectionYear, setCollectionYear] = useState(new Date().getFullYear());
  const [appliedFilter, setAppliedFilter] = useState<{ month: number; year: number } | null>(null);
  const [sortConfig, setSortConfig] = useState<{ field: 'member' | 'amount' | 'date' | 'status' | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'desc' });
  const [memberSortConfig, setMemberSortConfig] = useState<{ field: 'name' | 'contact' | 'joinDate' | 'totalPaid' | 'status' | null, direction: 'asc' | 'desc' }>({ field: null, direction: 'asc' });
  const [collectionContribSortConfig, setCollectionContribSortConfig] = useState<{ field: 'sno' | 'member' | 'amount' | 'method' | 'date', direction: 'asc' | 'desc' }>({ field: 'sno', direction: 'asc' });
  const [collectionLoanSortConfig, setCollectionLoanSortConfig] = useState<{ field: 'sno' | 'borrower' | 'principal' | 'interest' | 'total' | 'date', direction: 'asc' | 'desc' }>({ field: 'sno', direction: 'asc' });
  const [isContribListExpanded, setIsContribListExpanded] = useState<boolean>(true);
  const [isLoanListExpanded, setIsLoanListExpanded] = useState<boolean>(true);
  const [isMonthlyCollectionSummaryExpanded, setIsMonthlyCollectionSummaryExpanded] = useState<boolean>(true);
  const [customPrincipal, setCustomPrincipal] = useState<number>(5000);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'cash' | 'online'>('all');
  const [isMemberActionsCollapsed, setIsMemberActionsCollapsed] = useState<boolean>(false);
  const [isMemberDetailsCollapsed, setIsMemberDetailsCollapsed] = useState<boolean>(false);

  const [deletingRepaymentId, setDeletingRepaymentId] = useState<string | null>(null);

  const [settlingLoanId, setSettlingLoanId] = useState<string | null>(null);
  const [settlePrincipal, setSettlePrincipal] = useState<number>(0);
  const [settleInterest, setSettleInterest] = useState<number>(0);
  const [showNoticeBoard, setShowNoticeBoard] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{
    isOpen: boolean;
    amount: number;
    note: string;
    type: 'contribution' | 'loan';
    mode: 'online' | 'cash';
  }>({ isOpen: false, amount: 0, note: '', type: 'contribution', mode: 'online' });
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState<{
    loan: Loan;
    month: number;
    year: number;
    principal: number;
    interest: number;
  } | null>(null);
  const [settleDate, setSettleDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [isSettlingPending, setIsSettlingPending] = useState(false);
  const [settlePaymentMode, setSettlePaymentMode] = useState<'Online' | 'Cash'>('Online');
  const [approvingLoanForPaymentMode, setApprovingLoanForPaymentMode] = useState<Loan | null>(null);
  const [selectedDisbursalMode, setSelectedDisbursalMode] = useState<'Online' | 'Cash'>('Online');
  const [isActiveLoansExpanded, setIsActiveLoansExpanded] = useState(true);
  const [isCompletedLoansExpanded, setIsCompletedLoansExpanded] = useState(true);
  const [isActiveRepaymentsExpanded, setIsActiveRepaymentsExpanded] = useState(true);
  const [isCompletedRepaymentsExpanded, setIsCompletedRepaymentsExpanded] = useState(true);
  const [isLoanOverviewExpanded, setIsLoanOverviewExpanded] = useState(true);
  const [isFinancialInsightsExpanded, setIsFinancialInsightsExpanded] = useState(true);

  const [loanSortConfig, setLoanSortConfig] = useState<{
    field: 'name' | 'amount' | 'remaining' | 'status' | 'date' | 'monthlyStatus' | 'interestRate' | 'term' | 'details' | 'paymentMode';
    direction: 'asc' | 'desc';
  }>({ field: 'date', direction: 'desc' });

  const [adminManualRepayment, setAdminManualRepayment] = useState<{
    isOpen: boolean;
    loan: Loan | null;
    month: number;
    year: number;
    amount: number;
    interest: number;
    method: 'cash' | 'online';
    paymentDate: string;
  }>({
    isOpen: false,
    loan: null,
    month: 1,
    year: 2026,
    amount: 0,
    interest: 0,
    method: 'online',
    paymentDate: format(new Date(), 'yyyy-MM-dd')
  });

  // Handle hardware back button on Android/iOS natively via Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonHandlerPromise = CapacitorApp.addListener('backButton', () => {
      console.log('Hardware back button pressed');

      // Check and dismiss open modals/dialogs in order of precedence:
      if (paymentModal.isOpen) {
        setPaymentModal(prev => ({ ...prev, isOpen: false }));
        return;
      }
      if (adminManualRepayment.isOpen) {
        setAdminManualRepayment(prev => ({ ...prev, isOpen: false }));
        return;
      }
      if (showAddMemberDropdown) {
        setShowAddMemberDropdown(false);
        return;
      }
      if (isBulkAdding) {
        setIsBulkAdding(false);
        return;
      }
      if (isAdding) {
        setIsAdding(false);
        return;
      }
      if (isAddingMember) {
        setIsAddingMember(false);
        return;
      }
      if (editingUser) {
        setEditingUser(null);
        return;
      }
      if (editingContribution) {
        setEditingContribution(null);
        return;
      }
      if (isAddingNotice) {
        setIsAddingNotice(false);
        return;
      }
      if (isPayingLoan) {
        setIsPayingLoan(false);
        return;
      }
      if (isApplyingLoan) {
        setIsApplyingLoan(false);
        return;
      }
      if (isAddingLoan) {
        setIsAddingLoan(false);
        return;
      }
      if (selectedLoan) {
        setSelectedLoan(null);
        return;
      }
      if (deletingId) {
        setDeletingId(null);
        return;
      }
      if (deletingRepaymentId) {
        setDeletingRepaymentId(null);
        return;
      }
      if (settlingLoanId) {
        setSettlingLoanId(null);
        return;
      }
      if (approvingLoanForPaymentMode) {
        setApprovingLoanForPaymentMode(null);
        return;
      }
      if (showPhonePrompt) {
        setShowPhonePrompt(false);
        return;
      }
      if (showNotifications) {
        setShowNotifications(false);
        return;
      }
      if (showNoticeBoard) {
        setShowNoticeBoard(false);
        return;
      }

      // If no modal or custom sub-view is active, manage tab hierarchy:
      if (activeTab !== 'contributions') {
        setActiveTab('contributions');
        return;
      }

      // If on the primary screen, minimize the app elegantly to prevent abrupt termination
      CapacitorApp.minimizeApp();
    });

    return () => {
      backButtonHandlerPromise.then(handle => handle.remove());
    };
  }, [
    paymentModal,
    adminManualRepayment,
    showAddMemberDropdown,
    isBulkAdding,
    isAdding,
    isAddingMember,
    editingUser,
    editingContribution,
    isAddingNotice,
    isPayingLoan,
    isApplyingLoan,
    isAddingLoan,
    selectedLoan,
    deletingId,
    deletingRepaymentId,
    settlingLoanId,
    approvingLoanForPaymentMode,
    showPhonePrompt,
    showNotifications,
    showNoticeBoard,
    activeTab
  ]);

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

  const handleSort = (field: 'member' | 'amount' | 'date' | 'status') => {
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

  const handleSortLoans = (field: 'name' | 'amount' | 'remaining' | 'status' | 'date' | 'monthlyStatus' | 'interestRate' | 'term' | 'details' | 'paymentMode') => {
    setLoanSortConfig(prev => ({
      field: field as any,
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
        notify('error', `Low balance! Available: ₹${financials.availableBalance.toLocaleString('en-IN')}. Requested: ₹${adminLoanAmount.toLocaleString('en-IN')}`);
        return;
      }

      const timestampValue = loanDate ? getTimestampFromDateString(loanDate) : serverTimestamp();
      
      const loanData: any = {
        userId: targetUser.uid || '',
        userEmail: targetUser.email,
        amount: adminLoanAmount,
        details: adminLoanDetails,
        status: adminLoanStatus,
        createdAt: timestampValue,
        paymentMode: adminLoanPaymentMode
      };

      if (adminLoanStatus === 'approved') {
        loanData.approvedAmount = adminLoanAmount;
        loanData.interestRate = 0.5;
        loanData.approvedAt = timestampValue;
        loanData.installments = Math.ceil(adminLoanAmount / 5000);
        loanData.paymentMode = adminLoanPaymentMode;
      }

      await addDoc(collection(db, 'loans'), loanData);
      
      if (targetUser.uid) {
        createNotification(
          targetUser.uid, 
          adminLoanStatus === 'approved' ? "Loan Recorded" : "Loan Application Recorded", 
          `An admin has recorded a ${adminLoanStatus === 'approved' ? 'approved' : 'pending'} loan of ₹${adminLoanAmount.toLocaleString('en-IN')} for you.`, 
          'loan'
        );
      }

      setIsAddingLoan(false);
      setSelectedLoanUserId(null);
      setAdminLoanAmount(10000);
      setAdminLoanDetails('');
      setAdminLoanPaymentMode('Online');
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

  const [activeNoticeToast, setActiveNoticeToast] = useState<Notice | null>(null);
  const [activeNotificationToast, setActiveNotificationToast] = useState<AppNotification | null>(null);
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

  const isAdmin = isLocalAdmin || (!!user && (profile?.role === 'admin' || (!!user.email && ADMIN_EMAILS.includes(user.email.toLowerCase()))));

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
  const isSystemAdmin = user?.email?.toLowerCase() === SYSTEM_ADMIN_EMAIL.toLowerCase();

  const adminCurrentMonthTotalReceived = useMemo(() => {
    const paidContributionsCurrentMonth = contributions
      .filter(c => c.month === currentMonth && c.year === currentYear && c.status === 'paid')
      .reduce((sum, c) => sum + (c.amount || 0), 0);

    const paidLoanPaymentsCurrentMonth = loanPayments.filter(p => 
      p.status === 'paid' && p.month === currentMonth && p.year === currentYear
    );
    const totalCollectionCurrentMonth = paidLoanPaymentsCurrentMonth.reduce(
      (sum, p) => sum + (p.amount || 0) + (p.interest || 0), 
      0
    );

    return paidContributionsCurrentMonth + totalCollectionCurrentMonth;
  }, [contributions, loanPayments, currentMonth, currentYear]);

  const hasPaidCurrent = useMemo(() => {
    if (isSystemAdmin) {
      const nonAdminUsers = allUsers.filter(u => u.email?.toLowerCase() !== SYSTEM_ADMIN_EMAIL.toLowerCase());
      if (nonAdminUsers.length === 0) return true;

      const allMembersPaidContrib = nonAdminUsers.every(u => 
        contributions.some(c => 
          ((u.uid && c.userId === u.uid) || (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())) &&
          c.month === currentMonth && c.year === currentYear && c.status === 'paid'
        )
      );

      const activeLoans = loans.filter(l => {
        if (l.status !== 'approved') return false;
        // Skip loans approved in the current month - repayments start from the following month
        const approvedAt = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
        const approvedMonth = approvedAt.getMonth() + 1;
        const approvedYear = approvedAt.getFullYear();
        return !(approvedYear === currentYear && approvedMonth === currentMonth);
      });
      const allRepaymentsPaid = activeLoans.every(l => 
        loanPayments.some(p => 
          p.loanId === l.id && p.month === currentMonth && p.year === currentYear && p.status === 'paid'
        )
      );

      return allMembersPaidContrib && allRepaymentsPaid;
    }
    return contributions.some(c => 
      ((user?.uid && c.userId === user.uid) || (user?.email && c.userEmail?.toLowerCase() === user.email.toLowerCase())) && 
      c.month === currentMonth && 
      c.year === currentYear && 
      c.status === 'paid'
    );
  }, [user, isSystemAdmin, allUsers, contributions, loans, loanPayments, currentMonth, currentYear]);

  const hasPendingCurrent = useMemo(() => {
    if (isSystemAdmin) {
      if (hasPaidCurrent) return false;
      const nonAdminUsers = allUsers.filter(u => u.email?.toLowerCase() !== SYSTEM_ADMIN_EMAIL.toLowerCase());
      const anyPendingContrib = nonAdminUsers.some(u => 
        contributions.some(c => 
          ((u.uid && c.userId === u.uid) || (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())) &&
          c.month === currentMonth && c.year === currentYear && c.status === 'pending'
        )
      );
      const activeLoans = loans.filter(l => {
        if (l.status !== 'approved') return false;
        const approvedAt = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();
        const approvedMonth = approvedAt.getMonth() + 1;
        const approvedYear = approvedAt.getFullYear();
        return !(approvedYear === currentYear && approvedMonth === currentMonth);
      });
      const anyPendingLoan = activeLoans.some(l => 
        loanPayments.some(p => 
          p.loanId === l.id && p.month === currentMonth && p.year === currentYear && p.status === 'pending'
        )
      );
      return anyPendingContrib || anyPendingLoan;
    }
    return contributions.some(c => 
      ((user?.uid && c.userId === user.uid) || (user?.email && c.userEmail?.toLowerCase() === user.email.toLowerCase())) && 
      c.month === currentMonth && 
      c.year === currentYear && 
      c.status === 'pending'
    );
  }, [user, isSystemAdmin, hasPaidCurrent, allUsers, contributions, loans, loanPayments, currentMonth, currentYear]);
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
        } else if (sortConfig.field === 'amount') {
          return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
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
      items = items.filter(u => {
        const nameMatch = u.displayName?.toLowerCase().includes(query) || false;
        const emailMatch = u.email?.toLowerCase().includes(query) || false;
        const phoneMatch = u.phoneNumber?.toLowerCase().includes(query) || false;
        const roleMatch = u.role?.toLowerCase().includes(query) || false;
        return nameMatch || emailMatch || phoneMatch || roleMatch;
      });
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
            // Include both paid and pending for dynamic reflection
            const totalA = aContribs.reduce((acc, c) => acc + c.amount, 0);
            const totalB = bContribs.reduce((acc, c) => acc + c.amount, 0);
            return memberSortConfig.direction === 'asc' ? totalA - totalB : totalB - totalA;
          case 'status':
            // Check for both paid and pending recorded for the current month
            const paidA = aContribs.some(c => c.month === currentMonth && c.year === currentYear);
            const paidB = bContribs.some(c => c.month === currentMonth && c.year === currentYear);
            return memberSortConfig.direction === 'asc' ? (paidA === paidB ? 0 : paidA ? -1 : 1) : (paidA === paidB ? 0 : paidA ? 1 : -1);
          default:
            return 0;
        }
      });
    }
    return items;
  }, [allUsers, contributions, memberSortConfig, currentMonth, currentYear, isAdmin, searchQuery]);

    // Financial summary calculated directly from database records
    const financials = useMemo(() => {
      // Filter contributions to only include paid records from 2026 onwards as requested
      const paidContributions = contributions.filter(c => c.status === 'paid' && c.year >= 2026);
      
      // Filter loan payments belonging to approved or paid loans
      const activeLoanIds = new Set(loans.filter(l => l.status === 'approved' || l.status === 'paid').map(l => l.id));
      const paidLoanPayments = loanPayments.filter(p => {
        // Use p.year for filtering as it's more reliable than parsing timestamp strings
        return p.status === 'paid' && activeLoanIds.has(p.loanId) && (p.year || 0) >= 2026;
      });
      
      const totalCollected = paidContributions.reduce((acc, c) => acc + c.amount, 0);
      const totalInterest = paidLoanPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
      const totalPrincipalPaid = paidLoanPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      
      const approvedLoans = loans.filter(l => l.status === 'approved');
      const outstandingPrincipal = approvedLoans.reduce((acc, l) => {
        const payments = paidLoanPayments.filter(p => p.loanId === l.id);
        const paidOfThisLoan = payments.reduce((pAcc, p) => pAcc + (p.amount || 0), 0);
        return acc + Math.max(0, (l.approvedAmount || 0) - paidOfThisLoan);
      }, 0);

      // Total Group Savings is purely dynamic based on records in the database from 2026 onwards.
      const totalSavings = totalCollected + totalInterest; 
      const availableBalance = totalSavings - outstandingPrincipal;

      return {
        totalSavings,
        totalCollected,
        availableBalance: Math.max(0, availableBalance),
        outstandingPrincipal,
        totalInterest,
        totalLoanIssued: loans.filter(l => l.status === 'approved' || l.status === 'paid').reduce((acc, l) => acc + (l.approvedAmount || 0), 0),
        totalLoanPaid: totalPrincipalPaid
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
        console.log(`Checking for data to backfill for email: ${email}`);
        
        // 1. Contributions
        const contribsQuery = query(
          collection(db, 'contributions'), 
          where('userEmail', '==', email)
        );
        
        // Use standard getDocs, if offline it should still return cache
        const contribsSnap = await getDocs(contribsQuery).catch(err => {
          console.warn("Backfill (contribs) error:", err.message);
          return null;
        });

        const batch = writeBatch(db);
        let hasChanges = false;

        if (contribsSnap) {
          contribsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!data.userId || data.userId === '') {
              batch.update(doc.ref, { userId: uid });
              hasChanges = true;
            }
          });
        }

        // 2. Notifications
        const notificationsQuery = query(
          collection(db, 'notifications'), 
          where('userId', '==', email)
        );
        const notificationsSnap = await getDocs(notificationsQuery).catch(() => null);
        if (notificationsSnap) {
          notificationsSnap.docs.forEach(doc => {
            batch.update(doc.ref, { userId: uid });
            hasChanges = true;
          });
        }

        // 3. Loans
        const loansQuery = query(
          collection(db, 'loans'), 
          where('userEmail', '==', email)
        );
        const loansSnap = await getDocs(loansQuery).catch(() => null);
        if (loansSnap) {
          loansSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!data.userId || data.userId === '') {
              batch.update(doc.ref, { userId: uid });
              hasChanges = true;
            }
          });
        }

        // 4. Loan Payments
        const loanPaymentsQuery = query(
          collection(db, 'loanPayments'), 
          where('userEmail', '==', email)
        );
        const loanPaymentsSnap = await getDocs(loanPaymentsQuery).catch(() => null);
        if (loanPaymentsSnap) {
          loanPaymentsSnap.docs.forEach(doc => {
            const data = doc.data();
            if (!data.userId || data.userId === '') {
              batch.update(doc.ref, { userId: uid });
              hasChanges = true;
            }
          });
        }

        // 5. Clean up email-keyed user document
        const emailRef = doc(db, 'users', email);
        if (email !== uid) {
          const emailSnap = await getDoc(emailRef).catch(() => null);
          if (emailSnap?.exists()) {
            batch.delete(emailRef);
            hasChanges = true;
          }
        }

        if (hasChanges) {
          await batch.commit();
          console.log(`Backfilled data and cleaned up duplicate doc for user ${email}`);
        } else {
          console.log("No data found that needed backfilling.");
        }
      } catch (err: any) {
        if (err.message?.includes('offline')) {
          console.info("Backfill deferred: Device is currently offline.");
        } else {
          console.error("Error backfilling user data:", err);
        }
      }
    };

    const testConnection = async () => {
      try {
        // Mandatory Firestore connection test - but handle offline gracefully
        // Using a shorter timeout for this specific test
        const testPromise = getDocFromServer(doc(db, 'test', 'connection'));
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection test timed out')), 3000)
        );
        
        await Promise.race([testPromise, timeoutPromise]);
        console.log("Firestore connection verified.");
      } catch (error) {
        // We log as warning instead of error to avoid scaring the user/system 
        // if it's just a temporary network glitch or slow connection.
        console.warn("Firestore connection check info:", error instanceof Error ? error.message : String(error));
        if (error instanceof Error && (error.message.includes('the client is offline') || error.message.includes('timed out'))) {
          console.info("Application will operate in offline mode until connection is restored.");
        }
      }

      try {
        // Use a timeout for the health check to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // Check server health/SMTP
        const healthRes = await fetch(`${API_BASE_URL}/api/health`, { signal: controller.signal });
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
    
    // Handle redirect result for Capacitor support with whitelisted domain
    const handleRedirectResultFlow = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
          console.log("Redirect result success:", result.user.email);
          notify('success', `Welcome back, ${result.user.displayName || 'Member'}!`);
        }
      } catch (err: any) {
        if (err.code === 'auth/unauthorized-domain') {
          console.warn("Domain Authorization Issue. Current:", window.location.hostname);
        } else if (err.code === 'auth/missing-initial-state' || err.message?.includes('missing initial state')) {
          // This is the common Android/Capacitor error.
          // We check if the user is ALREADY signed in via onAuthStateChanged.
          // If NOT, we try to recover by cleaning up the auth state.
          console.log("Transient state check: Missing initial state. Checking session...");
        } else if (err.code === 'auth/operation-not-supported-in-this-environment') {
           console.warn("Auth environment mismatch - likely WebView restriction.");
        } else {
          console.error("Auth redirect error:", err);
        }
      }
    };
    handleRedirectResultFlow();

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
            // Link UID to existing record (User was pre-registered by email)
            const existingData = emailSnap.data() as UserProfile;
            const updatedProfile = { ...existingData, uid: firebaseUser.uid, displayName: firebaseUser.displayName || existingData.displayName };
            await setDoc(userRef, updatedProfile);
            await deleteDoc(emailRef); // Remove the email-keyed doc
            setProfile(updatedProfile);
            
            // Backfill contributions and notifications
            backfillUserData(firebaseUser.uid, email);
          } else {
            // STRICT VERIFICATION: Not in database = Access Denied
            await signOut(auth);
            notify('error', "Access Denied: Your email is not registered in our system. Only pre-authorized members can log in.");
            setProfile(null);
            setIsLocalAdmin(false);
            setLoading(false);
            return;
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
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Contribution));
      setContributions(data);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'contributions');
    });

    const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as UserProfile)).filter(u => u && u.email);
      // Ensure uniqueness by email to prevent double counting if a user has both UID and Email docs
      // Prioritize entries that have a UID
      const uniqueUsersMap = new Map<string, UserProfile>();
      data.forEach(u => {
        const email = u.email.trim().toLowerCase();
        const existing = uniqueUsersMap.get(email);
        if (!existing || (!existing.uid && u.uid)) {
          uniqueUsersMap.set(email, u);
        }
      });
      setAllUsers(Array.from(uniqueUsersMap.values()));
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'users');
    });

    const loansQuery = collection(db, 'loans');

    const unsubscribeLoans = onSnapshot(loansQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Loan));
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

    const paymentsQuery = collection(db, 'loanPayments');

    const unsubscribeLoanPayments = onSnapshot(paymentsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as LoanPayment));
      // Filter out test loan repayment entry (20,100 in Apr 2026)
      const validData = data.filter(p => {
        const isApr2026 = p.month === 4 && p.year === 2026;
        const total = (p.amount || 0) + (p.interest || 0);
        const isTestPayment = isApr2026 && (total === 20100 || p.amount === 20100 || p.amount === 20000);
        return !isTestPayment;
      });
      setLoanPayments(validData);
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, 'loanPayments');
    });

    const unsubscribeNotices = onSnapshot(query(collection(db, 'notices'), orderBy('createdAt', 'desc')), (snapshot) => {
      setNotices(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Notice)));
    });

    const unsubscribeNotifications = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid), orderBy('createdAt', 'desc')),
      (snapshot) => {
        setNotifications(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as AppNotification)));
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

  const getInferredPaymentMode = (l: Loan): 'Online' | 'Cash' | null => {
    if (l.paymentMode) return l.paymentMode;
    const targetUser = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email?.toLowerCase() === l.userEmail.toLowerCase()));
    const name = (targetUser?.displayName || l.userEmail || '').toLowerCase().replace(/\s/g, '');
    if (name.includes('shreenidhi') || name.includes('prasad')) {
      return 'Online';
    }
    return null;
  };

  // --- One-time Data Migration for Existing Loans ---
  useEffect(() => {
    if (profile?.role === 'admin' && loans.length > 0 && allUsers.length > 0) {
      const updates = [
        { name: 'Meghashri Srinivas', mode: 'Cash' as const },
        { name: 'SudhakarJP', mode: 'Online' as const },
        { name: 'Soumya Santosh Batavi', mode: 'Online' as const },
        { name: 'Priya SB', mode: 'Online' as const },
        { name: 'Shreenidhi JK', mode: 'Online' as const },
        { name: 'Prasad Batavi', mode: 'Online' as const },
        { name: 'Shreenidhi', mode: 'Online' as const },
        { name: 'Prasad', mode: 'Online' as const }
      ];

      loans.forEach(async (loan) => {
        if (!loan.paymentMode && loan.id) {
          const userProfile = allUsers.find(u => 
            (loan.userId && u.uid === loan.userId) || 
            (loan.userEmail && u.email?.toLowerCase() === loan.userEmail.toLowerCase())
          );
          
          if (userProfile && userProfile.displayName) {
            const normalizedName = userProfile.displayName.toLowerCase().replace(/\s/g, '');
            const match = updates.find(upd => 
              upd.name === userProfile.displayName || 
              upd.name.toLowerCase().replace(/\s/g, '') === normalizedName ||
              normalizedName.includes(upd.name.toLowerCase().replace(/\s/g, ''))
            );
            if (match) {
              try {
                await updateDoc(doc(db, 'loans', loan.id), { paymentMode: match.mode });
                console.log(`Auto-updated paymentMode for loan ${loan.id} (${match.name}): ${match.mode}`);
              } catch (e) {
              }
            }
          }
        }
      });

      // Synchronize loan statuses based on valid payments
      loans.forEach(async (loan) => {
        if (loan.id && loan.approvedAmount) {
          const payments = loanPayments.filter(p => p.loanId === loan.id && p.status === 'paid');
          const totalPaid = payments.reduce((acc, p) => acc + p.amount, 0);
          if (loan.status !== 'paid' && totalPaid >= loan.approvedAmount) {
            try {
              await updateDoc(doc(db, 'loans', loan.id), { status: 'paid' });
            } catch (e) {}
          } else if (loan.status === 'paid' && totalPaid < loan.approvedAmount) {
            try {
              await updateDoc(doc(db, 'loans', loan.id), { status: 'approved' });
            } catch (e) {}
          }
        }
      });

      // Permanently delete the test loan repayment of 20,100 from April 2026 from Firestore
      getDocs(collection(db, 'loanPayments')).then((snapshot) => {
        snapshot.docs.forEach(async (d) => {
          const p = d.data() as LoanPayment;
          const total = (p.amount || 0) + (p.interest || 0);
          const isApr2026 = p.month === 4 && p.year === 2026;
          const isTestPayment = isApr2026 && (total === 20100 || p.amount === 20100 || p.amount === 20000);
          if (isTestPayment) {
            try {
              await deleteDoc(doc(db, 'loanPayments', d.id));
              console.log(`Deleted test loanPayment doc ${d.id} for April 2026`);
            } catch (e) {
              console.error('Error deleting test payment doc:', e);
            }
          }
        });
      }).catch(() => {});

      // Special fix for Priya SB's repayments
      loanPayments.forEach(async (p) => {
        const userProfile = allUsers.find(u => 
          (p.userId && u.uid === p.userId) || 
          (p.userEmail && u.email?.toLowerCase() === p.userEmail.toLowerCase())
        );
        if (userProfile && userProfile.displayName === 'Priya SB') {
          // Fix mode if showing as Cash
          if (p.paymentMode === 'Cash' || p.paymentMethod === 'Cash') {
            try {
              await updateDoc(doc(db, 'loanPayments', p.id!), { 
                paymentMode: 'Online', 
                paymentMethod: 'Online' 
              });
            } catch (e) {}
          }
          // Ensure year is set for financials if it was missing
          if (!p.year || p.year < 2026) {
             const payDate = p.timestamp?.toDate ? p.timestamp.toDate() : new Date();
             if (payDate.getFullYear() >= 2026) {
               try {
                 await updateDoc(doc(db, 'loanPayments', p.id!), { 
                   year: payDate.getFullYear(),
                   month: payDate.getMonth() + 1
                 });
               } catch (e) {}
             }
          }
        }
      });
    }
  }, [profile, loans, allUsers, loanPayments]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Ensure we request the email to make it more official for Google
      provider.addScope('https://www.googleapis.com/auth/userinfo.email');
      // Force Account Selection UI
      provider.setCustomParameters({ prompt: 'select_account' });
      
      console.log('Login attempt started. Origin:', window.location.origin);

      try {
        // Detecting if we are in a mobile/WebView context
        const isWebView = window.location.protocol === 'file:' || 
                          window.location.hostname === 'localhost' || 
                          /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isWebView && !window.location.hostname.includes('asia-southeast1.run.app')) {
          console.log('Mobile/WebView environment detected - using Redirect for security');
          await signInWithRedirect(auth, provider);
        } else {
          console.log('Standard environment detected - using Popup');
          await signInWithPopup(auth, provider);
        }
      } catch (popupErr: any) {
        console.error('Login attempt result:', popupErr.code);
        
        if (popupErr.code === 'auth/unauthorized-domain') {
          notify('error', 'Domain Error: Please add "localhost" and your app URL to Authorized Domains in Firebase console.');
        } else if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/operation-not-supported-in-this-environment') {
          notify('info', 'Switching to secure redirection...');
          await signInWithRedirect(auth, provider);
        } else if (popupErr.code === 'auth/disallowed-useragent' || popupErr.message?.includes('disallowed_useragent')) {
          notify('error', 'Browser Restriction: Google does not allow login in this simplified view. Please try opening the app in the Chrome browser.');
        } else if (popupErr.code !== 'auth/popup-closed-by-user') {
          console.log('Attempting Redirect fallback...');
          await signInWithRedirect(auth, provider);
        }
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-by-user') {
        notify('error', err.message || "An unexpected error occurred.");
      }
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
      const response = await fetch(`${API_BASE_URL}/api/admin/trigger-reminders`, {
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

  const triggerFullBackupReport = async () => {
    if (!isAdmin) return;
    
    if (!isSmtpConfigured) {
      notify('error', "SMTP is not configured. Please set SMTP_USER and SMTP_PASS in your environment variables.");
      return;
    }

    setIsSendingReport(true);
    try {
      notify('info', "Gathering data for backup...");
      
      // Fetch all required collections
      const [uSnap, cSnap, lSnap, pSnap, nSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'contributions')),
        getDocs(collection(db, 'loans')),
        getDocs(collection(db, 'loanPayments')),
        getDocs(collection(db, 'notices'))
      ]);

      const dataPayload = {
        users: uSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        contributions: cSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        loans: lSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        payments: pSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        notices: nSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };

      notify('info', "Sending backup to server...");

      const response = await fetch(`${API_BASE_URL}/api/admin/send-backup-report-data`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dataPayload)
      });
      
      const data = await response.json();
      const message = data.message || data.error || (response.ok ? "Full backup report sent successfully to jpvenu2000@gmail.com!" : "Failed to send report");
      notify(response.ok ? 'success' : 'error', message);
    } catch (err: any) {
      notify('error', "Failed to send full backup report: " + err.message);
    } finally {
      setIsSendingReport(false);
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

  const isLatePaymentDate = useMemo(() => {
    if (!paymentDate) return false;
    const parts = paymentDate.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[2], 10);
      if (!isNaN(day)) return day > DUE_DAY;
    }
    const d = new Date(paymentDate);
    return !isNaN(d.getTime()) && d.getDate() > DUE_DAY;
  }, [paymentDate]);

  useEffect(() => {
    if (isLatePaymentDate) {
      setCustomFine(LATE_FEE);
      setCustomAmount(MONTHLY_AMOUNT + LATE_FEE);
    } else {
      setCustomFine(0);
      setCustomAmount(MONTHLY_AMOUNT);
    }
  }, [isLatePaymentDate, paymentDate, isAdding, selectedMonth, selectedYear]);

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
      const timestampValue = customDate ? getTimestampFromDateString(customDate) : serverTimestamp();
      
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
          const message = `Hi ${targetUser.displayName || 'Member'}, your Unnati contribution of ₹${contrib.amount.toLocaleString('en-IN')} for ${monthName} ${contrib.year} has been successfully verified and approved. Thank you!`;
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
    const isUserAdmin = isAdmin || profile?.role === 'admin' || isLocalAdmin || (!!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    if (!isUserAdmin) {
      notify('error', "Access Denied: Only administrators can add new members.");
      return;
    }

    const cleanName = (newMember.name || '').trim();
    const cleanEmail = (newMember.email || '').trim().toLowerCase();
    const cleanPhone = (newMember.phoneNumber || '').trim();
    const cleanJoinDate = (newMember.joinDate || '').trim() || format(new Date(), 'yyyy-MM-dd');

    if (!cleanName) {
      notify('error', "Please enter the member's full name.");
      return;
    }

    if (!cleanEmail) {
      notify('error', "Please enter the member's email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      notify('error', "Please enter a valid email address.");
      return;
    }

    // Check if user already exists
    const existing = allUsers.find(u => u.email && u.email.trim().toLowerCase() === cleanEmail);
    if (existing) {
      notify('error', "A member with this email address already exists.");
      return;
    }

    setIsSubmittingMember(true);
    try {
      // Use clean email as ID for pre-added users
      await setDoc(doc(db, 'users', cleanEmail), {
        uid: null,
        email: cleanEmail,
        displayName: cleanName,
        phoneNumber: cleanPhone,
        role: 'user',
        joinDate: cleanJoinDate
      }, { merge: true });

      setIsAddingMember(false);
      setNewMember({ name: '', email: '', phoneNumber: '', joinDate: format(new Date(), 'yyyy-MM-dd') });
      notify('success', `Member "${cleanName}" added successfully!`);
      
      // Send Welcome Email in background
      try {
        const emailRes = await fetch(`${API_BASE_URL}/api/admin/send-welcome-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: cleanEmail, name: cleanName })
        });
        const emailData = await emailRes.json().catch(() => ({}));
        if (emailRes.ok) {
          notify('success', `Member added and welcome email sent to ${cleanEmail}!`);
        } else {
          console.warn('Welcome email not sent:', emailData?.message);
        }
      } catch (err: any) {
        console.warn('Failed to trigger welcome email:', err);
      }
    } catch (err: any) {
      console.error("Failed to add member in Firestore:", err);
      notify('error', `Failed to add member: ${err.message || 'Database error'}`);
    } finally {
      setIsSubmittingMember(false);
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
              const res = await fetch(`${API_BASE_URL}/api/admin/send-welcome-email`, {
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
    if (id === 'arun2102000@gmail.com' || id === 'unnati.finance2026@gmail.com' || 
        id === 'LckmqupxqXfZ2gtrRU4m5gySmjm1' || id === 'aTG3MEJf2dPCNWEV6jYGaZXx6RD3') {
      notify('error', "Cannot delete primary administrators.");
      return;
    }

    try {
      // Check if user has active loans or pending repayments
      const targetUser = allUsers.find(u => 
        (id && u.uid === id) || 
        (id && u.email && u.email.toLowerCase() === id.toLowerCase())
      );
      const userEmails = [id.toLowerCase()];
      if (targetUser && targetUser.email) userEmails.push(targetUser.email.toLowerCase());
      const uniqueEmails = Array.from(new Set(userEmails));

      const userLoans = loans.filter(l => 
        (l.userId === id) || 
        (l.userEmail && uniqueEmails.includes(l.userEmail.toLowerCase()))
      );
      const hasActiveLoan = userLoans.some(l => l.status === 'approved' || l.status === 'pending');
      const hasPendingRepayment = loanPayments.some(p => 
        (p.userId === id || (p.userEmail && uniqueEmails.includes(p.userEmail.toLowerCase()))) && 
        p.status === 'pending'
      );
      
      if (hasActiveLoan || hasPendingRepayment) {
        notify('error', "Member has an active or pending loan/repayment and cannot be deleted.");
        return;
      }

      const batch = writeBatch(db);
      
      // 1. Delete user document
      batch.delete(doc(db, 'users', id));
      
      // 2. Delete contributions (Crucial for financials adjustment)
      const contribsByIdQuery = query(collection(db, 'contributions'), where('userId', '==', id));
      const contribsByIdSnap = await getDocs(contribsByIdQuery);
      contribsByIdSnap.forEach(d => batch.delete(d.ref));
      
      for (const email of uniqueEmails) {
        const contribsByEmailQuery = query(collection(db, 'contributions'), where('userEmail', '==', email));
        const contribsByEmailSnap = await getDocs(contribsByEmailQuery);
        contribsByEmailSnap.forEach(d => batch.delete(d.ref));
      }

      // 3. Delete loans
      const loansByIdQuery = query(collection(db, 'loans'), where('userId', '==', id));
      const loansByIdSnap = await getDocs(loansByIdQuery);
      loansByIdSnap.forEach(d => batch.delete(d.ref));

      for (const email of uniqueEmails) {
        const loansByEmailQuery = query(collection(db, 'loans'), where('userEmail', '==', email));
        const loansByEmailSnap = await getDocs(loansByEmailQuery);
        loansByEmailSnap.forEach(d => batch.delete(d.ref));
      }

      // 4. Delete loan payments
      const paymentsByIdQuery = query(collection(db, 'loanPayments'), where('userId', '==', id));
      const paymentsByIdSnap = await getDocs(paymentsByIdQuery);
      paymentsByIdSnap.forEach(d => batch.delete(d.ref));

      for (const email of uniqueEmails) {
        const paymentsByEmailQuery = query(collection(db, 'loanPayments'), where('userEmail', '==', email));
        const paymentsByEmailSnap = await getDocs(paymentsByEmailQuery);
        paymentsByEmailSnap.forEach(d => batch.delete(d.ref));
      }

      // 5. Delete notifications
      const notifsByIdQuery = query(collection(db, 'notifications'), where('userId', '==', id));
      const notifsByIdSnap = await getDocs(notifsByIdQuery);
      notifsByIdSnap.forEach(d => batch.delete(d.ref));

      for (const email of uniqueEmails) {
        const notifsByEmailQuery = query(collection(db, 'notifications'), where('userId', '==', email));
        const notifsByEmailSnap = await getDocs(notifsByEmailQuery);
        notifsByEmailSnap.forEach(d => batch.delete(d.ref));
      }

      await batch.commit();
      notify('success', "Member and all related data removed. Group financials adjusted.");
      setDeletingUserId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${id}`);
    }
  };

  const handleUPIPayment = (month: number, year: number, customPayAmount?: number) => {
    if (!user || !profile) return;
    
    const monthName = format(new Date(year, month - 1), 'MMMM');
    const amount = customPayAmount !== undefined ? customPayAmount : getContributionAmount(month, year, paymentDate);
    const note = `Unnati Contribution - ${monthName} ${year}`;
    setPaymentModal({
      isOpen: true,
      amount: typeof amount === 'number' ? amount : parseFloat(String(amount)),
      note,
      type: 'contribution',
      mode: 'online'
    });
    setSelectedLoanForPayment(null);
  };

  const handlePayLoanInstallment = (loan: Loan, month: number, year: number, principal: number, interest: number) => {
    const note = `Loan Payment - ${format(new Date(year, month - 1), 'MMM yyyy')}`;
    setPaymentModal({
      isOpen: true,
      amount: principal + interest,
      note,
      type: 'loan',
      mode: 'online'
    });
    setSelectedLoanForPayment({ loan, month, year, principal, interest });
  };

  const updateMember = async () => {
    const isUserAdmin = isAdmin || profile?.role === 'admin' || isLocalAdmin || (!!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase()));
    if (!isUserAdmin || !editingUser || !originalEditingEmail) {
      notify('error', "Access Denied: Only administrators can update member details.");
      return;
    }
    try {
      const userRef = doc(db, 'users', originalEditingEmail);
      
      // If the user hasn't logged in yet (ID is email) and the email is being changed
      if (!editingUser.uid && editingUser.email !== originalEditingEmail) {
        // Create new doc with new email as ID
        const newRef = doc(db, 'users', editingUser.email.trim().toLowerCase());
        await setDoc(newRef, {
          ...editingUser,
          email: editingUser.email.trim().toLowerCase()
        });
        // Delete old doc
        await deleteDoc(userRef);
      } else {
        // Just update existing doc
        await updateDoc(userRef, {
          displayName: editingUser.displayName,
          phoneNumber: editingUser.phoneNumber || '',
          email: editingUser.email.trim().toLowerCase(),
          joinDate: editingUser.joinDate
        });
      }
      setEditingUser(null);
      setOriginalEditingEmail(null);
      notify('success', 'Member updated successfully');
    } catch (err: any) {
      console.error("Failed to update member:", err);
      notify('error', `Failed to update member: ${err.message || 'Database error'}`);
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
    const message = `Hi ${u.displayName || 'Member'}, this is a reminder for your Unnati Loan Repayment of ₹${amount.toLocaleString('en-IN')} for ${month}. Please pay before the 10th to avoid late fees. Thanks!`;
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/${u.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
  };

  const sendLoanEmailReminder = (u: UserProfile, amount: number, month: string) => {
    const subject = `Loan Repayment Reminder: Unnati - ${month}`;
    const body = `Hi ${u.displayName || 'Member'},\n\nThis is a reminder for your Unnati loan repayment of ₹${amount.toLocaleString('en-IN')} for ${month}. Please ensure the payment is made before the 10th.\n\nThanks!`;
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

  const exportAllDataToExcel = async () => {
    if (profile?.role !== 'admin') return;

    const wb = XLSX.utils.book_new();

    // 1. Master Report - Consolidated Member Summary
    const masterReport = allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map(u => {
      // Contributions / Subscriptions for this member
      const userContribs = contributions.filter(c => 
        (u.uid && c.userId && c.userId === u.uid) || 
        (u.email && c.userEmail && c.userEmail.toLowerCase().trim() === u.email.toLowerCase().trim())
      );
      const paidContribs = userContribs.filter(c => c.status === 'paid');
      const totalDeposited = paidContribs.reduce((acc, c) => acc + (c.amount || 0), 0);
      const subscriptionMonthsCount = paidContribs.length;
      
      // All loans associated with this member
      const userLoans = loans.filter(l => 
        (u.uid && l.userId && l.userId === u.uid) || 
        (u.email && l.userEmail && l.userEmail.toLowerCase().trim() === u.email.toLowerCase().trim())
      );
      
      // Sanctioned/Disbursed loans (approved or paid)
      const sanctionedLoans = userLoans.filter(l => l.status === 'approved' || l.status === 'paid');
      const activeLoans = userLoans.filter(l => l.status === 'approved');
      const closedLoans = userLoans.filter(l => l.status === 'paid');
      const hasLoan = sanctionedLoans.length > 0;
      
      // All payments made by this member across all loans
      const userPayments = loanPayments.filter(p => 
        (u.uid && p.userId && p.userId === u.uid) || 
        (u.email && p.userEmail && p.userEmail.toLowerCase().trim() === u.email.toLowerCase().trim())
      );
      const paidUserPayments = userPayments.filter(p => p.status === 'paid');

      let totalSanctionedAmount = 0;
      let totalActiveLoanAmount = 0;
      let totalClosedLoanAmount = 0;
      let totalLoanPrincipalPaid = 0;
      let totalLoanInterestPaid = 0;
      let totalPendingPrincipal = 0;

      const loanDetailsList: string[] = [];

      // Consolidate loan by loan
      sanctionedLoans.forEach((l, idx) => {
        const loanAmt = l.approvedAmount || l.amount || 0;
        totalSanctionedAmount += loanAmt;

        // Specific payments for this particular loan
        const lPayments = paidUserPayments.filter(p => p.loanId === l.id);
        const lPrincipalPaid = lPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
        const lInterestPaid = lPayments.reduce((acc, p) => acc + (p.interest || 0), 0);

        totalLoanPrincipalPaid += lPrincipalPaid;
        totalLoanInterestPaid += lInterestPaid;

        const isSettled = l.status === 'paid' || (loanAmt > 0 && lPrincipalPaid >= loanAmt);
        const lRemainingBal = isSettled ? 0 : Math.max(0, loanAmt - lPrincipalPaid);

        if (isSettled) {
          totalClosedLoanAmount += loanAmt;
        } else {
          totalActiveLoanAmount += loanAmt;
          totalPendingPrincipal += lRemainingBal;
        }

        // Format approval/creation date
        let dateStr = '';
        if (l.approvedAt?.toDate) {
          dateStr = format(l.approvedAt.toDate(), 'dd-MMM-yyyy');
        } else if (l.approvedAt?.seconds) {
          dateStr = format(new Date(l.approvedAt.seconds * 1000), 'dd-MMM-yyyy');
        } else if (l.createdAt?.toDate) {
          dateStr = format(l.createdAt.toDate(), 'dd-MMM-yyyy');
        } else if (l.createdAt?.seconds) {
          dateStr = format(new Date(l.createdAt.seconds * 1000), 'dd-MMM-yyyy');
        }

        const statusTag = isSettled ? 'CLOSED' : 'ACTIVE';
        loanDetailsList.push(
          `Loan #${idx + 1}: ₹${loanAmt.toLocaleString('en-IN')}${dateStr ? ` (${dateStr})` : ''} - ${statusTag} [Principal Paid: ₹${lPrincipalPaid.toLocaleString('en-IN')}, Balance: ₹${lRemainingBal.toLocaleString('en-IN')}, Interest: ₹${lInterestPaid.toLocaleString('en-IN')}]`
        );
      });

      // Status Summary String
      let loanStatusStr = 'NO LOAN';
      if (sanctionedLoans.length > 0) {
        if (activeLoans.length > 0 && closedLoans.length > 0) {
          loanStatusStr = `${activeLoans.length} ACTIVE, ${closedLoans.length} CLOSED (${sanctionedLoans.length} Total)`;
        } else if (activeLoans.length > 0) {
          loanStatusStr = activeLoans.length === 1 ? 'ACTIVE' : `${activeLoans.length} ACTIVE LOANS`;
        } else {
          loanStatusStr = closedLoans.length === 1 ? 'CLOSED (FULLY PAID)' : `${closedLoans.length} CLOSED LOANS`;
        }
      }

      return {
        'Member Name': u.displayName || 'N/A',
        'Email': u.email,
        'Phone': u.phoneNumber || 'N/A',
        'Join Date': u.joinDate || 'N/A',
        'Total Deposited (₹)': totalDeposited,
        'Paid Subscription Months': subscriptionMonthsCount,
        'Has Taken Loan?': hasLoan ? 'Yes' : 'No',
        'Total Loans Count': sanctionedLoans.length,
        'Active Loans Count': activeLoans.length,
        'Closed Loans Count': closedLoans.length,
        'Total Sanctioned Loan Amount (₹)': totalSanctionedAmount,
        'Active Loan Amount (₹)': totalActiveLoanAmount,
        'Closed Loan Amount (₹)': totalClosedLoanAmount,
        'Loan Principal Paid (₹)': totalLoanPrincipalPaid,
        'Loan Interest Paid (₹)': totalLoanInterestPaid,
        'Loan Pending Principal (₹)': totalPendingPrincipal,
        'Loan Status': loanStatusStr,
        'Consolidated Loan Details': loanDetailsList.length > 0 ? loanDetailsList.join(' | ') : 'No loans taken'
      };
    });

    const masterWS = XLSX.utils.json_to_sheet(masterReport);
    XLSX.utils.book_append_sheet(wb, masterWS, "Master Report");

    // 2. All Contributions (Subscriptions)
    const contribsWS = XLSX.utils.json_to_sheet(contributions.map(c => {
      const u = allUsers.find(user => 
        (c.userId && user.uid === c.userId) || 
        (c.userEmail && user.email.toLowerCase().trim() === c.userEmail.toLowerCase().trim())
      );
      let dateStr = 'N/A';
      if (c.timestamp?.toDate) {
        dateStr = format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm');
      } else if (c.timestamp?.seconds) {
        dateStr = format(new Date(c.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');
      }
      return {
        'Member Name': u?.displayName || c.userEmail.split('@')[0],
        'Email': u?.email || c.userEmail || 'N/A',
        'Month': format(new Date(c.year, c.month - 1), 'MMMM'),
        'Year': c.year,
        'Amount (₹)': c.amount || 0,
        'Status': (c.status || 'PENDING').toUpperCase(),
        'Payment Method': c.paymentMethod ? c.paymentMethod.toUpperCase() : 'ONLINE',
        'Payment Date': dateStr
      };
    }));
    XLSX.utils.book_append_sheet(wb, contribsWS, "All Contributions");

    // 3. All Loans (Individual Loan Sanctions)
    const loansWS = XLSX.utils.json_to_sheet(loans.map((l, idx) => {
      const u = allUsers.find(user => 
        (l.userId && user.uid === l.userId) || 
        (l.userEmail && user.email.toLowerCase().trim() === l.userEmail.toLowerCase().trim())
      );
      const lPayments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
      const principalPaid = lPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
      const interestPaid = lPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
      const approvedAmt = l.approvedAmount || l.amount || 0;
      const isSettled = l.status === 'paid' || (approvedAmt > 0 && principalPaid >= approvedAmt);
      const remainingBal = isSettled ? 0 : Math.max(0, approvedAmt - principalPaid);

      let appliedDate = 'N/A';
      if (l.createdAt?.toDate) appliedDate = format(l.createdAt.toDate(), 'yyyy-MM-dd HH:mm');
      else if (l.createdAt?.seconds) appliedDate = format(new Date(l.createdAt.seconds * 1000), 'yyyy-MM-dd HH:mm');

      let approvedDate = 'N/A';
      if (l.approvedAt?.toDate) approvedDate = format(l.approvedAt.toDate(), 'yyyy-MM-dd HH:mm');
      else if (l.approvedAt?.seconds) approvedDate = format(new Date(l.approvedAt.seconds * 1000), 'yyyy-MM-dd HH:mm');

      let closedDate = 'N/A';
      if (isSettled) {
        if (lPayments.length > 0) {
          const lastPayment = [...lPayments].sort((a, b) => ((b.year || 0) * 100 + (b.month || 0)) - ((a.year || 0) * 100 + (a.month || 0)))[0];
          if (lastPayment?.timestamp?.toDate) closedDate = format(lastPayment.timestamp.toDate(), 'yyyy-MM-dd HH:mm');
          else if (lastPayment?.month && lastPayment?.year) closedDate = `${format(new Date(lastPayment.year, lastPayment.month - 1), 'MMMM')} ${lastPayment.year}`;
        }
      }

      return {
        'Loan #': idx + 1,
        'Loan ID': l.id || `L-${idx + 1}`,
        'Member Name': u?.displayName || l.userEmail?.split('@')[0] || 'N/A',
        'Email': u?.email || l.userEmail || 'N/A',
        'Requested Amount (₹)': l.amount || 0,
        'Sanctioned / Approved Amount (₹)': approvedAmt,
        'Interest Rate (%)': `${l.interestRate ?? 1}%`,
        'Tenure (Months)': l.installments || 10,
        'Status': isSettled ? 'CLOSED' : (l.status || 'PENDING').toUpperCase(),
        'Principal Paid (₹)': principalPaid,
        'Interest Paid (₹)': interestPaid,
        'Pending Balance Principal (₹)': remainingBal,
        'Applied Date': appliedDate,
        'Approved Date': approvedDate,
        'Closed Date': closedDate,
        'Purpose': l.details || 'N/A'
      };
    }));
    XLSX.utils.book_append_sheet(wb, loansWS, "All Loans");

    // 4. All Loan Repayments (Individual Repayment Transactions)
    const repaymentsWS = XLSX.utils.json_to_sheet(loanPayments.map((p, idx) => {
      const u = allUsers.find(user => 
        (p.userId && user.uid === p.userId) || 
        (p.userEmail && user.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
      );
      const parentLoan = loans.find(l => l.id === p.loanId);
      let paymentDate = 'N/A';
      if (p.timestamp?.toDate) paymentDate = format(p.timestamp.toDate(), 'yyyy-MM-dd HH:mm');
      else if (p.timestamp?.seconds) paymentDate = format(new Date(p.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');

      return {
        'Payment #': idx + 1,
        'Payment ID': p.id || `P-${idx + 1}`,
        'Loan ID': p.loanId || 'N/A',
        'Member Name': u?.displayName || p.userEmail?.split('@')[0] || 'N/A',
        'Email': u?.email || p.userEmail || 'N/A',
        'Loan Sanctioned (₹)': parentLoan ? (parentLoan.approvedAmount || parentLoan.amount || 0) : 'N/A',
        'Repayment Month': p.month ? format(new Date(p.year || 2026, p.month - 1), 'MMMM') : 'N/A',
        'Year': p.year || 'N/A',
        'Principal Paid (₹)': p.amount || 0,
        'Interest Paid (₹)': p.interest || 0,
        'Total Paid (₹)': (p.amount || 0) + (p.interest || 0),
        'Status': (p.status || 'PENDING').toUpperCase(),
        'Payment Method': (p.paymentMethod || 'ONLINE').toUpperCase(),
        'Payment Date & Time': paymentDate
      };
    }));
    XLSX.utils.book_append_sheet(wb, repaymentsWS, "All Loan Repayments");

    // 5. Group Financial Summary
    const totalGroupSavings = contributions.filter(c => c.status === 'paid').reduce((sum, c) => sum + (c.amount || 0), 0);
    const totalSanctionedAll = loans.filter(l => l.status === 'approved' || l.status === 'paid').reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
    const totalActiveLoansSanctioned = loans.filter(l => l.status === 'approved').reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
    const totalPrincipalRepaidAll = loanPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalInterestEarnedAll = loanPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.interest || 0), 0);
    const totalActivePendingPrincipal = loans.filter(l => l.status === 'approved').reduce((sum, l) => {
      const lPaid = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid').reduce((acc, p) => acc + (p.amount || 0), 0);
      return sum + Math.max(0, (l.approvedAmount || l.amount || 0) - lPaid);
    }, 0);
    const availableLiquidBalance = (totalGroupSavings + totalPrincipalRepaidAll + totalInterestEarnedAll) - totalSanctionedAll;

    const groupSummary = [
      { 'Financial Metric': 'Report Generated Date', 'Value': format(new Date(), 'dd-MMM-yyyy HH:mm') },
      { 'Financial Metric': 'Total Registered Members', 'Value': allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).length },
      { 'Financial Metric': 'Total Group Subscriptions / Savings (₹)', 'Value': totalGroupSavings },
      { 'Financial Metric': 'Total Loans Disbursed / Sanctioned (₹)', 'Value': totalSanctionedAll },
      { 'Financial Metric': 'Total Active Loans Disbursed (₹)', 'Value': totalActiveLoansSanctioned },
      { 'Financial Metric': 'Total Loan Principal Repaid (₹)', 'Value': totalPrincipalRepaidAll },
      { 'Financial Metric': 'Total Active Loan Pending Principal (₹)', 'Value': totalActivePendingPrincipal },
      { 'Financial Metric': 'Total Interest Earned from Loans (₹)', 'Value': totalInterestEarnedAll },
      { 'Financial Metric': 'Available Liquid Balance in Fund (₹)', 'Value': availableLiquidBalance },
      { 'Financial Metric': 'Total Active Running Loans Count', 'Value': loans.filter(l => l.status === 'approved').length },
      { 'Financial Metric': 'Total Closed / Settled Loans Count', 'Value': loans.filter(l => l.status === 'paid').length }
    ];
    const summaryWS = XLSX.utils.json_to_sheet(groupSummary);
    XLSX.utils.book_append_sheet(wb, summaryWS, "Financial Summary");

    const fileName = `Unnati_Admin_Master_Report_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    if (isMobileApp) {
      try {
        const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const res = await downloadFileMobile(fileName, base64Data);
        if (res.success) {
          notify('success', `Report downloaded successfully as: ${fileName}`);
        } else {
          notify('error', "Could not download file directly. Attempting browser download...");
          XLSX.writeFile(wb, fileName);
        }
      } catch (err: any) {
        console.error("Export all mobile failed:", err);
        notify('error', `Failed to download report: ${err.message || 'Unknown error'}`);
      }
    } else {
      XLSX.writeFile(wb, fileName);
      notify('success', "Comprehensive report exported with Master, Loans, Repayments & Subscriptions");
    }
  };

  const exportUserStatementToExcel = async () => {
    if (!user) return;
    const wb = XLSX.utils.book_new();
    
    // Subscriptions
    const userContribs = contributions.filter(c => 
      ((user.uid && c.userId && c.userId === user.uid) || (user.email && c.userEmail && c.userEmail.toLowerCase() === user.email.toLowerCase()))
    );
    const statementData = userContribs.sort((a,b) => b.year - a.year || b.month - a.month).map(c => {
      let dateStr = 'N/A';
      if (c.timestamp?.toDate) {
        dateStr = format(c.timestamp.toDate(), 'yyyy-MM-dd HH:mm');
      } else if (c.timestamp?.seconds) {
        dateStr = format(new Date(c.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');
      }
      return {
        'Payment Date': dateStr,
        'Month': format(new Date(c.year, c.month - 1), 'MMMM'),
        'Year': c.year,
        'Amount (₹)': c.amount,
        'Status': (c.status || 'PENDING').toUpperCase(),
        'Payment Method': (c.paymentMethod || 'ONLINE').toUpperCase()
      };
    });
    const ws = XLSX.utils.json_to_sheet(statementData);
    XLSX.utils.book_append_sheet(wb, ws, "My Subscriptions");

    // Member Loans
    const userLoans = loans.filter(l => 
      ((user.uid && l.userId && l.userId === user.uid) || (user.email && l.userEmail && l.userEmail.toLowerCase() === user.email.toLowerCase()))
    );
    if (userLoans.length > 0) {
      const userLoansData = userLoans.map((l, idx) => {
        const lPayments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
        const principalPaid = lPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
        const interestPaid = lPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
        const approvedAmt = l.approvedAmount || l.amount || 0;
        const isSettled = l.status === 'paid' || (approvedAmt > 0 && principalPaid >= approvedAmt);
        const remainingBal = isSettled ? 0 : Math.max(0, approvedAmt - principalPaid);

        let approvedDate = 'N/A';
        if (l.approvedAt?.toDate) approvedDate = format(l.approvedAt.toDate(), 'yyyy-MM-dd');
        else if (l.approvedAt?.seconds) approvedDate = format(new Date(l.approvedAt.seconds * 1000), 'yyyy-MM-dd');

        return {
          'Loan #': idx + 1,
          'Sanctioned Amount (₹)': approvedAmt,
          'Interest Rate (%)': `${l.interestRate ?? 1}%`,
          'Tenure (Months)': l.installments || 10,
          'Status': isSettled ? 'CLOSED' : (l.status || 'PENDING').toUpperCase(),
          'Principal Paid (₹)': principalPaid,
          'Interest Paid (₹)': interestPaid,
          'Pending Balance (₹)': remainingBal,
          'Approved Date': approvedDate
        };
      });
      const loansWs = XLSX.utils.json_to_sheet(userLoansData);
      XLSX.utils.book_append_sheet(wb, loansWs, "My Loans");
    }

    // Member Loan Repayments
    const userLoanPayments = loanPayments.filter(p => 
      ((user.uid && p.userId && p.userId === user.uid) || (user.email && p.userEmail && p.userEmail.toLowerCase() === user.email.toLowerCase()))
    );
    if (userLoanPayments.length > 0) {
      const userPaymentsData = userLoanPayments.sort((a,b) => (b.year||0) - (a.year||0) || (b.month||0) - (a.month||0)).map((p, idx) => {
        let paymentDate = 'N/A';
        if (p.timestamp?.toDate) paymentDate = format(p.timestamp.toDate(), 'yyyy-MM-dd HH:mm');
        else if (p.timestamp?.seconds) paymentDate = format(new Date(p.timestamp.seconds * 1000), 'yyyy-MM-dd HH:mm');

        return {
          'Payment #': idx + 1,
          'Month': p.month ? format(new Date(p.year || 2026, p.month - 1), 'MMMM') : 'N/A',
          'Year': p.year || 'N/A',
          'Principal Paid (₹)': p.amount || 0,
          'Interest Paid (₹)': p.interest || 0,
          'Total Paid (₹)': (p.amount || 0) + (p.interest || 0),
          'Status': (p.status || 'PENDING').toUpperCase(),
          'Payment Method': (p.paymentMethod || 'ONLINE').toUpperCase(),
          'Date': paymentDate
        };
      });
      const paymentsWs = XLSX.utils.json_to_sheet(userPaymentsData);
      XLSX.utils.book_append_sheet(wb, paymentsWs, "My Loan Repayments");
    }

    const fileName = `My_Unnati_Statement_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
    if (isMobileApp) {
      try {
        const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const res = await downloadFileMobile(fileName, base64Data);
        if (res.success) {
          notify('success', `Statement downloaded successfully as: ${fileName}`);
        } else {
          notify('error', "Could not download file directly. Attempting browser download...");
          XLSX.writeFile(wb, fileName);
        }
      } catch (err: any) {
        console.error("Export user mobile failed:", err);
        notify('error', `Failed to download statement: ${err.message || 'Unknown error'}`);
      }
    } else {
      XLSX.writeFile(wb, fileName);
      notify('success', "Statement exported to Excel");
    }
  };

  const exportMonthlyCollectionsExcel = async () => {
    const wb = XLSX.utils.book_new();

    const monthlyPaidContributions = contributions.filter(c => 
      c.status === 'paid' && 
      c.month === collectionMonth && 
      c.year === collectionYear
    );
    const monthlyContributionTotal = monthlyPaidContributions.reduce((acc, c) => acc + (c.amount || 0), 0);

    const monthlyPaidLoanPayments = loanPayments.filter(p => 
      p.status === 'paid' && 
      p.month === collectionMonth && 
      p.year === collectionYear
    );
    const monthlyLoanPrincipalCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const monthlyLoanInterestCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
    const monthlyLoanTotalCollected = monthlyLoanPrincipalCollected + monthlyLoanInterestCollected;
    const grandTotalMonthlyReceived = monthlyContributionTotal + monthlyLoanTotalCollected;

    const monthLabel = format(new Date(collectionYear, collectionMonth - 1, 1), 'MMMM yyyy');
    const monthShort = format(new Date(collectionYear, collectionMonth - 1, 1), 'MMM');

    // 1. Sheet 1: Monthly Collection Summary
    const summarySheetData = [
      { 'Metric': 'Month & Year', 'Value': monthLabel },
      { 'Metric': 'Total Received (Grand Total)', 'Value': `₹${grandTotalMonthlyReceived.toLocaleString('en-IN')}` },
      { 'Metric': 'Total Member Subscriptions/Contributions (₹)', 'Value': `₹${monthlyContributionTotal.toLocaleString('en-IN')}` },
      { 'Metric': 'Total Paid Subscriptions Count', 'Value': monthlyPaidContributions.length },
      { 'Metric': 'Total Loan Repayments Collected (₹)', 'Value': `₹${monthlyLoanTotalCollected.toLocaleString('en-IN')}` },
      { 'Metric': 'Total Loan Repayments Count', 'Value': monthlyPaidLoanPayments.length },
      { 'Metric': 'Loan Principal Collected (₹)', 'Value': `₹${monthlyLoanPrincipalCollected.toLocaleString('en-IN')}` },
      { 'Metric': 'Loan Interest Collected [0.5%] (₹)', 'Value': `₹${monthlyLoanInterestCollected.toLocaleString('en-IN')}` },
      { 'Metric': 'Export Generated Date', 'Value': format(new Date(), 'dd-MMM-yyyy HH:mm:ss') }
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summarySheetData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Monthly Collection Summary");

    // 2. Sheet 2: Member Collection Details
    const memberCollectionRows = monthlyPaidContributions.map((c, idx) => {
      const mUser = allUsers.find(u => 
        (u.uid && c.userId && u.uid === c.userId) || 
        (u.email && c.userEmail && u.email.toLowerCase().trim() === c.userEmail.toLowerCase().trim())
      );
      const memberName = mUser?.displayName || (c as any).userName || (c as any).displayName || (c.userEmail ? c.userEmail.split('@')[0] : `Member ${idx + 1}`);
      const userPhone = mUser?.phoneNumber || (mUser as any)?.phone || '';
      const userEmail = mUser?.email || c.userEmail || '';
      const dateObj = c.timestamp?.toDate ? c.timestamp.toDate() : null;
      
      return {
        'S.No': idx + 1,
        'Member Name': memberName,
        'Email Address': userEmail,
        'Phone Number': userPhone || 'N/A',
        'Month & Year': monthLabel,
        'Contribution Amount (₹)': c.amount || 0,
        'Payment Mode': (c.paymentMethod || 'Online').toUpperCase(),
        'Payment Date': dateObj ? format(dateObj, 'dd-MMM-yyyy HH:mm') : 'N/A',
        'Status': (c.status || 'PAID').toUpperCase()
      };
    });
    const wsMember = XLSX.utils.json_to_sheet(memberCollectionRows.length > 0 ? memberCollectionRows : [{ 'Message': 'No member contributions found for this month' }]);
    XLSX.utils.book_append_sheet(wb, wsMember, "Member Collection Details");

    // 3. Sheet 3: Loan Repayments Collected
    const loanRepaymentRows = monthlyPaidLoanPayments.map((p, idx) => {
      const parentLoan = loans.find(l => l.id === p.loanId);
      const borrower = allUsers.find(u => 
        (u.uid && parentLoan?.userId && u.uid === parentLoan.userId) ||
        (u.email && parentLoan?.userEmail && u.email.toLowerCase().trim() === parentLoan.userEmail.toLowerCase().trim()) ||
        (u.uid && p.userId && u.uid === p.userId) ||
        (u.email && p.userEmail && u.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
      );
      const borrowerName = borrower?.displayName || (parentLoan as any)?.userName || parentLoan?.userEmail?.split('@')[0] || (p as any)?.userName || p.userEmail?.split('@')[0] || `Borrower ${idx + 1}`;
      const borrowerPhone = borrower?.phoneNumber || (borrower as any)?.phone || '';
      const borrowerEmail = borrower?.email || parentLoan?.userEmail || p.userEmail || '';
      const principal = p.amount || 0;
      const interest = p.interest || 0;
      const total = principal + interest;
      const paymentMode = (p.paymentMode || (p as any)?.paymentMethod || 'Online').toUpperCase();
      const dateObj = p.approvedAt?.toDate ? p.approvedAt.toDate() : p.timestamp?.toDate ? p.timestamp.toDate() : null;

      return {
        'S.No': idx + 1,
        'Borrower Name': borrowerName,
        'Email Address': borrowerEmail,
        'Phone Number': borrowerPhone || 'N/A',
        'Month & Year': monthLabel,
        'Principal Amount (₹)': principal,
        'Interest Amount (₹)': interest,
        'Total Repayment Paid (₹)': total,
        'Payment Mode': paymentMode,
        'Payment Date': dateObj ? format(dateObj, 'dd-MMM-yyyy HH:mm') : 'N/A',
        'Status': (p.status || 'PAID').toUpperCase()
      };
    });
    const wsLoans = XLSX.utils.json_to_sheet(loanRepaymentRows.length > 0 ? loanRepaymentRows : [{ 'Message': 'No loan repayments found for this month' }]);
    XLSX.utils.book_append_sheet(wb, wsLoans, "Loan Repayments Collected");

    const fileName = `MonthlyReport_${monthShort}${collectionYear}.xlsx`;
    if (isMobileApp) {
      try {
        const base64Data = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const res = await downloadFileMobile(fileName, base64Data);
        if (res.success) {
          notify('success', `Monthly Collection exported as: ${fileName}`);
        } else {
          notify('error', "Could not download file directly. Attempting browser download...");
          XLSX.writeFile(wb, fileName);
        }
      } catch (err: any) {
        console.error("Monthly collections export failed:", err);
        notify('error', `Failed to download: ${err.message || 'Unknown error'}`);
      }
    } else {
      XLSX.writeFile(wb, fileName);
      notify('success', `Exported ${fileName} successfully!`);
    }
  };

  const sortedLoans = useMemo(() => {
    let items = isAdmin ? [...loans] : loans.filter(l => 
      (user?.uid && l.userId && l.userId === user.uid) || 
      (user?.email && l.userEmail && l.userEmail.toLowerCase() === user.email.toLowerCase())
    );
    
    if (isAdmin && searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const digitsOnly = query.replace(/\D/g, '');

      items = items.filter(l => {
        const targetUser = allUsers.find(u => 
          (l.userId && u.uid === l.userId) || 
          (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
        );

        // Member details
        if (targetUser?.displayName?.toLowerCase().includes(query)) return true;
        if (targetUser?.phoneNumber?.toLowerCase().includes(query)) return true;
        if (l.userEmail?.toLowerCase().includes(query)) return true;

        // Details / Purpose
        if (l.details?.toLowerCase().includes(query)) return true;

        // Status
        const isPaid = l.status === 'paid';
        if (l.status.toLowerCase().includes(query)) return true;
        if (isPaid && (query.includes('settl') || query === 'paid' || query === 'completed')) return true;
        if (!isPaid && (query.includes('activ') || query === 'pending' || query === 'approved')) return true;

        // Payment mode
        if (l.paymentMode?.toLowerCase().includes(query)) return true;

        // Date strings
        if (l.createdAt?.toDate) {
          const dateStr = format(l.createdAt.toDate(), 'yyyy-MM-dd MMM dd yyyy').toLowerCase();
          if (dateStr.includes(query)) return true;
        }
        if (l.approvedAt?.toDate) {
          const dateStr = format(l.approvedAt.toDate(), 'yyyy-MM-dd MMM dd yyyy').toLowerCase();
          if (dateStr.includes(query)) return true;
        }

        // Calculations for amounts
        const payments = loanPayments.filter(p => p.loanId === l.id);
        const paidPayments = payments.filter(p => p.status === 'paid');
        const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
        const remainingPrincipal = Math.max(0, (l.approvedAmount || l.amount || 0) - totalPrincipalPaid);
        const remainingTotal = calculateLoanRemainingTotal(l, payments);
        const reqAmount = l.amount || 0;
        const appAmount = l.approvedAmount || l.amount || 0;

        // Digits search
        if (digitsOnly) {
          if (reqAmount.toString().includes(digitsOnly)) return true;
          if (appAmount.toString().includes(digitsOnly)) return true;
          if (totalPrincipalPaid.toString().includes(digitsOnly)) return true;
          if (remainingPrincipal.toString().includes(digitsOnly)) return true;
          if (Math.round(remainingTotal).toString().includes(digitsOnly)) return true;
        }

        // Formatted amount search
        const amounts = [
          reqAmount.toLocaleString('en-IN'),
          appAmount.toLocaleString('en-IN'),
          totalPrincipalPaid.toLocaleString('en-IN'),
          remainingPrincipal.toLocaleString('en-IN'),
          Math.round(remainingTotal).toLocaleString('en-IN'),
          `₹${reqAmount.toLocaleString('en-IN')}`,
          `₹${appAmount.toLocaleString('en-IN')}`,
          `₹${totalPrincipalPaid.toLocaleString('en-IN')}`,
          `₹${remainingPrincipal.toLocaleString('en-IN')}`,
          `₹${Math.round(remainingTotal).toLocaleString('en-IN')}`,
          `₹${reqAmount}`,
          `₹${appAmount}`,
          `₹${totalPrincipalPaid}`,
          `₹${remainingPrincipal}`
        ];

        if (amounts.some(a => a.toLowerCase().includes(query))) return true;

        return false;
      });
    }

    if (loanSortConfig.field) {
      items = [...items].sort((a, b) => {
        switch (loanSortConfig.field) {
          case 'name':
            const userA = allUsers.find(u => (a.userId && u.uid === a.userId) || (a.userEmail && u.email?.toLowerCase() === a.userEmail?.toLowerCase()));
            const userB = allUsers.find(u => (b.userId && u.uid === b.userId) || (b.userEmail && u.email?.toLowerCase() === b.userEmail?.toLowerCase()));
            const nameA = userA?.displayName || a.userEmail || '';
            const nameB = userB?.displayName || b.userEmail || '';
            return loanSortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
          case 'amount':
            return loanSortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
          case 'remaining':
            const paymentsA = loanPayments.filter(p => p.loanId === a.id);
            const paymentsB = loanPayments.filter(p => p.loanId === b.id);
            const remA = calculateLoanRemainingTotal(a, paymentsA);
            const remB = calculateLoanRemainingTotal(b, paymentsB);
            return loanSortConfig.direction === 'asc' ? remA - remB : remB - remA;
          case 'status':
            return loanSortConfig.direction === 'asc' ? a.status.localeCompare(b.status) : b.status.localeCompare(a.status);
          case 'monthlyStatus': {
            const getMonthlyStatusRank = (loan: Loan) => {
              const payments = loanPayments.filter(p => p.loanId === loan.id);
              const paidPayments = payments.filter(p => p.status === 'paid');
              const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
              const remainingPrincipal = Math.max(0, (loan.approvedAmount || 0) - totalPrincipalPaid);
              const isFullyPaid = loan.status === 'paid' || remainingPrincipal <= 0;

              const isPaid = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'paid');
              const isPending = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'pending');
              const loanApprovedThisMonth = loan.approvedAt?.toDate && 
                loan.approvedAt.toDate().getMonth() === (repaymentMonth - 1) && 
                loan.approvedAt.toDate().getFullYear() === repaymentYear;
              const isLate = !isFullyPaid && !isPaid && !isPending && new Date().getDate() > 10 && !loanApprovedThisMonth && (repaymentYear < new Date().getFullYear() || (repaymentYear === new Date().getFullYear() && repaymentMonth <= (new Date().getMonth() + 1)));

              if (isPaid || isFullyPaid) return 'PAID';
              if (isPending) return 'AWAITING APPROVAL';
              if (isLate) return 'OVERDUE';
              if (loanApprovedThisMonth) return 'STARTS NEXT MONTH';
              return 'PENDING';
            };
            const statusA = getMonthlyStatusRank(a);
            const statusB = getMonthlyStatusRank(b);
            return loanSortConfig.direction === 'asc' ? statusA.localeCompare(statusB) : statusB.localeCompare(statusA);
          }
          case 'date':
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return loanSortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
          case 'term':
            const termA = a.installments || 10;
            const termB = b.installments || 10;
            return loanSortConfig.direction === 'asc' ? termA - termB : termB - termA;
          case 'interestRate':
            return 0;
          case 'details':
            const detA = a.details || '';
            const detB = b.details || '';
            return loanSortConfig.direction === 'asc' ? detA.localeCompare(detB) : detB.localeCompare(detA);
          case 'paymentMode':
            const modeA = a.paymentMode || getInferredPaymentMode(a) || '';
            const modeB = b.paymentMode || getInferredPaymentMode(b) || '';
            return loanSortConfig.direction === 'asc' ? modeA.localeCompare(modeB) : modeB.localeCompare(modeA);
          default:
            return 0;
        }
      });
    } else {
      items.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateA - dateB;
      });
    }

    return items;
  }, [loans, isAdmin, searchQuery, loanSortConfig, allUsers, loanPayments, repaymentMonth, repaymentYear]);

  const oldestPendingLoanId = useMemo(() => {
    const pending = loans
      .filter(l => l.status === 'pending')
      .sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateA - dateB;
      });
    return pending.length > 0 ? pending[0].id : null;
  }, [loans]);

  const filteredLoanPayments = useMemo(() => {
    let items = isAdmin ? [...loanPayments] : loanPayments.filter(p => 
      (user?.uid && p.userId === user.uid) || 
      (user?.email && p.userEmail?.toLowerCase() === user.email.toLowerCase())
    );
    if (isAdmin && searchQuery && searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      const digitsOnly = query.replace(/\D/g, '');

      items = items.filter(p => {
        const targetUser = allUsers.find(u => 
          (p.userId && u.uid === p.userId) || 
          (p.userEmail && u.email.toLowerCase() === p.userEmail.toLowerCase())
        );

        if (targetUser?.displayName?.toLowerCase().includes(query)) return true;
        if (targetUser?.email?.toLowerCase().includes(query)) return true;
        if (targetUser?.phoneNumber?.toLowerCase().includes(query)) return true;

        if (p.status?.toLowerCase().includes(query)) return true;
        const totalAmount = p.amount + p.interest;

        if (digitsOnly) {
          if (p.amount.toString().includes(digitsOnly)) return true;
          if (p.interest.toString().includes(digitsOnly)) return true;
          if (totalAmount.toString().includes(digitsOnly)) return true;
        }

        const amounts = [
          p.amount.toLocaleString('en-IN'),
          p.interest.toLocaleString('en-IN'),
          totalAmount.toLocaleString('en-IN'),
          `₹${p.amount.toLocaleString('en-IN')}`,
          `₹${p.interest.toLocaleString('en-IN')}`,
          `₹${totalAmount.toLocaleString('en-IN')}`,
          `₹${p.amount}`,
          `₹${p.interest}`,
          `₹${totalAmount}`
        ];

        if (amounts.some(a => a.toLowerCase().includes(query))) return true;

        return false;
      });
    }
    return items;
  }, [loanPayments, isAdmin, searchQuery, allUsers]);

  const generateMemberStatement = async (targetUserId: string) => {
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
        (targetUserId && c.userId && c.userId === targetUserId) || 
        (targetUser.email && c.userEmail && c.userEmail.toLowerCase() === targetUser.email.toLowerCase())
      );
      
      const userLoans = loans.filter(l => 
        (targetUserId && l.userId && l.userId === targetUserId) || 
        (targetUser.email && l.userEmail && l.userEmail.toLowerCase() === targetUser.email.toLowerCase())
      );

      const userLoanPayments = loanPayments.filter(p => 
        (targetUserId && p.userId && p.userId === targetUserId) ||
        (targetUser.email && p.userEmail && p.userEmail.toLowerCase() === targetUser.email.toLowerCase())
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
      doc.text(`Total Savings: Rs. ${totalSaved.toLocaleString('en-IN')}`, 20, 75);
      doc.text(`Total Loan Principal Paid: Rs. ${totalLoanPaid.toLocaleString('en-IN')}`, 20, 82);
      doc.text(`Total Interest Paid: Rs. ${totalInterestPaid.toLocaleString('en-IN')}`, 20, 89);
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
            `Rs. ${(c.amount || 0).toLocaleString('en-IN')}`,
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

            let paymentDateTime = 'N/A';
            if (p.timestamp) {
              try {
                const date = p.timestamp.toDate ? p.timestamp.toDate() : new Date(p.timestamp);
                paymentDateTime = format(date, 'MMM dd, yyyy p');
              } catch (e) {
                console.error("Error formatting timestamp for loan payment:", e);
              }
            }

            return [
              monthName,
              p.year || 'N/A',
              paymentDateTime,
              (p.paymentMethod || 'N/A').toUpperCase(),
              `Rs. ${(p.amount || 0).toLocaleString('en-IN')}`,
              `Rs. ${(p.interest || 0).toLocaleString('en-IN')}`,
              (p.status || 'N/A').toUpperCase()
            ];
          });

        autoTable(doc, {
          startY: finalY + 20,
          head: [['Month', 'Year', 'Date & Time', 'Payment Mode', 'Principal', 'Interest', 'Status']],
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
          head: [['Date & Time', 'Amount', 'Status']],
          body: userLoans.map(l => [
            l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy p') : 'N/A',
            `Rs. ${(l.amount || 0).toLocaleString('en-IN')}`,
            (l.status || 'N/A').toUpperCase()
          ]),
          theme: 'grid',
          headStyles: { fillColor: [79, 70, 229] }
        });
      }

      const fileName = `Unnati_Statement_${(targetUser.displayName || targetUser.email || 'Member').replace(/\s+/g, '_')}.pdf`;
      if (isMobileApp) {
        try {
          const base64Data = doc.output('datauristring').split(',')[1];
          const res = await downloadFileMobile(fileName, base64Data);
          if (res.success) {
            notify('success', `PDF Statement saved locally. Check your Downloads or Documents folder.`);
          } else {
            notify('error', "Could not download file directly. Attempting browser download...");
            doc.save(fileName);
          }
        } catch (err: any) {
          console.error("PDF Mobile download failed:", err);
          notify('error', `Failed to download PDF: ${err.message || 'Unknown error'}`);
        }
      } else {
        doc.save(fileName);
        notify('success', "Statement generated successfully!");
      }
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
    const isOwner = loan.userId === user?.uid || (user?.email && loan.userEmail === user.email);
    if (profile?.role !== 'admin' && !isOwner) return;
    
    setIsSettlingPending(true);
    try {
      const settlementTimestamp = getTimestampFromDateString(settleDate);
      const isActuallyAdmin = profile?.role === 'admin';
      
      // Create a final settlement payment
      await addDoc(collection(db, 'loanPayments'), {
        loanId: loan.id,
        userId: loan.userId,
        userEmail: loan.userEmail,
        month: new Date(settleDate).getMonth() + 1,
        year: new Date(settleDate).getFullYear(),
        amount: settlePrincipal,
        interest: settleInterest,
        status: isActuallyAdmin ? 'paid' : 'pending',
        timestamp: settlementTimestamp,
        approvedAt: isActuallyAdmin ? settlementTimestamp : null,
        paymentMethod: settlePaymentMode,
        paymentMode: settlePaymentMode,
        isSettlement: true
      });

      if (isActuallyAdmin) {
        // Mark loan as paid
        await updateDoc(doc(db, 'loans', loan.id!), { status: 'paid' });
        
        createNotification(loan.userId, "Loan Settled", `Your loan of ₹${loan.approvedAmount?.toLocaleString('en-IN')} has been settled immediately.`, 'loan');
        
        // Get target user for notifications
        const targetUser = allUsers.find(u => u.uid === loan.userId || u.email.toLowerCase() === loan.userEmail.toLowerCase());
        
        // Send Email via API
        if (targetUser?.email) {
          fetch(`${API_BASE_URL}/api/admin/send-loan-closure-email`, {
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
          const message = `*Loan Fully Settled - Unnati Finance*\n\nHi ${targetUser.displayName || 'Member'},\n\nCongratulations! Your loan of ₹${loan.approvedAmount?.toLocaleString('en-IN')} is now *Paid in Full*.\n\n*Settlement Details:*\n- Principal: ₹${settlePrincipal.toLocaleString('en-IN')}\n- Interest: ₹${settleInterest.toLocaleString('en-IN')}\n- Date: ${format(new Date(settleDate), 'MMM dd, yyyy')}\n\nThank you for being a responsible member!`;
          const encodedMessage = encodeURIComponent(message);
          window.open(`https://wa.me/${targetUser.phoneNumber.replace(/\D/g, '')}?text=${encodedMessage}`, '_blank');
        }

        notify('success', "Loan settled immediately with final principal and interest.");
      } else {
        notify('success', "Settlement request submitted for approval!");
        // Find an admin to notify
        const adminUser = allUsers.find(u => u.role === 'admin');
        if (adminUser?.uid) {
          createNotification(adminUser.uid, "Settlement Request", `${profile?.displayName || profile?.email || 'A member'} has requested a one-time loan settlement.`, 'loan');
        }
      }

      setSettlingLoanId(null);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `loans/${loan.id}/settle`);
    } finally {
      setIsSettlingPending(false);
    }
  };

  const approveLoan = async (loan: Loan) => {
    if (profile?.role !== 'admin') return;
    setApprovingLoanForPaymentMode(loan);
    setSelectedDisbursalMode('Online');
  };

  const approveLoanWithMode = async () => {
    if (profile?.role !== 'admin' || !approvingLoanForPaymentMode) return;
    const loan = approvingLoanForPaymentMode;
    try {
      if (loan.amount > financials.availableBalance) {
        notify('error', `Low balance! Available: ₹${financials.availableBalance.toLocaleString('en-IN')}. Required: ₹${loan.amount.toLocaleString('en-IN')}`);
        return;
      }

      // Approve this loan
      await updateDoc(doc(db, 'loans', loan.id!), {
        status: 'approved',
        approvedAmount: loan.amount,
        interestRate: 0.5,
        approvedAt: serverTimestamp(),
        installments: Math.ceil(loan.amount / 5000), // 10 months for 50k
        paymentMode: selectedDisbursalMode
      });

      // Notify user
      createNotification(loan.userId, "Loan Approved", `Your loan of Rs. ${loan.amount} has been approved via ${selectedDisbursalMode}.`, 'loan');

      notify('success', "Loan approved.");
      setApprovingLoanForPaymentMode(null);
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
          createNotification(payment.userId, "Loan Fully Paid", `Congratulations! Your loan of ₹${loan.approvedAmount?.toLocaleString('en-IN')} is now fully paid.`, 'loan');
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

  const payLoanInstallment = async (loan: Loan, month: number, year: number, amount: number, interest: number, method: 'cash' | 'online' = 'online') => {
    if (!user || !profile) return;
    try {
      // Check if there's already a pending payment for this month/year
      const existingPending = loanPayments.find(p => 
        p.loanId === loan.id && 
        p.month === month && 
        p.year === year && 
        p.status === 'pending'
      );

      const mode = method === 'cash' ? 'Cash' : 'Online';

      if (existingPending) {
        await updateDoc(doc(db, 'loanPayments', existingPending.id!), {
          amount,
          interest,
          paymentMethod: mode,
          paymentMode: mode,
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
          paymentMethod: mode,
          paymentMode: mode,
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

  const submitAdminManualRepayment = async () => {
    if (profile?.role !== 'admin' || !adminManualRepayment.loan) return;
    
    try {
      const { loan, month, year, amount, interest, method, paymentDate } = adminManualRepayment;
      const timestamp = getTimestampFromDateString(paymentDate);
      const mode = method === 'cash' ? 'Cash' : 'Online';
      
      // Check if there's already a payment for this month/year
      const existingPayment = loanPayments.find(p => 
        p.loanId === loan.id && 
        p.month === month && 
        p.year === year
      );

      if (existingPayment) {
        await updateDoc(doc(db, 'loanPayments', existingPayment.id!), {
          amount,
          interest,
          paymentMethod: mode,
          paymentMode: mode,
          status: 'paid',
          timestamp: timestamp,
          approvedAt: timestamp
        });
      } else {
        await addDoc(collection(db, 'loanPayments'), {
          loanId: loan.id,
          userId: loan.userId,
          userEmail: loan.userEmail,
          month,
          year,
          amount,
          interest,
          paymentMethod: mode,
          paymentMode: mode,
          status: 'paid',
          timestamp: timestamp,
          approvedAt: timestamp
        });
      }

      // Check if this was the last payment for the loan
      // Note: Since we are using current loanPayments from state, we need to be careful.
      // But typically state will update soon.
      const currentPaidPayments = loanPayments.filter(p => p.loanId === loan.id && p.status === 'paid');
      const totalPrincipalPaid = currentPaidPayments.reduce((acc, p) => acc + p.amount, 0) + (existingPayment?.status === 'paid' ? 0 : amount);
      
      if (loan.approvedAmount && totalPrincipalPaid >= loan.approvedAmount) {
        await updateDoc(doc(db, 'loans', loan.id!), { status: 'paid' });
        createNotification(loan.userId, "Loan Fully Paid", `Congratulations! Your loan of ₹${loan.approvedAmount.toLocaleString('en-IN')} is now fully paid.`, 'loan');
      }

      createNotification(loan.userId, "Loan Payment Recorded", `Admin has recorded your loan payment for ${format(new Date(year, month - 1), 'MMMM yyyy')}.`, 'payment');
      
      notify('success', `Repayment recorded successfully for ${format(new Date(year, month - 1), "MMMM yyyy")}`);
      setAdminManualRepayment(prev => ({ ...prev, isOpen: false }));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, 'loanPayments/admin-manual');
    }
  };

  return (
    <>
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-white flex flex-col items-center justify-center p-6"
          >
            <div className="flex flex-col items-center">
              <div className="relative mb-12">
                <div className="w-48 h-48 flex items-center justify-center relative overflow-hidden">
                  <img 
                    src={LOGO_SRC} 
                    alt="Unnati Logo" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = "https://picsum.photos/seed/growth/512/512";
                    }}
                  />
                </div>
              </div>
              
              <motion.h1 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-4xl font-black tracking-tighter text-[#013125] mb-2"
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
                  className="w-full h-full bg-[#013125]"
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
            </div>
          </motion.div>
        ) : error ? (
          <ErrorBoundary key="error-boundary" error={error} />
        ) : (!profile && !isLocalAdmin) ? (
          <motion.div 
            key="login-screen"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6"
          >
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "max-w-md w-full bg-white p-8 rounded-[2.5rem] shadow-2xl text-center border border-slate-100",
                isMobileVisual && "p-6 rounded-[2rem]"
              )}
            >
              <div className={cn("relative w-40 h-40 mx-auto mb-8", isMobileVisual && "w-32 h-32 mb-6")}>
                <div className="w-full h-full flex items-center justify-center relative z-10 overflow-hidden">
                  <img 
                    src={LOGO_SRC} 
                    alt="Unnati Logo" 
                    className="w-full h-full object-contain"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = "https://picsum.photos/seed/growth/512/512";
                    }}
                  />
                </div>
              </div>
              
              <h1 className={cn("text-4xl font-black text-gray-900 mb-2 tracking-tighter", isMobileVisual && "text-3xl")}>UNNATI</h1>
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
          </motion.div>
        ) : (
          <motion.div 
            key="main-app"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="min-h-screen bg-slate-50 text-slate-900 font-sans overflow-x-hidden"
          >
            <div className="flex flex-col min-h-screen">
              <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className={cn("max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between", isMobileVisual && "px-2.5")}>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 flex items-center justify-center overflow-hidden">
              <img 
                src={LOGO_SRC} 
                alt="Unnati Logo" 
                className="w-full h-full object-contain"
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

      <main className={cn("max-w-6xl mx-auto px-4 sm:px-6 py-8", isMobileVisual && "px-2 py-4")}>
        <div className={cn("mb-8", isMobileVisual && "mb-6")}>
          <h1 className={cn("text-3xl font-black text-slate-900 tracking-tight", isMobileVisual && "text-2xl")}>
            Welcome back, {profile?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'User'}!
          </h1>
          <p className={cn("text-slate-500 font-medium mt-1", isMobileVisual && "text-sm")}>Here's what's happening with your Unnati savings.</p>
        </div>

        {isAdmin && (
          <div className={cn("mb-5", isMobileVisual && "mb-4")}>
            <button
              onClick={() => setIsFinancialInsightsExpanded(prev => !prev)}
              className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-white hover:from-indigo-50/90 hover:to-slate-50 border-2 border-indigo-200/90 rounded-2xl shadow-xs transition-all group select-none text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                  <Zap className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-black text-slate-900 tracking-tight">Financial Insights</h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                      5 Cards
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">Group funds, collections, outstanding loans & liquid balance overview</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-indigo-600 hidden sm:inline">
                  {isFinancialInsightsExpanded ? 'Collapse' : 'Expand'}
                </span>
                <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-200 transition-colors">
                  {isFinancialInsightsExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </div>
              </div>
            </button>
          </div>
        )}

        {(!isAdmin || isFinancialInsightsExpanded) && (
        <div className={cn(
          "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 mb-6",
          !isAdmin && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 max-w-2xl",
          isMobileVisual && "gap-2.5 mb-5"
        )}>
          {/* Card 1: Current Month / Status */}
          <motion.div 
            key="dashboard-card-status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-indigo-200/90 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/50 transition-all flex flex-col justify-between group relative overflow-hidden",
              isMobileVisual && "p-3 rounded-xl"
            )}
          >
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                <div className="w-7.5 h-7.5 rounded-xl bg-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Calendar className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider truncate">
                  {format(new Date(), 'MMM yyyy')}
                </span>
              </div>
              {isAdmin ? (
                <div>
                  <h3 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Monthly Received</h3>
                  <div className="mt-0.5 text-xl sm:text-2xl font-black text-indigo-950 tracking-tight truncate">
                    ₹{adminCurrentMonthTotalReceived.toLocaleString('en-IN')}
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Status ({format(new Date(), 'MMM')})</h3>
                  <div className="mt-1 flex items-center gap-1.5">
                    {hasPaidCurrent ? (
                      <div className="flex items-center gap-1.5 text-emerald-600 font-bold text-sm sm:text-base">
                        <CheckCircle2 className="w-4 h-4" /> Paid
                      </div>
                    ) : hasPendingCurrent ? (
                      <div className="flex items-center gap-1.5 text-amber-600 font-bold text-sm sm:text-base">
                        <Clock className="w-4 h-4" /> Verification
                      </div>
                    ) : isLate ? (
                      <div className="flex items-center gap-1.5 text-red-600 font-bold text-sm sm:text-base">
                        <AlertCircle className="w-4 h-4" /> Overdue
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-amber-600 font-bold text-sm sm:text-base">
                        <Clock className="w-4 h-4" /> Pending
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            {isAdmin && (
              <div className="mt-2.5 pt-2 border-t border-indigo-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Status:</span>
                <div>
                  {hasPaidCurrent ? (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                      <CheckCircle2 className="w-3 h-3" /> Paid
                    </span>
                  ) : hasPendingCurrent ? (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  ) : isLate ? (
                    <span className="inline-flex items-center gap-1 font-bold text-red-600">
                      <AlertCircle className="w-3 h-3" /> Overdue
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                      <Clock className="w-3 h-3" /> Pending
                    </span>
                  )}
                </div>
              </div>
            )}
          </motion.div>

          {!isAdmin ? (
            <motion.div 
              key="dashboard-card-your-savings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className={cn(
                "bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group",
                isMobileVisual && "p-3 rounded-xl"
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">Your Savings</span>
                </div>
                <h3 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Your Contributions</h3>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-950 tracking-tight">
                  ₹{myContributions.reduce((acc, c) => acc + c.amount, 0).toLocaleString('en-IN')}
                </div>
              </div>
            </motion.div>
          ) : (
            /* Card 2: Active Members */
            <motion.div 
              key="dashboard-card-active-members"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className={cn(
                "bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-purple-200/90 hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/50 transition-all flex flex-col justify-between group relative overflow-hidden",
                isMobileVisual && "p-3 rounded-xl"
              )}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-purple-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Users className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-md uppercase tracking-wider truncate">
                    Group Size
                  </span>
                </div>
                <h3 className="text-purple-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Active Members</h3>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-purple-950 tracking-tight truncate">
                  {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).length}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-purple-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Total Sub:</span>
                <span className="font-bold text-purple-700 truncate ml-1">₹{financials.totalCollected.toLocaleString('en-IN')}</span>
              </div>
            </motion.div>
          )}

          {isAdmin && (
            <>
              {/* Card 3: Group Funds */}
              <motion.div 
                key="dashboard-card-group-funds"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 }}
                className={cn(
                  "bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden",
                  isMobileVisual && "p-3 rounded-xl"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider truncate">
                      Savings
                    </span>
                  </div>
                  <h3 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Group Funds</h3>
                  <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-950 tracking-tight truncate">
                    ₹{financials.totalSavings.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-slate-500">Interest:</span>
                  <span className="font-bold text-emerald-700 truncate ml-1">₹{financials.totalInterest.toLocaleString('en-IN')}</span>
                </div>
              </motion.div>

              {/* Card 4: Outstanding Principal */}
              <motion.div 
                key="dashboard-card-outstanding-principal"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 }}
                className={cn(
                  "bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-amber-200/90 hover:border-amber-400 hover:shadow-md hover:shadow-amber-100/50 transition-all flex flex-col justify-between group relative overflow-hidden",
                  isMobileVisual && "p-3 rounded-xl"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <div className="w-7.5 h-7.5 rounded-xl bg-amber-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-md uppercase tracking-wider truncate">
                      Loans
                    </span>
                  </div>
                  <h3 className="text-amber-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Outstanding Loan</h3>
                  <div className="mt-0.5 text-xl sm:text-2xl font-black text-amber-700 tracking-tight truncate">
                    ₹{financials.outstandingPrincipal.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-amber-100/90 flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-slate-500">Active:</span>
                  <span className="font-bold text-amber-800 truncate ml-1">{loans.filter(l => l.status === 'approved').length} loans</span>
                </div>
              </motion.div>

              {/* Card 5: Available Balance */}
              <motion.div 
                key="dashboard-card-available-balance"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className={cn(
                  "bg-gradient-to-br from-cyan-50/90 via-sky-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-cyan-200/90 hover:border-cyan-400 hover:shadow-md hover:shadow-cyan-100/50 transition-all flex flex-col justify-between group relative overflow-hidden col-span-2 sm:col-span-1",
                  isMobileVisual && "p-3 rounded-xl"
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <div className="w-7.5 h-7.5 rounded-xl bg-cyan-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Wallet className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-bold text-cyan-700 bg-cyan-100/90 border border-cyan-200 px-2 py-0.5 rounded-md uppercase tracking-wider truncate">
                      Liquid
                    </span>
                  </div>
                  <h3 className="text-cyan-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Available Balance</h3>
                  <div className="mt-0.5 text-xl sm:text-2xl font-black text-cyan-950 tracking-tight truncate">
                    ₹{financials.availableBalance.toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="mt-2.5 pt-2 border-t border-cyan-100/90 flex items-center justify-between text-[10.5px]">
                  <span className="font-semibold text-slate-500">Liquid Funds</span>
                  <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ready
                  </span>
                </div>
              </motion.div>
            </>
          )}
        </div>
        )}

        {isAdmin && (
          <div className={cn(
            "flex gap-2 mb-8 p-2 bg-gradient-to-r from-slate-100/90 via-indigo-50/50 to-slate-100/90 rounded-2xl w-fit border-2 border-indigo-200/80 shadow-sm",
            isMobileVisual && "w-full overflow-x-auto scrollbar-hide no-scrollbar"
          )}>
            <button 
              onClick={() => setActiveTab('contributions')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'contributions' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              Contributions
              {isAdmin && contributions.some(c => c.status === 'pending') && (
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab('members')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'members' 
                  ? "bg-purple-600 text-white shadow-md shadow-purple-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-purple-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              Members
            </button>
            <button 
              onClick={() => setActiveTab('loans')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'loans' 
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-emerald-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              Loans
              {isAdmin && loans.some(l => l.status === 'pending') && (
                <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab('notices')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'notices' 
                  ? "bg-amber-600 text-white shadow-md shadow-amber-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-amber-700 border border-slate-200/70 shadow-2xs"
              )}
            >
              Notices
            </button>
            <button 
              onClick={() => setActiveTab('monthlyCollection')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'monthlyCollection' 
                  ? "bg-sky-600 text-white shadow-md shadow-sky-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-sky-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              <IndianRupee className="w-4 h-4" />
              Monthly Collection
            </button>
            <button 
              onClick={() => setActiveTab('graphs')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'graphs' 
                  ? "bg-teal-600 text-white shadow-md shadow-teal-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-teal-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              <GraphIcon className="w-4 h-4" />
              Graphs
            </button>
          </div>
        )}

        {!isAdmin && (
          <div className={cn(
            "flex gap-2 mb-8 p-2 bg-gradient-to-r from-slate-100/90 via-indigo-50/50 to-slate-100/90 rounded-2xl w-fit border-2 border-indigo-200/80 shadow-sm",
            isMobileVisual && "w-full overflow-x-auto scrollbar-hide no-scrollbar"
          )}>
            <button 
              onClick={() => setActiveTab('contributions')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'contributions' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              Contributions
            </button>
            <button 
              onClick={() => setActiveTab('loans')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'loans' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              Loans
              {loans.some(l => l.userId === user?.uid && l.status === 'approved') && (
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              )}
            </button>
            <button 
              onClick={() => setActiveTab('graphs')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center gap-2 whitespace-nowrap",
                isMobileVisual && "px-3 py-2 text-xs",
                activeTab === 'graphs' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200/60" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 border border-slate-200/70 shadow-2xs"
              )}
            >
              <GraphIcon className="w-4 h-4" />
              Graphs
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
          <div className="flex flex-col">
            <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5 flex-wrap">
              {isAdmin 
                ? (activeTab === 'contributions' ? 'All Contributions' : activeTab === 'members' ? 'Group Members' : activeTab === 'loans' ? (
                    <span className="inline-flex items-center gap-2 flex-wrap">
                      <span>Loan Applications</span>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/80 tracking-normal">
                        0.5% Interest Rate
                      </span>
                    </span>
                  ) : activeTab === 'graphs' ? 'Data Analytics' : activeTab === 'monthlyCollection' ? 'Monthly Collection Overview' : 'Notice Board') 
                : (activeTab === 'contributions' ? 'Your History' : activeTab === 'graphs' ? 'Your Insights' : 'Loan Dashboard')}
            </h2>
            {isAdmin && activeTab === 'members' && !isSmtpConfigured && (
              <div className="mt-1 flex items-center gap-1.5 text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100 w-fit">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">SMTP Not Configured - Reminders Disabled</span>
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-center">
            {isAdmin && activeTab !== 'graphs' && (
              <form 
                onSubmit={(e) => e.preventDefault()}
                className="relative w-full sm:w-72 md:w-80 group"
              >
                <div className="relative flex items-center bg-gradient-to-r from-white via-indigo-50/25 to-white border-2 border-indigo-200/90 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-100 rounded-2xl shadow-xs transition-all">
                  <Search className="w-4 h-4 text-indigo-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-110 transition-transform" />
                  <input 
                    type="text"
                    placeholder="Search records across tabs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-10 py-2.5 bg-transparent border-0 rounded-2xl text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-0"
                  />
                  {searchQuery && (
                    <button 
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>
            )}
            {isAdmin && activeTab === 'monthlyCollection' && (
              <button 
                type="button"
                onClick={exportMonthlyCollectionsExcel}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs sm:text-xs md:text-sm font-bold tracking-tight whitespace-nowrap transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Export Monthly Collections Spreadsheet"
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>Export Monthly Report</span>
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
            {activeTab === 'contributions' && !isAdmin && (
              <button 
                onClick={() => !hasPaidCurrent && !hasPendingCurrent && setIsAdding(true)}
                disabled={hasPaidCurrent || hasPendingCurrent}
                className={cn(
                  "flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                  (hasPaidCurrent || hasPendingCurrent) 
                    ? "bg-slate-100 text-slate-400 shadow-none border border-slate-200" 
                    : "bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700"
                )}
              >
                <Wallet className="w-5 h-5" /> Pay Now
              </button>
            )}
            {/* Remove the separate Pending div as it's now handled in the button */}
          </div>
        </div>

        {isAdmin && activeTab === 'loans' && (
          <div className="flex flex-wrap gap-2 mb-6 p-2 bg-gradient-to-r from-slate-100/90 via-indigo-50/50 to-slate-100/90 border-2 border-indigo-200/80 rounded-2xl w-fit shadow-xs">
            <button 
              onClick={() => setLoanSubTab('applications')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                loanSubTab === 'applications' 
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-200" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-indigo-600 border border-slate-200/80 shadow-2xs"
              )}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Applications
            </button>
            <button 
              onClick={() => setLoanSubTab('repayments')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                loanSubTab === 'repayments' 
                  ? "bg-emerald-600 text-white shadow-md shadow-emerald-200" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-emerald-600 border border-slate-200/80 shadow-2xs"
              )}
            >
              <IndianRupee className="w-3.5 h-3.5" />
              Loan Repayment
            </button>
            <button 
              onClick={() => setLoanSubTab('breakdown')}
              className={cn(
                "px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                loanSubTab === 'breakdown' 
                  ? "bg-purple-600 text-white shadow-md shadow-purple-200" 
                  : "bg-white/90 text-slate-700 hover:bg-white hover:text-purple-600 border border-slate-200/80 shadow-2xs"
              )}
            >
              <Layers className="w-3.5 h-3.5" />
              Payment Summary
            </button>
          </div>
        )}

        {isAdmin && activeTab === 'members' ? (
          <div className="space-y-6">
            {/* Member Management Actions Collapsible Card */}
            <div className={cn("bg-white rounded-3xl border-2 border-indigo-200/90 shadow-sm transition-all relative z-20", isMemberActionsCollapsed ? "overflow-hidden" : "overflow-visible")}>
              <div 
                onClick={() => setIsMemberActionsCollapsed(!isMemberActionsCollapsed)}
                className={cn(
                  "flex items-center justify-between p-5 sm:p-6 cursor-pointer bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white hover:from-indigo-100 hover:to-indigo-50/50 transition-colors select-none group border-b border-indigo-100/90",
                  isMemberActionsCollapsed ? "rounded-3xl border-b-0" : "rounded-t-3xl"
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                    <UserPlus className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                        Member Management Actions
                        <ChevronDown className={cn("w-4 h-4 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isMemberActionsCollapsed && "-rotate-180")} />
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300/80">
                        Admin
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Add new members individually or via Excel, broadcast reminder notifications, and trigger cloud backups
                    </p>
                  </div>
                </div>
              </div>

              {!isMemberActionsCollapsed && (
                <div className="px-5 sm:px-6 py-6 bg-white rounded-b-3xl overflow-visible">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Add Member Dropdown */}
                    <div className="relative flex-1 sm:flex-none z-30">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowAddMemberDropdown(prev => !prev);
                        }}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 text-sm cursor-pointer"
                      >
                        <Plus className="w-4 h-4" /> Add Member <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", showAddMemberDropdown && "rotate-180")} />
                      </button>
                      
                      {showAddMemberDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowAddMemberDropdown(false);
                            }}
                          />
                          <div className="absolute left-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200/90 py-1.5 z-50 divide-y divide-slate-100/80 animate-in fade-in zoom-in-95 duration-150">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsAddingMember(true);
                                setShowAddMemberDropdown(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-left group"
                            >
                              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                                <UserPlus className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Add Individual</span>
                                <span className="text-[11px] text-slate-500 font-medium">Add a single member manually</span>
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setIsBulkAdding(true);
                                setShowAddMemberDropdown(false);
                              }}
                              className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-left group"
                            >
                              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                                <FileSpreadsheet className="w-4 h-4" />
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Bulk Upload (XLS)</span>
                                <span className="text-[11px] text-slate-500 font-medium">Import members from Excel file</span>
                              </div>
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Export All Button */}
                    <button 
                      onClick={exportAllDataToExcel}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-teal-100 active:scale-95 text-sm"
                      title="Export all member contributions and financial data to Excel"
                    >
                      <FileSpreadsheet className="w-4 h-4" /> Export All
                    </button>

                    {/* Send Reminders Button */}
                    <button 
                      onClick={() => setShowReminderConfirm(true)}
                      disabled={isTriggeringReminders || isSendingReport}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 active:scale-95 disabled:opacity-50 text-sm"
                      title="Send monthly reminders to members who haven't paid"
                    >
                      {isTriggeringReminders ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <Mail className="w-4 h-4" />
                      )}
                      {isTriggeringReminders ? 'Sending...' : 'Send Reminders'}
                    </button>

                    {/* Send Backup Now Button */}
                    <button 
                      onClick={triggerFullBackupReport}
                      disabled={isSendingReport || isTriggeringReminders}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 text-sm"
                      title="Send full financial backup report to jpvenu2000@gmail.com"
                    >
                      {isSendingReport ? (
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <FileDown className="w-4 h-4" />
                      )}
                      {isSendingReport ? 'Generating Backup...' : 'Send Backup Now'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Member Details Collapsible Card */}
            <div className="bg-white rounded-3xl border-2 border-indigo-200/90 shadow-sm overflow-hidden transition-all">
              <div 
                onClick={() => setIsMemberDetailsCollapsed(!isMemberDetailsCollapsed)}
                className="flex items-center justify-between p-5 sm:p-6 cursor-pointer bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white hover:from-indigo-100 hover:to-indigo-50/50 transition-colors select-none group border-b border-indigo-100/90"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                        Member Details
                        <ChevronDown className={cn("w-4 h-4 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isMemberDetailsCollapsed && "-rotate-180")} />
                      </h3>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Overview of registered group members, payment status, contact details, and administration controls
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-1.5 bg-indigo-100 text-indigo-800 rounded-full text-xs font-bold border border-indigo-300/80 shadow-2xs">
                    {sortedMembers.length} Members
                  </span>
                </div>
              </div>

              {!isMemberDetailsCollapsed && (
                <div className="border-t border-slate-100">
                  {/* Desktop Table View */}
                  <div className="hidden lg:block w-full max-w-full overflow-hidden">
                    <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                <table className="w-full min-w-[760px] text-left border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200/80">
                      <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10 border-r border-slate-200/60 select-none">#</th>
                      <th 
                        className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                        onClick={() => handleSortMembers('name')}
                      >
                        <div className="flex items-center gap-1.5">
                          Member
                          {memberSortConfig.field === 'name' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                        onClick={() => handleSortMembers('contact')}
                      >
                        <div className="flex items-center gap-1.5">
                          Contact
                          {memberSortConfig.field === 'contact' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                        onClick={() => handleSortMembers('joinDate')}
                      >
                        <div className="flex items-center gap-1.5">
                          Join Date
                          {memberSortConfig.field === 'joinDate' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                        onClick={() => handleSortMembers('totalPaid')}
                      >
                        <div className="flex items-center gap-1.5">
                          Total Paid
                          {memberSortConfig.field === 'totalPaid' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                        onClick={() => handleSortMembers('status')}
                      >
                        <div className="flex items-center gap-1.5">
                          Status
                          {memberSortConfig.field === 'status' ? (
                            memberSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                          )}
                        </div>
                      </th>
                      <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedMembers.map((u, idx) => {
                      const userContribs = contributions.filter(c => 
                        ((u.uid && c.userId === u.uid) || 
                        (u.email && c.userEmail?.toLowerCase() === u.email.toLowerCase())) &&
                        c.year >= 2026
                      );
                      const totalPaid = userContribs.reduce((acc, c) => acc + c.amount, 0);
                      const paidThisMonth = userContribs.some(c => c.month === currentMonth && c.year === currentYear);
                      // Check if any month from Jan to current month is pending
                      const hasPendingThisYear = Array.from({ length: currentMonth }, (_, i) => i + 1)
                        .some(m => !userContribs.some(c => c.month === m && c.year === currentYear && c.status === 'paid'));
                      
                      return (
                        <motion.tr 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={`desktop-member-${u.id || u.uid || u.email.toLowerCase() || 'mem'}-${idx}`} 
                          className="hover:bg-slate-50/60 transition-colors"
                        >
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <span className="text-xs font-bold text-slate-400">{idx + 1}</span>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                                {u.displayName ? u.displayName[0].toUpperCase() : '?'}
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-sm font-semibold text-slate-900 truncate">{u.displayName || 'Unnamed'}</span>
                                <span className="text-[11px] text-slate-400 font-medium">{u.role.toUpperCase()}</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <div className="flex flex-col min-w-0">
                              <span className="text-sm text-slate-600 truncate">{u.email}</span>
                              <span className="text-xs text-slate-500 font-medium flex items-center gap-1">
                                <Phone className="w-3 h-3 text-indigo-500 shrink-0" />
                                {u.phoneNumber || (u as any).phone || 'No mobile number'}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <span className="text-xs text-slate-500">{u.joinDate}</span>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <span className="text-sm font-bold text-slate-900">₹{totalPaid.toLocaleString('en-IN')}</span>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold",
                              !hasPendingThisYear ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                            )}>
                              {!hasPendingThisYear ? 'Active' : 'Pending'}
                            </span>
                          </td>
                          <td className="px-3 sm:px-3.5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => toggleAdminRole(u)}
                                className={cn(
                                  "p-1.5 rounded-lg transition-all",
                                  u.role === 'admin' ? "text-indigo-600 bg-indigo-50" : "text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                )}
                                title={u.role === 'admin' ? "Remove Admin Access" : "Grant Admin Access"}
                              >
                                <Shield className="w-4 h-4" />
                              </button>
                              {hasPendingThisYear && (
                                <>
                                  <button 
                                    onClick={() => sendWhatsAppReminder(u)}
                                    className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all"
                                    title="WhatsApp Reminder"
                                  >
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                  <button 
                                    onClick={() => sendEmailReminder(u)}
                                    className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
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
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Add Loan"
                              >
                                <IndianRupee className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  setEditingUser(u);
                                  setOriginalEditingEmail(u.uid || u.email);
                                }}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setDeletingUserId(u.uid || u.email)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                title="Delete"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => {
                                  const userId = u.uid || u.email;
                                  setSelectedUserId(userId);
                                  const firstMissing = Array.from({ length: currentMonth }, (_, i) => i + 1)
                                    .find(m => !userContribs.some(c => c.month === m && c.year === currentYear && c.status === 'paid'));
                                  if (firstMissing) setSelectedMonth(firstMissing);
                                  setSelectedYear(currentYear);
                                  setIsAdding(true);
                                }}
                                disabled={!hasPendingThisYear}
                                className={cn(
                                  "ml-1 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                                  !hasPendingThisYear ? "bg-slate-100 text-slate-400" : "text-indigo-600 hover:text-indigo-700 bg-indigo-50"
                                )}
                              >
                                {!hasPendingThisYear ? 'Paid' : 'Record'}
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
            <div className="lg:hidden space-y-4">
              <MobileQuickSort
                options={[
                  { key: 'name', label: 'Name' },
                  { key: 'contact', label: 'Contact' },
                  { key: 'joinDate', label: 'Join Date' },
                  { key: 'totalPaid', label: 'Total Paid' },
                  { key: 'status', label: 'Status' }
                ]}
                activeField={memberSortConfig.field}
                direction={memberSortConfig.direction}
                onSort={handleSortMembers}
                className="mb-1"
              />
              {sortedMembers.map((u, idx) => {
                const userContribs = contributions.filter(c => 
                  ((u.uid && c.userId === u.uid) || 
                  (u.email && c.userEmail?.toLowerCase().trim() === u.email.toLowerCase().trim())) &&
                  c.year >= 2026
                );
                const totalPaid = userContribs.reduce((acc, c) => acc + c.amount, 0);
                const paidThisMonth = userContribs.some(c => c.month === currentMonth && c.year === currentYear);
                const hasPendingThisYear = Array.from({ length: currentMonth }, (_, i) => i + 1)
                  .some(m => !userContribs.some(c => c.month === m && c.year === currentYear && c.status === 'paid'));

                return (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    key={`mobile-member-${u.id || u.uid || u.email.toLowerCase() || 'mob'}-${idx}`}
                    className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                      #{idx + 1}
                    </div>
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-lg">
                          {u.displayName ? u.displayName[0].toUpperCase() : '?'}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 truncate">{u.displayName || 'Unnamed'}</h4>
                          <p className="text-xs text-slate-500 truncate">{u.email}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0",
                        !hasPendingThisYear ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      )}>
                        {!hasPendingThisYear ? 'Active' : 'Pending'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Total Paid</p>
                        <p className="font-bold text-slate-900">₹{totalPaid.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded-2xl">
                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Joined</p>
                        <p className="font-bold text-slate-900 text-sm">{u.joinDate}</p>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-2xl mb-4 flex items-center justify-between">
                      <div className="min-w-0 pr-2">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Mobile Number</p>
                        <p className="font-bold text-slate-900 text-sm mt-0.5 truncate">{u.phoneNumber || (u as any).phone || 'Not Available'}</p>
                      </div>
                      {(u.phoneNumber || (u as any).phone) && (
                        <a 
                          href={`tel:${u.phoneNumber || (u as any).phone}`} 
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-colors shrink-0"
                        >
                          <Phone className="w-3.5 h-3.5" /> Call
                        </a>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {hasPendingThisYear && (
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
                        onClick={() => {
                          setEditingUser(u);
                          setOriginalEditingEmail(u.uid || u.email);
                        }}
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
                          const userId = u.uid || u.email;
                          setSelectedUserId(userId);
                          const firstMissing = Array.from({ length: currentMonth }, (_, i) => i + 1)
                            .find(m => !userContribs.some(c => c.month === m && c.year === currentYear && c.status === 'paid'));
                          if (firstMissing) setSelectedMonth(firstMissing);
                          setSelectedYear(currentYear);
                          setIsAdding(true);
                        }}
                        disabled={!hasPendingThisYear}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
                          !hasPendingThisYear ? "bg-slate-100 text-slate-400 shadow-none border border-slate-200" : "bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700"
                        )}
                      >
                        {!hasPendingThisYear ? 'Payment Recorded' : 'Record Payment'}
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : activeTab === 'loans' ? (
          <div className="space-y-6">
            {isAdmin ? (
              <>
                {loanSubTab === 'applications' ? (
                  <div className="space-y-8">
                    {(() => {
                      const activeLoans = sortedLoans.filter(l => l.status !== 'paid');
                      const completedLoans = sortedLoans.filter(l => l.status === 'paid');

                      const renderLoanApplicationsList = (loanList: Loan[], emptyMessage: string, keyPrefix: string) => (
                        <div className="space-y-4">
                          {/* Desktop Table View */}
                          <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 w-full max-w-full overflow-hidden">
                            <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                              <table className="w-full min-w-[760px] text-left border-collapse whitespace-nowrap">
                                <thead>
                                  <tr className="bg-slate-50/75 border-b border-slate-200/80">
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('date')}
                                    >
                                      <div className="flex items-center gap-1">
                                        #
                                        {loanSortConfig.field === 'date' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('name')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Member
                                        {loanSortConfig.field === 'name' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('amount')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Loan Amount
                                        {loanSortConfig.field === 'amount' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('details')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Details
                                        {loanSortConfig.field === 'details' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('status')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Status
                                        {loanSortConfig.field === 'status' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('date')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Date
                                        {loanSortConfig.field === 'date' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('paymentMode')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Payment Mode
                                        {loanSortConfig.field === 'paymentMode' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {loanList.map((l, idx) => {
                                    const targetUser = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
                                    const isOldestPending = l.id === oldestPendingLoanId;
                                    const hasRepayments = loanPayments.some(p => p.loanId === l.id);
                                    return (
                                      <motion.tr 
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.05 }}
                                        key={`desktop-loan-${keyPrefix}-${l.id || 'loan-d'}-${idx}`} 
                                        className={cn(
                                          "hover:bg-slate-50/60 transition-colors",
                                          isOldestPending && "bg-indigo-50/40"
                                        )}
                                      >
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-bold text-slate-400">{idx + 1}</span>
                                            {isOldestPending && (
                                              <div className="flex items-center gap-1 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold animate-pulse">
                                                <Star className="w-2.5 h-2.5 fill-indigo-600" />
                                                FCFS
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <div className="flex flex-col">
                                            <span className="text-sm font-semibold text-slate-900">{targetUser?.displayName || l.userEmail?.split('@')[0]}</span>
                                            <span className="text-xs text-slate-500">{targetUser?.phoneNumber || l.userEmail}</span>
                                          </div>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <div className="flex flex-col items-start gap-1">
                                            <span className="text-sm font-bold text-slate-900">₹{l.amount.toLocaleString('en-IN')}</span>
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200/80">
                                              {l.installments || 10} Months
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <p className="text-xs text-slate-500 max-w-[170px] truncate" title={l.details}>
                                            {l.details || 'No details'}
                                          </p>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <span className={cn(
                                            "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold",
                                            l.status === 'approved' ? "bg-emerald-50 text-emerald-600" : 
                                            l.status === 'pending' ? "bg-amber-50 text-amber-600" : 
                                            l.status === 'paid' ? "bg-indigo-50 text-indigo-600" :
                                            "bg-red-50 text-red-600"
                                          )}>
                                            {l.status === 'paid' ? 'COMPLETED' : l.status.toUpperCase()}
                                          </span>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <span className="text-xs text-slate-500">
                                            {l.createdAt?.toDate ? format(l.createdAt.toDate(), 'MMM dd, yyyy') : 'Just now'}
                                          </span>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <span className={cn(
                                            "text-xs font-bold",
                                            (l.paymentMode || getInferredPaymentMode(l)) === 'Online' ? "text-indigo-600" : (l.paymentMode || getInferredPaymentMode(l)) === 'Cash' ? "text-amber-600" : "text-slate-400 italic"
                                          )}>
                                            {l.paymentMode || getInferredPaymentMode(l) || '-'}
                                          </span>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 text-right">
                                          <div className="flex items-center justify-end gap-1.5">
                                            {l.status === 'pending' && (
                                              <button 
                                                onClick={() => approveLoan(l)}
                                                className="px-2.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all"
                                              >
                                                Approve
                                              </button>
                                            )}
                                            {(l.status === 'pending' || l.status === 'approved') && !hasRepayments && (
                                              <button 
                                                onClick={() => {
                                                  setDecliningLoanId(l.id!);
                                                  setLoanActionComment('');
                                                }}
                                                className="px-2.5 py-1.5 bg-amber-50 text-amber-600 text-xs font-bold rounded-lg hover:bg-amber-100 transition-all"
                                              >
                                                Decline
                                              </button>
                                            )}
                                            {!hasRepayments && (
                                              <button 
                                                onClick={() => {
                                                  setDeletingLoanId(l.id!);
                                                  setLoanActionComment('');
                                                }}
                                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                title="Delete Application"
                                              >
                                                <Trash2 className="w-4 h-4" />
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </motion.tr>
                                    );
                                  })}
                                  {loanList.length === 0 && (
                                    <tr>
                                      <td colSpan={10} className="px-6 py-8 text-center text-slate-400 italic">
                                        {emptyMessage}
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Mobile Card View */}
                          <div className="lg:hidden space-y-4">
                            <MobileQuickSort
                              options={[
                                { key: 'date', label: 'Date' },
                                { key: 'name', label: 'Member' },
                                { key: 'amount', label: 'Loan Amount' },
                                { key: 'details', label: 'Details' },
                                { key: 'status', label: 'Status' },
                                { key: 'paymentMode', label: 'Payment Mode' }
                              ]}
                              activeField={loanSortConfig.field}
                              direction={loanSortConfig.direction}
                              onSort={handleSortLoans}
                              className="mb-1"
                            />
                            {loanList.map((l, idx) => {
                              const targetUser = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
                              const isOldestPending = l.id === oldestPendingLoanId;
                              const hasRepayments = loanPayments.some(p => p.loanId === l.id);
                              return (
                                <motion.div 
                                  key={`mobile-loan-item-${keyPrefix}-${l.id || idx}-${idx}`}
                                  initial={{ opacity: 0, y: 10 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.05 }}
                                  className={cn(
                                    "bg-white p-6 rounded-3xl shadow-sm border transition-all duration-300 relative overflow-hidden",
                                    isOldestPending ? "border-indigo-300 ring-2 ring-indigo-50 shadow-md" : "border-slate-200"
                                  )}
                                >
                                  <div className={cn(
                                    "absolute top-0 right-0 px-3 py-1 text-[10px] font-bold rounded-bl-xl border-b border-l transition-colors",
                                    isOldestPending ? "bg-indigo-600 text-white border-indigo-700" : "bg-slate-100 text-slate-400 border-slate-200"
                                  )}>
                                    {isOldestPending ? 'FCFS PRIORITY' : `#${idx + 1}`}
                                  </div>
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
                                      {l.status === 'paid' ? 'COMPLETED' : l.status.toUpperCase()}
                                    </span>
                                  </div>
                                  
                                  <div className="mb-4 grid grid-cols-3 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-100">
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Loan Amount</p>
                                      <p className="text-sm font-black text-slate-900">₹{l.amount.toLocaleString('en-IN')}</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Interest Rate</p>
                                      <p className="text-sm font-bold text-indigo-600">0.5%</p>
                                    </div>
                                    <div>
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">Loan Term</p>
                                      <p className="text-sm font-bold text-slate-800">{l.installments || 10} Mo</p>
                                    </div>
                                  </div>

                                  {l.details && (
                                    <div className="mb-4 p-3 bg-slate-50 rounded-xl">
                                      <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Details</p>
                                      <p className="text-xs text-slate-600 leading-relaxed">{l.details}</p>
                                    </div>
                                  )}

                                  <div className="mb-6 grid grid-cols-2 gap-4">
                                    <div>
                                       <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Payment Mode</p>
                                       <p className={cn(
                                         "text-xs font-bold",
                                         (l.paymentMode || getInferredPaymentMode(l)) === 'Online' ? "text-indigo-600" : (l.paymentMode || getInferredPaymentMode(l)) === 'Cash' ? "text-amber-600" : "text-slate-400 italic"
                                       )}>{l.paymentMode || getInferredPaymentMode(l) || 'Pending'}</p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    {l.status === 'pending' && (
                                      <button 
                                        onClick={() => approveLoan(l)}
                                        className="flex-1 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    {(l.status === 'pending' || l.status === 'approved') && !hasRepayments && (
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
                                    {!hasRepayments && (
                                      <button 
                                        onClick={() => {
                                          setDeletingLoanId(l.id!);
                                          setLoanActionComment('');
                                        }}
                                        className="p-2.5 bg-red-50 text-red-600 rounded-xl transition-all"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                </motion.div>
                              );
                            })}
                            {loanList.length === 0 && (
                              <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center text-slate-400 italic text-sm">
                                {emptyMessage}
                              </div>
                            )}
                          </div>
                        </div>
                      );

                      return (
                        <>
                          {/* Approved Applications Section */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-1">
                              <button 
                                type="button"
                                onClick={() => setIsActiveLoansExpanded(!isActiveLoansExpanded)}
                                className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-white hover:from-indigo-100 hover:to-indigo-50/50 border-2 border-indigo-200/90 rounded-xl transition-all cursor-pointer group text-left select-none shadow-2xs"
                              >
                                <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                                  <FileText className="w-3.5 h-3.5" />
                                </div>
                                <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-indigo-600 transition-colors">Approved Applications</h3>
                                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 border border-indigo-300/80 rounded-full text-xs font-bold">
                                  {activeLoans.length}
                                </span>
                                <ChevronDown className={cn("w-4 h-4 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isActiveLoansExpanded && "-rotate-90")} />
                              </button>
                            </div>
                            {isActiveLoansExpanded && renderLoanApplicationsList(activeLoans, "No approved loan applications found.", "active")}
                          </div>

                          {/* Repaid Applications Section */}
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-1 pt-2">
                              <button 
                                type="button"
                                onClick={() => setIsCompletedLoansExpanded(!isCompletedLoansExpanded)}
                                className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-white hover:from-emerald-100 hover:to-emerald-50/50 border-2 border-emerald-200/90 rounded-xl transition-all cursor-pointer group text-left select-none shadow-2xs"
                              >
                                <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </div>
                                <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors">Repaid Applications</h3>
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300/80 rounded-full text-xs font-bold">
                                  {completedLoans.length}
                                </span>
                                <ChevronDown className={cn("w-4 h-4 text-emerald-600 group-hover:text-emerald-700 transition-transform duration-200", !isCompletedLoansExpanded && "-rotate-90")} />
                              </button>
                            </div>
                            {isCompletedLoansExpanded && renderLoanApplicationsList(completedLoans, "No repaid applications found.", "completed")}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : loanSubTab === 'repayments' ? (
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
                            const uniqueKey = `pending-repayment-${p.id || 'repay'}-${p.userId || 'user'}-${idx}`;
                            return (
                              <div key={uniqueKey} className="bg-white p-4 rounded-2xl border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative overflow-hidden">
                                <div className="absolute top-0 right-0 px-2 py-0.5 bg-amber-50 text-[8px] font-bold text-amber-400 rounded-bl-lg border-b border-l border-amber-100 z-10">
                                  #{idx + 1}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center font-bold">
                                    {targetUser?.displayName ? targetUser.displayName[0].toUpperCase() : '?'}
                                  </div>
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">{targetUser?.displayName || p.userId}</p>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                      {format(new Date(p.year, p.month - 1), 'MMMM yyyy')} • Principal: ₹{p.amount.toLocaleString('en-IN')} • Interest: ₹{p.interest.toLocaleString('en-IN')}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-4">
                                  <div className="text-right">
                                    <p className="text-sm font-black text-slate-900">₹{(p.amount + p.interest).toLocaleString('en-IN')}</p>
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



                    {/* Summary Section / Loan Overview */}
                    <div className="mb-6 space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <button
                          type="button"
                          onClick={() => setIsLoanOverviewExpanded(!isLoanOverviewExpanded)}
                          className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gradient-to-r from-indigo-50/70 via-slate-50 to-white hover:from-indigo-100 hover:to-indigo-50/50 border-2 border-indigo-200/90 rounded-xl transition-all cursor-pointer group text-left select-none shadow-2xs"
                        >
                          <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                            <Layers className="w-3.5 h-3.5" />
                          </div>
                          <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-indigo-600 transition-colors">Loan Overview</h3>
                          <ChevronDown className={cn("w-4 h-4 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isLoanOverviewExpanded && "-rotate-90")} />
                        </button>
                      </div>

                      {isLoanOverviewExpanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-3.5">
                          {/* Card 1: Active Loans (Blue) */}
                          <div className="bg-gradient-to-br from-blue-50/90 via-blue-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-blue-200/90 hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-blue-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <Users className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Active
                                </span>
                              </div>
                              <h4 className="text-blue-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Active Loans</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-blue-950 tracking-tight">
                                {loans.filter(l => l.status === 'approved').length}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-blue-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Status:</span>
                              <span className="font-bold text-blue-700">Open Accounts</span>
                            </div>
                          </div>

                          {/* Card 2: Total Loan Issued (Purple) */}
                          <div className="bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-purple-200/90 hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-purple-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <CreditCard className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Disbursed
                                </span>
                              </div>
                              <h4 className="text-purple-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Loan Issued</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-purple-950 tracking-tight truncate">
                                ₹{financials.totalLoanIssued.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-purple-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Cumulative:</span>
                              <span className="font-bold text-purple-700">All Time</span>
                            </div>
                          </div>

                          {/* Card 3: Loan Paid (Emerald) */}
                          <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <CheckCircle2 className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Recovered
                                </span>
                              </div>
                              <h4 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Loan Paid</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate">
                                ₹{financials.totalLoanPaid.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Principal:</span>
                              <span className="font-bold text-emerald-700">Repaid</span>
                            </div>
                          </div>

                          {/* Card 4: Interest Paid (Amber) */}
                          <div className="bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-amber-200/90 hover:border-amber-400 hover:shadow-md hover:shadow-amber-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-amber-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <Percent className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Interest
                                </span>
                              </div>
                              <h4 className="text-amber-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Interest Paid</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-amber-700 tracking-tight truncate">
                                ₹{financials.totalInterest.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-amber-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Income:</span>
                              <span className="font-bold text-amber-700">Earned</span>
                            </div>
                          </div>

                          {/* Card 5: Outstanding Principal (Rose) */}
                          <div className="bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-rose-200/90 hover:border-rose-400 hover:shadow-md hover:shadow-rose-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-rose-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <AlertCircle className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-rose-700 bg-rose-100/90 border border-rose-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Principal
                                </span>
                              </div>
                              <h4 className="text-rose-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Outstanding Principal</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-rose-700 tracking-tight truncate">
                                ₹{financials.outstandingPrincipal.toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-rose-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Balance:</span>
                              <span className="font-bold text-rose-700">Due</span>
                            </div>
                          </div>

                          {/* Card 6: Total Outstanding with Interest (Teal) */}
                          <div className="bg-gradient-to-br from-teal-50/90 via-cyan-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-teal-200/90 hover:border-teal-400 hover:shadow-md hover:shadow-teal-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
                            <div>
                              <div className="flex items-center justify-between gap-1.5 mb-2.5">
                                <div className="w-7.5 h-7.5 rounded-xl bg-teal-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                                  <IndianRupee className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-bold text-teal-800 bg-teal-100/90 border border-teal-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                                  Total Due
                                </span>
                              </div>
                              <h4 className="text-teal-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Outstanding (Inc. Int)</h4>
                              <div className="mt-0.5 text-xl sm:text-2xl font-black text-teal-950 tracking-tight truncate">
                                ₹{loans.filter(l => l.status === 'approved').reduce((acc, l) => {
                                  const payments = loanPayments.filter(p => p.loanId === l.id);
                                  return acc + calculateLoanRemainingTotal(l, payments);
                                }, 0).toLocaleString('en-IN')}
                              </div>
                            </div>
                            <div className="mt-2.5 pt-2 border-t border-teal-100/90 flex items-center justify-between text-[10.5px]">
                              <span className="font-semibold text-slate-500">Total:</span>
                              <span className="font-bold text-teal-700">Principal + Int</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Separate Active and Completed Loans Sections */}
                    {(() => {
                      const activeLoansList = sortedLoans.filter(l => l.status === 'approved');
                      const completedLoansList = sortedLoans.filter(l => l.status === 'paid');

                      const renderLoanList = (loanList: Loan[], keyPrefix: string) => (
                        <div className="space-y-4">
                          {/* Desktop Table View */}
                          <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 w-full max-w-full overflow-hidden">
                            <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                              <table className="w-full min-w-[800px] text-left border-collapse whitespace-nowrap">
                                <thead>
                                  <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                    <th 
                                      className="px-4 py-3.5 w-12 text-center border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('date')}
                                    >
                                      <div className="flex items-center justify-center gap-1">
                                        #
                                        {loanSortConfig.field === 'date' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-3.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('name')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Member
                                        {loanSortConfig.field === 'name' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th 
                                      className="px-4 py-3.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('remaining')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Loan Balance
                                        {loanSortConfig.field === 'remaining' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th className="px-4 py-3.5 border-r border-slate-200/60">
                                      Progress
                                    </th>
                                    <th 
                                      className="px-4 py-3.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      onClick={() => handleSortLoans('monthlyStatus')}
                                    >
                                      <div className="flex items-center gap-1.5">
                                        Monthly Status ({format(new Date(repaymentYear, repaymentMonth - 1, 1), 'MMM')})
                                        {loanSortConfig.field === 'monthlyStatus' ? (
                                          loanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                        ) : (
                                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                        )}
                                      </div>
                                    </th>
                                    <th className="px-4 py-3.5 text-right">
                                      Actions
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {loanList.map((l, idx) => {
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
                                    const isPaidThisMonth = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'paid');
                                    const isPendingThisMonth = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'pending');
                                    const loanApprovedThisMonth = l.approvedAt?.toDate && 
                                      l.approvedAt.toDate().getMonth() === (repaymentMonth - 1) && 
                                      l.approvedAt.toDate().getFullYear() === repaymentYear;
                                    const isFullyPaid = l.status === 'paid' || remainingPrincipal <= 0 || remainingTotal <= 0;
                                    const isLate = !isFullyPaid && !isPaidThisMonth && !isPendingThisMonth && new Date().getDate() > 10 && !loanApprovedThisMonth && (repaymentYear < new Date().getFullYear() || (repaymentYear === new Date().getFullYear() && repaymentMonth <= (new Date().getMonth() + 1)));

                                    return (
                                      <React.Fragment key={`repayment-loan-frag-${keyPrefix}-${l.id || 'repay'}-${idx}`}>
                                        <tr className="hover:bg-slate-50/70 transition-colors">
                                          <td className="px-4 py-3.5 text-center font-bold text-slate-400 text-xs border-r border-slate-200/60">
                                            {idx + 1}
                                          </td>
                                          <td className="px-4 py-3.5 border-r border-slate-200/60">
                                            <div className="flex items-center gap-3">
                                              <div className="w-9 h-9 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-sm shrink-0">
                                                {targetUser?.displayName ? targetUser.displayName[0].toUpperCase() : '?'}
                                              </div>
                                              <div className="min-w-0">
                                                <h4 className="font-bold text-slate-900 text-sm truncate">{targetUser?.displayName || l.userEmail}</h4>
                                                <p className="text-xs text-slate-500 truncate">
                                                  {targetUser?.phoneNumber || l.userEmail || '-'}
                                                </p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3.5 border-r border-slate-200/60">
                                            <div>
                                              <p className="font-bold text-indigo-600 text-sm">₹{remainingTotal.toLocaleString('en-IN')}</p>
                                              <p className="text-[11px] text-slate-400 font-medium">₹{remainingPrincipal.toLocaleString('en-IN')} Principal</p>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3.5 border-r border-slate-200/60">
                                            <div>
                                              <p className="font-bold text-slate-900 text-xs">{paidPayments.length} / {l.installments} Paid</p>
                                              <div className="w-24 bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                                <div 
                                                  className="bg-indigo-600 h-full rounded-full transition-all duration-300" 
                                                  style={{ width: `${Math.min(100, (paidPayments.length / (l.installments || 10)) * 100)}%` }}
                                                />
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3.5 border-r border-slate-200/60">
                                            <span className={cn(
                                              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border",
                                              (isPaidThisMonth || isFullyPaid) ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                                              isPendingThisMonth ? "bg-amber-50 text-amber-600 border-amber-200" :
                                              isLate ? "bg-red-50 text-red-600 border-red-200" : 
                                              loanApprovedThisMonth ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-red-50 text-red-600 border-red-200"
                                            )}>
                                              {(isPaidThisMonth || isFullyPaid) ? 'PAID' : isPendingThisMonth ? 'AWAITING APPROVAL' : isLate ? 'OVERDUE' : loanApprovedThisMonth ? 'STARTS NEXT MONTH' : 'PENDING'}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3.5 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                              {l.status !== 'paid' && targetUser && (
                                                <div className="flex items-center bg-slate-50 border border-slate-200/80 rounded-xl p-1 shadow-xs gap-1">
                                                  <button 
                                                    onClick={() => setSettlingLoanId(l.id!)}
                                                    className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 rounded-lg transition-all cursor-pointer"
                                                    title="Settle Loan Immediately"
                                                  >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                  </button>
                                                  <button 
                                                    onClick={() => sendLoanWhatsAppReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                                    className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/70 rounded-lg transition-all cursor-pointer"
                                                    title="WhatsApp Reminder"
                                                  >
                                                    <MessageSquare className="w-4 h-4" />
                                                  </button>
                                                  <button 
                                                    onClick={() => sendLoanEmailReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                                    className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100/70 rounded-lg transition-all cursor-pointer"
                                                    title="Email Reminder"
                                                  >
                                                    <Mail className="w-4 h-4" />
                                                  </button>
                                                </div>
                                              )}
                                              <button 
                                                onClick={() => setSelectedLoan(selectedLoan?.id === l.id ? null : l)}
                                                className={cn(
                                                  "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border shadow-xs cursor-pointer",
                                                  selectedLoan?.id === l.id ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-indigo-100" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                                )}
                                              >
                                                {selectedLoan?.id === l.id ? 'Hide Details' : 'View Schedule'}
                                              </button>
                                            </div>
                                          </td>
                                        </tr>

                                        {/* Expanded Schedule Row */}
                                        {selectedLoan?.id === l.id && (
                                          <tr className="bg-slate-50/40">
                                            <td colSpan={6} className="p-4 sm:p-6 border-t border-b border-slate-200/80">
                                              <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
                                                <div className="p-4 bg-slate-50/80 border-b border-slate-200/80 flex items-center justify-between">
                                                  <h4 className="font-bold text-sm text-slate-900">Repayment Schedule — {targetUser?.displayName || l.userEmail}</h4>
                                                  <span className="text-xs font-bold text-indigo-600">{paidPayments.length} / {l.installments} Installments Paid</span>
                                                </div>
                                                <div className="p-4 space-y-2">
                                                  {(() => {
                                                    const approvedAmount = l.approvedAmount || 0;
                                                    const installments = l.installments || 10;
                                                    const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();

                                                    // Find settlement month for fully paid loans
                                                    const settlement = l.status === 'paid' ? [...payments].filter(p => p.status === 'paid').sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;

                                                    return Array.from({ length: installments }).map((_, i) => {
                                                      const installmentNum = i + 1;
                                                      const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                                      const installmentMonth = installmentDate.getMonth() + 1;
                                                      const installmentYear = installmentDate.getFullYear();

                                                      // Hide installments strictly following the settlement month
                                                      if (settlement && (installmentYear > (settlement.year || 0) || (installmentYear === (settlement.year || 0) && installmentMonth > (settlement.month || 0)))) {
                                                        return null;
                                                      }

                                                      const payment = payments.find(p => p.month === installmentMonth && p.year === installmentYear);
                                                      const settlementPayment = l.status === 'paid' ? [...payments].sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;
                                                      const displayPayment = payment || settlementPayment;
                                                      const isPaid = l.status === 'paid' || payment?.status === 'paid';
                                                      const isPending = !isPaid && payment?.status === 'pending';
                                                      
                                                      // Calculate interest based on planned reducing balance
                                                      const scheduledPrincipal = approvedAmount / installments;
                                                      const plannedRemainingPrincipal = Math.max(0, approvedAmount - (i * scheduledPrincipal));
                                                      const interest = Math.round(plannedRemainingPrincipal * 0.005);
                                                      const principalToDisplay = (isPaid || isPending) ? (payment?.amount || (isPaid ? scheduledPrincipal : 0)) : scheduledPrincipal;
                                                      const interestToDisplay = (isPaid || isPending) ? (payment?.interest ?? (isPaid ? interest : 0)) : interest;
                                                      const total = principalToDisplay + interestToDisplay;

                                                      return (
                                                        <div key={`admin-loan-schedule-${l.id || 'loan'}-${idx}-${i}`} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-100">
                                                          <div className="flex items-center gap-3">
                                                            <span className="text-xs font-bold text-slate-400 w-6">{installmentNum}.</span>
                                                            <div>
                                                              <p className="text-sm font-bold text-slate-900">{format(installmentDate, 'MMMM yyyy')}</p>
                                                              <p className="text-[10px] text-slate-500">₹{principalToDisplay.toLocaleString('en-IN')} + ₹{interestToDisplay.toLocaleString('en-IN')} Int.</p>
                                                            </div>
                                                          </div>
                                                          <div className="flex items-center gap-4">
                                                            <div className="w-16 px-1">
                                                              <p className="text-[10px] font-bold text-slate-400 uppercase">Mode</p>
                                                              <p className={cn(
                                                                "text-xs font-bold",
                                                                displayPayment?.paymentMode === 'Online' ? "text-indigo-600" : displayPayment?.paymentMode === 'Cash' ? "text-amber-600" : "text-slate-300 italic"
                                                              )}>
                                                                {displayPayment?.paymentMode || (isPaid || isPending ? (displayPayment?.paymentMethod || 'Online') : '-')}
                                                              </p>
                                                            </div>
                                                            <div className="w-20 px-1 text-center">
                                                              <p className="text-[10px] font-bold text-slate-400 uppercase">Paid On</p>
                                                              <p className="text-xs font-bold text-slate-600">
                                                                {isPaid ? (
                                                                  displayPayment?.timestamp?.toDate ? format(displayPayment.timestamp.toDate(), 'dd MMM yy') :
                                                                  displayPayment?.approvedAt?.toDate ? format(displayPayment.approvedAt.toDate(), 'dd MMM yy') : '-'
                                                                ) : '-'}
                                                              </p>
                                                            </div>
                                                            <span className="text-sm font-black text-slate-900 w-20 text-right">₹{total.toLocaleString('en-IN')}</span>
                                                            <div className="flex items-center gap-2">
                                                              {isPaid && (
                                                                <button 
                                                                  onClick={() => setDeletingRepaymentId(payment.id!)}
                                                                  className="p-1 text-slate-400 hover:text-red-600 transition-colors"
                                                                  title="Delete Repayment Record"
                                                                >
                                                                  <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                              )}
                                                              {!isPaid && !isPending && isAdmin && (
                                                                <button 
                                                                  onClick={() => setAdminManualRepayment({
                                                                    isOpen: true,
                                                                    loan: l,
                                                                    month: installmentMonth,
                                                                    year: installmentYear,
                                                                    amount: scheduledPrincipal,
                                                                    interest: interest,
                                                                    method: 'cash',
                                                                    paymentDate: format(new Date(), 'yyyy-MM-dd')
                                                                  })}
                                                                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all border border-indigo-100/50"
                                                                  title="Record Payment Manually"
                                                                >
                                                                  <PlusCircle className="w-4 h-4" />
                                                                </button>
                                                              )}
                                                            </div>
                                                          </div>
                                                        </div>
                                                      );
                                                    });
                                                  })()}
                                                </div>
                                              </div>
                                            </td>
                                          </tr>
                                        )}
                                      </React.Fragment>
                                    );
                                  })}
                                  {loanList.length === 0 && (
                                    <tr>
                                      <td colSpan={6} className="px-6 py-8 text-center text-slate-400 italic">
                                        No loan records found in this section
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Mobile View Cards */}
                          <div className="lg:hidden space-y-4">
                            <MobileQuickSort
                              options={[
                                { key: 'date', label: 'Date' },
                                { key: 'name', label: 'Member' },
                                { key: 'remaining', label: 'Loan Balance' },
                                { key: 'monthlyStatus', label: 'Monthly Status' }
                              ]}
                              activeField={loanSortConfig.field}
                              direction={loanSortConfig.direction}
                              onSort={handleSortLoans}
                              className="mb-1"
                            />
                            {loanList.map((l, idx) => {
                              const payments = loanPayments.filter(p => p.loanId === l.id);
                              const paidPayments = payments.filter(p => p.status === 'paid');
                              const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
                              const remainingPrincipal = Math.max(0, l.approvedAmount! - totalPrincipalPaid);
                              const remainingTotal = calculateLoanRemainingTotal(l, payments);
                              const targetUser = allUsers.find(u => 
                                (l.userId && u.uid === l.userId) || 
                                (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
                              );
                              
                              const principal = l.approvedAmount! / (l.installments || 10);
                              const interest = remainingPrincipal * 0.005;
                              const currentTotal = principal + interest;
                              const isPaidThisMonth = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'paid');
                              const isPendingThisMonth = payments.some(p => p.month === repaymentMonth && p.year === repaymentYear && p.status === 'pending');
                              const loanApprovedThisMonth = l.approvedAt?.toDate && 
                                l.approvedAt.toDate().getMonth() === (repaymentMonth - 1) && 
                                l.approvedAt.toDate().getFullYear() === repaymentYear;
                              const isFullyPaid = l.status === 'paid' || remainingPrincipal <= 0 || remainingTotal <= 0;
                              const isLate = !isFullyPaid && !isPaidThisMonth && !isPendingThisMonth && new Date().getDate() > 10 && !loanApprovedThisMonth && (repaymentYear < new Date().getFullYear() || (repaymentYear === new Date().getFullYear() && repaymentMonth <= (new Date().getMonth() + 1)));

                              return (
                                <motion.div 
                                  key={`repayment-loan-mobile-${keyPrefix}-${l.id || 'repay'}-${idx}`}
                                  initial={{ opacity: 0, y: 15 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: idx * 0.04 }}
                                  className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden relative"
                                >
                                  <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                                    #{idx + 1}
                                  </div>
                                  <div className="p-5 flex flex-col gap-4">
                                    <div className="flex items-center justify-between pr-8">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-base shrink-0">
                                          {targetUser?.displayName ? targetUser.displayName[0].toUpperCase() : '?'}
                                        </div>
                                        <div className="min-w-0">
                                          <h4 className="font-bold text-slate-900 text-sm truncate">{targetUser?.displayName || l.userEmail}</h4>
                                          <p className="text-xs text-slate-500 truncate">
                                            {targetUser?.phoneNumber || l.userEmail || '-'}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Loan Balance</p>
                                        <p className="font-bold text-indigo-600 text-sm">₹{remainingTotal.toLocaleString('en-IN')}</p>
                                        <p className="text-[10px] text-slate-400">₹{remainingPrincipal.toLocaleString('en-IN')} Principal</p>
                                      </div>
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Progress</p>
                                        <p className="font-bold text-slate-900">{paidPayments.length} / {l.installments} Paid</p>
                                      </div>
                                      <div className="col-span-2">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Monthly Status</p>
                                        <span className={cn(
                                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border",
                                          (isPaidThisMonth || isFullyPaid) ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                                          isPendingThisMonth ? "bg-amber-50 text-amber-600 border-amber-200" :
                                          isLate ? "bg-red-50 text-red-600 border-red-200" : 
                                          loanApprovedThisMonth ? "bg-blue-50 text-blue-600 border-blue-200" : "bg-red-50 text-red-600 border-red-200"
                                        )}>
                                          {(isPaidThisMonth || isFullyPaid) ? 'PAID' : isPendingThisMonth ? 'AWAITING APPROVAL' : isLate ? 'OVERDUE' : loanApprovedThisMonth ? 'STARTS NEXT MONTH' : 'PENDING'}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                      {l.status !== 'paid' && targetUser && (
                                        <div className="flex items-center bg-slate-50 border border-slate-200/80 rounded-xl p-1 shadow-xs gap-1">
                                          <button 
                                            onClick={() => setSettlingLoanId(l.id!)}
                                            className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-100/70 rounded-lg transition-all"
                                            title="Settle Loan Immediately"
                                          >
                                            <CheckCircle2 className="w-4 h-4" />
                                          </button>
                                          <button 
                                            onClick={() => sendLoanWhatsAppReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-100/70 rounded-lg transition-all"
                                            title="WhatsApp Reminder"
                                          >
                                            <MessageSquare className="w-4 h-4" />
                                          </button>
                                          <button 
                                            onClick={() => sendLoanEmailReminder(targetUser, currentTotal, format(new Date(), 'MMMM yyyy'))}
                                            className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100/70 rounded-lg transition-all"
                                            title="Email Reminder"
                                          >
                                            <Mail className="w-4 h-4" />
                                          </button>
                                        </div>
                                      )}
                                      <button 
                                        onClick={() => setSelectedLoan(selectedLoan?.id === l.id ? null : l)}
                                        className={cn(
                                          "px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap border shadow-xs",
                                          selectedLoan?.id === l.id ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-indigo-100" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                                        )}
                                      >
                                        {selectedLoan?.id === l.id ? 'Hide Details' : 'View Schedule'}
                                      </button>
                                    </div>
                                  </div>

                                  {selectedLoan?.id === l.id && (
                                    <div className="px-4 pb-4 sm:px-5 sm:pb-5 border-t border-slate-100 bg-slate-50/50">
                                      {/* Schedule Header */}
                                      <div className="mt-3 p-3.5 bg-white rounded-2xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-2 shadow-xs">
                                        <div>
                                          <h4 className="font-bold text-xs sm:text-sm text-slate-900">
                                            Repayment Schedule — {targetUser?.displayName || l.userEmail}
                                          </h4>
                                        </div>
                                        <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                                          {paidPayments.length} / {l.installments || 10} Installments Paid
                                        </span>
                                      </div>

                                      <div className="mt-3 space-y-2.5">
                                        {(() => {
                                          const approvedAmount = l.approvedAmount || 0;
                                          const installments = l.installments || 10;
                                          const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();

                                          const settlement = l.status === 'paid' ? [...payments].filter(p => p.status === 'paid').sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;

                                          return Array.from({ length: installments }).map((_, i) => {
                                            const installmentNum = i + 1;
                                            const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                            const installmentMonth = installmentDate.getMonth() + 1;
                                            const installmentYear = installmentDate.getFullYear();

                                            if (settlement && (installmentYear > (settlement.year || 0) || (installmentYear === (settlement.year || 0) && installmentMonth > (settlement.month || 0)))) {
                                              return null;
                                            }

                                            const payment = payments.find(p => p.month === installmentMonth && p.year === installmentYear);
                                            const settlementPayment = l.status === 'paid' ? [...payments].sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;
                                            const displayPayment = payment || settlementPayment;
                                            const isPaid = l.status === 'paid' || payment?.status === 'paid';
                                            const isPending = !isPaid && payment?.status === 'pending';
                                            
                                            const scheduledPrincipal = approvedAmount / installments;
                                            const plannedRemainingPrincipal = Math.max(0, approvedAmount - (i * scheduledPrincipal));
                                            const interest = Math.round(plannedRemainingPrincipal * 0.005);
                                            const principalToDisplay = (isPaid || isPending) ? (payment?.amount || (isPaid ? scheduledPrincipal : 0)) : scheduledPrincipal;
                                            const interestToDisplay = (isPaid || isPending) ? (payment?.interest ?? (isPaid ? interest : 0)) : interest;
                                            const total = principalToDisplay + interestToDisplay;

                                            const paidOnDate = isPaid ? (
                                              displayPayment?.timestamp?.toDate ? format(displayPayment.timestamp.toDate(), 'dd MMM yy') :
                                              displayPayment?.approvedAt?.toDate ? format(displayPayment.approvedAt.toDate(), 'dd MMM yy') : '-'
                                            ) : '-';

                                            const targetPaymentId = payment?.id || displayPayment?.id;

                                            return (
                                              <div key={`admin-loan-schedule-mob-${l.id || 'loan'}-${idx}-${i}`} className="p-3.5 bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col gap-2.5 relative overflow-hidden">
                                                <div className="absolute top-0 right-0 px-2.5 py-0.5 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-lg border-b border-l border-slate-200">
                                                  #{installmentNum}
                                                </div>
                                                <div className="flex items-center justify-between pr-8">
                                                  <div className="flex items-center gap-2">
                                                    <div className={cn(
                                                      "w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs shrink-0",
                                                      isPaid ? "bg-emerald-100 text-emerald-600" : isPending ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500"
                                                    )}>
                                                      {installmentNum}
                                                    </div>
                                                    <div>
                                                      <p className="text-xs font-bold text-slate-900">{format(installmentDate, 'MMMM yyyy')}</p>
                                                      <p className="text-[10px] text-slate-500">₹{principalToDisplay.toLocaleString('en-IN')} + ₹{interestToDisplay.toLocaleString('en-IN')} Int.</p>
                                                    </div>
                                                  </div>
                                                  <div className="text-right flex items-center gap-2">
                                                    <span className="text-xs sm:text-sm font-black text-slate-900">₹{total.toLocaleString('en-IN')}</span>
                                                    {isPaid && targetPaymentId && (
                                                      <button 
                                                        onClick={() => setDeletingRepaymentId(targetPaymentId)}
                                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                                        title="Delete Repayment Record"
                                                      >
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-[11px] bg-slate-50/70 p-2.5 rounded-xl">
                                                  <div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Mode</span>
                                                    <span className={cn(
                                                      "font-bold",
                                                      displayPayment?.paymentMode === 'Online' ? "text-indigo-600" : displayPayment?.paymentMode === 'Cash' ? "text-amber-600" : "text-slate-400 italic"
                                                    )}>
                                                      {displayPayment?.paymentMode || (isPaid || isPending ? (displayPayment?.paymentMethod || 'Online') : '-')}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase block">Paid On</span>
                                                    <span className="font-bold text-slate-700">
                                                      {paidOnDate}
                                                    </span>
                                                  </div>
                                                </div>

                                                {!isPaid && !isPending && isAdmin && (
                                                  <div className="pt-1">
                                                    <button 
                                                      onClick={() => setAdminManualRepayment({
                                                        isOpen: true,
                                                        loan: l,
                                                        month: installmentMonth,
                                                        year: installmentYear,
                                                        amount: scheduledPrincipal,
                                                        interest: interest,
                                                        method: 'cash',
                                                        paymentDate: format(new Date(), 'yyyy-MM-dd')
                                                      })}
                                                      className="w-full flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all border border-indigo-100 cursor-pointer"
                                                      title="Record Payment Manually"
                                                    >
                                                      <PlusCircle className="w-4 h-4 text-indigo-600" />
                                                      <span>Record Payment manually</span>
                                                    </button>
                                                  </div>
                                                )}
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
                          </div>
                        </div>
                      );

                      return (
                        <div className="space-y-8">
                          {/* Active Loans Section */}
                          <div>
                            <button
                              type="button"
                              onClick={() => setIsActiveRepaymentsExpanded(!isActiveRepaymentsExpanded)}
                              className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gradient-to-r from-amber-50/80 via-slate-50 to-white hover:from-amber-100 hover:to-amber-50/50 border-2 border-amber-200/90 rounded-xl transition-all cursor-pointer group text-left select-none shadow-2xs mb-3.5"
                            >
                              <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                                <Clock className="w-3.5 h-3.5" />
                              </div>
                              <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-amber-700 transition-colors">Active Loans</h3>
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300/80">
                                {activeLoansList.length}
                              </span>
                              <ChevronDown className={cn("w-4 h-4 text-amber-600 group-hover:text-amber-700 transition-transform duration-200", !isActiveRepaymentsExpanded && "-rotate-90")} />
                            </button>
                            {isActiveRepaymentsExpanded && (
                              activeLoansList.length > 0 ? (
                                renderLoanList(activeLoansList, 'active')
                              ) : (
                                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center">
                                  <p className="text-slate-400 italic text-sm">No active loans in progress.</p>
                                </div>
                              )
                            )}
                          </div>

                          {/* Settled Loans Section */}
                          <div>
                            <button
                              type="button"
                              onClick={() => setIsCompletedRepaymentsExpanded(!isCompletedRepaymentsExpanded)}
                              className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-white hover:from-emerald-100 hover:to-emerald-50/50 border-2 border-emerald-200/90 rounded-xl transition-all cursor-pointer group text-left select-none shadow-2xs mb-3.5"
                            >
                              <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </div>
                              <h3 className="font-bold text-sm sm:text-base text-slate-900 group-hover:text-emerald-700 transition-colors">Settled Loans</h3>
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/80">
                                {completedLoansList.length}
                              </span>
                              <ChevronDown className={cn("w-4 h-4 text-emerald-600 group-hover:text-emerald-700 transition-transform duration-200", !isCompletedRepaymentsExpanded && "-rotate-90")} />
                            </button>
                            {isCompletedRepaymentsExpanded && (
                              completedLoansList.length > 0 ? (
                                renderLoanList(completedLoansList, 'completed')
                              ) : (
                                <div className="bg-white p-8 rounded-3xl border border-slate-200 text-center">
                                  <p className="text-slate-400 italic text-sm">No settled loans yet.</p>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <MonthWiseLoanBreakdown
                    loans={loans}
                    loanPayments={loanPayments}
                    allUsers={allUsers}
                    isAndroid={Capacitor.getPlatform() === 'android'}
                    searchQuery={searchQuery}
                  />
                )}
              </>
            ) : null}

            {/* User Loan View (Only for members) */}
            {!isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                  {/* Active Loan Info */}
                  {loans.filter(l => l.userId === user?.uid && (l.status === 'approved' || l.status === 'paid')).map((l, idx) => {
                    const payments = loanPayments.filter(p => p.loanId === l.id);
                    const paidPayments = payments.filter(p => p.status === 'paid');
                    const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + p.amount, 0);
                    const remainingPrincipal = Math.max(0, l.approvedAmount! - totalPrincipalPaid);
                    const remainingTotal = calculateLoanRemainingTotal(l, payments);
                    return (
                      <motion.div 
                        key={`user-loan-card-${l.id || 'loan'}-${idx}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-[2.5rem] shadow-sm border border-slate-200 overflow-hidden"
                      >
                        <div className="p-5 sm:p-8 bg-indigo-600 text-white">
                          <div className="flex items-center justify-between mb-6">
                            <div className="p-2.5 sm:p-3 bg-white/10 rounded-2xl">
                              <Wallet className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                            </div>
                            <div className="flex items-center gap-2">
                              {l.status !== 'paid' && (
                                <button
                                  onClick={() => setSettlingLoanId(l.id!)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-widest border border-amber-400 shadow-sm hover:bg-amber-600 transition-all active:scale-95"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Settle One-time
                                </button>
                              )}
                              {l.status === 'paid' ? (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest border border-emerald-400/50 shadow-sm animate-pulse-slow">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Completed
                                </div>
                              ) : (
                                <span className="px-3 py-1.5 bg-white/20 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest">Active</span>
                              )}
                            </div>
                          </div>
                          <h3 className="text-indigo-100 font-bold uppercase tracking-widest text-[10px] sm:text-xs mb-1">Approved Amount</h3>
                          <div className="text-3xl sm:text-5xl font-black mb-6">₹{l.approvedAmount?.toLocaleString('en-IN')}</div>
                          
                          <div className="grid grid-cols-2 gap-4 sm:gap-8 pt-5 sm:pt-6 border-t border-white/10">
                            <div>
                              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">Monthly Interest</p>
                              <p className="text-lg sm:text-xl font-bold">0.5%</p>
                            </div>
                            <div>
                              <p className="text-indigo-100 text-[10px] font-black uppercase tracking-widest mb-1">Remaining Due</p>
                              <p className="text-lg sm:text-xl font-bold">₹{remainingTotal.toLocaleString('en-IN')}</p>
                              <p className="text-[10px] text-indigo-200 font-bold">₹{remainingPrincipal.toLocaleString('en-IN')} Principal</p>
                            </div>
                          </div>
                        </div>

                        <div className="p-5 sm:p-8">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
                            <h4 className="text-lg font-bold text-slate-900">Repayment Schedule</h4>
                            <div className="self-start sm:self-auto flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl text-xs font-bold border border-emerald-100">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              {payments.filter(p => p.status === 'paid').length} / {l.installments} Paid
                            </div>
                          </div>

                          <div className="space-y-3">
                            {(() => {
                               const approvedAmount = l.approvedAmount || 0;
                               const installments = l.installments || 10;
                               const approvedDate = l.approvedAt?.toDate ? l.approvedAt.toDate() : new Date();

                               // Find settlement month for fully paid loans
                               const settlement = l.status === 'paid' ? [...payments].filter(p => p.status === 'paid').sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;

                               return Array.from({ length: installments }).map((_, i) => {
                                 const installmentNum = i + 1;
                                 // Repayment starts from next month
                                 const installmentDate = new Date(approvedDate.getFullYear(), approvedDate.getMonth() + i + 1, 1);
                                 const installmentMonth = installmentDate.getMonth() + 1;
                                 const installmentYear = installmentDate.getFullYear();
                                 
                                 // Hide installments strictly following the settlement month
                                 if (settlement && (installmentYear > (settlement.year || 0) || (installmentYear === (settlement.year || 0) && installmentMonth > (settlement.month || 0)))) {
                                   return null;
                                 }

                                 // Find the most relevant payment for this installment
                                 const payment = payments
                                   .filter(p => p.month === installmentMonth && p.year === installmentYear)
                                   .sort((a, b) => {
                                     const statusOrder: Record<string, number> = { 'paid': 0, 'pending': 1, 'declined': 2 };
                                     const orderA = statusOrder[a.status] ?? 3;
                                     const orderB = statusOrder[b.status] ?? 3;
                                     if (orderA !== orderB) return orderA - orderB;
                                     return (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0);
                                   })[0];

                                 const settlementPayment = l.status === 'paid' ? [...payments].sort((a,b) => (b.timestamp?.toMillis?.() || 0) - (a.timestamp?.toMillis?.() || 0))[0] : null;
                                 const displayPayment = payment || settlementPayment;
                                 const isPaid = l.status === 'paid' || payment?.status === 'paid';
                                 const isPending = !isPaid && payment?.status === 'pending';
                                 
                                 // Calculate interest based on planned reducing balance
                                 const scheduledPrincipal = approvedAmount / installments;
                                 const plannedRemainingPrincipal = Math.max(0, approvedAmount - (i * scheduledPrincipal));
                                 const interest = (isPaid || isPending) ? (displayPayment?.interest || Math.round(plannedRemainingPrincipal * 0.005)) : Math.round(plannedRemainingPrincipal * 0.005);
                                 const principalToDisplay = (isPaid || isPending) ? (payment?.amount || (isPaid ? scheduledPrincipal : 0)) : scheduledPrincipal;
                                 const total = principalToDisplay + interest;

                                 const isCurrentMonth = new Date().getMonth() + 1 === installmentMonth && new Date().getFullYear() === installmentYear;
                                 const isFuture = installmentDate > new Date() && l.status !== 'paid';
                                 const isPast = installmentDate < new Date() && !isCurrentMonth;

                                 return (
                                   <div 
                                     key={`loan-schedule-${l.id || 'loan'}-${idx}-${i}`}
                                     className={cn(
                                       "p-4 sm:p-5 rounded-3xl border transition-all flex flex-col gap-3 relative overflow-hidden",
                                       isPaid ? "bg-slate-50 border-slate-100 opacity-80" : 
                                       isPending ? "bg-amber-50/70 border-amber-200 shadow-sm" :
                                       isCurrentMonth ? "bg-white border-indigo-200 ring-2 ring-indigo-50 shadow-md" :
                                       isFuture ? "bg-white border-slate-100 opacity-50" : "bg-white border-slate-200"
                                     )}
                                   >
                                     <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                                       #{installmentNum}
                                     </div>

                                     <div className="flex items-center justify-between pr-8">
                                       <div className="flex items-center gap-3">
                                         <div className={cn(
                                           "w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0",
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
                                           <span className={cn(
                                             "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-0.5 border",
                                             isPaid ? "bg-emerald-50 text-emerald-600 border-emerald-200" : 
                                             isPending ? "bg-amber-50 text-amber-600 border-amber-200" : 
                                             isCurrentMonth ? "bg-indigo-50 text-indigo-600 border-indigo-200" : 
                                             isFuture ? "bg-slate-50 text-slate-400 border-slate-200" : "bg-slate-50 text-slate-500 border-slate-200"
                                           )}>
                                             {isPaid ? 'PAID' : isPending ? 'AWAITING APPROVAL' : isCurrentMonth ? 'DUE THIS MONTH' : isFuture ? 'UPCOMING' : 'PENDING'}
                                           </span>
                                         </div>
                                       </div>
                                       
                                       <div className="text-right">
                                         <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                                         <p className="font-black text-slate-950 text-sm sm:text-base">₹{total.toLocaleString('en-IN')}</p>
                                       </div>
                                     </div>

                                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs">
                                       <div>
                                         <p className="text-[10px] font-bold text-slate-400 uppercase">Principal</p>
                                         <p className="font-bold text-slate-800">₹{principalToDisplay.toLocaleString('en-IN')}</p>
                                       </div>
                                       <div>
                                         <p className="text-[10px] font-bold text-slate-400 uppercase">Interest (0.5%)</p>
                                         <p className="font-bold text-indigo-600">₹{interest.toLocaleString('en-IN')}</p>
                                       </div>
                                       <div>
                                         <p className="text-[10px] font-bold text-slate-400 uppercase">Payment Mode</p>
                                         <p className={cn(
                                           "font-bold truncate",
                                           displayPayment?.paymentMode === 'Online' ? "text-indigo-600" : displayPayment?.paymentMode === 'Cash' ? "text-amber-600" : "text-slate-400 italic"
                                         )}>
                                           {displayPayment?.paymentMode || (isPaid || isPending ? (displayPayment?.paymentMethod || 'Online') : '-')}
                                         </p>
                                       </div>
                                       {isPaid && (
                                         <div className="col-span-2 sm:col-span-1">
                                           <p className="text-[10px] font-bold text-slate-400 uppercase">Paid On</p>
                                           <p className="font-bold text-slate-700">
                                             {displayPayment?.timestamp?.toDate ? format(displayPayment.timestamp.toDate(), 'dd MMM yyyy') :
                                             displayPayment?.approvedAt?.toDate ? format(displayPayment.approvedAt.toDate(), 'dd MMM yyyy') : '-'}
                                           </p>
                                         </div>
                                       )}
                                     </div>
                                     
                                     <div className="flex items-center justify-between pt-1">
                                       <div className="text-xs text-slate-400">
                                         {isPaid ? (
                                           <span className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                                             <CheckCircle2 className="w-4 h-4" /> Installment Cleared
                                           </span>
                                         ) : isPending ? (
                                           <span className="text-amber-600 font-bold text-xs">
                                             Verification in progress
                                           </span>
                                         ) : null}
                                       </div>
                                       <div className="flex items-center gap-3 ml-auto sm:ml-0">
                                         <span className="hidden sm:inline font-black text-slate-900 w-20 text-right">₹{total.toLocaleString('en-IN')}</span>
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
                                               isCurrentMonth ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm" : "bg-slate-100 text-slate-300 cursor-not-allowed"
                                             )}
                                           >
                                             <Plus className="w-4 h-4" />
                                           </button>
                                         )}
                                         {isPending && (
                                           <span className="text-[9px] font-black tracking-wider text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-200 uppercase">AWAITING</span>
                                         )}
                                         {isPaid && (
                                           <div className="p-0.5 bg-emerald-50 rounded-full border border-emerald-100">
                                             <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                                           </div>
                                         )}
                                       </div>
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
                      }).map((l, idx) => (
                        <div key={`loan-history-${l.id || 'loan-hist'}-${idx}`} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 relative overflow-hidden">
                          <div className="absolute top-0 right-0 px-3 py-1 bg-slate-200/70 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                            #{idx + 1}
                          </div>
                          <div className="flex items-center justify-between mb-2 pr-8">
                             <div className="flex flex-col">
                               <span className="text-sm font-bold text-slate-900">₹{l.amount.toLocaleString('en-IN')}</span>
                               <span className={cn(
                                 "text-[10px] font-bold",
                                 l.paymentMode === 'Online' ? "text-indigo-600" : l.paymentMode === 'Cash' ? "text-amber-600" : "text-slate-400 italic"
                               )}>
                                 {l.paymentMode || 'Mode: Pending'}
                               </span>
                             </div>
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
        ) : activeTab === 'graphs' ? (
          <Graphs 
            allUsers={allUsers}
            contributions={contributions}
            loans={loans}
            loanPayments={loanPayments}
            financials={financials}
            userEmail={user?.email || ''}
            isAdmin={isAdmin}
          />
        ) : activeTab === 'notices' ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {notices.map((notice, idx) => (
                <motion.div 
                  key={`notices-tab-item-${notice.id || 'notice'}-${idx}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={cn(
                    "bg-white p-6 rounded-3xl shadow-sm border overflow-hidden relative",
                    notice.priority === 'high' ? "border-red-200" : "border-slate-200"
                  )}
                >
                  <div className="absolute top-0 right-0 px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                    #{idx + 1}
                  </div>
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
        ) : activeTab === 'monthlyCollection' ? (
          <div className="space-y-6">
            {(() => {
              const monthlyPaidContributions = contributions.filter(c => 
                c.status === 'paid' && 
                c.month === collectionMonth && 
                c.year === collectionYear
              );
              const monthlyContributionTotal = monthlyPaidContributions.reduce((acc, c) => acc + (c.amount || 0), 0);

              const monthlyPaidLoanPayments = loanPayments.filter(p => 
                p.status === 'paid' && 
                p.month === collectionMonth && 
                p.year === collectionYear
              );
              const monthlyLoanPrincipalCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
              const monthlyLoanInterestCollected = monthlyPaidLoanPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
              const monthlyLoanTotalCollected = monthlyLoanPrincipalCollected + monthlyLoanInterestCollected;

              const grandTotalMonthlyReceived = monthlyContributionTotal + monthlyLoanTotalCollected;

              // Member lookup and mapping for contributions
              const mappedContribs = monthlyPaidContributions.map((c, idx) => {
                const mUser = allUsers.find(u => 
                  (u.uid && c.userId && u.uid === c.userId) || 
                  (u.email && c.userEmail && u.email.toLowerCase().trim() === c.userEmail.toLowerCase().trim())
                );
                const memberName = mUser?.displayName || (c as any).userName || (c as any).displayName || (c.userEmail ? c.userEmail.split('@')[0] : 'Member');
                const userPhone = mUser?.phoneNumber || (mUser as any)?.phone || '';
                const userEmail = mUser?.email || c.userEmail || '';
                const dateObj = c.timestamp?.toDate ? c.timestamp.toDate() : null;
                return {
                  sno: idx + 1,
                  id: c.id,
                  memberName,
                  userPhone,
                  userEmail,
                  amount: c.amount || 0,
                  method: c.paymentMethod || 'online',
                  dateFormatted: dateObj ? format(dateObj, 'dd MMM yyyy') : '-',
                  timeMs: dateObj ? dateObj.getTime() : 0,
                  raw: c
                };
              });

              // Filter contributions by search query
              const filteredContribs = searchQuery && searchQuery.trim() ? mappedContribs.filter(item => {
                const query = searchQuery.trim().toLowerCase();
                const digitsOnly = query.replace(/\D/g, '');
                const nameMatch = item.memberName.toLowerCase().includes(query);
                const emailMatch = item.userEmail.toLowerCase().includes(query);
                const phoneMatch = Boolean(digitsOnly.length >= 3 && item.userPhone && item.userPhone.replace(/\D/g, '').includes(digitsOnly));
                const amountMatch = item.amount.toString().includes(query);
                const methodMatch = item.method.toLowerCase().includes(query);
                const dateMatch = item.dateFormatted.toLowerCase().includes(query);
                const notesMatch = Boolean((item.raw as any)?.notes && (item.raw as any).notes.toLowerCase().includes(query));
                const txMatch = Boolean((item.raw as any)?.transactionId && (item.raw as any).transactionId.toLowerCase().includes(query));
                return nameMatch || emailMatch || phoneMatch || amountMatch || methodMatch || dateMatch || notesMatch || txMatch;
              }) : mappedContribs;

              const sortedContribs = [...filteredContribs].sort((a, b) => {
                const { field, direction } = collectionContribSortConfig;
                const factor = direction === 'asc' ? 1 : -1;
                if (field === 'sno') return (a.sno - b.sno) * factor;
                if (field === 'member') return a.memberName.localeCompare(b.memberName) * factor;
                if (field === 'amount') return (a.amount - b.amount) * factor;
                if (field === 'method') return a.method.localeCompare(b.method) * factor;
                if (field === 'date') return (a.timeMs - b.timeMs) * factor;
                return 0;
              });

              const handleContribSort = (field: 'sno' | 'member' | 'amount' | 'method' | 'date') => {
                if (collectionContribSortConfig.field === field) {
                  setCollectionContribSortConfig({
                    field,
                    direction: collectionContribSortConfig.direction === 'asc' ? 'desc' : 'asc'
                  });
                } else {
                  setCollectionContribSortConfig({ field, direction: 'asc' });
                }
              };

              // Borrower lookup and mapping for loan repayments
              const mappedLoanPayments = monthlyPaidLoanPayments.map((p, idx) => {
                const parentLoan = loans.find(l => l.id === p.loanId);
                const borrower = allUsers.find(u => 
                  (u.uid && parentLoan?.userId && u.uid === parentLoan.userId) ||
                  (u.email && parentLoan?.userEmail && u.email.toLowerCase().trim() === parentLoan.userEmail.toLowerCase().trim()) ||
                  (u.uid && p.userId && u.uid === p.userId) ||
                  (u.email && p.userEmail && u.email.toLowerCase().trim() === p.userEmail.toLowerCase().trim())
                );
                const borrowerName = borrower?.displayName || (parentLoan as any)?.userName || parentLoan?.userEmail?.split('@')[0] || (p as any)?.userName || p.userEmail?.split('@')[0] || 'Borrower';
                const borrowerPhone = borrower?.phoneNumber || (borrower as any)?.phone || '';
                const borrowerEmail = borrower?.email || parentLoan?.userEmail || p.userEmail || '';
                const principal = p.amount || 0;
                const interest = p.interest || 0;
                const total = principal + interest;
                const paymentMode = p.paymentMode || (p as any)?.paymentMethod || 'Online';
                const dateObj = p.approvedAt?.toDate ? p.approvedAt.toDate() : p.timestamp?.toDate ? p.timestamp.toDate() : null;

                return {
                  sno: idx + 1,
                  id: p.id,
                  borrowerName,
                  borrowerPhone,
                  borrowerEmail,
                  principal,
                  interest,
                  total,
                  paymentMode,
                  dateFormatted: dateObj ? format(dateObj, 'dd MMM yyyy') : '-',
                  timeMs: dateObj ? dateObj.getTime() : 0,
                  raw: p
                };
              });

              // Filter loan repayments by search query
              const filteredLoanPayments = searchQuery && searchQuery.trim() ? mappedLoanPayments.filter(item => {
                const query = searchQuery.trim().toLowerCase();
                const digitsOnly = query.replace(/\D/g, '');
                const nameMatch = item.borrowerName.toLowerCase().includes(query);
                const emailMatch = item.borrowerEmail.toLowerCase().includes(query);
                const phoneMatch = Boolean(digitsOnly.length >= 3 && item.borrowerPhone && item.borrowerPhone.replace(/\D/g, '').includes(digitsOnly));
                const principalMatch = item.principal.toString().includes(query);
                const interestMatch = item.interest.toString().includes(query);
                const totalMatch = item.total.toString().includes(query);
                const modeMatch = item.paymentMode.toLowerCase().includes(query);
                const dateMatch = item.dateFormatted.toLowerCase().includes(query);
                const notesMatch = Boolean((item.raw as any)?.notes && (item.raw as any).notes.toLowerCase().includes(query));
                const txMatch = Boolean((item.raw as any)?.transactionId && (item.raw as any).transactionId.toLowerCase().includes(query));
                return nameMatch || emailMatch || phoneMatch || principalMatch || interestMatch || totalMatch || modeMatch || dateMatch || notesMatch || txMatch;
              }) : mappedLoanPayments;

              const sortedLoanPayments = [...filteredLoanPayments].sort((a, b) => {
                const { field, direction } = collectionLoanSortConfig;
                const factor = direction === 'asc' ? 1 : -1;
                if (field === 'sno') return (a.sno - b.sno) * factor;
                if (field === 'borrower') return a.borrowerName.localeCompare(b.borrowerName) * factor;
                if (field === 'principal') return (a.principal - b.principal) * factor;
                if (field === 'interest') return (a.interest - b.interest) * factor;
                if (field === 'total') return (a.total - b.total) * factor;
                if (field === 'date') return (a.timeMs - b.timeMs) * factor;
                return 0;
              });

              const handleLoanSort = (field: 'sno' | 'borrower' | 'principal' | 'interest' | 'total' | 'date') => {
                if (collectionLoanSortConfig.field === field) {
                  setCollectionLoanSortConfig({
                    field,
                    direction: collectionLoanSortConfig.direction === 'asc' ? 'desc' : 'asc'
                  });
                } else {
                  setCollectionLoanSortConfig({ field, direction: 'asc' });
                }
              };

              return (
                <div className="space-y-6">
                  {/* Top Banner */}
                  <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-sm border-2 border-indigo-200/90">
                    <div className={cn("flex flex-col lg:flex-row lg:items-center justify-between gap-4", isMonthlyCollectionSummaryExpanded && "pb-6 border-b border-indigo-100/80")}>
                      <div 
                        onClick={() => setIsMonthlyCollectionSummaryExpanded(!isMonthlyCollectionSummaryExpanded)}
                        className="flex items-center gap-3.5 cursor-pointer group select-none"
                      >
                        <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200 text-indigo-600 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                          <IndianRupee className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-xl text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                              Monthly Collection Summary
                              <ChevronDown className={cn("w-5 h-5 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isMonthlyCollectionSummaryExpanded && "-rotate-90")} />
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Live
                            </span>
                          </div>
                          {isMonthlyCollectionSummaryExpanded && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              Total received amount including member contributions &amp; loan repayments (principal + interest)
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Month / Year Traversable Selector Controls */}
                      {isMonthlyCollectionSummaryExpanded && (
                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                          <div className="flex items-center bg-white rounded-2xl p-1 border border-slate-200 shadow-xs">
                            <button 
                              onClick={() => {
                                if (collectionMonth === 1) {
                                  setCollectionMonth(12);
                                  setCollectionYear(collectionYear - 1);
                                } else {
                                  setCollectionMonth(collectionMonth - 1);
                                }
                              }}
                              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                              title="Previous Month"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            
                            <select 
                              value={collectionMonth}
                              onChange={(e) => setCollectionMonth(Number(e.target.value))}
                              className="bg-transparent text-slate-800 font-bold text-xs px-2.5 py-1 focus:outline-none cursor-pointer"
                            >
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                                <option key={`coll-m-${m}`} value={m} className="bg-white text-slate-900">
                                  {format(new Date(2026, m - 1, 1), 'MMMM')}
                                </option>
                              ))}
                            </select>

                            <select 
                              value={collectionYear}
                              onChange={(e) => setCollectionYear(Number(e.target.value))}
                              className="bg-transparent text-slate-800 font-bold text-xs px-2.5 py-1 focus:outline-none cursor-pointer"
                            >
                              {[2024, 2025, 2026, 2027, 2028].map(y => (
                                <option key={`coll-y-${y}`} value={y} className="bg-white text-slate-900">
                                  {y}
                                </option>
                              ))}
                            </select>

                            <button 
                              onClick={() => {
                                if (collectionMonth === 12) {
                                  setCollectionMonth(1);
                                  setCollectionYear(collectionYear + 1);
                                } else {
                                  setCollectionMonth(collectionMonth + 1);
                                }
                              }}
                              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all"
                              title="Next Month"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>

                          {(collectionMonth !== (new Date().getMonth() + 1) || collectionYear !== new Date().getFullYear()) && (
                            <button 
                              onClick={() => {
                                setCollectionMonth(new Date().getMonth() + 1);
                                setCollectionYear(new Date().getFullYear());
                              }}
                              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-xs font-bold rounded-2xl text-white transition-all shadow-sm whitespace-nowrap"
                            >
                              Current Month
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Collection Metrics Grid */}
                    {isMonthlyCollectionSummaryExpanded && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                        <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white border-2 border-emerald-200/90 rounded-2xl p-5 relative overflow-hidden shadow-xs">
                          <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider mb-1">
                            Total Received ({format(new Date(collectionYear, collectionMonth - 1, 1), 'MMM yyyy')})
                          </p>
                          <p className="text-3xl font-black text-emerald-700">
                            ₹{grandTotalMonthlyReceived.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[10px] text-emerald-600 font-semibold mt-1.5">
                            Contributions + Loan Repayments
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white border-2 border-indigo-200/90 rounded-2xl p-5 shadow-xs">
                          <p className="text-[10px] font-bold text-indigo-800 uppercase tracking-wider mb-1">
                            Member Contributions
                          </p>
                          <p className="text-2xl font-black text-indigo-950">
                            ₹{monthlyContributionTotal.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[10px] text-indigo-600 font-semibold mt-1.5">
                            {monthlyPaidContributions.length} Paid Members
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white border-2 border-purple-200/90 rounded-2xl p-5 shadow-xs">
                          <p className="text-[10px] font-bold text-purple-800 uppercase tracking-wider mb-1">
                            Total Loan Repayments
                          </p>
                          <p className="text-2xl font-black text-purple-950">
                            ₹{monthlyLoanTotalCollected.toLocaleString('en-IN')}
                          </p>
                          <p className="text-[10px] text-purple-600 font-semibold mt-1.5">
                            {monthlyPaidLoanPayments.length} Collected Repayments
                          </p>
                        </div>

                        <div className="bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white border-2 border-amber-200/90 rounded-2xl p-5 shadow-xs">
                          <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider mb-1">
                            Principal &amp; Interest Split
                          </p>
                          <div className="text-lg font-black text-slate-900">
                            ₹{monthlyLoanPrincipalCollected.toLocaleString('en-IN')} <span className="text-xs font-normal text-slate-400">+</span> <span className="text-amber-700">₹{monthlyLoanInterestCollected.toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-[10px] text-amber-700 font-semibold mt-1.5">
                            Principal + Interest Portion
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Detailed Tables Section */}
                  <div className="flex flex-col gap-6">
                    {/* Table 1: Paid Member Contributions */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
                      <div 
                        onClick={() => setIsContribListExpanded(!isContribListExpanded)}
                        className="flex items-center justify-between p-3.5 bg-gradient-to-r from-indigo-50/80 via-slate-50 to-white hover:from-indigo-100 hover:to-indigo-50/50 border-2 border-indigo-200/90 rounded-2xl cursor-pointer select-none group transition-all shadow-2xs"
                        title={isContribListExpanded ? "Click to collapse" : "Click to expand"}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                            <Wallet className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                              Member Contributions
                              <ChevronDown className={cn("w-4 h-4 text-indigo-500 group-hover:text-indigo-600 transition-transform duration-200", !isContribListExpanded && "-rotate-90")} />
                            </h4>
                            <p className="text-xs text-slate-500">Paid for {format(new Date(collectionYear, collectionMonth - 1, 1), 'MMMM yyyy')}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-xs font-bold shadow-2xs">
                          ₹{monthlyContributionTotal.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {isContribListExpanded && (
                        <>
                          {sortedContribs.length === 0 ? (
                            <p className="text-slate-400 text-xs italic py-8 text-center">
                              {searchQuery && searchQuery.trim() ? "No contributions match your search." : "No paid contributions recorded for this month."}
                            </p>
                          ) : (
                            <>
                              {/* Desktop Table View */}
                              <div className="hidden lg:block overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                                <table className="w-full min-w-[650px] text-left border-collapse whitespace-nowrap">
                                  <thead>
                                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
                                      <th 
                                        onClick={() => handleContribSort('sno')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-10"
                                      >
                                        <div className="flex items-center gap-1">
                                          #
                                          {collectionContribSortConfig.field === 'sno' ? (
                                            collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleContribSort('member')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Member
                                          {collectionContribSortConfig.field === 'member' ? (
                                            collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleContribSort('amount')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Amount
                                          {collectionContribSortConfig.field === 'amount' ? (
                                            collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleContribSort('method')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Method
                                          {collectionContribSortConfig.field === 'method' ? (
                                            collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleContribSort('date')}
                                        className="px-3 sm:px-3.5 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Date
                                          {collectionContribSortConfig.field === 'date' ? (
                                            collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                                    {sortedContribs.map((item, rowIdx) => (
                                      <tr key={`coll-contrib-${item.id}`} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-slate-400 border-r border-slate-200/60">
                                          {rowIdx + 1}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-slate-900 border-r border-slate-200/60">
                                          {item.memberName}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-emerald-600 border-r border-slate-200/60">
                                          ₹{item.amount.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                          <span className={cn(
                                            "px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase",
                                            item.method === 'cash' ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                          )}>
                                            {item.method}
                                          </span>
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 text-slate-500">
                                          {item.dateFormatted}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile / Tablet Columnar Table View */}
                              <div className="lg:hidden">
                                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain rounded-2xl border border-slate-200/90 shadow-2xs bg-white">
                                  <table className="w-full min-w-[480px] text-left border-collapse whitespace-nowrap text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                                        <th 
                                          onClick={() => handleContribSort('sno')}
                                          className="px-2.5 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors w-9 text-center select-none"
                                        >
                                          <div className="flex items-center justify-center gap-1">
                                            #
                                            {collectionContribSortConfig.field === 'sno' ? (
                                              collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleContribSort('member')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Member
                                            {collectionContribSortConfig.field === 'member' ? (
                                              collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleContribSort('amount')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Amount
                                            {collectionContribSortConfig.field === 'amount' ? (
                                              collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleContribSort('method')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Method
                                            {collectionContribSortConfig.field === 'method' ? (
                                              collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleContribSort('date')}
                                          className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Date
                                            {collectionContribSortConfig.field === 'date' ? (
                                              collectionContribSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                                      {sortedContribs.map((item, rowIdx) => (
                                        <tr key={`coll-contrib-mobile-${item.id}-${rowIdx}`} className="hover:bg-slate-50/70 transition-colors">
                                          <td className="px-2.5 py-2.5 font-bold text-slate-400 border-r border-slate-200/60 text-center">
                                            {rowIdx + 1}
                                          </td>
                                          <td className="px-3 py-2.5 font-bold text-slate-900 border-r border-slate-200/60">
                                            {item.memberName}
                                          </td>
                                          <td className="px-3 py-2.5 font-bold text-emerald-600 border-r border-slate-200/60">
                                            ₹{item.amount.toLocaleString('en-IN')}
                                          </td>
                                          <td className="px-3 py-2.5 border-r border-slate-200/60">
                                            <span className={cn(
                                              "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                              item.method === 'cash' ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                                            )}>
                                              {item.method}
                                            </span>
                                          </td>
                                          <td className="px-3 py-2.5 text-slate-500">
                                            {item.dateFormatted}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>

                    {/* Table 2: Loan Repayments Collected */}
                    <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-4">
                      <div 
                        onClick={() => setIsLoanListExpanded(!isLoanListExpanded)}
                        className="flex items-center justify-between p-3.5 bg-gradient-to-r from-emerald-50/80 via-slate-50 to-white hover:from-emerald-100 hover:to-emerald-50/50 border-2 border-emerald-200/90 rounded-2xl cursor-pointer select-none group transition-all shadow-2xs"
                        title={isLoanListExpanded ? "Click to collapse" : "Click to expand"}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
                            <IndianRupee className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-emerald-700 transition-colors flex items-center gap-2">
                              Loan Repayments Collected
                              <ChevronDown className={cn("w-4 h-4 text-emerald-600 group-hover:text-emerald-700 transition-transform duration-200", !isLoanListExpanded && "-rotate-90")} />
                            </h4>
                            <p className="text-xs text-slate-500">Principal + Interest for {format(new Date(collectionYear, collectionMonth - 1, 1), 'MMMM yyyy')}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded-full text-xs font-bold shadow-2xs">
                          ₹{monthlyLoanTotalCollected.toLocaleString('en-IN')}
                        </span>
                      </div>

                      {isLoanListExpanded && (
                        <>
                          {sortedLoanPayments.length === 0 ? (
                            <p className="text-slate-400 text-xs italic py-8 text-center">
                              {searchQuery && searchQuery.trim() ? "No loan repayments match your search." : "No loan repayments collected for this month."}
                            </p>
                          ) : (
                            <>
                              {/* Desktop Table View */}
                              <div className="hidden lg:block overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                                <table className="w-full min-w-[720px] text-left border-collapse whitespace-nowrap">
                                  <thead>
                                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-xs font-bold text-slate-500 uppercase tracking-wider select-none">
                                      <th 
                                        onClick={() => handleLoanSort('sno')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none w-10"
                                      >
                                        <div className="flex items-center gap-1">
                                          #
                                          {collectionLoanSortConfig.field === 'sno' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleLoanSort('borrower')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Borrower
                                          {collectionLoanSortConfig.field === 'borrower' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleLoanSort('principal')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Principal
                                          {collectionLoanSortConfig.field === 'principal' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleLoanSort('interest')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Interest
                                          {collectionLoanSortConfig.field === 'interest' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleLoanSort('total')}
                                        className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Total Paid
                                          {collectionLoanSortConfig.field === 'total' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleLoanSort('date')}
                                        className="px-3 sm:px-3.5 py-3 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1">
                                          Date
                                          {collectionLoanSortConfig.field === 'date' ? (
                                            collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />}
                                        </div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                                    {sortedLoanPayments.map((p, rowIdx) => (
                                      <tr key={`coll-loan-p-${p.id}`} className="hover:bg-slate-50/70 transition-colors">
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-slate-400 border-r border-slate-200/60">
                                          {rowIdx + 1}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-slate-900 border-r border-slate-200/60">
                                          {p.borrowerName}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-semibold text-slate-700 border-r border-slate-200/60">
                                          ₹{p.principal.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-semibold text-amber-600 border-r border-slate-200/60">
                                          ₹{p.interest.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 font-bold text-emerald-600 border-r border-slate-200/60">
                                          ₹{p.total.toLocaleString('en-IN')}
                                        </td>
                                        <td className="px-3 sm:px-3.5 py-3 text-slate-500">
                                          {p.dateFormatted}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile / Tablet Columnar Table View */}
                              <div className="lg:hidden">
                                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain rounded-2xl border border-slate-200/90 shadow-2xs bg-white">
                                  <table className="w-full min-w-[540px] text-left border-collapse whitespace-nowrap text-xs">
                                    <thead>
                                      <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-500 uppercase tracking-wider select-none">
                                        <th 
                                          onClick={() => handleLoanSort('sno')}
                                          className="px-2.5 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors w-9 text-center select-none"
                                        >
                                          <div className="flex items-center justify-center gap-1">
                                            #
                                            {collectionLoanSortConfig.field === 'sno' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleLoanSort('borrower')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            BORROWER
                                            {collectionLoanSortConfig.field === 'borrower' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleLoanSort('principal')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Principal
                                            {collectionLoanSortConfig.field === 'principal' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleLoanSort('interest')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Interest
                                            {collectionLoanSortConfig.field === 'interest' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleLoanSort('total')}
                                          className="px-3 py-2.5 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Total paid
                                            {collectionLoanSortConfig.field === 'total' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                        <th 
                                          onClick={() => handleLoanSort('date')}
                                          className="px-3 py-2.5 cursor-pointer hover:bg-slate-100 transition-colors select-none"
                                        >
                                          <div className="flex items-center gap-1">
                                            Date
                                            {collectionLoanSortConfig.field === 'date' ? (
                                              collectionLoanSortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                            ) : <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                                          </div>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700 text-xs">
                                      {sortedLoanPayments.map((p, rowIdx) => (
                                        <tr key={`coll-loan-mobile-${p.id}-${rowIdx}`} className="hover:bg-slate-50/70 transition-colors">
                                          <td className="px-2.5 py-2.5 font-bold text-slate-400 border-r border-slate-200/60 text-center">
                                            {rowIdx + 1}
                                          </td>
                                          <td className="px-3 py-2.5 font-bold text-slate-900 border-r border-slate-200/60">
                                            {p.borrowerName}
                                          </td>
                                          <td className="px-3 py-2.5 font-semibold text-slate-700 border-r border-slate-200/60">
                                            ₹{p.principal.toLocaleString('en-IN')}
                                          </td>
                                          <td className="px-3 py-2.5 font-semibold text-amber-600 border-r border-slate-200/60">
                                            ₹{p.interest.toLocaleString('en-IN')}
                                          </td>
                                          <td className="px-3 py-2.5 font-bold text-emerald-600 border-r border-slate-200/60">
                                            ₹{p.total.toLocaleString('en-IN')}
                                          </td>
                                          <td className="px-3 py-2.5 text-slate-500">
                                            {p.dateFormatted}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Filter Section */}
            <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white p-6 sm:p-7 rounded-3xl shadow-sm border-2 border-indigo-200/90">
              <div className="flex flex-col md:flex-row md:items-end gap-4">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2 ml-1 tracking-wider">Month</label>
                    <div className="relative">
                      <select 
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(Number(e.target.value))}
                        className="w-full p-3.5 bg-white rounded-2xl border-2 border-indigo-200/90 text-slate-900 font-semibold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all cursor-pointer shadow-2xs text-sm"
                      >
                        {Array.from({ length: 12 }).map((_, i) => (
                          <option key={`filter-month-${i + 1}`} value={i + 1}>
                            {format(new Date(2024, i, 1), 'MMMM')}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-2 ml-1 tracking-wider">Year</label>
                    <div className="relative">
                      <select 
                        value={filterYear}
                        onChange={(e) => setFilterYear(Number(e.target.value))}
                        className="w-full p-3.5 bg-white rounded-2xl border-2 border-indigo-200/90 text-slate-900 font-semibold focus:ring-4 focus:ring-indigo-100 focus:border-indigo-600 outline-none transition-all cursor-pointer shadow-2xs text-sm"
                      >
                        {[2024, 2025, 2026, 2027, 2028].map(y => (
                          <option key={`filter-year-${y}`} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setAppliedFilter({ month: filterMonth, year: filterYear });
                    setPaymentMethodFilter('all');
                  }}
                  className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center justify-center gap-2 cursor-pointer text-sm whitespace-nowrap"
                >
                  <Search className="w-4 h-4" /> Show Payments
                </button>
              </div>

              {isAdmin && appliedFilter && (
                <div className="mt-6 pt-6 border-t border-indigo-100/90 flex flex-wrap gap-4">
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
                            "px-4 py-2.5 rounded-2xl border-2 transition-all text-left active:scale-95 shadow-2xs",
                            paymentMethodFilter === 'online' 
                              ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-200" 
                              : "bg-emerald-50/90 border-emerald-200/90 text-emerald-700 hover:bg-emerald-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'online' ? "text-emerald-50" : "text-emerald-800")}>Online Payments</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'online' ? "text-white" : "text-emerald-700")}>{online}</p>
                        </button>
                        <button 
                          onClick={() => setPaymentMethodFilter(prev => prev === 'cash' ? 'all' : 'cash')}
                          className={cn(
                            "px-4 py-2.5 rounded-2xl border-2 transition-all text-left active:scale-95 shadow-2xs",
                            paymentMethodFilter === 'cash' 
                              ? "bg-amber-600 border-amber-600 text-white shadow-md shadow-amber-200" 
                              : "bg-amber-50/90 border-amber-200/90 text-amber-700 hover:bg-amber-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'cash' ? "text-amber-50" : "text-amber-800")}>Cash Payments</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'cash' ? "text-white" : "text-amber-700")}>{cash}</p>
                        </button>
                        <button 
                          onClick={() => setPaymentMethodFilter('all')}
                          className={cn(
                            "px-4 py-2.5 rounded-2xl border-2 transition-all text-left active:scale-95 shadow-2xs",
                            paymentMethodFilter === 'all' 
                              ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200" 
                              : "bg-indigo-50/90 border-indigo-200/90 text-indigo-700 hover:bg-indigo-100"
                          )}
                        >
                          <p className={cn("text-[10px] font-bold uppercase tracking-wider", paymentMethodFilter === 'all' ? "text-indigo-50" : "text-indigo-800")}>Total Amount</p>
                          <p className={cn("text-lg font-black", paymentMethodFilter === 'all' ? "text-white" : "text-indigo-700")}>₹{total.toLocaleString('en-IN')}</p>
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
                <div className="hidden lg:block bg-white rounded-3xl shadow-sm border border-slate-200 w-full max-w-full overflow-hidden">
                  <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                    <table className="w-full min-w-[760px] text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-slate-50/75 border-b border-slate-200/80">
                          <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-10 border-r border-slate-200/60 select-none">#</th>
                          {isAdmin && (
                            <th 
                              className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                              onClick={() => handleSort('member')}
                            >
                              <div className="flex items-center gap-1.5">
                                Member
                                {sortConfig.field === 'member' ? (
                                  sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                ) : (
                                  <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                )}
                              </div>
                            </th>
                          )}
                          <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-r border-slate-200/60 select-none">Amount</th>
                          <th 
                            className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                            onClick={() => handleSort('status')}
                          >
                            <div className="flex items-center gap-1.5">
                              Status
                              {sortConfig.field === 'status' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer hover:bg-slate-100 transition-colors group border-r border-slate-200/60 select-none"
                            onClick={() => handleSort('date')}
                          >
                            <div className="flex items-center gap-1.5">
                              Date
                              {sortConfig.field === 'date' ? (
                                sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                              )}
                            </div>
                          </th>
                          {isAdmin && <th className="px-3 sm:px-3.5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sortedContributions.map((c, idx) => {
                          const targetUser = allUsers.find(u => 
                            (c.userId && u.uid === c.userId) || 
                            (c.userEmail && u.email.toLowerCase() === c.userEmail.toLowerCase())
                          );
                          return (
                            <motion.tr 
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              key={`desktop-contrib-${idx}-${c.id || 'cont-d'}`} 
                              className="hover:bg-slate-50/60 transition-colors"
                            >
                              <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                <span className="text-xs font-bold text-slate-400">{idx + 1}</span>
                              </td>
                              {isAdmin && (
                                <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                  <span className="text-sm font-semibold text-slate-900 truncate">
                                    {targetUser?.displayName || c.userEmail.split('@')[0]}
                                  </span>
                                </td>
                              )}
                              <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                <span className="text-sm font-bold text-slate-900">₹{c.amount.toLocaleString('en-IN')}</span>
                              </td>
                              <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                <div className="flex flex-col items-start gap-1">
                                  <span className={cn(
                                    "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold w-fit",
                                    c.status === 'paid' ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                                  )}>
                                    {c.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                    {c.status.toUpperCase()}
                                  </span>
                                  {c.status === 'paid' && (
                                    <span className={cn(
                                      "text-[10.5px] font-semibold ml-0.5",
                                      c.paymentMethod === 'online' ? "text-indigo-600" : c.paymentMethod === 'cash' ? "text-amber-600" : "text-slate-500"
                                    )}>
                                      ({c.paymentMethod || 'online'})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 sm:px-3.5 py-3 border-r border-slate-200/60">
                                <span className="text-xs text-slate-500">
                                  {c.timestamp?.toDate ? format(c.timestamp.toDate(), 'MMM dd, yyyy') : 'Just now'}
                                </span>
                              </td>
                              {isAdmin && (
                                <td className="px-3 sm:px-3.5 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    {c.status === 'pending' && (
                                      <button 
                                        onClick={() => updateStatus(c.id!, 'paid')}
                                        className="px-2.5 py-1 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 transition-all shadow-sm shadow-emerald-100"
                                        title="Approve Payment"
                                      >
                                        Approve
                                      </button>
                                    )}
                                    <button 
                                      onClick={() => setDeletingId(c.id!)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              )}
                            </motion.tr>
                          );
                        })}
                        {sortedContributions.length === 0 && (
                          <tr>
                            <td colSpan={isAdmin ? 5 : 3} className="px-6 py-12 text-center text-slate-400 italic">
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
                  <MobileQuickSort
                    options={[
                      ...(isAdmin ? [{ key: 'member', label: 'Member' }] : []),
                      { key: 'amount', label: 'Amount' },
                      { key: 'status', label: 'Status' },
                      { key: 'date', label: 'Date' }
                    ]}
                    activeField={sortConfig.field}
                    direction={sortConfig.direction}
                    onSort={handleSort}
                    className="mb-1"
                  />
                  {sortedContributions.map((c, idx) => {
                    const member = allUsers.find(u => 
                      (c.userId && u.uid === c.userId) || 
                      (c.userEmail && u.email.toLowerCase() === c.userEmail.toLowerCase())
                    );
                    const memberName = member?.displayName || (c as any).userName || (c.userEmail ? c.userEmail.split('@')[0] : 'Member');
                    const memberPhone = member?.phoneNumber || (member as any)?.phone || '';
                    const memberEmail = member?.email || c.userEmail || '';
                    const isPaid = c.status === 'paid';
                    const dateFormatted = c.timestamp?.toDate ? format(c.timestamp.toDate(), 'dd MMM yyyy, hh:mm a') : 'Just now';
                    const periodFormatted = format(new Date(c.year, c.month - 1), 'MMMM yyyy');

                    return (
                      <motion.div 
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        key={`mobile-contrib-${idx}-${c.id || 'cont-m'}`}
                        className="bg-white rounded-3xl shadow-sm border border-slate-200/80 overflow-hidden relative"
                      >
                        <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                          #{idx + 1}
                        </div>
                        <div className="p-5 flex flex-col gap-4">
                          <div className="flex items-center justify-between pr-8">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center font-bold text-base shrink-0">
                                {memberName ? memberName[0].toUpperCase() : '?'}
                              </div>
                              <div className="min-w-0">
                                <h4 className="font-bold text-slate-900 text-sm truncate">{memberName}</h4>
                                <p className="text-xs text-slate-500 truncate">
                                  {memberPhone || memberEmail || '-'}
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              "px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 border",
                              isPaid ? "bg-emerald-50 text-emerald-600 border-emerald-200" : "bg-amber-50 text-amber-600 border-amber-200"
                            )}>
                              {c.status.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Amount</p>
                              <p className="font-black text-emerald-600 text-sm sm:text-base">₹{c.amount.toLocaleString('en-IN')}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Mode</p>
                              <span className={cn(
                                "inline-block mt-0.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase",
                                c.paymentMethod === 'cash' ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                              )}>
                                {c.paymentMethod || 'online'}
                              </span>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Period</p>
                              <p className="font-bold text-slate-700 text-xs mt-0.5">{periodFormatted}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payment Date</p>
                              <p className="font-medium text-slate-600 text-xs mt-0.5">{dateFormatted}</p>
                            </div>
                          </div>

                          {isAdmin && (
                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                              {c.status === 'pending' && (
                                <button 
                                  onClick={() => updateStatus(c.id!, 'paid')}
                                  className="px-3.5 py-1.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-all shadow-xs active:scale-95 flex items-center gap-1.5"
                                  title="Approve Payment"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                </button>
                              )}
                              <button 
                                onClick={() => setDeletingId(c.id!)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                                title="Delete Record"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
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

        {activeNoticeToast && (
          <div key="toast-notice-wrapper" className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4">
            <motion.div 
              key={`toast-notice-content-${activeNoticeToast.id}`}
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
          <div key="toast-notification-wrapper" className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-full max-w-md px-4">
            <motion.div 
              key={`toast-notif-content-${activeNotificationToast.id}`}
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

        {paymentModal.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              key="modal-payment-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPaymentModal(p => ({ ...p, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl"
            />
            <motion.div 
              key="modal-payment-content"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-sm max-h-[88vh] overflow-y-auto rounded-[2rem] shadow-2xl flex flex-col"
            >
              <div className="p-5 pb-2 text-center">
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
                  <Banknote className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">Record Payment</h3>
                
                {/* Payment Mode Selector */}
                <div className="grid grid-cols-2 gap-2 mt-3 mb-2 px-2">
                  <button 
                    onClick={() => setPaymentModal(p => ({ ...p, mode: 'online' }))}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group",
                      paymentModal.mode === 'online' 
                        ? "bg-indigo-50 border-indigo-600 shadow-md shadow-indigo-100/50" 
                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {paymentModal.mode === 'online' && (
                      <motion.div 
                        layoutId="active-selection"
                        className="absolute inset-0 bg-indigo-600 opacity-[0.03]"
                      />
                    )}
                    <div className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      paymentModal.mode === 'online' ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                    )}>
                      <Zap className={cn("w-4 h-4", paymentModal.mode === 'online' ? "fill-white" : "fill-none")} />
                    </div>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-[0.05em]",
                      paymentModal.mode === 'online' ? "text-indigo-600" : "text-slate-400"
                    )}>Online</span>
                  </button>

                  <button 
                    onClick={() => setPaymentModal(p => ({ ...p, mode: 'cash' }))}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border-2 transition-all duration-300 relative overflow-hidden group",
                      paymentModal.mode === 'cash' 
                        ? "bg-amber-50 border-amber-600 shadow-md shadow-amber-100/50" 
                        : "bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {paymentModal.mode === 'cash' && (
                      <motion.div 
                        layoutId="active-selection"
                        className="absolute inset-0 bg-amber-600 opacity-[0.03]"
                      />
                    )}
                    <div className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      paymentModal.mode === 'cash' ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-400 group-hover:bg-slate-200"
                    )}>
                      <Banknote className="w-4 h-4" />
                    </div>
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-[0.05em]",
                      paymentModal.mode === 'cash' ? "text-amber-600" : "text-slate-400"
                    )}>Cash</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 px-6 pb-6 flex flex-col items-center w-full">
                {paymentModal.mode === 'online' ? (
                  <div className="w-full flex-col flex items-center space-y-3">
                    <div className="w-full bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100/50 text-center">
                      <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-0.5">Amount to Transfer</p>
                      <p className="text-2xl font-black text-slate-900">₹{paymentModal.amount.toLocaleString('en-IN')}</p>
                    </div>
                    
                    <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                      <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                        Please proceed to make the bank transfer or UPI payment of <strong className="text-indigo-600 font-extrabold">₹{paymentModal.amount.toLocaleString('en-IN')}</strong> using your preferred banking/UPI application.
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed mt-2">
                        After transferring, tap "Confirm Paid" below to notify the admin for verification.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex-col flex items-center space-y-3">
                    <div className="w-full bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50 text-center">
                      <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest mb-0.5">Amount to Handover</p>
                      <p className="text-2xl font-black text-slate-900">₹{paymentModal.amount.toLocaleString('en-IN')}</p>
                    </div>

                    <div className="w-full bg-slate-50 p-4 rounded-xl border border-slate-100 text-center">
                      <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                        Please handover cash of <strong className="text-amber-600 font-extrabold">₹{paymentModal.amount.toLocaleString('en-IN')}</strong> to any Unnati Group Admin.
                      </p>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed mt-2">
                        After handing over, tap "Confirm Paid" below. The admin will review and verify.
                      </p>
                    </div>
                  </div>
                )}

                <div className="w-full space-y-3 mt-4 pb-1">
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPaymentModal(p => ({ ...p, isOpen: false }))}
                      className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-xl font-black text-xs hover:bg-slate-200 transition-all active:scale-95"
                    >
                      Cancel
                    </button>
                    
                    <button 
                      onClick={async () => {
                        // Mark as recorded
                        if (paymentModal.type === 'contribution') {
                           notify('success', `Payment noted as ${paymentModal.mode}. Admin will verify once received.`);
                           const parts = paymentModal.note.split(' ');
                           const yearStr = parts[parts.length - 1];
                           const monthName = parts[parts.length - 2];
                           const monthMap: any = { 'January': 1, 'February': 2, 'March': 3, 'April': 4, 'May': 5, 'June': 6, 'July': 7, 'August': 8, 'September': 9, 'October': 10, 'November': 11, 'December': 12 };
                           const month = monthMap[monthName] || (new Date().getMonth() + 1);
                           const year = parseInt(yearStr) || new Date().getFullYear();
                           const paymentDateToRecord = paymentDate || format(new Date(), 'yyyy-MM-dd');
                           await addContribution(month, year, undefined, 'pending', paymentDateToRecord, paymentModal.amount, paymentModal.mode);
                        } else if (paymentModal.type === 'loan' && selectedLoanForPayment) {
                           notify('success', `Installment noted as ${paymentModal.mode}. Admin will verify once received.`);
                           await payLoanInstallment(
                             selectedLoanForPayment.loan, 
                             selectedLoanForPayment.month, 
                             selectedLoanForPayment.year, 
                             selectedLoanForPayment.principal, 
                             selectedLoanForPayment.interest,
                             paymentModal.mode
                           );
                        }
                        setPaymentModal(p => ({ ...p, isOpen: false }));
                      }}
                      className={cn(
                        "flex-[2] py-3 rounded-xl font-black text-white shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5 overflow-hidden text-xs",
                        paymentModal.mode === 'online' 
                          ? "bg-indigo-600 shadow-indigo-100/30" 
                          : "bg-amber-600 shadow-amber-100/30"
                      )}
                    >
                      Confirm Paid
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {showNoticeBoard && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
              key="modal-notice-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoticeBoard(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div 
              key="modal-notice-content"
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
                    {notices.map((notice, idx) => (
                      <div 
                        key={`modal-notice-${notice.id || 'modal-notice'}-${idx}`}
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
                    {notifications.map((n, idx) => (
                      <div 
                        key={`modal-notification-${n.id || 'modal-noti'}-${idx}`}
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
              key="modal-add-notice-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingNotice(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-add-notice-content"
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

        <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center">
          <p className="text-sm text-slate-400">
            Rules: ₹1,000 contribution due before the 10th of every month.
          </p>
          <p className="text-xs text-slate-300 mt-2">
            &copy; {new Date().getFullYear()} Unnati Services. All rights reserved.
          </p>
        </footer>
      </div>
    </motion.div>
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
                Your loan application for <span className="text-indigo-600 font-bold">₹{approvedLoanPopup.amount.toLocaleString('en-IN')}</span> has been approved. The amount will be disbursed soon.
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
              key="modal-add-member-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingMember(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-add-member-content"
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
                    disabled={isSubmittingMember}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 disabled:opacity-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={addMember}
                    disabled={isSubmittingMember}
                    className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isSubmittingMember ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Adding Member...</span>
                      </>
                    ) : (
                      <span>Add Member</span>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {editingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="modal-edit-member-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEditingUser(null);
                setOriginalEditingEmail(null);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-edit-member-content"
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
                    onClick={() => {
                      setEditingUser(null);
                      setOriginalEditingEmail(null);
                    }}
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
              key="modal-record-loan-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingLoan(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-record-loan-content"
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
                    {allUsers.filter(u => u.email !== SYSTEM_ADMIN_EMAIL).map((u, uidx) => (
                      <option key={`admin-loan-member-${u.id || u.uid || 'member'}-${uidx}`} value={u.uid || u.email}>
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
                        key={`admin-loan-quick-amt-${amt}`}
                        onClick={() => setAdminLoanAmount(amt)}
                        className={cn(
                          "py-3 rounded-xl text-sm font-bold transition-all border",
                          adminLoanAmount === amt 
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                            : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200"
                        )}
                      >
                        ₹{amt.toLocaleString('en-IN')}
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
                  <label className="block text-sm font-bold text-slate-700 mb-2">Payment Mode</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAdminLoanPaymentMode('Online')}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2",
                        adminLoanPaymentMode === 'Online' 
                          ? "bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-indigo-200"
                      )}
                    >
                      <Zap className="w-4 h-4" /> Online
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminLoanPaymentMode('Cash')}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-bold transition-all border flex items-center justify-center gap-2",
                        adminLoanPaymentMode === 'Cash' 
                          ? "bg-amber-600 text-white border-amber-600 shadow-lg shadow-amber-100" 
                          : "bg-white text-slate-600 border-slate-200 hover:border-amber-200"
                      )}
                    >
                      <Banknote className="w-4 h-4" /> Cash
                    </button>
                  </div>
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
              key="modal-edit-contrib-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingContribution(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-edit-contrib-content"
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
              key="modal-add-contrib-backdrop"
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
              key="modal-add-contrib-content"
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
                      {allUsers.filter(u => u.email?.toLowerCase() !== SYSTEM_ADMIN_EMAIL.toLowerCase()).map((u, uidx) => (
                        <option key={`contrib-reg-opt-${u.email?.toLowerCase() || 'email'}-${uidx}`} value={u.uid || u.email}>
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
                        <option key={`contrib-reg-month-${i + 1}`} value={i + 1}>
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
                        <option key={`contrib-reg-year-${y}`} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>

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
                    <label className="block text-sm font-bold text-slate-700 mb-2">Payment Method</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPaymentMethod('online')}
                        className={cn(
                          "py-4 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border-2",
                          paymentMethod === 'online'
                            ? "bg-indigo-50 border-indigo-600 text-indigo-600 shadow-lg shadow-indigo-100/50"
                            : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                        )}
                      >
                        <Zap className={cn("w-4 h-4", paymentMethod === 'online' ? "fill-indigo-600" : "fill-none")} />
                        Online
                      </button>
                      <button
                        onClick={() => setPaymentMethod('cash')}
                        className={cn(
                          "py-4 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border-2",
                          paymentMethod === 'cash'
                            ? "bg-amber-50 border-amber-600 text-amber-600 shadow-lg shadow-amber-100/50"
                            : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                        )}
                      >
                        <Banknote className="w-4 h-4" />
                        Cash
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Base Contribution Field */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                        Subscription (₹)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                        <input
                          type="number"
                          value={MONTHLY_AMOUNT}
                          disabled
                          className="w-full pl-7 pr-3 py-2.5 bg-white rounded-xl border border-slate-200 text-slate-700 font-bold text-sm outline-none cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Separate Fine / Late Fee Field */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                          Fine / Late Fee (₹)
                        </label>
                        <span className={cn(
                          "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border",
                          isLatePaymentDate 
                            ? "bg-red-50 text-red-600 border-red-200" 
                            : "bg-slate-100 text-slate-400 border-slate-200"
                        )}>
                          {isLatePaymentDate ? "Active (>10th)" : "Inactive (≤10th)"}
                        </span>
                      </div>
                      <div className="relative">
                        <span className={cn(
                          "absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm",
                          isLatePaymentDate ? "text-red-600" : "text-slate-400"
                        )}>₹</span>
                        <input
                          type="number"
                          value={isLatePaymentDate ? customFine : 0}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value) || 0);
                            setCustomFine(val);
                            setCustomAmount(MONTHLY_AMOUNT + val);
                          }}
                          disabled={!isLatePaymentDate}
                          className={cn(
                            "w-full pl-7 pr-3 py-2.5 rounded-xl border font-bold text-sm outline-none transition-all",
                            isLatePaymentDate
                              ? "bg-red-50/50 border-red-300 text-red-700 focus:ring-2 focus:ring-red-400"
                              : "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                          )}
                          placeholder="0"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Total Amount to Pay row */}
                  <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                    <div>
                      <span className="text-xs font-black text-slate-700 uppercase tracking-wider">Total Amount to Pay</span>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {isLatePaymentDate 
                          ? `₹${MONTHLY_AMOUNT.toLocaleString('en-IN')} Base + ₹${customFine.toLocaleString('en-IN')} Fine (Paid after 10th)` 
                          : `₹${MONTHLY_AMOUNT.toLocaleString('en-IN')} Base (Paid on or before 10th)`}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xl font-black text-indigo-900">
                        ₹{(MONTHLY_AMOUNT + (isLatePaymentDate ? customFine : 0)).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
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
                  {paymentMethod === 'online' ? (
                    <button 
                      onClick={() => {
                        const finalAmt = MONTHLY_AMOUNT + (isLatePaymentDate ? customFine : 0);
                        if (isAdmin && selectedUserId) {
                           // Admin recording online payment directly
                           addContribution(selectedMonth, selectedYear, selectedUserId, 'paid', paymentDate, finalAmt, 'online');
                        } else {
                           handleUPIPayment(selectedMonth, selectedYear, finalAmt);
                        }
                      }}
                      className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Zap className="w-5 h-5 fill-white" /> Pay via UPI
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        const finalAmt = MONTHLY_AMOUNT + (isLatePaymentDate ? customFine : 0);
                        addContribution(selectedMonth, selectedYear, selectedUserId || undefined, isAdmin ? 'paid' : 'pending', paymentDate, finalAmt, 'cash');
                      }}
                      className="flex-2 py-4 bg-amber-600 text-white rounded-2xl font-bold hover:bg-amber-700 transition-all shadow-lg shadow-amber-100 active:scale-95 flex items-center justify-center gap-2"
                    >
                      <Banknote className="w-5 h-5" /> Pay
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

        {isApplyingLoan && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              key="modal-apply-loan-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsApplyingLoan(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-apply-loan-content"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl p-6 sm:p-8"
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
                        key={`apply-loan-quick-amt-${amt}`}
                        onClick={() => setLoanAmount(amt)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs font-bold transition-all",
                          loanAmount === amt ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        )}
                      >
                        ₹{amt.toLocaleString('en-IN')}
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
              className="relative bg-white w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl shadow-2xl p-4 sm:p-6"
            >
              <h2 className="text-xl font-extrabold text-slate-900 mb-3">Loan Repayment</h2>
              
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
                const interest = Math.round(currentRemainingPrincipal * 0.005);
                const total = principal + interest;

                return (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Installment Details</p>
                      <div className="flex justify-between mb-1.5 text-sm">
                        <span className="text-slate-600 font-medium">Month</span>
                        <span className="font-bold text-slate-900">{format(new Date(nextYear, nextMonth - 1), 'MMMM yyyy')}</span>
                      </div>
                      <div className="flex justify-between items-center mb-1.5 text-sm">
                        <span className="text-slate-600 font-medium">Principal</span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-xs font-bold">₹</span>
                          <input 
                            type="number"
                            value={customPrincipal}
                            onChange={(e) => setCustomPrincipal(Number(e.target.value))}
                            className="w-20 p-1 bg-white border border-slate-200 rounded-md text-right font-bold text-slate-900 text-sm focus:ring-1 focus:ring-indigo-500 outline-none"
                          />
                        </div>
                      </div>
                      <div className="flex justify-between mb-2.5 text-sm">
                        <span className="text-slate-600 font-medium">Interest (0.5%)</span>
                        <span className="font-bold text-emerald-600">+₹{Math.round(interest).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="pt-2.5 border-t border-slate-200 flex justify-between items-center">
                        <span className="text-sm font-bold text-slate-950">Total Amount</span>
                        <span className="text-lg font-black text-indigo-600">₹{total.toLocaleString('en-IN')}</span>
                      </div>
                    </div>

                    <div className="flex gap-2.5 pt-2">
                      <button 
                        onClick={() => {
                          setIsPayingLoan(false);
                          setSelectedLoan(null);
                        }}
                        className="flex-1 py-2.5 text-slate-500 font-bold hover:bg-slate-50 rounded-xl text-sm transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => {
                          handlePayLoanInstallment(selectedLoan!, nextMonth, nextYear, principal, interest);
                        }}
                        className="flex-[2] py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all text-sm active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100/30"
                      >
                        <Zap className="w-4 h-4 fill-white animate-pulse" /> Pay Now
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
              className="relative bg-white w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl p-6 sm:p-8"
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

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Mode</label>
                  <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                    {(['Online', 'Cash'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSettlePaymentMode(m)}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-xs font-bold transition-all",
                          settlePaymentMode === m 
                            ? "bg-white text-indigo-600 shadow-sm" 
                            : "text-slate-500 hover:bg-white/50"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-700 uppercase">Total Settlement Amount</span>
                    <span className="text-lg font-black text-amber-900">₹{(settlePrincipal + settleInterest).toLocaleString('en-IN')}</span>
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
                  {isSettlingPending ? 'Settling...' : isAdmin ? 'Settle Now' : 'Request Settlement'}
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
              key="modal-delete-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeletingId(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-delete-content"
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

        {adminManualRepayment.isOpen && adminManualRepayment.loan && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAdminManualRepayment(prev => ({ ...prev, isOpen: false }))}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Record Loan Payment</h2>
                  <p className="text-sm text-slate-500 font-medium">For {format(new Date(adminManualRepayment.year, adminManualRepayment.month - 1), 'MMMM yyyy')}</p>
                </div>
                <button 
                  onClick={() => setAdminManualRepayment(prev => ({ ...prev, isOpen: false }))}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Principal Amount (₹)</label>
                  <input
                    type="number"
                    value={adminManualRepayment.amount}
                    onChange={(e) => setAdminManualRepayment(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Interest (₹)</label>
                  <input
                    type="number"
                    value={adminManualRepayment.interest}
                    onChange={(e) => setAdminManualRepayment(prev => ({ ...prev, interest: Number(e.target.value) }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-lg font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-emerald-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Date</label>
                  <input
                    type="date"
                    value={adminManualRepayment.paymentDate}
                    onChange={(e) => setAdminManualRepayment(prev => ({ ...prev, paymentDate: e.target.value }))}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Payment Mode</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['cash', 'online'].map(m => (
                      <button
                        key={`manual-repayment-mode-${m}`}
                        onClick={() => setAdminManualRepayment(prev => ({ ...prev, method: m as 'cash' | 'online' }))}
                        className={cn(
                          "py-3 rounded-2xl text-sm font-bold border-2 transition-all capitalize",
                          adminManualRepayment.method === m 
                            ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                            : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-700 uppercase">Total to Record</span>
                  <span className="text-xl font-black text-indigo-900">₹{(adminManualRepayment.amount + adminManualRepayment.interest).toLocaleString('en-IN')}</span>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setAdminManualRepayment(prev => ({ ...prev, isOpen: false }))}
                    className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={submitAdminManualRepayment}
                    className="flex-[1.5] py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Confirm Payment
                  </button>
                </div>
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

        {/* Loan Approval / Disbursal Modal */}
        {approvingLoanForPaymentMode && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setApprovingLoanForPaymentMode(null)}
              className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-[3rem] shadow-2xl p-8"
            >
              <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-2xl font-black text-slate-900 text-center mb-2">Loan Disbursal</h3>
              <p className="text-slate-500 text-center mb-8">Please select the payment mode for this loan disbursal.</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button 
                  onClick={() => setSelectedDisbursalMode('Online')}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-[2rem] border-2 transition-all",
                    selectedDisbursalMode === 'Online' 
                      ? "bg-indigo-50 border-indigo-600 text-indigo-600" 
                      : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "p-3 rounded-2xl",
                    selectedDisbursalMode === 'Online' ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    <Zap className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">Online</span>
                </button>

                <button 
                  onClick={() => setSelectedDisbursalMode('Cash')}
                  className={cn(
                    "flex flex-col items-center gap-3 p-6 rounded-[2rem] border-2 transition-all",
                    selectedDisbursalMode === 'Cash' 
                      ? "bg-amber-50 border-amber-600 text-amber-600" 
                      : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                  )}
                >
                  <div className={cn(
                    "p-3 rounded-2xl",
                    selectedDisbursalMode === 'Cash' ? "bg-amber-600 text-white" : "bg-slate-100 text-slate-400"
                  )}>
                    <Banknote className="w-6 h-6" />
                  </div>
                  <span className="text-sm font-bold">Cash</span>
                </button>
              </div>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setApprovingLoanForPaymentMode(null)}
                  className="flex-1 py-4 bg-slate-100 text-slate-600 font-bold rounded-2xl hover:bg-slate-200 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={approveLoanWithMode}
                  className="flex-1 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
