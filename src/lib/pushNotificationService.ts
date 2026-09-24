import { format } from 'date-fns';
import { collection, addDoc, serverTimestamp, query, where, getDocs, Firestore } from 'firebase/firestore';
import { Loan, LoanPayment, UserProfile, AppNotification } from '../types';

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

    message = `*UNNATI FINANCE - Loan Application Approved* 🎉\n\n` +
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

    message = `*UNNATI FINANCE - Loan Application Update*\n\n` +
      `Dear ${recipientName},\n\n` +
      `Your loan application for *₹${loanAmountFormatted}* has been *DECLINED*.\n\n` +
      `📝 *Reason:* ${reason}\n\n` +
      `If you have questions or require further clarification, please contact the Unnati Administration.\n\n` +
      `_Unnati Administration_`;
  }

  const encodedMessage = encodeURIComponent(message);
  const waUrl = formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodedMessage}` : '';

  if (waUrl && typeof window !== 'undefined') {
    try {
      window.open(waUrl, '_blank');
    } catch (e) {
      console.warn('Popup blocked while opening WhatsApp:', e);
    }
  }

  return {
    success: !!formattedPhone,
    waUrl,
    message,
    phone: formattedPhone,
    recipientName,
  };
};

/**
 * Checks and triggers automated push notification for members if their monthly contribution (₹1,000)
 * has not been recorded by the 5th of the current month.
 */
export const checkAndTriggerMonthlyContributionPushReminder = async (
  currentUser: { uid: string; email?: string | null; displayName?: string | null },
  contributions: Array<{ userId?: string; userEmail?: string; month: number; year: number; status?: string; amount?: number }>,
  db: Firestore,
  createInAppNotification: (userId: string, title: string, message: string, type: AppNotification['type'], link?: string) => Promise<void>
): Promise<{ triggered: boolean; reason?: string }> => {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthName = format(now, 'MMMM');

  // Must be on or after the 5th of the month
  if (dayOfMonth < 5) {
    return { triggered: false, reason: 'Current date is before the 5th of the month' };
  }

  const userEmail = (currentUser.email || '').toLowerCase().trim();
  const userId = currentUser.uid;

  // Check if contribution of ₹1,000 already recorded for current month & year
  const hasContribution = contributions.some(c => {
    const matchId = c.userId === userId;
    const matchEmail = !!c.userEmail && c.userEmail.toLowerCase().trim() === userEmail;
    return (matchId || matchEmail) && c.month === currentMonth && c.year === currentYear;
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
 */
export const checkAndTriggerLoanRepaymentDuePushReminder = async (
  currentUser: { uid: string; email?: string | null; displayName?: string | null },
  loans: Loan[],
  loanPayments: LoanPayment[],
  db: Firestore,
  createInAppNotification: (userId: string, title: string, message: string, type: AppNotification['type'], link?: string) => Promise<void>
): Promise<{ triggered: boolean; cycle?: '5th' | '9th'; reason?: string }> => {
  const now = new Date();
  const dayOfMonth = now.getDate();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const monthName = format(now, 'MMMM');

  // Must be on or after 5th
  if (dayOfMonth < 5) {
    return { triggered: false, reason: 'Current date is before 5th' };
  }

  const userEmail = (currentUser.email || '').toLowerCase().trim();
  const userId = currentUser.uid;

  // Filter active loans for this user
  const activeLoans = loans.filter(l => {
    const isOwner = l.userId === userId || (!!l.userEmail && l.userEmail.toLowerCase().trim() === userEmail);
    return isOwner && l.status === 'approved';
  });

  if (activeLoans.length === 0) {
    return { triggered: false, reason: 'No active loans for user' };
  }

  // Check if user has recorded loan payment for current month
  const hasPaidForCurrentMonth = loanPayments.some(p => {
    const isUserPayment = p.userId === userId || (!!p.userEmail && p.userEmail.toLowerCase().trim() === userEmail);
    const matchesLoan = activeLoans.some(l => l.id === p.loanId);
    return (isUserPayment || matchesLoan) && p.month === currentMonth && p.year === currentYear;
  });

  if (hasPaidForCurrentMonth) {
    return { triggered: false, reason: 'Loan repayment already recorded for current month' };
  }

  // Determine which cycle: 9th alert or 5th alert
  const is9thCycle = dayOfMonth >= 9;
  const cycleName = is9thCycle ? '9th' : '5th';
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

  return { triggered: true, cycle: is9thCycle ? '9th' : '5th' };
};
