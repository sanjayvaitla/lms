import { useState } from 'react';
import { useNavigate, Navigate, Link } from 'react-router';
import { useAuth } from '../../store/AuthContext';
import api from '../../lib/axios';
import { toast } from 'sonner';
import {
  GraduationCap, Eye, EyeOff, Loader2, User, Mail, Lock,
  Phone, Calendar, Briefcase, BookOpen, Clock,
  ChevronRight, ChevronLeft, CheckCircle2, MapPin,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface FormData {
  // Step 1 — Personal
  name: string;
  email: string;
  phone: string;
  dob: string;
  address: string;
  // Step 2 — Background
  role: string;
  occupation: string;
  qualification: string;
  graduationYear: string;
  // Step 3 — Preferences
  classPreference: string;
  leadSource: string;
  // Step 4 — Account
  password: string;
  confirmPassword: string;
}

const STEPS = [
  { id: 1, label: 'Personal Info',   icon: User },
  { id: 2, label: 'Background',      icon: Briefcase },
  { id: 3, label: 'Preferences',     icon: Clock },
  { id: 4, label: 'Create Account',  icon: Lock },
];

const inputCls = 'w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-gray-50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-400 transition-all placeholder-gray-400';
const labelCls = 'block text-sm font-medium text-gray-700 mb-1.5';
const selectCls = inputCls + ' cursor-pointer';

function passwordMeetsPolicy(pw: string): boolean {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /\d/.test(pw);
}

export default function SignupPage() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: '', email: '', phone: '', dob: '', address: '',
    role: 'STUDENT', occupation: '', qualification: '', graduationYear: '',
    classPreference: '', leadSource: '',
    password: '', confirmPassword: '',
  });

  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  const set = (key: keyof FormData, val: string) => setForm(f => ({ ...f, [key]: val }));

  function validateStep(): boolean {
    if (step === 1) {
      if (!form.name.trim())  { toast.error('Full name is required'); return false; }
      if (!form.email.trim()) { toast.error('Email is required'); return false; }
      if (!/\S+@\S+\.\S+/.test(form.email)) { toast.error('Enter a valid email'); return false; }
      if (!form.phone.trim()) { toast.error('Phone number is required'); return false; }
      if (!/^\d{10}$/.test(form.phone.replace(/\s/g, ''))) { toast.error('Enter a valid 10-digit phone number'); return false; }
      if (!form.dob) { toast.error('Date of birth is required'); return false; }
    }
    if (step === 2) {
      if (!form.occupation)    { toast.error('Please select your occupation'); return false; }
      if (!form.qualification.trim()) { toast.error('Qualification is required'); return false; }
    }
    if (step === 3) {
      if (!form.classPreference) { toast.error('Please select class preference'); return false; }
    }
    if (step === 4) {
      if (!passwordMeetsPolicy(form.password)) {
        toast.error('Password must be 8+ chars with uppercase, lowercase, and a number');
        return false;
      }
      if (form.password !== form.confirmPassword) { toast.error('Passwords do not match'); return false; }
    }
    return true;
  }

  const [checkingEmail, setCheckingEmail] = useState(false);

  async function next() {
    if (!validateStep()) return;

    if (step === 1) {
      setCheckingEmail(true);
      try {
        const { data } = await api.get(`/auth/check-email?email=${encodeURIComponent(form.email)}`);
        if (data.data?.exists) {
          toast.error('Email already registered');
          setCheckingEmail(false);
          return;
        }
      } catch (err) {
        console.error('Failed to check email', err);
      }
      setCheckingEmail(false);
    }

    setStep(s => s + 1);
  }

  function back() { setStep(s => s - 1); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        name:             form.name.trim(),
        email:            form.email.trim().toLowerCase(),
        password:         form.password,
        phoneNumber:      form.phone.trim(),
        dateOfBirth:      form.dob || null,
        address:          form.address.trim() || null,
        occupation:       form.occupation || null,
        qualification:    form.qualification.trim() || null,
        graduationYear:   form.graduationYear.trim() || null,
        classPreference:  form.classPreference || null,
        leadSource:       form.leadSource || null,
        role:             form.role,
      });
      if (!data.success) throw new Error(data.message);

      // Students start PENDING — no auto-login (sessions are not issued until approved)
      toast.success('Account created! It is pending approval — you can sign in once the fee admin activates it.');
      navigate('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  const progress = ((step - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-dvh bg-gradient-to-br from-[#0a1628] via-[#0f2447] to-[#0a1628] flex items-center justify-center p-4 sm:p-6 relative overflow-x-hidden overflow-y-auto">
      {/* Background glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative z-10 py-6">
        <div className="bg-white rounded-3xl shadow-2xl shadow-black/30 overflow-hidden">

          {/* Top brand bar */}
          <div className="bg-gradient-to-r from-[#0a1628] to-[#0f2447] px-8 py-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-white p-2 rounded-xl flex items-center justify-center">
                <img src="/logo.png" alt="Vtricks Logo" className="h-8 object-contain" />
              </div>
              <div>
                <p className="text-cyan-400 text-xs mt-1 font-medium tracking-wider uppercase">Student Registration</p>
              </div>
            </div>

            {/* Step indicators */}
            <div className="flex items-center gap-2">
              {STEPS.map((s, i) => {
                const Icon = s.icon;
                const done = step > s.id;
                const active = step === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-2 flex-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      done   ? 'bg-emerald-500' :
                      active ? 'bg-cyan-500' :
                      'bg-white/10'
                    }`}>
                      {done
                        ? <CheckCircle2 className="w-4 h-4 text-white" />
                        : <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-white/40'}`} />}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className="flex-1 h-0.5 rounded-full bg-white/10">
                        <div className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                          style={{ width: step > s.id ? '100%' : '0%' }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-white/60 text-xs mt-2">Step {step} of {STEPS.length} — {STEPS[step-1].label}</p>
          </div>

          {/* Form body */}
          <form onSubmit={handleSubmit} className="p-8">

            {/* ── Step 1: Personal Info ── */}
            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Personal Information</h2>
                  <p className="text-gray-500 text-sm mt-0.5">Tell us about yourself</p>
                </div>

                <div>
                  <label className={labelCls}>I am registering as *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['STUDENT', 'INTERN'].map(opt => (
                      <button key={opt} type="button" onClick={() => set('role', opt)}
                        className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                          form.role === opt
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}>
                        {opt === 'STUDENT' ? 'Training Student' : 'Intern'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Full Name *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.name} onChange={e => set('name', e.target.value)}
                      placeholder="e.g. Shreyas S Gowda" className={inputCls + ' pl-10'} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                        placeholder="you@email.com" className={inputCls + ' pl-10'} />
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Phone Number *</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                        placeholder="9876543210" maxLength={10} className={inputCls + ' pl-10'} />
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Date of Birth *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="date" value={form.dob} onChange={e => set('dob', e.target.value)}
                      max={new Date().toISOString().split('T')[0]}
                      className={inputCls + ' pl-10'} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Address</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <textarea value={form.address} onChange={e => set('address', e.target.value)}
                      placeholder="Your full address" rows={2}
                      className={inputCls + ' pl-10 resize-none'} />
                  </div>
                </div>
              </div>
            )}

            {/* ── Step 2: Background ── */}
            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Your Background</h2>
                  <p className="text-gray-500 text-sm mt-0.5">Help us understand your profile</p>
                </div>

                <div>
                  <label className={labelCls}>Occupation *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Student', 'Fresher', 'Working Professional', 'Career Switcher', 'Other'].map(opt => (
                      <button key={opt} type="button" onClick={() => set('occupation', opt)}
                        className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all text-left ${
                          form.occupation === opt
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Highest Qualification *</label>
                  <div className="relative">
                    <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input value={form.qualification} onChange={e => set('qualification', e.target.value)}
                      placeholder="e.g. B.Tech (CS), MBA, B.Com" className={inputCls + ' pl-10'} />
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Year of Graduation / Passing</label>
                  <select value={form.graduationYear} onChange={e => set('graduationYear', e.target.value)} className={selectCls}>
                    <option value="">Select year</option>
                    {Array.from({ length: 15 }, (_, i) => 2026 - i).map(y => (
                      <option key={y} value={String(y)}>{y}</option>
                    ))}
                    <option value="Pursuing">Currently Pursuing</option>
                  </select>
                </div>
              </div>
            )}

            {/* ── Step 3: Preferences ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Your Preferences</h2>
                  <p className="text-gray-500 text-sm mt-0.5">Help us schedule your classes</p>
                </div>

                <div>
                  <label className={labelCls}>Class Preference *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['Weekday', 'Weekend', 'Both'].map(opt => (
                      <button key={opt} type="button" onClick={() => set('classPreference', opt)}
                        className={`px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                          form.classPreference === opt
                            ? 'border-cyan-500 bg-cyan-50 text-cyan-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
                        }`}>
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className={labelCls}>How did you hear about us?</label>
                  <select value={form.leadSource} onChange={e => set('leadSource', e.target.value)} className={selectCls}>
                    <option value="">Select (optional)</option>
                    {['Website', 'Referral', 'Social Media', 'Campus Drive', 'Walk-in', 'Other'].map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4">
                  <p className="text-sm text-cyan-700 font-medium">Almost done!</p>
                  <p className="text-xs text-cyan-600 mt-1">One more step — create your account password to complete registration.</p>
                </div>
              </div>
            )}

            {/* ── Step 4: Account ── */}
            {step === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Create Your Account</h2>
                  <p className="text-gray-500 text-sm mt-0.5">Set a secure password to complete registration</p>
                </div>

                {/* Summary */}
                <div className="bg-cyan-50 border border-cyan-100 rounded-2xl p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-cyan-700 mb-2">Registration Summary</p>
                  {[
                    { label: 'Name',        value: form.name },
                    { label: 'Email',       value: form.email },
                    { label: 'Phone',       value: form.phone },
                    { label: 'Occupation',  value: form.occupation },
                    { label: 'Classes',     value: form.classPreference },
                  ].map(({ label, value }) => value ? (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-800 text-right max-w-[60%] truncate">{value}</span>
                    </div>
                  ) : null)}
                </div>

                <div>
                  <label className={labelCls}>Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showPw ? 'text' : 'password'} value={form.password}
                      onChange={e => set('password', e.target.value)}
                      placeholder="Min. 8 characters" className={inputCls + ' pl-10 pr-11'} />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className={labelCls}>Confirm Password *</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type={showConfirm ? 'text' : 'password'} value={form.confirmPassword}
                      onChange={e => set('confirmPassword', e.target.value)}
                      placeholder="Re-enter password" className={`${inputCls} pl-10 pr-11 ${
                        form.confirmPassword && form.password !== form.confirmPassword ? 'border-rose-300 focus:border-rose-400' :
                        form.confirmPassword && form.password === form.confirmPassword ? 'border-emerald-300 focus:border-emerald-400' : ''
                      }`} />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p className="text-xs text-rose-500 mt-1">Passwords do not match</p>
                  )}
                  {form.confirmPassword && form.password === form.confirmPassword && (
                    <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Passwords match</p>
                  )}
                </div>
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex gap-3 mt-6">
              {step > 1 && (
                <button type="button" onClick={back}
                  className="flex items-center gap-2 px-5 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors">
                  <ChevronLeft className="w-4 h-4" /> Back
                </button>
              )}
              {step < 4 ? (
                <button type="button" onClick={next} disabled={checkingEmail}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:opacity-90 shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-60">
                  {checkingEmail ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking...</> : <>Continue <ChevronRight className="w-4 h-4" /></>}
                </button>
              ) : (
                <button type="submit" disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl hover:opacity-90 disabled:opacity-60 shadow-lg shadow-emerald-500/20 transition-all">
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Account…</> : <><CheckCircle2 className="w-4 h-4" /> Complete Registration</>}
                </button>
              )}
            </div>

            <p className="text-center text-sm text-gray-500 mt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-cyan-600 font-medium hover:underline">Sign in</Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
