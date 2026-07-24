import { useState, useEffect } from 'react';
import { useNavigate, Navigate, Link, useSearchParams } from 'react-router';
import { useAuth } from '../../store/AuthContext';
import { toast } from 'sonner';
import { authToast } from '../../lib/authToast';
import { Eye, EyeOff, Loader2, BarChart3, Code2, Cloud, Cpu, BrainCircuit, Bot, Database, Sparkles, Zap, Smartphone, ShieldCheck } from 'lucide-react';

function FloatingBadge({ title, icon: Icon, position, delay, colorClass, shape = 'default' }: any) {
  const shapeStyles: Record<string, React.CSSProperties> = {
    drop: { borderRadius: '30px 30px 30px 4px' },
    'drop-reverse': { borderRadius: '30px 30px 4px 30px' },
    leaf: { borderRadius: '4px 30px 4px 30px' },
    cloud: { borderRadius: '30px 50px 20px 50px / 30px 20px 50px 30px' },
    pill: { borderRadius: '9999px' },
    blob: { borderRadius: '40px 20px 40px 20px / 20px 40px 20px 40px' },
    default: { borderRadius: '16px' }
  };

  return (
    <div
      className={`absolute flex items-center gap-3 bg-white/90 backdrop-blur-md border border-slate-200/50 px-5 py-3 shadow-xl shadow-cyan-900/10 animate-float pointer-events-auto hover:bg-white transition-transform hover:scale-105 z-0 hidden lg:flex ${position}`}
      style={{ animationDelay: delay, ...shapeStyles[shape || 'default'] }}
    >
      <div className={`p-2 rounded-full bg-slate-100/80 ${colorClass}`}>
        <Icon className="w-5 h-5" />
      </div>
      <span className="text-slate-700 font-semibold text-sm whitespace-nowrap">{title}</span>
    </div>
  );
}

function FloatingQuote({ text, position, delay }: any) {
  return (
    <div
      className={`absolute hidden lg:block max-w-[320px] z-0 opacity-80 animate-float pointer-events-none ${position}`}
      style={{ animationDelay: delay }}
    >
      <div className="relative">
        <span className="absolute -top-8 -left-6 text-7xl text-cyan-500/20 font-serif font-bold leading-none">"</span>
        <p className="text-slate-700 text-xl font-medium italic leading-relaxed relative z-10 tracking-wide drop-shadow-sm">
          {text}
        </p>
      </div>
    </div>
  );
}

const ERROR_COPY: Record<string, string> = {
  pending_approval: 'Your account is pending fee admin approval. You will receive a welcome email when activated.',
  account_inactive: 'This account is inactive. Contact L&D or your fee admin for help.',
  account_expired: 'Your learner account has expired (365-day limit). Contact L&D.',
  google_auth_failed: 'Google sign-in failed. Please use email and password.',
};

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const err = searchParams.get('error');
    if (err && ERROR_COPY[err]) {
      toast.error(ERROR_COPY[err], { duration: 6000 });
      searchParams.delete('error');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Bootstrapping a stored session — avoid flashing the login form
  if (isLoading && !submitting) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 px-4">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-cyan-600" />
          <p className="text-sm font-medium">Checking session…</p>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = await login(email.trim().toLowerCase(), password);
      authToast.welcome(user.name.split(' ')[0]);
      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      const code = err?.response?.data?.code;
      const msg =
        (code && ERROR_COPY[code === 'ACCOUNT_PENDING' ? 'pending_approval' : code === 'ACCOUNT_EXPIRED' ? 'account_expired' : '']) ||
        err?.response?.data?.message ||
        'Login failed. Please check your email and password.';
      toast.error(msg, { duration: 5000 });
    } finally {
      setSubmitting(false);
    }
  }

  const busy = submitting;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-blue-50 via-white to-cyan-50 flex items-center justify-center p-4 sm:p-6 relative overflow-x-hidden overflow-y-auto">
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-cyan-400/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-purple-400/20 rounded-full blur-3xl" />
      </div>

      <div className="absolute inset-0 hidden lg:block pointer-events-none z-0 overflow-hidden">
        <FloatingQuote text="Every expert was once a beginner who refused to stop learning." position="top-[8%] left-[4%]" delay="1s" />
        <FloatingQuote text="Learn with purpose. Build with confidence. Grow without limits." position="bottom-[8%] right-[4%]" delay="3s" />
        <FloatingBadge title="Data Analytics" icon={BarChart3} position="top-[35%] left-[5%]" delay="0s" colorClass="text-cyan-500" shape="leaf" />
        <FloatingBadge title="Machine Learning" icon={BrainCircuit} position="top-[49%] left-[16%]" delay="2.5s" colorClass="text-purple-500" shape="drop" />
        <FloatingBadge title="Deep Learning" icon={Bot} position="top-[63%] left-[4%]" delay="1.5s" colorClass="text-pink-500" shape="blob" />
        <FloatingBadge title="Data Engineering" icon={Database} position="top-[77%] left-[15%]" delay="3.5s" colorClass="text-blue-500" shape="pill" />
        <FloatingBadge title="Flutter" icon={Smartphone} position="top-[91%] left-[6%]" delay="5s" colorClass="text-rose-500" shape="drop-reverse" />
        <FloatingBadge title="Cloud Computing & DevOps" icon={Cloud} position="top-[6%] right-[5%]" delay="0.5s" colorClass="text-sky-500" shape="cloud" />
        <FloatingBadge title="AWS" icon={Zap} position="top-[18%] right-[16%]" delay="4s" colorClass="text-orange-500" shape="pill" />
        <FloatingBadge title="Generative AI" icon={Cpu} position="top-[30%] right-[4%]" delay="1s" colorClass="text-teal-500" shape="leaf" />
        <FloatingBadge title="Full Stack Web" icon={Code2} position="top-[42%] right-[18%]" delay="2.5s" colorClass="text-indigo-500" shape="blob" />
        <FloatingBadge title="Cyber Security" icon={ShieldCheck} position="top-[54%] right-[6%]" delay="2s" colorClass="text-emerald-500" shape="drop" />
        <FloatingBadge title="Vibe Coding" icon={Sparkles} position="top-[66%] right-[16%]" delay="4.5s" colorClass="text-yellow-500" shape="cloud" />
      </div>

      <div className="w-full max-w-md relative z-10 flex flex-col items-center py-6 sm:py-10">
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl shadow-black/20 p-5 sm:p-8 border border-white/20 w-full">
          <div className="text-center mb-6 sm:mb-8 flex flex-col items-center">
            <div className="bg-white rounded-2xl p-2 shadow-sm mb-4 inline-block">
              <img src="/logo.png" alt="Vtricks Logo" className="h-10 sm:h-12 object-contain" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Welcome Back</h1>
            <p className="text-gray-500 text-sm">Sign in to your LMS account</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-700" htmlFor="password">Password</label>
                <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline py-1 min-h-11 inline-flex items-center">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all pr-14"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-11 min-h-11 flex items-center justify-center text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-12 py-3 px-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-base font-semibold rounded-xl hover:from-cyan-400 hover:to-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 mt-2"
            >
              {busy && <Loader2 className="w-5 h-5 animate-spin" />}
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">New student?</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <Link
            to="/signup"
            className="block w-full min-h-12 py-3 text-center text-base font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Create a student account
          </Link>
        </div>

        <p className="text-center text-xs text-slate-500 mt-5 px-2 leading-relaxed">
          Waiting for approval? Sign in after you get the welcome email.
          Wrong email/phone? Contact L&amp;D — do not create a second account.
        </p>
      </div>
    </div>
  );
}
