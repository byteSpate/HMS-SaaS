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
  mfa: {
    setupTitle: 'দুই-ধাপের সাইন-ইন চালু করুন',
    setupDescription:
      'আপনার ভূমিকার জন্য সাইন-ইনে একটি দ্বিতীয় ধাপ লাগে। আপনার ফোনে একটি অথেনটিকেটর অ্যাপ ইনস্টল করুন (যেমন Google Authenticator বা Microsoft Authenticator)।',
    startSetup: 'সেট-আপ কোড দেখান',
    scanCode: 'অ্যাপ দিয়ে এই কোডটি স্ক্যান করুন, তারপর অ্যাপে দেখানো ৬ অঙ্কের কোডটি দিন।',
    qrLabel: 'আপনার অথেনটিকেটর অ্যাপের জন্য QR কোড',
    manualKey: 'স্ক্যান করতে পারছেন না? এর বদলে অ্যাপে এই কী-টি লিখুন:',
    turnOn: 'দুই-ধাপের সাইন-ইন চালু করুন',
    verifyTitle: 'দুই-ধাপের সাইন-ইন',
    verifyDescription: 'আপনার অথেনটিকেটর অ্যাপ থেকে ৬ অঙ্কের কোডটি দিন।',
    codeLabel: '৬ অঙ্কের কোড',
    recoveryCodeLabel: 'রিকভারি কোড',
    useRecoveryCode: 'ফোন হারিয়েছেন? একটি রিকভারি কোড ব্যবহার করুন',
    useAppCode: 'অ্যাপের কোড ব্যবহার করুন',
    continue: 'চালিয়ে যান',
    recoveryTitle: 'আপনার রিকভারি কোডগুলো সংরক্ষণ করুন',
    recoveryDescription:
      'ফোন হারালে এই প্রতিটি কোড দিয়ে একবার সাইন ইন করা যাবে। কোডগুলো লিখে রাখুন বা নিরাপদ কোথাও রাখুন। এগুলো আর দেখানো হবে না।',
    recoverySaved: 'আমি কোডগুলো সংরক্ষণ করেছি',
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
      MFA_CODE_INVALID: 'কোডটি সঠিক নয় অথবা আগেই ব্যবহার করা হয়েছে। সর্বশেষ কোডটি দিন।',
      ACCOUNT_LOCKED:
        'এই অ্যাকাউন্টটি লক করা আছে। পরে চেষ্টা করুন অথবা অ্যাডমিনিস্ট্রেটরের সাথে যোগাযোগ করুন।',
      PERMISSION_DENIED: 'এই কাজটি করার অনুমতি আপনার নেই।',
      MFA_REQUIRED: 'আগে আপনার অথেনটিকেটর অ্যাপ দিয়ে নিশ্চিত করুন যে এটি আপনি।',
      CSRF_TOKEN_INVALID: 'আপনার সেশন নতুন করতে হবে। অনুগ্রহ করে আবার সাইন ইন করুন।',
      TENANT_NOT_SELECTED: 'আগে একটি হাসপাতাল বেছে নিন।',
      MEMBERSHIP_NOT_ACTIVE: 'এই হাসপাতালে আপনার অ্যাক্সেস সক্রিয় নয়।',
      ENTITLEMENT_MISSING: 'এই হাসপাতাল এই মডিউলটি ব্যবহার করে না।',
      NOT_FOUND: 'রেকর্ড পাওয়া যায়নি।',
      INVALID_TRANSITION: 'বর্তমান অবস্থায় এই রেকর্ডটি এভাবে পরিবর্তন করা যায় না।',
      VALIDATION_FAILED: 'চিহ্নিত ঘরগুলো পরীক্ষা করুন।',
      PAYLOAD_TOO_LARGE: 'অনুরোধটি অনেক বড়। কম তথ্য পাঠিয়ে আবার চেষ্টা করুন।',
      RATE_LIMITED: 'অনেকবার চেষ্টা করা হয়েছে। কয়েক মিনিট অপেক্ষা করে আবার চেষ্টা করুন।',
      INTERNAL_ERROR: 'আমাদের দিকে কিছু ভুল হয়েছে। আবার চেষ্টা করুন।',
      SERVICE_UNAVAILABLE: 'সেবাটি সাময়িকভাবে পাওয়া যাচ্ছে না।',
    },
  },
};
