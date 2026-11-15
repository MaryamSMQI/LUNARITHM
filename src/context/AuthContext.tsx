import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  EmailAuthProvider,
  User,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../config/firebase';
import { UserProfileSession, UserRole } from '../utils/sessionTypes';

interface AuthContextValue {
  user: User | null;
  profile: UserProfileSession | null;
  authLoading: boolean;
  isConfigured: boolean;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  clearToast: () => void;
  signUpWithEmail: (params: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    organization: string;
  }) => Promise<UserProfileSession>;
  signInWithEmail: (params: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<UserProfileSession | null>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshVerificationStatus: () => Promise<boolean>;
  updateAccountProfile: (params: {
    name: string;
    role: UserRole;
    organization: string;
  }) => Promise<void>;
  changeAccountPassword: (params: {
    currentPassword: string;
    newPassword: string;
  }) => Promise<void>;
  deleteUserAccount: (params: { currentPassword: string }) => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfileSession | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(isFirebaseConfigured);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
  }, []);

  const clearToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  useEffect(() => {
    if (!toastMessage) return;
    const id = window.setTimeout(() => setToastMessage(null), 4500);
    return () => window.clearTimeout(id);
  }, [toastMessage]);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      if (nextUser) {
        setProfile((prev) => ({
          name:
            nextUser.displayName ||
            prev?.name ||
            nextUser.email?.split('@')[0] ||
            'Lunar Explorer',
          email: nextUser.email || prev?.email || '',
          role: prev?.role || 'Other',
          organization: prev?.organization || '',
        }));
      } else {
        setProfile(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signUpWithEmail = useCallback(
    async (params: {
      name: string;
      email: string;
      password: string;
      role: UserRole;
      organization: string;
    }): Promise<UserProfileSession> => {
      if (!auth) throw new Error('Firebase Auth is not configured.');
      await setPersistence(auth, browserLocalPersistence);
      const cred = await createUserWithEmailAndPassword(auth, params.email.trim(), params.password);
      await updateProfile(cred.user, { displayName: params.name.trim() });

      // Kept strictly in session memory — not persisted to any database
      const sessionProfile: UserProfileSession = {
        name: params.name.trim(),
        email: params.email.trim(),
        role: params.role,
        organization: params.organization.trim(),
      };
      setProfile(sessionProfile);

      try {
        const returnUrl = `${window.location.href.split('#')[0]}#/`;
        await sendEmailVerification(cred.user, { url: returnUrl });
      } catch {
        try {
          await sendEmailVerification(cred.user);
        } catch {
          // Verification email can be resent from the banner if needed
        }
      }

      showToast(`Welcome to LUNARITHM, ${sessionProfile.name}! Check your inbox to verify your email.`);
      return sessionProfile;
    },
    [showToast]
  );

  const signInWithEmail = useCallback(
    async (params: {
      email: string;
      password: string;
      rememberMe: boolean;
    }): Promise<UserProfileSession | null> => {
      if (!auth) throw new Error('Firebase Auth is not configured.');
      await setPersistence(
        auth,
        params.rememberMe ? browserLocalPersistence : browserSessionPersistence
      );
      const cred = await signInWithEmailAndPassword(auth, params.email.trim(), params.password);
      const sessionProfile: UserProfileSession = {
        name: cred.user.displayName || cred.user.email?.split('@')[0] || 'Lunar Explorer',
        email: cred.user.email || '',
        role: 'Other',
        organization: '',
      };
      setProfile(sessionProfile);
      showToast(`Welcome back, ${sessionProfile.name}!`);
      return sessionProfile;
    },
    [showToast]
  );

  const sendPasswordReset = useCallback(async (email: string) => {
    if (!auth) throw new Error('Firebase Auth is not configured.');
    const returnUrl = `${window.location.href.split('#')[0]}#/sign-in`;
    try {
      await sendPasswordResetEmail(auth, email.trim(), { url: returnUrl });
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/unauthorized-continue-uri' || code === 'auth/invalid-continue-uri') {
        await sendPasswordResetEmail(auth, email.trim());
      } else {
        throw err;
      }
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth?.currentUser) throw new Error('No active user session.');
    const returnUrl = `${window.location.href.split('#')[0]}#/`;
    try {
      await sendEmailVerification(auth.currentUser, { url: returnUrl });
    } catch {
      await sendEmailVerification(auth.currentUser);
    }
    showToast('Verification email sent. Check your inbox and spam folder.');
  }, [showToast]);

  const refreshVerificationStatus = useCallback(async (): Promise<boolean> => {
    if (!auth?.currentUser) return false;
    await auth.currentUser.reload();
    const refreshed = auth.currentUser;
    setUser(refreshed);
    if (refreshed.emailVerified) {
      showToast('Email verified!');
    }
    return refreshed.emailVerified;
  }, [showToast]);

  const updateAccountProfile = useCallback(
    async (params: { name: string; role: UserRole; organization: string }) => {
      if (!auth?.currentUser) throw new Error('You must be signed in.');
      await updateProfile(auth.currentUser, { displayName: params.name.trim() });
      setProfile((prev) => ({
        name: params.name.trim(),
        email: prev?.email || auth?.currentUser?.email || '',
        role: params.role,
        organization: params.organization.trim(),
      }));
      showToast('Session profile updated (not saved to a database).');
    },
    [showToast]
  );

  const changeAccountPassword = useCallback(
    async (params: { currentPassword: string; newPassword: string }) => {
      if (!auth?.currentUser || !auth.currentUser.email) {
        throw new Error('Password change requires an active email/password session.');
      }
      const credential = EmailAuthProvider.credential(auth.currentUser.email, params.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, params.newPassword);
      showToast('Password updated successfully.');
    },
    [showToast]
  );

  const deleteUserAccount = useCallback(
    async (params: { currentPassword: string }) => {
      if (!auth?.currentUser || !auth.currentUser.email) {
        throw new Error('You must be signed in.');
      }
      const cred = EmailAuthProvider.credential(auth.currentUser.email, params.currentPassword);
      await reauthenticateWithCredential(auth.currentUser, cred);
      await deleteUser(auth.currentUser);
      setUser(null);
      setProfile(null);
      showToast('Your account has been deleted.');
    },
    [showToast]
  );

  const signOutUser = useCallback(async () => {
    if (!auth) return;
    await signOut(auth);
    setUser(null);
    setProfile(null);
    showToast('Signed out. Workspace remains active in Guest mode.');
  }, [showToast]);

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        authLoading,
        isConfigured: isFirebaseConfigured,
        toastMessage,
        showToast,
        clearToast,
        signUpWithEmail,
        signInWithEmail,
        sendPasswordReset,
        resendVerificationEmail,
        refreshVerificationStatus,
        updateAccountProfile,
        changeAccountPassword,
        deleteUserAccount,
        signOutUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
