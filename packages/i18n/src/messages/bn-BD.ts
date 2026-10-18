// Bangla catalog. PROPOSED wording: every string needs native-speaker review before RG-3
// (Q-050, A1 glossary). Typed against the English catalog, so a missing key does not compile.
import type { Messages } from './en.js';

export const bnBD: Messages = {
  app: {
    name: 'হাসপাতাল ইআরপি',
    skipToContent: 'মূল অংশে যান',
  },
  language: {
    label: 'ভাষা',
    bn: 'বাংলা',
    en: 'English',
  },
  common: {
    loading: 'লোড হচ্ছে...',
    retry: 'আবার চেষ্টা করুন',
    close: 'বন্ধ করুন',
    signOut: 'সাইন আউট',
    dismiss: 'সরিয়ে দিন',
    notifications: 'বিজ্ঞপ্তি',
  },
  validation: {
    required: 'এই ঘরটি পূরণ করা আবশ্যক।',
  },
  login: {
    title: 'সাইন ইন',
    description: 'আপনার হাসপাতালের স্টাফ অ্যাকাউন্ট ব্যবহার করুন।',
    usernameLabel: 'ইউজারনেম',
    // A field label, not a secret.
    // eslint-disable-next-line sonarjs/no-hardcoded-passwords
    passwordLabel: 'পাসওয়ার্ড',
    submit: 'সাইন ইন',
    submitting: 'সাইন ইন হচ্ছে...',
  },
  chooseHospital: {
    title: 'হাসপাতাল বেছে নিন',
    description: 'আপনার অ্যাকাউন্টে একাধিক হাসপাতালের অ্যাক্সেস আছে।',
    noAccess:
      'আপনার অ্যাকাউন্ট এখনও কোনো হাসপাতালে নিযুক্ত নয়। অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।',
    continueWith: '{name}-এ চালিয়ে যান',
  },
  nav: {
    label: 'প্রধান মেনু',
    home: 'হোম',
    more: 'আরও',
  },
  shell: {
    userMenu: 'অ্যাকাউন্ট মেনু',
    signedInAs: '{name} হিসেবে সাইন ইন করা আছে',
    switchHospital: 'হাসপাতাল পরিবর্তন করুন',
    collapseMenu: 'মেনু ছোট করুন',
    expandMenu: 'মেনু বড় করুন',
  },
  session: {
    expiringTitle: 'আপনার সেশন শেষ হতে চলেছে',
    expiringBody:
      'নিষ্ক্রিয়তার কারণে {minutes, plural, one {# মিনিট} other {# মিনিট}} পর আপনাকে সাইন আউট করা হবে।',
    stay: 'সাইন ইন থাকুন',
    expiredTitle: 'আপনার সেশন শেষ হয়েছে',
    expiredBody: 'চালিয়ে যেতে আবার সাইন ইন করুন।',
    signInAgain: 'আবার সাইন ইন করুন',
  },
  home: {
    title: 'হোম',
    welcome: 'স্বাগতম, {name}',
    hospital: 'হাসপাতাল: {name}',
    nothingYet: 'আপনার ভূমিকা অনুযায়ী মডিউল সেট আপ হলে এখানে দেখা যাবে।',
  },
  errors: {
    generic: 'কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।',
    offline: 'সার্ভারের সাথে সংযোগ করা যাচ্ছে না। আপনার সংযোগ পরীক্ষা করুন।',
    api: {
      UNAUTHENTICATED: 'অনুগ্রহ করে আবার সাইন ইন করুন।',
      INVALID_CREDENTIALS: 'ইউজারনেম বা পাসওয়ার্ড সঠিক নয়।',
      ACCOUNT_LOCKED:
        'এই অ্যাকাউন্টটি লক করা আছে। পরে চেষ্টা করুন অথবা অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।',
      PERMISSION_DENIED: 'এই কাজটি করার অনুমতি আপনার নেই।',
      CSRF_TOKEN_INVALID: 'আপনার সেশন নতুন করতে হবে। অনুগ্রহ করে আবার সাইন ইন করুন।',
      TENANT_NOT_SELECTED: 'আগে একটি হাসপাতাল বেছে নিন।',
      MEMBERSHIP_NOT_ACTIVE: 'এই হাসপাতালে আপনার অ্যাক্সেস সক্রিয় নয়।',
      NOT_FOUND: 'রেকর্ড পাওয়া যায়নি।',
      VALIDATION_FAILED: 'চিহ্নিত ঘরগুলো পরীক্ষা করুন।',
      PAYLOAD_TOO_LARGE: 'অনুরোধটি অনেক বড়। কম তথ্য পাঠিয়ে আবার চেষ্টা করুন।',
      INTERNAL_ERROR: 'আমাদের দিকে কিছু ভুল হয়েছে। আবার চেষ্টা করুন।',
      SERVICE_UNAVAILABLE: 'সেবাটি সাময়িকভাবে পাওয়া যাচ্ছে না।',
    },
  },
};
