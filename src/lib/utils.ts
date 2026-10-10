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
 * email rajagurujp@gmail.com, or Kannada/corrupted characters map to "Gururaj JP".
 */
export function getSafeMemberDisplayName(
  displayNameOrUser?: string | { displayName?: string; phoneNumber?: string; phone?: string; email?: string } | null,
  phoneNumber?: string | null,
  email?: string | null
): string {
  if (!displayNameOrUser) {
    if (phoneNumber || email) {
      if (isGururajMember(null, phoneNumber, email, null)) {
        return GURURAJ_ENGLISH_NAME;
      }
    }
    return '';
  }
  if (typeof displayNameOrUser === 'object') {
    const user = displayNameOrUser as any;
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
  if (isGururajMember(null, phoneNumber, email, displayName)) {
    return GURURAJ_ENGLISH_NAME;
  }
  if (displayName.includes('†') && displayName.includes('°')) {
    return GURURAJ_ENGLISH_NAME;
  }
  return displayName;
}

/**
 * Sanitizes a UserProfile object to ensure Gururaj JP's name, phone, and email are kept intact.
 */
export function sanitizeUserProfile<T extends { displayName?: string; phoneNumber?: string; email?: string; [key: string]: any }>(user: T): T {
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
