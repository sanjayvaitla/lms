import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User, Mail, Phone, Calendar, MapPin, Briefcase, GraduationCap,
  Clock, Shield, Edit3, X, Loader2, Save, Info, Github, Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import type { User as UserType } from '../../../types/api';
import { INPUT_CLS, LABEL_CLS } from '../../../lib/constants';

type ProfileForm = {
  name: string;
  dateOfBirth: string;
  address: string;
  occupation: string;
  qualification: string;
  graduationYear: string;
  classPreference: string;
  leadSource: string;
  githubUsername: string;
};

const OCCUPATIONS = ['Student', 'Working Professional', 'Fresher', 'Career Switcher', 'Other'];
const CLASS_PREFS = ['Weekday', 'Weekend', 'Both'];
const LEAD_SOURCES = ['Website', 'Referral', 'Social Media', 'Campus Drive', 'Walk-in', 'Other'];

function emptyForm(): ProfileForm {
  return {
    name: '', dateOfBirth: '', address: '',
    occupation: '', qualification: '', graduationYear: '',
    classPreference: '', leadSource: '', githubUsername: '',
  };
}

function formFromUser(u: UserType): ProfileForm {
  return {
    name: u.name ?? '',
    dateOfBirth: u.dateOfBirth ? String(u.dateOfBirth).slice(0, 10) : '',
    address: u.address ?? '',
    occupation: u.occupation ?? '',
    qualification: u.qualification ?? '',
    graduationYear: u.graduationYear ?? '',
    classPreference: u.classPreference ?? '',
    leadSource: u.leadSource ?? '',
    githubUsername: u.githubUsername ?? '',
  };
}

function Field({ label, value, icon: Icon, locked }: { label: string; value: string; icon: React.ElementType; locked?: boolean }) {
  return (
    <div className="flex items-start gap-3 p-4">
      <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">
          {label}
          {locked && <Lock className="w-3 h-3 text-slate-400" />}
        </p>
        <p className="text-sm font-medium text-slate-900 mt-0.5 break-words">{value || '—'}</p>
      </div>
    </div>
  );
}

