import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Crosshair,
  ExternalLink,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  FIREBASE_OAUTH_CLIENT_ID,
  FIREBASE_PROJECT_ID,
  auth,
  googleProvider,
} from '../firebase';
import { isEmailAllowed } from '../utils/authAllowlist';
import { InfoTooltip } from './InfoTooltip';

interface AuthGateProps {
  user: User | null;
  accessDeniedEmail?: string | null;
  onClearAccessDenied?: () => void;
  onVerifiedRefresh: () => Promise<void>;
}

type EmailMode = 'login' | 'register' | 'reset';

interface GoogleCredentialResponse {
  credential?: string;
}

interface GoogleAccountsIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    itp_support?: boolean;
  }) => void;
  renderButton: (
    parent: HTMLElement,
    options: {
      type?: 'standard' | 'icon';
      theme?: 'outline' | 'filled_blue' | 'filled_black';
      size?: 'large' | 'medium' | 'small';
      text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
      shape?: 'rectangular' | 'pill' | 'circle' | 'square';
      logo_alignment?: 'left' | 'center';
      width?: number;
      locale?: string;
    }
  ) => void;
  cancel?: () => void;
}

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: GoogleAccountsIdApi;
      };
    };
  }
}

function detectMobileBrowserContext(): {
  isIOS: boolean;
  isMobile: boolean;
  isInAppBrowser: boolean;
} {
  if (typeof navigator === 'undefined') {
    return { isIOS: false, isMobile: false, isInAppBrowser: false };
  }
  const ua = navigator.userAgent || '';
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isMobile = isIOS || /Android|Mobile/i.test(ua);
  const isInAppBrowser =
    /Telegram|FBAN|FBAV|Instagram|Line|MicroMessenger|wv\)/i.test(ua);
  return { isIOS, isMobile, isInAppBrowser };
}

function mapFirebaseAuthError(code: string): {
  message: string;
  showEmailProviderHint?: boolean;
} {
  switch (code) {
    case 'auth/operation-not-allowed':
      return {
        message:
          'Logowanie hasłem nie jest jeszcze włączone w konsoli Firebase. Włącz metodę „Adres e-mail/hasło” w Firebase Console.',
        showEmailProviderHint: true,
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        message:
          'Nieprawidłowy adres e-mail lub hasło. Jeśli wcześniej logowano się tylko przez Google, kliknij „Ustaw / resetuj hasło”.',
      };
    case 'auth/email-already-in-use':
      return {
        message:
          'Konto z tym adresem e-mail już istnieje. Zaloguj się przyciskiem Google lub kliknij „Ustaw / resetuj hasło”.',
      };
    case 'auth/weak-password':
      return { message: 'Hasło musi mieć co najmniej 6 znaków.' };
    case 'auth/invalid-email':
      return { message: 'Podaj poprawny adres e-mail.' };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { message: 'Okno logowania Google zostało zamknięte.' };
    case 'auth/popup-blocked':
      return {
        message:
          'Przeglądarka zablokowała okno logowania Google. Zezwól na wyskakujące okna lub zaloguj się przez e-mail i hasło poniżej.',
      };
    case 'auth/missing-initial-state':
    case 'auth/web-storage-unsupported':
      return {
        message:
          'Przeglądarka mobilna zablokowała sesję logowania Google. Otwórz stronę bezpośrednio w Safari/Chrome lub zaloguj się e-mailem.',
      };
    case 'auth/unauthorized-domain':
      return {
        message:
          'Ta domena nie jest autoryzowana w Firebase Authentication. Zaloguj się przez e-mail i hasło lub dodaj domenę w Firebase Console.',
      };
    case 'auth/too-many-requests':
      return {
        message: 'Zbyt wiele prób logowania. Odczekaj chwilę i spróbuj ponownie.',
      };
    default:
      return { message: 'Nie udało się zalogować. Spróbuj ponownie.' };
  }
}

