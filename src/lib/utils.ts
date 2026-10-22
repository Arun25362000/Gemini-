import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatINR(val: number | string | undefined | null): string {
  if (val === undefined || val === null || val === '') return '0';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-IN');
}

export const GURURAJ_PHONE = '9686763186';
export const GURURAJ_EMAIL = 'rajagurujp@gmail.com';
export const GURURAJ_ENGLISH_NAME = 'Gururaj JP';

export const PRANESH_PHONE = '9845901902';
export const PRANESH_CANONICAL_EMAIL = 'jpranesh1954@gmail.com';
export const PRANESH_LEGACY_EMAIL = 'praneshrao1954@gmail.com';
export const PRANESH_CANONICAL_NAME = 'Pranesh Rao J';
export const PRANESH_CANONICAL_UID = 'hkyUFqkelMVqYbQ27jfpTkN29LC3';
export const PRANESH_LEGACY_UID = 'imp5eagibVcvtfD5qleX4ISC1Nj2';
export const PRANESH_ADDRESS = 'Mathura,Tumkur';

/**
 * Checks whether an entity (profile, contribution, loan, payment, etc.) corresponds to Pranesh Rao J.
 */
export function isPraneshMember(
  data?: { phoneNumber?: string; phone?: string; email?: string; userEmail?: string; displayName?: string; userName?: string; uid?: string; userId?: string; id?: string } | null,
  rawPhone?: string | null,
  rawEmail?: string | null,
  rawName?: string | null,
  rawUid?: string | null
): boolean {
  const email = String(rawEmail || data?.email || data?.userEmail || '').trim().toLowerCase();
  if (email === PRANESH_CANONICAL_EMAIL || email === PRANESH_LEGACY_EMAIL) return true;
  if (email.includes('pranesh')) return true;

  const uid = String(rawUid || data?.uid || data?.userId || (data as any)?.id || '');
  if (uid === PRANESH_CANONICAL_UID || uid === PRANESH_LEGACY_UID) return true;

  const name = String(rawName || data?.displayName || data?.userName || '').trim().toLowerCase();
  if (
    name === 'pranesh rao j' || 
    name === 'pranesh rao' || 
    name === 'praneshrao1954' || 
    name === 'praneshrao' || 
    name === 'pranesh' ||
    name.includes('pranesh')
  ) {
    return true;
  }

  const phone = String(rawPhone || data?.phoneNumber || (data as any)?.phone || '').replace(/\D/g, '');
  if (phone.endsWith(PRANESH_PHONE)) return true;

  return false;
}

/**
 * Checks whether a user profile, phone number, email, or display name corresponds to Gururaj JP.
 */
export function isGururajMember(
  data?: { phoneNumber?: string; phone?: string; email?: string; userEmail?: string; displayName?: string } | null,
  rawPhone?: string | null,
  rawEmail?: string | null,
  rawName?: string | null
): boolean {
  const phone = String(rawPhone || data?.phoneNumber || (data as any)?.phone || '').replace(/\D/g, '');
  if (phone.endsWith(GURURAJ_PHONE)) return true;

  const email = String(rawEmail || data?.email || data?.userEmail || '').trim().toLowerCase();
  if (email === GURURAJ_EMAIL || email.includes('rajaguru')) return true;

  const name = String(rawName || data?.displayName || '');
  if (
    /[\u0C80-\u0CFF]/.test(name) &&
    (name.includes('ಗುರುರಾಜ') || name.includes('ಕಮಲಾಪುರ') || name.includes('ಆರ್ಯದಾಸ'))
  ) {
    return true;
  }
  // Check for corrupted ASCII symbols from non-Unicode font encodings
  if (name.includes('†') && (name.includes('°') || name.includes('Í') || name.includes('—'))) {
    return true;
  }
  return false;
}

/**
 * Resolves safe English display name for members, specifically ensuring phone 9686763186,
 * email rajagurujp@gmail.com, or Kannada/corrupted characters map to "Gururaj JP",
 * and ensuring Pranesh Rao's name is always "Pranesh Rao J".
 */
