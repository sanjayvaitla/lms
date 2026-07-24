import React from 'react';
import { toast } from 'sonner';
import { Copy } from 'lucide-react';

export type InternLoginCreds = { email: string; password?: string; portalUrl?: string; loginNote?: string };

export function copyText(text: string, label: string) {
  navigator.clipboard.writeText(text);
  toast.success(`${label} copied`);
}

export function InternLoginCredentials({ creds }: { creds: InternLoginCreds }) {
  const copyAll = () => {
    const lines = [
      `Email: ${creds.email}`,
      creds.password ? `Password: ${creds.password}` : '',
      creds.portalUrl ? `Portal: ${creds.portalUrl}` : '',
    ].filter(Boolean).join('\n');
    copyText(lines, 'Login details');
  };

  return (
    <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 space-y-3">
      <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide">
        Login credentials — share exact password with student
      </p>
      <div className="bg-white rounded-lg border border-emerald-100 p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] text-gray-500 font-semibold uppercase">Login email</p>
            <p className="font-bold text-gray-900 text-sm break-all">{creds.email}</p>
          </div>
          <button type="button" onClick={() => copyText(creds.email, 'Email')}
            className="shrink-0 p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg" title="Copy email">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
        {creds.password ? (
          <div className="flex items-start justify-between gap-2 pt-2 border-t border-emerald-100">
            <div>
              <p className="text-[10px] text-emerald-600 font-semibold uppercase">Password</p>
              <p className="font-bold text-emerald-900 text-sm font-mono select-all">{creds.password}</p>
            </div>
            <button type="button" onClick={() => copyText(creds.password!, 'Password')}
              className="shrink-0 p-1.5 text-emerald-700 hover:bg-emerald-100 rounded-lg" title="Copy password">
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <p className="text-[10px] text-amber-700 pt-2 border-t border-emerald-100">
            Password not stored. Use &quot;Generate New Password&quot; below to create one.
          </p>
        )}
        {creds.portalUrl && (
          <div className="pt-2 border-t border-emerald-100">
            <p className="text-[10px] text-gray-500 font-semibold uppercase mb-0.5">Portal</p>
            <a href={creds.portalUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline break-all">{creds.portalUrl}</a>
          </div>
        )}
      </div>
      {creds.loginNote && (
        <p className="text-[10px] text-emerald-700">{creds.loginNote}</p>
      )}
      <button type="button" onClick={copyAll}
        className="w-full py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
        Copy email + password
      </button>
    </div>
  );
}
