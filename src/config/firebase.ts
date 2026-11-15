import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import firebaseAppletConfig from '../../firebase-applet-config.json';

/**
 * Public Firebase Web configuration.
 * All Firebase Web SDK config values are public identifiers. No secrets or admin keys live here.
 * Configured strictly for Email/Password Firebase Authentication without database persistence.
 */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export const firebaseConfig: FirebaseWebConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
};

export function hasConfiguredFirebase(cfg: FirebaseWebConfig = firebaseConfig): boolean {
  return (
    Boolean(cfg.apiKey) &&
    Boolean(cfg.projectId) &&
    Boolean(cfg.appId) &&
    !cfg.apiKey.startsWith('YOUR_') &&
    !cfg.projectId.startsWith('YOUR_') &&
    !cfg.appId.startsWith('YOUR_')
  );
}

export const isFirebaseConfigured = hasConfiguredFirebase(firebaseConfig);

export const FIREBASE_UNCONFIGURED_MESSAGE =
  'Accounts are not configured on this deployment yet — you can use every feature as a Guest.';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
}

export function mapFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment or reset your password.';
    case 'auth/network-request-failed':
      return 'You appear to be offline. Check your connection and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 8 characters and include a letter and a number.';
    case 'auth/operation-not-allowed':
    case 'auth/unauthorized-domain':
      return 'Account sign-in is unavailable here right now — continuing in Guest mode.';
    case 'auth/requires-recent-login':
      return 'Please verify your current password before making this security update.';
    default:
      return error instanceof Error ? error.message : 'Authentication failed. Please try again.';
  }
}

export { app, auth };
