import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogOut,
  MailCheck,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { mapFirebaseAuthError } from '../config/firebase';
import { USER_ROLES, UserRole } from '../utils/sessionTypes';
import { evaluatePasswordRules } from './AuthPages';

export const MyAccountPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    user,
    profile,
    authLoading,
    resendVerificationEmail,
    refreshVerificationStatus,
    updateAccountProfile,
    changeAccountPassword,
    deleteUserAccount,
    signOutUser,
  } = useAuth();

  const [name, setName] = useState(profile?.name || user?.displayName || '');
  const [role, setRole] = useState<UserRole>(profile?.role || 'Other');
  const [organization, setOrganization] = useState(profile?.organization || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);

  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmNewPw, setConfirmNewPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);

  const [resendingEmail, setResendingEmail] = useState(false);
  const [checkingVerify, setCheckingVerify] = useState(false);

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setRole(profile.role);
      setOrganization(profile.organization);
    } else if (user?.displayName) {
      setName(user.displayName);
    }
  }, [profile, user]);

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-xs font-mono text-[#7392B5]">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading account…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-lg mx-auto py-12">
        <div className="lunar-panel rounded-xl p-6 text-center space-y-4">
          <h1 className="text-xl font-bold text-white">Sign in required</h1>
          <p className="text-sm text-[#7392B5]">
            My Account is available when signed in. You can sign in now or continue using all mission analysis features as a Guest.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/sign-in"
              state={{ from: '/account' }}
              className="lunar-btn px-4 py-2 text-xs font-semibold rounded-md bg-[#c9e8ff] text-[#0c0c16] hover:bg-white"
            >
              Sign in
            </Link>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="lunar-btn px-4 py-2 text-xs font-medium rounded-md bg-[#0c0c16] border border-[#272d47] text-slate-200 hover:border-[#7392B5]"
            >
              Continue as Guest
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pwRules = evaluatePasswordRules(newPw);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg(null);
    setProfileErr(null);
    if (!name.trim()) {
      setProfileErr('Name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    try {
      await updateAccountProfile({ name, role, organization });
      setProfileMsg('Session preferences updated (not saved to a database).');
    } catch (err) {
      setProfileErr(mapFirebaseAuthError(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    setPwErr(null);
    if (!currentPw) {
      setPwErr('Enter your current password to verify your identity.');
      return;
    }
    if (!pwRules.allValid) {
      setPwErr('New password must be at least 8 characters and include 1 letter and 1 number.');
      return;
    }
    if (newPw !== confirmNewPw) {
      setPwErr('New passwords do not match.');
      return;
    }
    setChangingPw(true);
    try {
      await changeAccountPassword({ currentPassword: currentPw, newPassword: newPw });
      setCurrentPw('');
      setNewPw('');
      setConfirmNewPw('');
      setPwMsg('Password updated.');
    } catch (err) {
      setPwErr(mapFirebaseAuthError(err));
    } finally {
      setChangingPw(false);
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteErr(null);
    if (!deletePassword) {
      setDeleteErr('Enter your current password to confirm account deletion.');
      return;
    }
    setDeleting(true);
    try {
      await deleteUserAccount({ currentPassword: deletePassword });
      navigate('/', { replace: true });
    } catch (err) {
      setDeleteErr(mapFirebaseAuthError(err));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5 animate-panel-in">
      <div className="lunar-panel rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-white">My Account</h1>
          <p className="text-xs font-mono text-[#7392B5]">{user.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/account/analyses"
            className="lunar-btn px-3.5 py-2 text-xs font-medium rounded-md bg-[#0c0c16] border border-[#272d47] text-[#c9e8ff] hover:border-[#7392B5]"
          >
            Session Snapshots
          </Link>
          <button
            type="button"
            onClick={() => void signOutUser().then(() => navigate('/'))}
            className="lunar-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-md bg-[#0c0c16] border border-[#272d47] text-slate-200 hover:border-[#F25F5C]/60"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      </div>

      {/* Email Verification Card */}
      <div className="lunar-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <MailCheck className={`w-5 h-5 mt-0.5 ${user.emailVerified ? 'text-[#b9f0d7]' : 'text-[#F5B83D]'}`} />
          <div className="space-y-0.5">
            <div className="text-sm font-semibold text-white">
              {user.emailVerified ? 'Email verified' : 'Email verification pending'}
            </div>
            <p className="text-xs text-[#7392B5]">
              {user.emailVerified
                ? 'Your account email is verified.'
                : 'Verify your email address using the link sent to your inbox.'}
            </p>
          </div>
        </div>
        {!user.emailVerified && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={resendingEmail}
              onClick={async () => {
                setResendingEmail(true);
                try {
                  await resendVerificationEmail();
                } finally {
                  setResendingEmail(false);
                }
              }}
              className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded bg-[#c9e8ff] text-[#0c0c16] hover:bg-white disabled:opacity-55"
            >
              {resendingEmail && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Resend verification email
            </button>
            <button
              type="button"
              disabled={checkingVerify}
              onClick={async () => {
                setCheckingVerify(true);
                try {
                  await refreshVerificationStatus();
                } finally {
                  setCheckingVerify(false);
                }
              }}
              className="lunar-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0c0c16] border border-[#272d47] text-slate-200 hover:border-[#7392B5]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingVerify ? 'animate-spin' : ''}`} />
              Check status
            </button>
          </div>
        )}
      </div>

      {/* Session Profile Preferences */}
      <form onSubmit={handleSaveProfile} className="lunar-panel rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-base font-semibold text-white">
            <UserCheck className="w-4 h-4 text-[#c9e8ff]" />
            Profile &amp; Mission Role
          </div>
          <span className="text-[11px] font-mono text-[#7392B5]">Session-only (not stored in a DB)</span>
        </div>

        {profileErr && (
          <div className="rounded-lg border border-[#F25F5C]/50 bg-[#F25F5C]/10 p-3 text-xs text-[#F25F5C] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {profileErr}
          </div>
        )}
        {profileMsg && (
          <div className="rounded-lg border border-[#b9f0d7]/50 bg-[#b9f0d7]/10 p-3 text-xs text-[#b9f0d7] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {profileMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label htmlFor="account-name" className="block text-xs font-medium text-slate-200">
              Full name
            </label>
            <input
              id="account-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="account-role" className="block text-xs font-medium text-slate-200">
              Role
            </label>
            <select
              id="account-role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="account-org" className="block text-xs font-medium text-slate-200">
            Organization
          </label>
          <input
            id="account-org"
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="University, agency, or aerospace team"
            className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
          />
        </div>

        <button
          type="submit"
          disabled={savingProfile}
          className="lunar-btn inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#c9e8ff] text-[#0c0c16] hover:bg-white disabled:opacity-55"
        >
          {savingProfile && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Apply to session
        </button>
      </form>

      {/* Change Password */}
      <form onSubmit={handleChangePassword} className="lunar-panel rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2 text-base font-semibold text-white">
          <KeyRound className="w-4 h-4 text-[#b8baff]" />
          Change Password
        </div>

        {pwErr && (
          <div className="rounded-lg border border-[#F25F5C]/50 bg-[#F25F5C]/10 p-3 text-xs text-[#F25F5C] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {pwErr}
          </div>
        )}
        {pwMsg && (
          <div className="rounded-lg border border-[#b9f0d7]/50 bg-[#b9f0d7]/10 p-3 text-xs text-[#b9f0d7] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {pwMsg}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label htmlFor="pw-current" className="block text-xs font-medium text-slate-200">
              Current password
            </label>
            <input
              id="pw-current"
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pw-new" className="block text-xs font-medium text-slate-200">
              New password
            </label>
            <input
              id="pw-new"
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="pw-confirm" className="block text-xs font-medium text-slate-200">
              Confirm new password
            </label>
            <input
              id="pw-confirm"
              type="password"
              value={confirmNewPw}
              onChange={(e) => setConfirmNewPw(e.target.value)}
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={changingPw}
          className="lunar-btn inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-md bg-[#131524] border border-[#272d47] text-white hover:border-[#c9e8ff] disabled:opacity-55"
        >
          {changingPw && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Update password
        </button>
      </form>

      {/* Danger Zone: Delete Account */}
      <div className="lunar-panel rounded-xl p-6 border-[#F25F5C]/40 space-y-3">
        <div className="flex items-center gap-2 text-base font-semibold text-[#F25F5C]">
          <ShieldAlert className="w-4 h-4" />
          Delete Account
        </div>
        <p className="text-xs text-[#7392B5] leading-relaxed">
          Permanently delete your email/password authentication account. This action cannot be undone.
        </p>

        {!showDeleteDialog ? (
          <button
            type="button"
            onClick={() => setShowDeleteDialog(true)}
            className="lunar-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-[#F25F5C]/15 border border-[#F25F5C]/50 text-[#F25F5C] hover:bg-[#F25F5C]/25"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete my account
          </button>
        ) : (
          <form onSubmit={handleDeleteAccount} className="p-4 rounded-lg bg-[#0c0c16] border border-[#F25F5C]/50 space-y-3">
            <div className="flex items-start gap-2 text-xs text-[#F5B83D]">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Confirm your current password to permanently delete your account.</span>
            </div>

            {deleteErr && <div className="text-xs text-[#F25F5C]">{deleteErr}</div>}

            <input
              type="password"
              required
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Current password"
              aria-label="Current password to confirm deletion"
              className="w-full max-w-sm bg-[#131524] border border-[#272d47] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#F25F5C]"
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={deleting}
                className="lunar-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-md bg-[#F25F5C] text-white hover:opacity-90 disabled:opacity-55"
              >
                {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {deleting ? 'Deleting…' : 'Confirm permanent deletion'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteDialog(false);
                  setDeleteErr(null);
                  setDeletePassword('');
                }}
                className="lunar-btn px-3.5 py-2 text-xs rounded-md bg-[#131524] border border-[#272d47] text-slate-300"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