export default function MyProfilePage() {
  const { user, setAuth, accessToken } = useAuth();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProfileForm>(emptyForm());
  const isLearner = user?.role === 'STUDENT' || user?.role === 'INTERN';

  const { data: profile, isLoading, refetch } = useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data.data as UserType;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) setForm(formFromUser(profile));
  }, [profile]);

  const saveMut = useMutation({
    mutationFn: async (payload: ProfileForm) => {
      const body: Record<string, unknown> = {
        name: payload.name.trim(),
        dateOfBirth: payload.dateOfBirth || null,
        address: payload.address.trim() || null,
        occupation: payload.occupation || null,
        qualification: payload.qualification.trim() || null,
        graduationYear: payload.graduationYear || null,
        classPreference: payload.classPreference || null,
        leadSource: payload.leadSource || null,
      };
      if (isLearner) {
        body.githubUsername = payload.githubUsername.trim().replace(/^@/, '') || null;
      }
      const { data } = await api.patch('/auth/profile', body);
      return data.data as UserType;
    },
    onSuccess: (updated) => {
      if (accessToken) setAuth(updated, accessToken);
      qc.setQueryData(['my-profile'], updated);
      void qc.invalidateQueries({ queryKey: ['student-assignments'] });
      void qc.invalidateQueries({ queryKey: ['my-profile'] });
      void qc.invalidateQueries({ queryKey: ['intern-tasks'] });
      void qc.invalidateQueries({ queryKey: ['intern-profile'] });
      setEditing(false);
      toast.success('Profile updated');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'Failed to update profile');
    },
  });

  if (!user) return null;

  if (isLoading || !profile) {
    return (
      <div className="max-w-3xl mx-auto w-full space-y-4">
        <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
        <div className="h-64 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const set = (key: keyof ProfileForm, val: string) => setForm((f) => ({ ...f, [key]: val }));

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-slate-500 text-sm mt-1">Keep education details current. Login identity is locked for safety.</p>
        </div>
        {!editing ? (
          <button
            onClick={() => { setForm(formFromUser(profile)); setEditing(true); }}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
          >
            <Edit3 className="w-4 h-4" /> Edit profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => { setEditing(false); setForm(formFromUser(profile)); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
            <button
              disabled={saveMut.isPending || !form.name.trim()}
              onClick={() => saveMut.mutate(form)}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-60"
            >
              {saveMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save changes
            </button>
          </div>
        )}
      </div>

      

      {/* Hero */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-slate-900 text-lg font-semibold">{profile.name}</h2>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-100 mt-1.5">
              <Shield className="w-3 h-3" /> {profile.role}
            </span>
          </div>
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-50">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Personal</h3>
            </div>
            <Field label="Full name" value={profile.name} icon={User} />
            <Field label="Email" value={profile.email} icon={Mail} locked />
            <Field label="Phone" value={profile.phoneNumber ?? ''} icon={Phone} locked />
            <Field
              label="Date of birth"
              value={profile.dateOfBirth
                ? new Date(profile.dateOfBirth).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                : ''}
              icon={Calendar}
            />
            <Field label="Address" value={profile.address ?? ''} icon={MapPin} />
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm divide-y divide-slate-50">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-800">Education & preferences</h3>
            </div>
            <Field label="Occupation" value={profile.occupation ?? ''} icon={Briefcase} />
            <Field label="Qualification" value={profile.qualification ?? ''} icon={GraduationCap} />
            <Field label="Graduation year" value={profile.graduationYear ?? ''} icon={Calendar} />
            <Field label="Class preference" value={profile.classPreference ?? ''} icon={Clock} />
            <Field label="Lead source" value={profile.leadSource ?? ''} icon={Info} />
            {isLearner && (
              <Field
                label="GitHub username"
                value={profile.githubUsername ? `@${profile.githubUsername}` : ''}
                icon={Github}
              />
            )}
            <Field
              label="Member since"
              value={new Date(profile.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              icon={Calendar}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Personal details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>Full name *</label>
                <input className={INPUT_CLS} value={form.name} onChange={(e) => set('name', e.target.value)} />
              </div>
              <div>
                <label className={LABEL_CLS}>Email (locked)</label>
                <input className={`${INPUT_CLS} bg-slate-50 text-slate-500`} value={profile.email} disabled />
              </div>
              <div>
                <label className={LABEL_CLS}>Phone (locked)</label>
                <input className={`${INPUT_CLS} bg-slate-50 text-slate-500`} value={profile.phoneNumber ?? ''} disabled />
              </div>
              <div>
                <label className={LABEL_CLS}>Date of birth</label>
                <input type="date" className={INPUT_CLS} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>Address</label>
                <textarea
                  className={`${INPUT_CLS} min-h-[80px] resize-y`}
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="Street, city, state, PIN"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h3 className="text-sm font-semibold text-slate-800 mb-3">Education & preferences</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>Occupation</label>
                <select className={INPUT_CLS} value={form.occupation} onChange={(e) => set('occupation', e.target.value)}>
                  <option value="">Select</option>
                  {OCCUPATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Qualification</label>
                <input className={INPUT_CLS} value={form.qualification} onChange={(e) => set('qualification', e.target.value)} placeholder="e.g. B.Tech CSE" />
              </div>
              <div>
                <label className={LABEL_CLS}>Graduation year</label>
                <select className={INPUT_CLS} value={form.graduationYear} onChange={(e) => set('graduationYear', e.target.value)}>
                  <option value="">Select</option>
                  {Array.from({ length: 15 }, (_, i) => 2026 - i).map((y) => (
                    <option key={y} value={String(y)}>{y}</option>
                  ))}
                  <option value="Pursuing">Currently Pursuing</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLS}>Class preference</label>
                <select className={INPUT_CLS} value={form.classPreference} onChange={(e) => set('classPreference', e.target.value)}>
                  <option value="">Select</option>
                  {CLASS_PREFS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={LABEL_CLS}>How did you hear about us?</label>
                <select className={INPUT_CLS} value={form.leadSource} onChange={(e) => set('leadSource', e.target.value)}>
                  <option value="">Select</option>
                  {LEAD_SOURCES.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {isLearner && (
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold text-slate-800 mb-1 flex items-center gap-2">
                <Github className="w-4 h-4" /> GitHub username
              </h3>
              <p className="text-xs text-slate-500 mb-3">
                Required for GitHub assignments. Does <strong>not</strong> need to match your real name or email —
                must match your GitHub login exactly, and must be unique (one learner per username).
              </p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
                <input
                  className={`${INPUT_CLS} pl-8`}
                  value={form.githubUsername}
                  onChange={(e) => set('githubUsername', e.target.value.replace(/\s/g, ''))}
                  placeholder="your-github-login"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {!editing && (
        <p className="text-center text-xs text-slate-400">
          Wrong email or phone? Contact L&amp;D — do not create a second signup.
          <button type="button" onClick={() => refetch()} className="ml-2 text-blue-600 hover:underline">Refresh</button>
          {isLearner && !profile.githubUsername && (
            <> · <button type="button" onClick={() => setEditing(true)} className="text-blue-600 hover:underline">Add GitHub username</button></>
          )}
        </p>
      )}
    </div>
  );
}
