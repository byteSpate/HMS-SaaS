// English catalog: the source of truth for message keys (FR-I18N-002, ADR-017).
// The Bangla catalog is typed against this one, so a missing key fails the TypeScript build.
// Keys are English identifiers. Arguments use ICU syntax: {name}, {count, plural, ...}.
export const en = {
  app: {
    name: 'Hospital ERP',
    skipToContent: 'Skip to main content',
  },
  language: {
    label: 'Language',
    // Language names are written in their own language in every catalog.
    bn: 'বাংলা',
    en: 'English',
  },
  common: {
    loading: 'Loading...',
    retry: 'Try again',
    close: 'Close',
    signOut: 'Sign out',
    dismiss: 'Dismiss',
    notifications: 'Notifications',
  },
  validation: {
    required: 'This field is required.',
  },
  login: {
    title: 'Sign in',
    description: 'Use your hospital staff account.',
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    submit: 'Sign in',
    submitting: 'Signing in...',
  },
  chooseHospital: {
    title: 'Choose a hospital',
    description: 'Your account has access to more than one hospital.',
    noAccess: 'Your account is not assigned to any hospital yet. Ask your administrator.',
    continueWith: 'Continue to {name}',
  },
  nav: {
    label: 'Main navigation',
    home: 'Home',
    more: 'More',
  },
  shell: {
    userMenu: 'Account menu',
    signedInAs: 'Signed in as {name}',
    switchHospital: 'Switch hospital',
    collapseMenu: 'Collapse menu',
    expandMenu: 'Expand menu',
  },
  session: {
    expiringTitle: 'Your session is about to end',
    expiringBody:
      'You will be signed out in {minutes, plural, one {# minute} other {# minutes}} because of inactivity.',
    stay: 'Stay signed in',
    expiredTitle: 'Your session has ended',
    expiredBody: 'Please sign in again to continue.',
    signInAgain: 'Sign in again',
  },
  home: {
    title: 'Home',
    welcome: 'Welcome, {name}',
    hospital: 'Hospital: {name}',
    nothingYet: 'Your modules appear here as they are set up for your role.',
  },
  errors: {
    generic: 'Something went wrong. Please try again.',
    offline: 'Cannot reach the server. Check your connection.',
    // One entry per API error code (@hms/contracts errorCodes), looked up by code at runtime.
    api: {
      UNAUTHENTICATED: 'Please sign in again.',
      INVALID_CREDENTIALS: 'The username or password is not correct.',
      ACCOUNT_LOCKED: 'This account is locked. Try again later or contact your administrator.',
      PERMISSION_DENIED: 'You do not have permission to do this.',
      CSRF_TOKEN_INVALID: 'Your session needs to be refreshed. Please sign in again.',
      TENANT_NOT_SELECTED: 'Choose a hospital first.',
      MEMBERSHIP_NOT_ACTIVE: 'Your access to this hospital is not active.',
      NOT_FOUND: 'Record not found.',
      VALIDATION_FAILED: 'Please check the highlighted fields.',
      PAYLOAD_TOO_LARGE: 'The request is too large. Send less data and try again.',
      INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
      SERVICE_UNAVAILABLE: 'The service is temporarily unavailable.',
    },
  },
} as const;

type Widen<T> = { -readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every language catalog must have. */
export type Messages = Widen<typeof en>;
