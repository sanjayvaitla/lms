import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import {
  X, Upload, CheckCircle2, Clock, XCircle, Smartphone,
  Copy, ExternalLink, Loader2, ImageIcon, IndianRupee,
} from 'lucide-react';
import api from '../../lib/axios';

interface Props {
  feeId: string;
  studentId: string;
  installmentKey: 'registration' | 'installment1' | 'installment2' | 'installment3';
  installmentLabel: string;
  amount: number;
  studentName: string;
  onClose: () => void;
}

const INSTALLMENT_LABELS: Record<string, string> = {
  registration:  'Registration Fee',
  installment1:  '1st Installment',
  installment2:  '2nd Installment',
  installment3:  '3rd Installment',
};

const STATUS_CONFIG = {
  PENDING:  { cls: 'text-amber-400 bg-amber-500/15 border-amber-500/30',   icon: Clock,        label: 'Pending Verification' },
  VERIFIED: { cls: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30', icon: CheckCircle2, label: 'Payment Verified' },
  REJECTED: { cls: 'text-rose-400 bg-rose-500/15 border-rose-500/30',      icon: XCircle,      label: 'Rejected' },
};

export default function PaymentModal({ feeId, studentId, installmentKey, installmentLabel, amount, studentName, onClose }: Props) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<'qr' | 'upload'>('qr');
  const [studentUpi, setStudentUpi] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));

  // Fetch UPI settings
  const { data: upi } = useQuery({
    queryKey: ['upi-settings'],
    queryFn: async () => { const { data } = await api.get('/payments/upi'); return data.data; },
  });

  // Fetch existing proofs for this installment
  const { data: myProofs = [] } = useQuery<any[]>({
    queryKey: ['my-proofs'],
    queryFn: async () => { const { data } = await api.get('/payments/proofs/mine'); return data.data ?? []; },
  });

  const existingProof = myProofs.find(p => p.fee_id === feeId && p.installment_key === installmentKey);

  // Build UPI deep link
  const upiId   = upi?.upi_id   ?? 'vtricks@upi';
  const upiName = upi?.upi_name ?? 'Vtricks LMS';
  const txnNote = `${INSTALLMENT_LABELS[installmentKey]} - ${studentName}`.slice(0, 50);
  const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&cu=INR`;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = ev => setPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
    setStep('upload');
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const form = new FormData();
      form.append('proof', file);
      form.append('fee_id', feeId);
      form.append('installment_key', installmentKey);
      form.append('amount', String(amount));
      if (studentUpi) form.append('student_upi', studentUpi);
      if (paymentDate) form.append('payment_date', paymentDate);
      await api.post('/payments/proofs/submit', form);
    },
    onSuccess: () => {
      toast.success('Payment proof submitted! Admin will verify shortly.');
      qc.invalidateQueries({ queryKey: ['my-proofs'] });
      qc.invalidateQueries({ queryKey: ['my-fees'] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message ?? 'Upload failed'),
  });

  const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0D1B2E] border border-white/10 rounded-2xl shadow-2xl w-full max-w-md">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-bold text-lg">Make Payment</h2>
            <p className="text-gray-400 text-sm">{installmentLabel} &nbsp;·&nbsp; <span className="text-emerald-400 font-semibold">{fmt(amount)}</span></p>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* Existing proof status */}
          {existingProof && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${STATUS_CONFIG[existingProof.status as keyof typeof STATUS_CONFIG]?.cls ?? ''}`}>
              {(() => { const cfg = STATUS_CONFIG[existingProof.status as keyof typeof STATUS_CONFIG]; const Icon = cfg?.icon ?? Clock; return <Icon className="w-4 h-4 flex-shrink-0" />; })()}
              <div>
                <p className="text-sm font-semibold">{STATUS_CONFIG[existingProof.status as keyof typeof STATUS_CONFIG]?.label}</p>
                {existingProof.note && <p className="text-xs opacity-70 mt-0.5">{existingProof.note}</p>}
              </div>
            </div>
          )}

          {/* Step tabs */}
          <div className="flex gap-1 bg-white/5 rounded-xl p-1">
            {(['qr', 'upload'] as const).map(s => (
              <button key={s} onClick={() => setStep(s)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${step === s ? 'bg-white/15 text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {s === 'qr' ? 'Scan & Pay' : 'Upload Proof'}
              </button>
            ))}
          </div>

          {/* QR Step */}
          {step === 'qr' && (
            <div className="space-y-4">
              {/* QR Code */}
              <div className="flex flex-col items-center gap-4 bg-white rounded-2xl p-6">
                <QRCodeSVG
                  value={upiLink}
                  size={200}
                  level="H"
                  includeMargin={false}
                />
                <div className="text-center">
                  <p className="text-gray-900 font-bold text-xl">{fmt(amount)}</p>
                  <p className="text-gray-500 text-sm">{txnNote}</p>
                  <p className="text-gray-400 text-xs mt-1">{upiId}</p>
                </div>
              </div>

              {/* UPI ID copy */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <IndianRupee className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span className="text-white text-sm font-mono flex-1">{upiId}</span>
                <button onClick={() => { navigator.clipboard.writeText(upiId); toast.success('UPI ID copied'); }}
                  className="p-1.5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">
                  <Copy className="w-4 h-4" />
                </button>
              </div>

              {/* Open in UPI app */}
              <a href={upiLink}
                className="flex items-center justify-center gap-2 w-full py-3 text-sm font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20">
                <Smartphone className="w-4 h-4" /> Open in UPI App
              </a>

              <p className="text-center text-xs text-gray-500">
                After payment, click <strong className="text-white">Upload Proof</strong> tab and upload your screenshot
              </p>
            </div>
          )}

          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              {/* Drop zone */}
              <div
                onClick={() => fileRef.current?.click()}
                className={`cursor-pointer rounded-2xl border-2 border-dashed p-6 text-center transition-all ${
                  preview ? 'border-emerald-500/50 bg-emerald-500/5' : 'border-white/20 hover:border-cyan-500/50 hover:bg-white/5'
                }`}>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                {preview ? (
                  <div className="space-y-3">
                    <img src={preview} alt="proof" className="max-h-48 mx-auto rounded-xl object-contain" />
                    <p className="text-emerald-400 text-sm font-medium">Screenshot selected</p>
                    <p className="text-gray-500 text-xs">Click to change</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ImageIcon className="w-10 h-10 text-gray-600 mx-auto" />
                    <p className="text-gray-300 text-sm font-medium">Upload payment screenshot</p>
                    <p className="text-gray-500 text-xs">JPG, PNG or WebP · Max 5MB</p>
                  </div>
                )}
              </div>

              {/* UPI ID and Payment Date Inputs */}
              <div className="grid grid-cols-2 gap-3 bg-white/5 border border-white/10 rounded-xl p-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Transaction ID</label>
                  <input
                    type="text"
                    value={studentUpi}
                    onChange={(e) => setStudentUpi(e.target.value)}
                    placeholder="e.g. T1234567890"
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors placeholder:text-gray-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-400 transition-colors"
                  />
                </div>
              </div>

              {/* Amount confirmation */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Amount paid</span>
                <span className="text-white font-bold">{fmt(amount)}</span>
              </div>

              {/* Submit */}
              <button
                onClick={() => submitMutation.mutate()}
                disabled={!file || submitMutation.isPending}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl hover:opacity-90 disabled:opacity-50 shadow-lg shadow-cyan-500/20">
                {submitMutation.isPending
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                  : <><Upload className="w-4 h-4" /> Submit for Verification</>}
              </button>

              <p className="text-center text-xs text-gray-500">
                Admin will verify your payment and update your fee record within 24 hours
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
