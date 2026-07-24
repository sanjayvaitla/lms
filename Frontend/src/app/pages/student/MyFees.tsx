import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  IndianRupee, CheckCircle2, Clock, AlertCircle, Loader2,
  Wallet, CalendarDays, Receipt, FileText, Download,
} from 'lucide-react';
import api from '../../../lib/axios';
import { useAuth } from '../../../store/AuthContext';
import PaymentModal from '../../components/PaymentModal';

interface Invoice {
  id: string;
  invoice_number: string;
  amount: string;
  created_at: string;
  program_name?: string | null;
  installment_key?: string | null;
  installment_label?: string | null;
}

type InstKey = 'registration' | 'installment1' | 'installment2' | 'installment3';

interface FeeRecord {
  id: string;
  fees_offered: string | null;
  registration_expected: string | null;
  registration_amount: string | null;
  registration_date: string | null;
  installment1_expected: string | null;
  installment1_amount: string | null;
  installment1_date: string | null;
  installment2_expected: string | null;
  installment2_amount: string | null;
  installment2_date: string | null;
  installment3_expected: string | null;
  installment3_amount: string | null;
  installment3_date: string | null;
  due_amount: string | null;
  enrolled_month: string | null;
  month_label?: string | null;
  remarks: string | null;
}

interface Proof {
  fee_id: string;
  installment_key: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

interface InstallmentDef {
  key: InstKey;
  label: string;
  expectedKey: keyof FeeRecord;
  amountKey: keyof FeeRecord;
  dateKey: keyof FeeRecord;
}

const INSTALLMENTS: InstallmentDef[] = [
  { key: 'registration', label: 'Registration Fee', expectedKey: 'registration_expected', amountKey: 'registration_amount', dateKey: 'registration_date' },
  { key: 'installment1', label: '1st Installment', expectedKey: 'installment1_expected', amountKey: 'installment1_amount', dateKey: 'installment1_date' },
  { key: 'installment2', label: '2nd Installment', expectedKey: 'installment2_expected', amountKey: 'installment2_amount', dateKey: 'installment2_date' },
  { key: 'installment3', label: '3rd Installment', expectedKey: 'installment3_expected', amountKey: 'installment3_amount', dateKey: 'installment3_date' },
];

const num = (v: string | null | undefined) => (v ? parseFloat(v) : 0);
const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

function openInvoice(invoiceId: string) {
  // Stay inside LMS — same tab (never a new browser window)
  window.location.assign(`/invoice/${invoiceId}`);
}

function installmentValues(fee: FeeRecord, def: InstallmentDef) {
  const expected = num(fee[def.expectedKey] as string | null);
  const amount = num(fee[def.amountKey] as string | null);
  const date = fee[def.dateKey] as string | null;
  return { expected, amount, date };
}

export default function MyFees() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pay, setPay] = useState<{ feeId: string; key: InstKey; label: string; amount: number } | null>(null);

  const { data: fees = [], isLoading, isError: feesError } = useQuery<FeeRecord[]>({
    queryKey: ['my-fees'],
    queryFn: async () => {
      const { data } = await api.get('/fees-v2/my-fees');
      return data.data ?? [];
    },
    enabled: !!user,
  });

  const { data: proofs = [] } = useQuery<Proof[]>({
    queryKey: ['my-proofs'],
    queryFn: async () => {
      const { data } = await api.get('/payments/proofs/mine');
      return data.data ?? [];
    },
    enabled: !!user,
  });

  const { data: invoices = [], isError: invoicesError, refetch: refetchInvoices } = useQuery<Invoice[]>({
    queryKey: ['my-invoices'],
    queryFn: async () => {
      const { data } = await api.get('/invoices/student/mine');
      return data.data ?? [];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const invoiceHistory = useMemo(
    () => [...invoices].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [invoices],
  );

  function closePaymentModal() {
    setPay(null);
    qc.invalidateQueries({ queryKey: ['my-fees'] });
    qc.invalidateQueries({ queryKey: ['my-proofs'] });
    qc.invalidateQueries({ queryKey: ['my-invoices'] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-7 h-7 text-blue-400 animate-spin" />
      </div>
    );
  }

  if (feesError) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-600 flex items-center gap-2">
        <AlertCircle className="w-4 h-4 shrink-0" />
        Failed to load fee records. Refresh to try again.
      </div>
    );
  }

  if (!fees.length) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-center">
        <Wallet className="w-12 h-12 text-slate-600" />
        <h2 className="text-lg font-semibold text-slate-900">No fee records yet</h2>
        <p className="text-sm text-slate-500">Your fee docket will appear here once the fees admin sets it up.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Receipt className="w-6 h-6 text-blue-400" /> My Fees
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          View payment status below. Download invoices from Invoice History after verification.
        </p>
      </div>

      {invoicesError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            Could not load invoices.
          </span>
          <button type="button" onClick={() => refetchInvoices()} className="text-xs font-semibold underline">
            Retry
          </button>
        </div>
      )}

      {fees.map((fee) => {
        const offered = num(fee.fees_offered);
        const paid = INSTALLMENTS.reduce((sum, def) => sum + num(fee[def.amountKey] as string | null), 0);
        const due = Math.max(offered - paid, 0);

        return (
          <div key={fee.id} className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200">
              <Stat label="Total Fees" value={fmt(offered)} tint="text-slate-900" />
              <Stat label="Paid" value={fmt(paid)} tint="text-blue-400" />
              <Stat label="Due" value={fmt(due)} tint={due > 0 ? 'text-amber-400' : 'text-blue-400'} />
            </div>

            {fee.month_label && (
              <div className="px-5 pt-3 text-xs text-slate-500 flex items-center gap-1.5">
                <CalendarDays className="w-3.5 h-3.5" /> {fee.month_label.trim()}
              </div>
            )}

            <div className="p-4 sm:p-5 space-y-2.5">
              {INSTALLMENTS.map((def) => {
                const { expected, amount, date } = installmentValues(fee, def);
                if (expected === 0 && amount === 0) return null;

                const proof = proofs.find((p) => p.fee_id === fee.id && p.installment_key === def.key);
                const isPaid = amount > 0 && amount >= expected;
                const pendingProof = proof?.status === 'PENDING';

                return (
                  <div
                    key={def.key}
                    className="flex items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">{def.label}</p>
                      <p className="text-xs text-slate-500">
                        Expected {fmt(expected)}{date ? ` · due ${fmtDate(date)}` : ''}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      {isPaid ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid {fmt(amount)}
                        </span>
                      ) : pendingProof ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <Clock className="w-3.5 h-3.5" /> Under review
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPay({ feeId: fee.id, key: def.key, label: def.label, amount: expected || amount })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-900 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg hover:opacity-90 transition-all"
                        >
                          <IndianRupee className="w-3.5 h-3.5" /> Pay
                        </button>
                      )}
                      {proof?.status === 'REJECTED' && (
                        <p className="text-[11px] text-rose-400 mt-1 flex items-center gap-1 justify-end">
                          <AlertCircle className="w-3 h-3" /> Rejected — re-upload
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {fee.remarks && (
              <div className="px-5 pb-4 -mt-1">
                <p className="text-xs text-slate-500">Note: {fee.remarks}</p>
              </div>
            )}
          </div>
        );
      })}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 mb-1">
          <FileText className="w-4 h-4 text-cyan-400" /> Invoice History
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Invoices appear here after your payment is verified. Click a row to view, print, or save as PDF.
        </p>

        {invoiceHistory.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl px-4 py-8 text-center text-sm text-slate-500">
            No invoices yet. They will be generated when verified payments are recorded.
          </div>
        ) : (
          <div className="space-y-2">
            {invoiceHistory.map((inv) => (
              <button
                key={inv.id}
                type="button"
                onClick={() => openInvoice(inv.id)}
                className="w-full flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors text-left"
              >
                <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {inv.installment_label ?? inv.invoice_number}
                  </p>
                  <p className="text-xs text-slate-500">
                    {inv.invoice_number} · {fmtDate(inv.created_at)}
                    {inv.program_name ? ` · ${inv.program_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-bold text-blue-400">{fmt(num(inv.amount))}</span>
                  <Download className="w-4 h-4 text-emerald-600" aria-hidden />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {pay && user && (
        <PaymentModal
          feeId={pay.feeId}
          studentId={user.id}
          installmentKey={pay.key}
          installmentLabel={pay.label}
          amount={pay.amount}
          studentName={user.name ?? 'Student'}
          onClose={closePaymentModal}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <div className="px-4 py-4 text-center">
      <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${tint}`}>{value}</p>
    </div>
  );
}
