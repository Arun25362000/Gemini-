import { format } from 'date-fns';
import { collection, addDoc, serverTimestamp, query, where, getDocs, Firestore } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { Loan, LoanPayment, UserProfile, AppNotification, Contribution } from '../types';

export const isPushSupported = (): boolean => {
  return typeof window !== 'undefined' && 'Notification' in window;
};

export const getPushPermissionState = (): NotificationPermission => {
  if (!isPushSupported()) return 'denied';
  return Notification.permission;
};

export const requestPushPermission = async (): Promise<NotificationPermission> => {
  if (!isPushSupported()) return 'denied';
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.warn('Error requesting push notification permission:', error);
    return 'denied';
  }
};

export const sendBrowserPush = async (
  title: string,
  options: {
    body: string;
    icon?: string;
    tag?: string;
    link?: string;
    data?: any;
  }
): Promise<boolean> => {
  if (!isPushSupported() || Notification.permission !== 'granted') {
    return false;
  }

  const icon = options.icon || '/brand-unnati-official.png';
  const notificationOptions: NotificationOptions = {
    body: options.body,
    icon,
    badge: icon,
    tag: options.tag || 'unnati-notification',
    data: { url: options.link || '/', ...options.data },
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, notificationOptions);
        return true;
      }
    }

    new Notification(title, notificationOptions);
    return true;
  } catch (error) {
    console.warn('Could not display browser push notification:', error);
    try {
      new Notification(title, notificationOptions);
      return true;
    } catch {
      return false;
    }
  }
};

/**
 * Helper to format phone number for WhatsApp international URL format (wa.me)
 */
export const formatWhatsAppNumber = (phone?: string | null): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (!cleaned) return '';
  if (cleaned.length === 10) return `91${cleaned}`;
  if (cleaned.startsWith('0') && cleaned.length === 11) return `91${cleaned.slice(1)}`;
  return cleaned;
};

/**
 * Detects if the current client is a mobile device or small touchscreen viewport
 */
export const isMobileDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)) ||
    (typeof window.innerWidth !== 'undefined' && window.innerWidth <= 768)
  );
};

/**
 * Detects if the current environment is running inside a native mobile app (Capacitor Android APK / iOS)
 */
export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    if (Capacitor.isNativePlatform()) return true;
    if ((window as any).Capacitor?.isNativePlatform?.()) return true;
    if (window.location.protocol === 'capacitor:' || window.location.protocol === 'ionic:') return true;
    if (window.location.hostname === 'localhost' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
  } catch {
    return false;
  }
  return false;
};

/**
 * Universal WhatsApp launcher supporting native Android APK, iOS, mobile web, and desktop browsers.
 * In native APK (Capacitor Android), uses AppLauncher to open native WhatsApp directly or external browser,
 * preventing "Webpage not available" (net::ERR_UNKNOWN_URL_SCHEME) errors and never navigating away from the app.
 */
export const launchWhatsApp = (
  phone?: string | null,
  message: string = ''
): {
  success: boolean;
  url: string;
} => {
  const formattedPhone = phone ? formatWhatsAppNumber(phone) : '';
  // Limit message length to keep encoded URLs well within mobile and Android intent limits (< 1200 chars)
  const safeMessage = message.length > 1200 ? message.slice(0, 1200) + '...' : message;
  const encodedMessage = encodeURIComponent(safeMessage);

  // Official WhatsApp Universal Web API endpoint
  const apiUrl = formattedPhone
    ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodedMessage}`
    : `https://api.whatsapp.com/send?text=${encodedMessage}`;

  // Direct native scheme for WhatsApp app on mobile devices
  const nativeWaUrl = formattedPhone
    ? `whatsapp://send?phone=${formattedPhone}&text=${encodedMessage}`
    : `whatsapp://send?text=${encodedMessage}`;

  if (typeof window !== 'undefined') {
    if (isNativeApp()) {
      // In native Capacitor APK (Android) or native iOS app:
      // Launch native WhatsApp app directly using Android Intent / AppLauncher
      AppLauncher.openUrl({ url: nativeWaUrl })
        .then((res) => {
          if (!res || !res.completed) {
            // Fallback to opening system browser (external, NEVER in-app WebView)
            Browser.open({ url: apiUrl, windowName: '_system' }).catch(err => {
              console.warn('Browser.open fallback failed:', err);
            });
          }
        })
        .catch(() => {
          // Fallback to opening system browser
          Browser.open({ url: apiUrl, windowName: '_system' }).catch(err => {
            console.warn('Browser.open fallback failed:', err);
          });
        });

      return { success: true, url: nativeWaUrl };
    }

    // Standard web browser environment (Desktop or Mobile Web)
    try {
      // Create a transient anchor with target="_blank" and rel="noopener noreferrer".
      const link = document.createElement('a');
      link.href = apiUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      }, 500);
    } catch (e) {
      console.warn('Direct link click for WhatsApp failed, using window.open:', e);
      try {
        window.open(apiUrl, '_blank', 'noopener,noreferrer');
      } catch (err) {
        console.warn('window.open fallback failed for WhatsApp:', err);
      }
    }
  }

  return { success: true, url: apiUrl };
};

