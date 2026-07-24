import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, Calendar, Target, Eye, X } from 'lucide-react';
import api from '../../../../lib/axios';
import { statusBadge } from '../shared';

interface ApiCompany {
  id: string; name: string; programCount: number; isActive: boolean;
  status: string; firstProgramStart: string; lastProgramEnd: string;
}

export function CompaniesTab() {
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<ApiCompany | null>(null);

  const { data: companies = [], isLoading } = useQuery<ApiCompany[]>({
    queryKey: ['admin-intern-companies'],
    queryFn: async () => (await api.get('/intern/admin/companies')).data.data,
  });

  const filtered = companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700">
        Companies are derived from internship Programs. Add or edit company names in the <strong>Programs</strong> tab.
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies…"
            className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400 text-xs">Loading companies…</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(c => (
            <div key={c.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:border-blue-200 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-gray-900 text-sm">{c.name}</p>
                    <p className="text-xs text-gray-400">{c.programCount} program{c.programCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                {statusBadge(c.status)}
              </div>
              <div className="space-y-1.5 text-xs text-gray-600">
                <div className="flex gap-1.5 items-center"><Calendar className="w-3 h-3 text-gray-400" /> {c.firstProgramStart} → {c.lastProgramEnd}</div>
                <div className="flex gap-1.5 items-center"><Target className="w-3 h-3 text-gray-400" /> {c.isActive ? 'Active programs' : 'No active programs'}</div>
              </div>
              <div className="mt-3">
                <button onClick={() => setDetail(c)} className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 font-semibold flex items-center gap-1">
                  <Eye className="w-3 h-3" /> View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">{detail.name}</h3>
              <button onClick={() => setDetail(null)} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Programs</span><span className="font-semibold">{detail.programCount}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Status</span>{statusBadge(detail.status)}</div>
              <div className="flex justify-between"><span className="text-gray-500">First Program</span><span className="font-semibold">{detail.firstProgramStart || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Latest End</span><span className="font-semibold">{detail.lastProgramEnd || '—'}</span></div>
              <p className="text-xs text-blue-600 bg-blue-50 rounded-xl p-3">Edit company name via Programs tab when creating or updating a program.</p>
            </div>
            <div className="px-6 pb-6">
              <button onClick={() => setDetail(null)} className="w-full py-2 text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
