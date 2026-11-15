import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { FIREBASE_UNCONFIGURED_MESSAGE, mapFirebaseAuthError } from '../config/firebase';
import { USER_ROLES, UserRole } from '../utils/sessionTypes';
import lunarRidgeImg from '../assets/images/lunar_ridge_cta_1794599014260.jpg';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function evaluatePasswordRules(password: string) {
  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbolOrLong = /[^A-Za-z0-9]/.test(password) || password.length >= 12;
  const passedCount = [hasMinLength, hasLetter, hasNumber].filter(Boolean).length;
  const score = passedCount < 3 ? passedCount : hasSymbolOrLong ? 4 : 3;

  return {
    hasMinLength,
    hasLetter,
    hasNumber,
    allValid: hasMinLength && hasLetter && hasNumber,
    score,
  };
}

const AuthCardShell: React.FC<{
  title: string;
  subtitle: string;
  children: React.ReactNode;
}> = ({ title, subtitle, children }) => (
  <div className="min-h-[78vh] flex items-center justify-center px-4 py-8">
    <div className="w-full max-w-md space-y-5">
      <div className="text-center space-y-1">
        <Link
          to="/"
          className="inline-block text-2xl font-bold tracking-tight text-white hover:text-[#c9e8ff] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff] rounded px-1"
        >
          LUNARITHM
        </Link>
        <p className="text-xs text-[#7392B5]">Lunar South Pole Site Evaluation &amp; Decision Platform</p>
      </div>

      <div className="lunar-panel rounded-xl overflow-hidden shadow-2xl border border-[#272d47]/90">
        <div
          className="h-24 w-full relative flex items-end p-5 border-b border-[#272d47]"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(12,12,22,0.22) 0%, rgba(19,21,36,0.96) 100%), url(${lunarRidgeImg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div>
            <h1 className="text-xl font-bold text-white" style={{ textWrap: 'balance' }}>
              {title}
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">{subtitle}</p>
          </div>
        </div>

        <div className="p-6 space-y-5">{children}</div>
      </div>
    </div>
  </div>
);

export const SignUpPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConfigured, signUpWithEmail } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>('University student');
  const [organization, setOrganization] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [showPw, setShowPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const pwRules = useMemo(() => evaluatePasswordRules(password), [password]);

  const inlineErrors = useMemo(() => {
    const errs: Record<string, string> = {};
    if (touched.name && !name.trim()) {
      errs.name = 'Please enter your full name.';
    }
    if (touched.email && !EMAIL_REGEX.test(email.trim())) {
      errs.email = 'Please enter a valid email address.';
    }
    if (touched.password && !pwRules.allValid) {
      errs.password = 'Password must be at least 8 characters and include a letter and a number.';
    }
    if (touched.confirmPassword && confirmPassword !== password) {
      errs.confirmPassword = 'Passwords do not match.';
    }
    return errs;
  }, [confirmPassword, email, name, password, pwRules.allValid, touched]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, password: true, confirmPassword: true, terms: true });
    setFormError(null);

    if (!name.trim()) {
      setFormError('Please enter your full name.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!pwRules.allValid) {
      setFormError('Password must be at least 8 characters with at least one letter and one number.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }
    if (!acceptedTerms) {
      setFormError('Please accept the Terms and Privacy Policy to create an account.');
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail({
        name,
        email,
        password,
        role,
        organization,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(mapFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConfigured) {
    return (
      <AuthCardShell title="Create your account" subtitle="Account status">
        <div className="rounded-lg border border-[#c9e8ff]/40 bg-[#0c0c16] p-4 text-sm text-slate-200">
          {FIREBASE_UNCONFIGURED_MESSAGE}
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white"
        >
          Continue as Guest
          <ArrowRight className="w-4 h-4" />
        </button>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="Create your account"
      subtitle="Create an email account to personalize your mission workspace."
    >
      {formError && (
        <div
          role="alert"
          className="rounded-lg border border-[#F25F5C]/55 bg-[#F25F5C]/10 p-3 text-xs text-[#F25F5C] flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
        <div className="space-y-1">
          <label htmlFor="signup-name" className="block text-xs font-medium text-slate-200">
            Full name
          </label>
          <div className="relative">
            <UserIcon className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signup-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, name: true }))}
              placeholder="Your full name"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
          </div>
          {inlineErrors.name && <p className="text-[11px] text-[#F25F5C]">{inlineErrors.name}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-email" className="block text-xs font-medium text-slate-200">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="explorer@mission.org"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
          </div>
          {inlineErrors.email && <p className="text-[11px] text-[#F25F5C]">{inlineErrors.email}</p>}
        </div>

        <div className="space-y-1.5">
          <label htmlFor="signup-password" className="block text-xs font-medium text-slate-200">
            Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signup-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              placeholder="At least 8 characters"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-2.5 p-1 text-[#7392B5] hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          <div className="space-y-1.5 pt-1">
            <div className="grid grid-cols-4 gap-1 h-1.5">
              {[1, 2, 3, 4].map((level) => {
                const active = pwRules.score >= level;
                const colorClass =
                  pwRules.score <= 1
                    ? 'bg-[#F25F5C]'
                    : pwRules.score === 2
                    ? 'bg-[#F5B83D]'
                    : 'bg-[#b9f0d7]';
                return (
                  <div
                    key={level}
                    className={`rounded-full transition-colors ${active ? colorClass : 'bg-[#272d47]'}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              {[
                { met: pwRules.hasMinLength, label: '8+ characters' },
                { met: pwRules.hasLetter, label: '1 letter' },
                { met: pwRules.hasNumber, label: '1 number' },
              ].map((rule) => (
                <span
                  key={rule.label}
                  className={`inline-flex items-center gap-1 ${
                    rule.met ? 'text-[#b9f0d7]' : 'text-[#7392B5]'
                  }`}
                >
                  <Check className={`w-3 h-3 ${rule.met ? 'opacity-100' : 'opacity-35'}`} />
                  {rule.label}
                </span>
              ))}
            </div>
          </div>
          {inlineErrors.password && <p className="text-[11px] text-[#F25F5C]">{inlineErrors.password}</p>}
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-confirm-password" className="block text-xs font-medium text-slate-200">
            Confirm password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signup-confirm-password"
              type={showConfirmPw ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, confirmPassword: true }))}
              placeholder="Repeat your password"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw((v) => !v)}
              aria-label={showConfirmPw ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-2.5 top-2.5 p-1 text-[#7392B5] hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
            >
              {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {inlineErrors.confirmPassword && (
            <p className="text-[11px] text-[#F25F5C]">{inlineErrors.confirmPassword}</p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-role" className="block text-xs font-medium text-slate-200">
            I am a…
          </label>
          <select
            id="signup-role"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="signup-org" className="block text-xs font-medium text-slate-200">
            Organization <span className="text-[#7392B5] font-normal">(optional)</span>
          </label>
          <input
            id="signup-org"
            type="text"
            autoComplete="organization"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Alexandria University, NASA, Space Lab…"
            className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
          />
        </div>

        <label className="flex items-start gap-2.5 pt-1 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-0.5 rounded border-[#272d47] bg-[#0c0c16] text-[#c9e8ff] focus:ring-2 focus:ring-[#c9e8ff]"
          />
          <span>
            I agree to the{' '}
            <Link to="/about" className="text-[#c9e8ff] underline hover:text-white">
              Terms and Privacy Policy
            </Link>
            .
          </span>
        </label>
        {touched.terms && !acceptedTerms && (
          <p className="text-[11px] text-[#F25F5C]">Please accept the Terms and Privacy Policy.</p>
        )}

        <p className="text-[11px] text-[#7392B5] leading-relaxed">
          Session-only preferences: your role, organization, and mission analyses are kept in memory during your session and are not saved to a database.
        </p>

        <button
          type="submit"
          disabled={submitting}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-55 transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#131524] border border-[#272d47] text-slate-200 hover:border-[#7392B5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
        >
          Continue as Guest
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="pt-3 border-t border-[#272d47] text-center text-xs text-[#7392B5]">
        Already have an account?{' '}
        <Link to="/sign-in" className="text-[#c9e8ff] hover:text-white font-medium">
          Sign in
        </Link>
      </div>
    </AuthCardShell>
  );
};

export const SignInPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isConfigured, signInWithEmail, showToast } = useAuth();

  const returnTo = (location.state as { from?: string } | null)?.from || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_REGEX.test(email.trim()) || !password) {
      showToast('Continuing in Guest mode — all LUNARITHM tools are unlocked.');
      navigate(returnTo, { replace: true });
      return;
    }

    setSubmitting(true);
    try {
      await signInWithEmail({ email, password, rememberMe });
      navigate(returnTo, { replace: true });
    } catch {
      showToast('Continuing in Guest mode — all LUNARITHM tools are unlocked.');
      navigate(returnTo, { replace: true });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isConfigured) {
    return (
      <AuthCardShell title="Sign in to LUNARITHM" subtitle="Authentication status">
        <div className="rounded-lg border border-[#c9e8ff]/40 bg-[#0c0c16] p-4 text-sm text-slate-200">
          {FIREBASE_UNCONFIGURED_MESSAGE}
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white"
        >
          Continue as Guest
          <ArrowRight className="w-4 h-4" />
        </button>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="Sign in to LUNARITHM"
      subtitle="Sign in with your email and password, or explore immediately as a Guest."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="signin-email" className="block text-xs font-medium text-slate-200">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signin-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="explorer@mission.org"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label htmlFor="signin-password" className="block text-xs font-medium text-slate-200">
              Password
            </label>
            <Link to="/forgot-password" className="text-xs text-[#c9e8ff] hover:text-white">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="signin-password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-2.5 p-1 text-[#7392B5] hover:text-white rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="rounded border-[#272d47] bg-[#0c0c16] text-[#c9e8ff] focus:ring-2 focus:ring-[#c9e8ff]"
          />
          Remember me on this device
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-55 transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-[#131524] border border-[#272d47] text-slate-200 hover:border-[#7392B5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9e8ff]"
        >
          Continue as Guest
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </form>

      <div className="pt-3 border-t border-[#272d47] text-center text-xs text-[#7392B5]">
        New here?{' '}
        <Link to="/sign-up" className="text-[#c9e8ff] hover:text-white font-medium">
          Create an account
        </Link>
      </div>
    </AuthCardShell>
  );
};

export const ForgotPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { isConfigured, sendPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState(false);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const id = window.setInterval(() => {
      setCooldownSeconds((s) => (s > 1 ? s - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);
    if (!EMAIL_REGEX.test(email.trim())) {
      setValidationError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      await sendPasswordReset(email);
    } catch {
      // Security best practice: do not disclose whether an email is registered
    } finally {
      setSubmitting(false);
      setSubmittedNotice(true);
      setCooldownSeconds(60);
    }
  };

  if (!isConfigured) {
    return (
      <AuthCardShell title="Reset your password" subtitle="Authentication status">
        <div className="rounded-lg border border-[#c9e8ff]/40 bg-[#0c0c16] p-4 text-sm text-slate-200">
          {FIREBASE_UNCONFIGURED_MESSAGE}
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white"
        >
          Continue as Guest
          <ArrowRight className="w-4 h-4" />
        </button>
      </AuthCardShell>
    );
  }

  return (
    <AuthCardShell
      title="Reset your password"
      subtitle="Enter your account email and we will send a secure reset link."
    >
      {validationError && (
        <div
          role="alert"
          className="rounded-lg border border-[#F25F5C]/55 bg-[#F25F5C]/10 p-3 text-xs text-[#F25F5C] flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {submittedNotice && (
        <div className="rounded-lg border border-[#b9f0d7]/50 bg-[#b9f0d7]/10 p-3.5 text-xs text-[#b9f0d7] flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.
          </span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="reset-email" className="block text-xs font-medium text-slate-200">
            Email address
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#7392B5] absolute left-3 top-3" />
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="explorer@mission.org"
              className="w-full bg-[#0c0c16] border border-[#272d47] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-[#7392B5]/70 focus:outline-none focus:ring-2 focus:ring-[#c9e8ff] focus:border-[#c9e8ff]"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting || cooldownSeconds > 0}
          className="lunar-btn w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#c9e8ff] text-[#0c0c16] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-55 transition-colors"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          {submitting
            ? 'Sending reset link…'
            : cooldownSeconds > 0
            ? `Resend available in ${cooldownSeconds}s`
            : 'Send reset link'}
        </button>
      </form>

      <div className="pt-3 border-t border-[#272d47] flex items-center justify-between text-xs text-[#7392B5]">
        <Link to="/sign-in" className="text-[#c9e8ff] hover:text-white font-medium">
          Back to Sign in
        </Link>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="text-slate-300 hover:text-white underline"
        >
          Continue as Guest
        </button>
      </div>
    </AuthCardShell>
  );
};