/**
 * Triggers an automated WhatsApp message when loan application status changes to 'approved' or 'declined'
 */
export const triggerLoanStatusWhatsAppNotification = (
  loan: Loan,
  targetUser?: UserProfile | null,
  status: 'approved' | 'declined' = 'approved',
  details?: {
    disbursalMode?: string;
    declineReason?: string;
    installments?: number;
  }
): {
  success: boolean;
  waUrl: string;
  message: string;
  phone: string;
  recipientName: string;
} => {
  const recipientName =
    targetUser?.displayName ||
    (loan as any).userName ||
    (targetUser?.email ? targetUser.email.split('@')[0] : 'Member');

  const rawPhone =
    targetUser?.phoneNumber ||
    (targetUser as any)?.phone ||
    (loan as any).phoneNumber ||
    (loan as any).phone;

  const formattedPhone = formatWhatsAppNumber(rawPhone);
  const loanAmountFormatted = (loan.approvedAmount || loan.amount || 0).toLocaleString('en-IN');

  let message = '';

  if (status === 'approved') {
    const disbursalMode = details?.disbursalMode || loan.paymentMode || 'Online Bank Transfer';
    const installments = details?.installments || loan.installments || Math.ceil((loan.approvedAmount || loan.amount) / 5000) || 10;

    message = `*UNNATI TRUST - Loan Application Approved* 🎉\n\n` +
      `Dear ${recipientName},\n\n` +
      `We are pleased to inform you that your loan application has been *APPROVED*.\n\n` +
      `📋 *Approval Details:*\n` +
      `• *Sanctioned Amount:* ₹${loanAmountFormatted}\n` +
      `• *Disbursal Mode:* ${disbursalMode}\n` +
      `• *Monthly Interest Rate:* 0.5%\n` +
      `• *Tenure / Installments:* ${installments} months\n` +
      `• *Status:* Active / Disbursed\n\n` +
      `You can view your detailed repayment schedule in the Unnati web app.\n\n` +
      `_Unnati Administration_`;
  } else {
    const reason = details?.declineReason || loan.declineReason || 'Criteria not met';

    message = `*UNNATI TRUST - Loan Application Update*\n\n` +
      `Dear ${recipientName},\n\n` +
      `Your loan application for *₹${loanAmountFormatted}* has been *DECLINED*.\n\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `If you have questions or require further clarification, please contact the Unnati Administration.\n\n` +
      `_Unnati Administration_`;
  }

  const result = launchWhatsApp(formattedPhone, message);

  return {
    success: !!formattedPhone,
    waUrl: result.url,
    message,
    phone: formattedPhone,
    recipientName,
  };
};

const ADMIN_EMAILS = ['arun2102000@gmail.com', 'unnati.finance2026@gmail.com', 'arun.cse.rymec@gmail.com'];
const SYSTEM_ADMIN_EMAIL = 'unnati.finance2026@gmail.com';

/**
 * Checks if a user is an administrator (including 'unnati' and system admin accounts)
 * who should never receive automatic contribution or loan reminders.
 */
export const isExemptAdministrator = (
  user?: { uid?: string; email?: string | null; displayName?: string | null; role?: string } | null
): boolean => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  const name = (user.displayName || '').toLowerCase().trim();

  // Only the system administrator robot account (unnati) is exempt from member obligations.
  // Admin members like Arun J (arun2102000@gmail.com) are contributing society members and must not be excluded.
  return (
    email === SYSTEM_ADMIN_EMAIL.toLowerCase() ||
    email.includes('unnati.finance2026') ||
    name === 'unnati' ||
    name === 'administrator'
  );
};

/**
 * Checks and triggers automated push notification for members if their monthly contribution (₹1,000)
 * has not been recorded by the 5th of the current month.
 * Reminders only trigger strictly on the 5th of each month (between 1st and 10th).
 * Administrators (unnati) are strictly exempt and never receive reminders.
 */
export const checkAndTriggerMonthlyContributionPushReminder = async (
  currentUser: { uid: string; email?: string | null; displayName?: string | null; role?: string },
  contributions: Contribution[],
  db: Firestore,
  createInAppNotification: (userId: string, title: string, message: string, type: AppNotification['type'], link?: string) => Promise<void>
): Promise<{ triggered: boolean; reason?: string }> => {
  // Administrators (unnati) must NOT receive reminders
  if (isExemptAdministrator(currentUser)) {
    return { triggered: false, reason: 'Administrator unnati is exempt from contribution reminders' };
  }

  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthName = format(now, 'MMMM');

  // Must happen strictly between dates 1st to 10th, specifically on the 5th
  if (dayOfMonth !== 5) {
    return { triggered: false, reason: 'Contribution reminders only happen on the 5th of each month (between 1st and 10th)' };
  }

  const userEmail = (currentUser.email || '').toLowerCase().trim();
  const userId = currentUser.uid;

  // Check if contribution of ₹1,000 already recorded for current month & year (direct or via advance)
  const hasContribution = contributions.some(c => {
    const matchId = c.userId === userId;
    const matchEmail = !!c.userEmail && c.userEmail.toLowerCase().trim() === userEmail;
    if (!(matchId || matchEmail) || c.status !== 'paid') return false;
    if (c.month === currentMonth && c.year === currentYear) return true;
    if (c.isAdvance && c.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)) return true;
    return false;
  });

  if (hasContribution) {
    return { triggered: false, reason: 'Monthly contribution already recorded' };
  }

  // Deduplication check: only alert once per member per monthly cycle (5th onwards)
  const storageKey = `unnati_contrib_5th_alert_${userId}_${currentYear}_${currentMonth}`;
  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) {
    return { triggered: false, reason: 'Alert already triggered this cycle' };
  }

  const title = `Monthly Contribution Due (₹1,000)`;
  const message = `Reminder: Your ₹1,000 monthly contribution for ${monthName} ${currentYear} has not been recorded by the 5th. Please record payment before the 10th to avoid late fees.`;

  // 1. Send native browser push notification
  await sendBrowserPush(title, {
    body: message,
    tag: `contrib-due-${currentYear}-${currentMonth}`,
    link: '/',
  });

  // 2. Leverage existing in-app notification system (Firestore 'notifications' collection)
  await createInAppNotification(userId, title, message, 'payment', '/');

  // Mark as triggered in localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, new Date().toISOString());
  }

  return { triggered: true };
};

/**
 * Checks and triggers 'Loan Repayment Due' alerts on the 5th and 9th of every month
 * for members who have an active loan and haven't recorded a payment for the current month.
 * Reminders happen strictly on the 5th and 9th only (between 1st and 10th).
 * Administrators (unnati) are strictly exempt.
 */
export const checkAndTriggerLoanRepaymentDuePushReminder = async (
  currentUser: { uid: string; email?: string | null; displayName?: string | null; role?: string },
  loans: Loan[],
  loanPayments: LoanPayment[],
  db: Firestore,
  createInAppNotification: (userId: string, title: string, message: string, type: AppNotification['type'], link?: string) => Promise<void>
): Promise<{ triggered: boolean; cycle?: '5th' | '9th'; reason?: string }> => {
  // Administrators (unnati) must NOT receive reminders
  if (isExemptAdministrator(currentUser)) {
    return { triggered: false, reason: 'Administrator unnati is exempt from loan repayment reminders' };
  }

  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthName = format(now, 'MMMM');

  // Must happen strictly between dates 1st to 10th, on the 5th or 9th only
  if (dayOfMonth !== 5 && dayOfMonth !== 9) {
    return { triggered: false, reason: 'Loan repayment reminders only happen on the 5th and 9th of each month (between 1st and 10th)' };
  }

  const cycleName: '5th' | '9th' = dayOfMonth === 9 ? '9th' : '5th';
  const is9thCycle = dayOfMonth === 9;

  const userEmail = (currentUser.email || '').toLowerCase().trim();
  const userId = currentUser.uid;

  // Filter active loans for this user whose repayment has started (loans recorded in current/future month start next month)
  const activeLoans = loans.filter(l => {
    const isOwner = l.userId === userId || (!!l.userEmail && l.userEmail.toLowerCase().trim() === userEmail);
    if (!isOwner || l.status !== 'approved') return false;

    // Check sanction date: when a loan is recorded in a month, repayment starts next month
    const parseLoanDate = (val: any): Date | null => {
      if (!val) return null;
      if (typeof val.toDate === 'function') {
        try {
          const d = val.toDate();
          if (d instanceof Date && !isNaN(d.getTime())) return d;
        } catch {}
      }
      if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
      if (typeof val._seconds === 'number') return new Date(val._seconds * 1000);
      if (val instanceof Date && !isNaN(val.getTime())) return val;
      if (typeof val === 'string') {
        const parts = val.split(/[-/]/);
        if (parts.length === 3) {
          if (parts[0].length === 4) {
            const d2 = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
            if (!isNaN(d2.getTime())) return d2;
          } else if (parts[2].length === 4) {
            const d2 = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
            if (!isNaN(d2.getTime())) return d2;
          }
        }
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
      }
      return null;
    };

    const dates = [
      parseLoanDate(l.approvedAt),
      parseLoanDate(l.createdAt),
      parseLoanDate((l as any).loanDate),
      parseLoanDate((l as any).date),
      parseLoanDate((l as any).disbursementDate)
    ].filter(Boolean) as Date[];

    if (dates.length > 0) {
      const sDate = new Date(Math.max(...dates.map(d => d.getTime())));
      const sMonth = sDate.getMonth() + 1;
      const sYear = sDate.getFullYear();
      if (sYear > currentYear || (sYear === currentYear && sMonth >= currentMonth)) {
        return false;
      }
    }
    return true;
  });

  if (activeLoans.length === 0) {
    return { triggered: false, reason: 'No active loans for user' };
  }

  // Check if user has recorded loan payment for current month (direct or via advance)
  const hasPaidForCurrentMonth = loanPayments.some(p => {
    const isUserPayment = p.userId === userId || (!!p.userEmail && p.userEmail.toLowerCase().trim() === userEmail);
    const matchesLoan = activeLoans.some(l => l.id === p.loanId);
    if (!(isUserPayment || matchesLoan) || p.status !== 'paid') return false;
    if (p.month === currentMonth && p.year === currentYear) return true;
    if (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)) return true;
    return false;
  });

  if (hasPaidForCurrentMonth) {
    return { triggered: false, reason: 'Loan repayment already recorded for current month' };
  }

  const storageKey = `unnati_loan_due_${cycleName}_${userId}_${currentYear}_${currentMonth}`;

  if (typeof localStorage !== 'undefined' && localStorage.getItem(storageKey)) {
    return { triggered: false, reason: `${cycleName} alert already sent` };
  }

  const title = is9thCycle
    ? `Loan Repayment Due - Final Alert (9th of Month)`
    : `Loan Repayment Due (5th of Month)`;

  const message = is9thCycle
    ? `Urgent Notice: Your Unnati loan repayment for ${monthName} ${currentYear} is due. Please pay today to avoid late fees starting tomorrow (10th).`
    : `Reminder: Your monthly Unnati loan repayment for ${monthName} ${currentYear} is due. Please record your installment before the 10th.`;

  // 1. Send native browser push notification
  await sendBrowserPush(title, {
    body: message,
    tag: `loan-due-${cycleName}-${currentYear}-${currentMonth}`,
    link: '/loans',
  });

  // 2. Leverage existing notification system
  await createInAppNotification(userId, title, message, 'loan', '/loans');

  // Mark cycle as done
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(storageKey, new Date().toISOString());
  }

  return { triggered: true, cycle: cycleName };
};
