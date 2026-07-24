import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Send, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';

const emailSchema = z.object({
  recipients: z.array(z.string().email()).min(1, 'Select at least one recipient'),
  subject: z.string().min(1, 'Subject is required'),
  htmlBody: z.string().min(1, 'Message body is required'),
});

type EmailForm = z.infer<typeof emailSchema>;

type Student = {
  id: string;
  name: string;
  email: string;
  batches?: { batchId: string; batchName: string }[];
};

export default function MessagingPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState<string>('');

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting }, reset } = useForm<EmailForm>({
    resolver: zodResolver(emailSchema),
    defaultValues: {
      recipients: [],
      subject: '',
      htmlBody: ''
    }
  });

  const selectedRecipients = watch('recipients');

  useEffect(() => {
    async function fetchBatches() {
      try {
        const { data } = await api.get('/batches');
        if (data.data && Array.isArray(data.data)) {
          setBatches(data.data);
        } else if (Array.isArray(data)) {
          setBatches(data);
        }
      } catch (err) {
        console.error('Failed to load batches:', err);
      }
    }
    
    async function fetchStudents() {
      try {
        const { data } = await api.get('/learners');
        if (data.data?.learners && Array.isArray(data.data.learners)) {
          setStudents(data.data.learners);
        } else if (data.success && Array.isArray(data.data)) {
          setStudents(data.data);
        } else if (Array.isArray(data)) {
           setStudents(data);
        }
      } catch (err) {
        console.error('Failed to load students:', err);
        toast.error('Failed to load student list');
      } finally {
        setLoadingStudents(false);
      }
    }
    fetchBatches();
    fetchStudents();
  }, []);

  const onSubmit = async (data: EmailForm) => {
    try {
      const response = await api.post('/messaging/send-email', data);
      if (response.data?.success) {
        toast.success(response.data.message || 'Email sent successfully!');
        reset();
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to send email. Check SMTP settings.');
    }
  };

  const handleSelectAll = () => {
    const allEmails = students.map(s => s.email).filter(Boolean);
    setValue('recipients', allEmails, { shouldValidate: true });
  };

  const handleClearAll = () => {
    setValue('recipients', [], { shouldValidate: true });
  };

  const handleToggleRecipient = (email: string) => {
    if (selectedRecipients.includes(email)) {
      setValue('recipients', selectedRecipients.filter(e => e !== email), { shouldValidate: true });
    } else {
      setValue('recipients', [...selectedRecipients, email], { shouldValidate: true });
    }
  };

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          student.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesBatch = selectedBatchId ? student.batches?.some(b => b.batchId === selectedBatchId) : true;
    return matchesSearch && matchesBatch;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Send className="w-6 h-6 text-indigo-600" />
            Institution Messaging
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Send direct emails to students' registered email addresses.</p>
        </div>
      </div>

      <div className="bg-[#0A1628] rounded-xl border border-white/10 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Recipients ({selectedRecipients.length} selected)
            </label>
            <div className="flex gap-2 mb-3">
               <button
                 type="button"
                 onClick={handleSelectAll}
                 className="text-xs bg-cyan-500/20 text-cyan-400 px-3 py-1.5 rounded hover:bg-cyan-500/30 transition-colors"
               >
                 Select All ({filteredStudents.length})
               </button>
               <button
                 type="button"
                 onClick={handleClearAll}
                 className="text-xs bg-slate-800 text-slate-300 px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
               >
                 Clear All
               </button>
            </div>
            
            <div className="mb-3">
              <select
                value={selectedBatchId}
                onChange={(e) => {
                  setSelectedBatchId(e.target.value);
                  handleClearAll(); // Clear selection when changing batch to avoid sending to wrong batch students unintentionally
                }}
                className="w-full bg-[#0F1D33] border border-white/10 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
              >
                <option value="">All Batches</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search students by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0F1D33] border border-white/10 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
              />
            </div>
            
            <div className="max-h-48 overflow-y-auto bg-[#0F1D33] border border-white/5 rounded-lg p-2 space-y-1">
              {loadingStudents ? (
                <div className="p-4 text-center text-slate-400 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">No students found</div>
              ) : (
                filteredStudents.map(student => (
                  <label key={student.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      className="rounded border-white/10 bg-black/20 text-cyan-500 focus:ring-cyan-500/20"
                      checked={selectedRecipients.includes(student.email)}
                      onChange={() => handleToggleRecipient(student.email)}
                    />
                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <span className="text-sm text-slate-200 font-medium truncate">{student.name}</span>
                      <span className="text-xs text-slate-500 truncate ml-2">{student.email}</span>
                    </div>
                  </label>
                ))
              )}
            </div>
            {errors.recipients && <p className="text-rose-400 text-xs mt-1.5">{errors.recipients.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Subject</label>
            <input
              {...register('subject')}
              type="text"
              className="w-full bg-[#0F1D33] border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
              placeholder="e.g. Important Update Regarding Your Course"
            />
            {errors.subject && <p className="text-rose-400 text-xs mt-1.5">{errors.subject.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Message Body</label>
            <textarea
              {...register('htmlBody')}
              rows={8}
              className="w-full bg-[#0F1D33] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 resize-y"
              placeholder="Type your email message here..."
            />
            {errors.htmlBody && <p className="text-rose-400 text-xs mt-1.5">{errors.htmlBody.message}</p>}
            <p className="text-[10px] text-slate-500 mt-2">Emails will be sent as standard text for now. (HTML allowed)</p>
          </div>

          <div className="pt-4 border-t border-white/10 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-6 py-2.5 rounded-lg font-medium hover:from-cyan-400 hover:to-blue-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-cyan-500/20"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {isSubmitting ? 'Sending...' : 'Send Email'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}