export function getSafeMemberDisplayName(
  displayNameOrUser?: string | { displayName?: string; phoneNumber?: string; phone?: string; email?: string; uid?: string; id?: string } | null,
  phoneNumber?: string | null,
  email?: string | null
): string {
  if (!displayNameOrUser) {
    if (phoneNumber || email) {
      if (isPraneshMember(null, phoneNumber, email, null)) {
        return PRANESH_CANONICAL_NAME;
      }
      if (isGururajMember(null, phoneNumber, email, null)) {
        return GURURAJ_ENGLISH_NAME;
      }
    }
    return '';
  }
  if (typeof displayNameOrUser === 'object') {
    const user = displayNameOrUser as any;
    if (isPraneshMember(user)) {
      return PRANESH_CANONICAL_NAME;
    }
    if (isGururajMember(user)) {
      return GURURAJ_ENGLISH_NAME;
    }
    const name = user.displayName || user.email || '';
    if (typeof name === 'string' && name.includes('†') && name.includes('°')) {
      return GURURAJ_ENGLISH_NAME;
    }
    return name;
  }
  const displayName = String(displayNameOrUser);
  if (isPraneshMember(null, phoneNumber, email, displayName)) {
    return PRANESH_CANONICAL_NAME;
  }
  if (isGururajMember(null, phoneNumber, email, displayName)) {
    return GURURAJ_ENGLISH_NAME;
  }
  if (displayName.includes('†') && displayName.includes('°')) {
    return GURURAJ_ENGLISH_NAME;
  }
  return displayName;
}

/**
 * Sanitizes a UserProfile object to ensure Gururaj JP and Pranesh Rao J are correctly structured and canonical.
 */
export function sanitizeUserProfile<T extends { displayName?: string; phoneNumber?: string; email?: string; [key: string]: any }>(user: T): T {
  if (isPraneshMember(user)) {
    return {
      ...user,
      id: PRANESH_CANONICAL_UID,
      uid: PRANESH_CANONICAL_UID,
      displayName: PRANESH_CANONICAL_NAME,
      email: PRANESH_CANONICAL_EMAIL,
      phoneNumber: user.phoneNumber && user.phoneNumber.replace(/\D/g, '').endsWith(PRANESH_PHONE) ? user.phoneNumber : PRANESH_PHONE,
      address: user.address || PRANESH_ADDRESS
    };
  }
  if (isGururajMember(user)) {
    return {
      ...user,
      displayName: GURURAJ_ENGLISH_NAME,
      phoneNumber: user.phoneNumber && user.phoneNumber.replace(/\D/g, '').endsWith(GURURAJ_PHONE) ? user.phoneNumber : GURURAJ_PHONE,
      email: user.email || GURURAJ_EMAIL
    };
  }
  return user;
}

export function sanitizeContribution<T extends { userEmail?: string; userName?: string; userId?: string; [key: string]: any }>(c: T): T {
  if (isPraneshMember(c)) {
    return {
      ...c,
      userId: PRANESH_CANONICAL_UID,
      userEmail: PRANESH_CANONICAL_EMAIL,
      userName: PRANESH_CANONICAL_NAME
    };
  }
  return c;
}

export function sanitizeLoan<T extends { userEmail?: string; userName?: string; userId?: string; [key: string]: any }>(l: T): T {
  if (isPraneshMember(l)) {
    return {
      ...l,
      userId: PRANESH_CANONICAL_UID,
      userEmail: PRANESH_CANONICAL_EMAIL,
      userName: PRANESH_CANONICAL_NAME,
      phoneNumber: PRANESH_PHONE
    };
  }
  return l;
}

export function sanitizeLoanPayment<T extends { userEmail?: string; userName?: string; userId?: string; [key: string]: any }>(p: T): T {
  if (isPraneshMember(p)) {
    return {
      ...p,
      userId: PRANESH_CANONICAL_UID,
      userEmail: PRANESH_CANONICAL_EMAIL,
      userName: PRANESH_CANONICAL_NAME
    };
  }
  return p;
}

export function getAppAvailableYears(): number[] {
  const startYear = 2026;
  const currentYear = new Date().getFullYear();
  const maxYear = Math.max(2028, currentYear + 2);
  const years: number[] = [];
  for (let y = startYear; y <= maxYear; y++) {
    years.push(y);
  }
  return years;
}

/**
 * Normalizes phone numbers to standard 10-digit format for accurate unique counts.
 */
export function normalizePhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10);
  }
  return digits;
}

/**
 * Normalizes email address for deduplication and consistent matching.
 */
export function normalizeEmailAddress(email?: string | null): string {
  if (!email) return '';
  const trimmed = String(email).trim().toLowerCase();
  if (!trimmed || trimmed === '-' || trimmed === 'n/a' || trimmed === 'nil' || trimmed === 'none' || trimmed === 'no-email') {
    return '';
  }
  return trimmed;
}