import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/axios';
import { Loader2, Printer } from 'lucide-react';
import { useEffect } from 'react';

export default function InvoiceView() {
  const { id } = useParams();

  const { data: invoice, isLoading } = useQuery({
    queryKey: ['invoice', id],
    queryFn: async () => {
      const { data } = await api.get(`/invoices/${id}`);
      return data.data;
    },
  });

  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body * { visibility: hidden; }
        #printable-invoice, #printable-invoice * { visibility: visible; }
        #printable-invoice { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
        @page { size: A4; margin: 15mm; }
        .no-print { display: none !important; }
      }
    `;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!invoice) {
    return <div className="min-h-screen flex items-center justify-center text-white">Invoice not found</div>;
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

  // Per-payment invoice: use the amount stored on this specific invoice
  const paidAmount = Number(invoice.amount) || 0;

  // GST breakdown: amount is inclusive of 18% GST
  // baseAmount = paidAmount / 1.18; GST = paidAmount - baseAmount; SGST = CGST = GST/2
  const baseAmount = paidAmount / 1.18;
  const sgst = (paidAmount - baseAmount) / 2;
  const cgst = (paidAmount - baseAmount) / 2;

  // Label for this specific payment
  const paymentLabel = invoice.installment_label ?? invoice.program_name ?? 'Course Fee';

  const dateStr = new Date(invoice.created_at).toLocaleDateString('en-IN');

  return (
    <div className="min-h-screen bg-[#0a1120] p-8 flex flex-col items-center">

      <div className="w-full max-w-4xl flex justify-end mb-4 no-print">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold shadow-lg transition-all"
        >
          <Printer className="w-4 h-4" /> Print / Save as PDF
        </button>
      </div>

      <div id="printable-invoice" className="bg-white text-black w-full max-w-4xl shadow-2xl" style={{ minHeight: '297mm' }}>

        {/* Header */}
        <div className="p-8 pb-4 flex justify-between items-start">
          <div className="flex items-center gap-1">
            <span className="text-4xl font-bold tracking-tighter" style={{ color: '#F97316' }}>v</span>
            <span className="text-4xl font-bold tracking-tighter" style={{ color: '#9333EA' }}>tricks</span>
            <div className="flex flex-col ml-1">
              <span className="text-[10px] font-semibold text-gray-600 tracking-wider uppercase mt-4">Technologies</span>
            </div>
          </div>
          <div className="text-center flex-1 pr-32">
            <h1 className="text-2xl font-bold text-[#4B207E] uppercase tracking-wide border-b-2 border-[#4B207E] inline-block pb-1">
              Tax Invoice
            </h1>
          </div>
        </div>

        {/* Top Details Grid */}
        <div className="grid grid-cols-2 border-y-2 border-black border-collapse">
          {/* Company Details */}
          <div className="p-3 border-r-2 border-black">
            <h2 className="font-bold text-sm mb-1 uppercase">Vtricks Technologies</h2>
            <p className="text-xs leading-tight font-medium">
              1<sup className="text-[9px]">ST</sup> FLOOR, #52/ E, BHAIRAVESHWARA NILAYA,<br />
              15<sup className="text-[9px]">TH</sup> MAIN ROAD, VIJAYANAGAR, BENGALURU,<br />
              560040
            </p>
            <p className="text-xs font-bold mt-2">PHONE NO: 9620749749</p>
            <p className="text-xs font-bold mt-1">GST:29AKRPH2439K1ZM</p>
          </div>

          {/* Invoice Details */}
          <div className="grid grid-cols-2">
            <div className="p-3 border-r-2 border-black border-b-2">
              <p className="text-xs">Invoice No.<br /><span className="font-bold">{invoice.invoice_number}</span></p>
            </div>
            <div className="p-3 border-b-2 border-black">
              <p className="text-xs">Invoice Date:<br /><span className="font-bold">{dateStr}</span></p>
            </div>
            <div className="p-3 border-r-2 border-black">
              <p className="text-xs">Delivery Note:<br /><span className="font-medium">Soft Copy</span></p>
            </div>
            <div className="p-3">
              <p className="text-xs">Payment For:<br /><span className="font-medium">{paymentLabel}</span></p>
            </div>
          </div>
        </div>

        {/* Buyer & Terms Grid */}
        <div className="grid grid-cols-2 border-b-2 border-black">
          {/* Buyer Details */}
          <div className="p-3 border-r-2 border-black">
            <p className="text-sm font-medium mb-2">Buyer (Bill to)</p>
            <table className="text-xs font-medium w-full">
              <tbody>
                <tr><td className="w-28 py-0.5">Name:</td><td className="font-bold">{invoice.student_name}</td></tr>
                <tr><td className="py-0.5">Contact Number:</td><td className="font-bold">{invoice.phone_number || '--'}</td></tr>
                <tr><td className="py-0.5">Email Address:</td><td className="font-bold">{invoice.student_email}</td></tr>
                <tr><td className="py-0.5">Student ID:</td><td className="font-bold font-mono">{invoice.student_id.slice(0, 8)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Terms & Conditions */}
          <div className="p-3">
            <p className="text-sm font-bold text-[#E2563C] mb-1">Terms &amp; Conditions/Notes:</p>
            <ul className="list-disc pl-4 text-xs font-medium space-y-0.5">
              <li>Total payment due in 30 days.</li>
              <li>Fees will not be refunded once paid.</li>
              <li>Candidates with genuine reasons can transfer the course with valid proof.</li>
            </ul>
          </div>
        </div>

        {/* Items Table */}
        <div className="min-h-[400px] border-b-2 border-black relative pb-20">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="p-2 text-left font-bold uppercase w-[50%]">Description</th>
                <th className="p-2 text-center font-bold">Rate</th>
                <th className="p-2 text-center font-bold">Qty.</th>
                <th className="p-2 text-right font-bold w-[25%] pr-4">Amount</th>
              </tr>
            </thead>
            <tbody>
              {/* Single line item for this specific payment */}
              <tr>
                <td className="p-2 pt-4 font-medium">
                  {paymentLabel}
                  {invoice.program_name ? ` — ${invoice.program_name}` : ''}
                </td>
                <td className="p-2 pt-4 text-center font-medium">{fmt(baseAmount)}/-</td>
                <td className="p-2 pt-4 text-center font-medium">1</td>
                <td className="p-2 pt-4 text-right font-medium pr-4">{fmt(baseAmount)}/-</td>
              </tr>

              <tr>
                <td className="p-2 pt-4 font-medium">SGST @ 9%</td>
                <td className="p-2 pt-4 text-center font-medium">{fmt(sgst)}/-</td>
                <td className="p-2 pt-4 text-center font-medium">1</td>
                <td className="p-2 pt-4 text-right font-medium pr-4">{fmt(sgst)}/-</td>
              </tr>
              <tr>
                <td className="p-2 pt-2 font-medium border-b-2 border-black/20 pb-4">CGST @ 9%</td>
                <td className="p-2 pt-2 text-center font-medium border-b-2 border-black/20 pb-4">{fmt(cgst)}/-</td>
                <td className="p-2 pt-2 text-center font-medium border-b-2 border-black/20 pb-4">1</td>
                <td className="p-2 pt-2 text-right font-medium pr-4 border-b-2 border-black/20 pb-4">{fmt(cgst)}/-</td>
              </tr>
            </tbody>
          </table>

          {/* Totals Section */}
          <div className="absolute bottom-4 w-full">
            <div className="flex w-full text-xs font-bold px-2">
              <div className="w-[75%] text-left">
                <div className="text-[#4B207E]">TOTAL PAID</div>
              </div>
              <div className="w-[25%] text-right pr-2">
                <div>{fmt(paidAmount)}/-</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Details */}
        <div className="grid grid-cols-2">
          {/* Left Column */}
          <div className="p-3 border-r-2 border-black flex flex-col justify-end">
            <div className="mt-8">
              <p className="text-xs font-bold italic">Dated on: {dateStr}</p>
            </div>
          </div>

          {/* Bank & Signature */}
          <div className="flex flex-col">
            <div className="p-3 border-b-2 border-black">
              <p className="text-xs font-medium">Company's Bank Details:</p>
              <p className="text-xs font-medium">Account Name: Vtricks Technologies</p>
              <p className="text-xs font-medium">AccountNumber: 1234567890</p>
              <p className="text-xs font-medium">Bank Name: Canara Bank</p>
              <p className="text-xs font-medium">SWIFTCODE: CNRBXXX</p>
              <p className="text-xs font-medium">IFSCCODE: CNRB000XXXX</p>
              <p className="text-xs font-medium">Branch Address: Vijayanagar, Bangalore</p>
            </div>
            <div className="p-3 flex-1 flex flex-col justify-between">
              <p className="text-xs font-bold">For VTRICKS TECHNOLOGIES</p>
              <p className="text-xs font-medium mt-16">Director</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