export const AuthGate: React.FC<AuthGateProps> = ({
  user,
  accessDeniedEmail,
  onClearAccessDenied,
  onVerifiedRefresh,
}) => {
  const [emailMode, setEmailMode] = useState<EmailMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [showProviderGuide, setShowProviderGuide] = useState(false);
  const [gisReady, setGisReady] = useState(false);
  const [gisFailed, setGisFailed] = useState(false);

  const gisContainerRef = useRef<HTMLDivElement | null>(null);
  const clearDeniedRef = useRef(onClearAccessDenied);
  clearDeniedRef.current = onClearAccessDenied;

  const browserCtx = useMemo(() => detectMobileBrowserContext(), []);

  useEffect(() => {
    if (user && isEmailAllowed(user.email) && !user.emailVerified) return;
    if (!FIREBASE_OAUTH_CLIENT_ID) {
      setGisFailed(true);
      return;
    }

    let cancelled = false;

    const initGisButton = () => {
      if (cancelled) return;
      const gsiId = window.google?.accounts?.id;
      const container = gisContainerRef.current;
      if (!gsiId || !container) return;

      gsiId.initialize({
        client_id: FIREBASE_OAUTH_CLIENT_ID,
        itp_support: true,
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: async (response: GoogleCredentialResponse) => {
          if (!response?.credential) return;
          setLoading(true);
          setErrorMsg(null);
          setInfoMsg(null);
          setShowProviderGuide(false);
          clearDeniedRef.current?.();
          try {
            const cred = GoogleAuthProvider.credential(response.credential);
            const result = await signInWithCredential(auth, cred);
            if (!isEmailAllowed(result.user.email)) {
              const blockedEmail = result.user.email || 'ten adres e-mail';
              await signOut(auth);
              setErrorMsg(
                `Brak dostępu. Adres ${blockedEmail} nie znajduje się na liście uprawnionych administratorów serwisu.`
              );
            }
          } catch (err: unknown) {
            const code = (err as { code?: string })?.code || '';
            setErrorMsg(mapFirebaseAuthError(code).message);
          } finally {
            setLoading(false);
          }
        },
      });

      container.innerHTML = '';
      const width = Math.min(390, Math.max(220, container.clientWidth || 320));
      gsiId.renderButton(container, {
        type: 'standard',
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width,
        locale: 'pl',
      });
      setGisReady(true);
    };

    if (window.google?.accounts?.id) {
      initGisButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-gis-client="true"]'
    );
    if (existingScript) {
      const onLoad = () => initGisButton();
      const onError = () => {
        if (!cancelled) setGisFailed(true);
      };
      existingScript.addEventListener('load', onLoad);
      existingScript.addEventListener('error', onError);
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', onLoad);
        existingScript.removeEventListener('error', onError);
      };
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.gisClient = 'true';
    script.onload = () => initGisButton();
    script.onerror = () => {
      if (!cancelled) setGisFailed(true);
    };
    document.head.appendChild(script);

    return () => {
      cancelled = true;
    };
  }, [user]);

  const deniedMessage = accessDeniedEmail
    ? `Brak dostępu. Adres ${accessDeniedEmail} nie znajduje się na liście uprawnionych administratorów serwisu.`
    : null;

  const handlePopupGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setShowProviderGuide(false);
    onClearAccessDenied?.();
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      if (!isEmailAllowed(cred.user.email)) {
        const blockedEmail = cred.user.email || 'ten adres e-mail';
        await signOut(auth);
        setErrorMsg(
          `Brak dostępu. Adres ${blockedEmail} nie znajduje się na liście uprawnionych administratorów serwisu.`
        );
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      setErrorMsg(mapFirebaseAuthError(code).message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMsg('Podaj adres e-mail.');
      return;
    }

    onClearAccessDenied?.();

    if (!isEmailAllowed(trimmedEmail)) {
      setInfoMsg(null);
      setShowProviderGuide(false);
      setErrorMsg(
        `Brak dostępu. Adres ${trimmedEmail} nie znajduje się na liście uprawnionych administratorów serwisu.`
      );
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    setShowProviderGuide(false);

    try {
      if (emailMode === 'reset') {
        await sendPasswordResetEmail(auth, trimmedEmail);
        setInfoMsg(
          `Wysłano link do ustawienia/resetu hasła na adres ${trimmedEmail}.`
        );
      } else if (emailMode === 'register') {
        const cred = await createUserWithEmailAndPassword(
          auth,
          trimmedEmail,
          password
        );
        await sendEmailVerification(cred.user);
        setInfoMsg(
          `Konto utworzone. Wysłaliśmy link weryfikacyjny na ${trimmedEmail}.`
        );
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      const mapped = mapFirebaseAuthError(code);
      setErrorMsg(mapped.message);
      if (mapped.showEmailProviderHint) {
        setShowProviderGuide(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!user || !isEmailAllowed(user.email)) return;
    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);
    try {
      await sendEmailVerification(user);
      setInfoMsg(`Wysłaliśmy ponownie link aktywacyjny na ${user.email}.`);
    } catch {
      setErrorMsg('Odczekaj chwilę przed ponownym wysłaniem linku.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckVerification = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await onVerifiedRefresh();
      if (auth.currentUser && !auth.currentUser.emailVerified) {
        setErrorMsg(
          'Adres e-mail nie został jeszcze potwierdzony. Kliknij link w wiadomości i sprawdź ponownie.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const brandLockup = (
    <div className="flex items-center gap-2 border-b border-slate-100 pb-4 sm:pb-5">
      <Crosshair className="h-5 w-5 text-[#e88a00]" />
      <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900">
        AIRSOFT Serwis
      </span>
      <span className="text-slate-300" aria-hidden="true">
        /
      </span>
      <span className="font-display text-xs sm:text-sm font-medium text-slate-600">
        Panel Administratora
      </span>
    </div>
  );

  if (user && isEmailAllowed(user.email) && !user.emailVerified) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f3f4f2] p-3.5 sm:p-6">
        <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 sm:p-7">
          {brandLockup}

          <h1 className="mt-5 font-display text-lg font-bold text-slate-900">
            Potwierdź swój adres e-mail
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">
            Aby zabezpieczyć dostęp do bazy zleceń napraw, diagnostyki i zakupów części, kliknij link aktywacyjny wysłany na{' '}
            <span className="font-semibold text-slate-900">{user.email}</span>.
          </p>

          {errorMsg && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </p>
          )}
          {infoMsg && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {infoMsg}
            </p>
          )}

          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              disabled={loading}
              onClick={handleCheckVerification}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#cf7b00] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Potwierdziłem — wejdź do bazy
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={handleResendVerification}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Mail className="h-3.5 w-3.5" />
              Wyślij link ponownie
            </button>

            <button
              type="button"
              disabled={loading}
              onClick={() => void signOut(auth)}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              Użyj innego konta e-mail
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeError = errorMsg || deniedMessage;

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f3f4f2] p-3.5 sm:p-6">
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 sm:p-7">
        {brandLockup}

        <div className="mt-5 flex items-center gap-2">
          <h1 className="font-display text-lg sm:text-xl font-bold text-slate-900">
            Logowanie do bazy serwisu ASG
          </h1>
          <InfoTooltip text="Dostęp mają wyłącznie uprawnieni administratorzy warsztatu (zweryfikowane konto Google lub e-mail)." />
        </div>

        {browserCtx.isInAppBrowser && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-950">
            <div className="flex items-start gap-2">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-[#b86d00]" />
              <p className="leading-relaxed">
                Otwarto z wbudowanej przeglądarki aplikacji. Jeśli przycisk Google nie otworzy okna, użyj Safari/Chrome lub zaloguj się e-mailem poniżej.
              </p>
            </div>
          </div>
        )}

        <div className="mt-5">
          <div
            ref={gisContainerRef}
            className={gisReady ? 'flex w-full justify-center min-h-[42px]' : 'hidden'}
          />

          {(!gisReady || gisFailed) && (
            <button
              type="button"
              disabled={loading}
              onClick={handlePopupGoogleLogin}
              className="inline-flex w-full items-center justify-center gap-2.5 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin text-[#e88a00]" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#EA4335"
                    d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.9 1.5l2.7-2.6C16.9 3.3 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"
                  />
                </svg>
              )}
              Zaloguj przez konto Google
            </button>
          )}
        </div>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-[11px] font-medium text-slate-400">
            lub przez e-mail i hasło
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              setEmailMode('login');
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className={`rounded-md py-1.5 transition-colors ${
              emailMode === 'login'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Logowanie
          </button>
          <button
            type="button"
            onClick={() => {
              setEmailMode('register');
              setErrorMsg(null);
              setInfoMsg(null);
            }}
            className={`rounded-md py-1.5 transition-colors ${
              emailMode === 'register'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Nowe konto
          </button>
        </div>

        <form onSubmit={handleEmailSubmit} className="mt-4 space-y-3">
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-medium text-slate-700"
            >
              Adres e-mail
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="serwis@airsoft-custom.pl"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
            />
          </div>

          {emailMode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="auth-password"
                  className="block text-xs font-medium text-slate-700"
                >
                  Hasło
                </label>
                {emailMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmailMode('reset');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="text-[11px] font-medium text-[#b86d00] hover:underline"
                  >
                    Ustaw / resetuj hasło
                  </button>
                )}
              </div>
              <input
                id="auth-password"
                type="password"
                required
                minLength={6}
                autoComplete={
                  emailMode === 'register' ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 znaków"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#e88a00] focus:outline-none"
              />
            </div>
          )}

          {activeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <div className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                <p>{activeError}</p>
              </div>
              {showProviderGuide && (
                <div className="mt-2 border-t border-red-200/70 pt-2 text-[11px] text-red-800">
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline"
                  >
                    Otwórz ustawienia logowania w Firebase
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          )}

          {infoMsg && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              {infoMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[#e88a00] px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#cf7b00] disabled:opacity-60"
          >
            {emailMode === 'register'
              ? 'Utwórz konto e-mail'
              : emailMode === 'reset'
              ? 'Wyślij link ustawienia hasła'
              : 'Zaloguj się przez e-mail'}
          </button>

          {emailMode === 'reset' && (
            <button
              type="button"
              onClick={() => {
                setEmailMode('login');
                setErrorMsg(null);
              }}
              className="w-full py-1 text-center text-xs text-slate-500 hover:text-slate-800"
            >
              Wróć do logowania
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
