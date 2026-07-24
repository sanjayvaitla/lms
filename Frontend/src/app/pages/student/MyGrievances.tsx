import { useState, useEffect } from 'react';
import { Mail, Plus, X, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../../lib/axios';

interface Grievance {
  id: string;
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  created_at: string;
}

export default function MyGrievances() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Form state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchGrievances();
  }, []);

  const fetchGrievances = async () => {
    try {
      const res = await api.get('/grievances/my');
      setGrievances(res.data);
    } catch (err: any) {
      toast.error('Failed to fetch grievances');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !description.trim()) {
      toast.error('Please fill in all fields');
      return;
    }

    try {
      setSubmitting(true);
      await api.post('/grievances', { subject, description });
      toast.success('Grievance submitted successfully');
      setIsModalOpen(false);
      setSubject('');
      setDescription('');
      fetchGrievances();
    } catch (err: any) {
      toast.error('Failed to submit grievance');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      case 'IN_PROGRESS': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      case 'RESOLVED': return 'bg-blue-500/20 text-blue-400 border-blue-500/50';
      default: return 'bg-slate-500/20 text-slate-500 border-slate-500/50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-blue-500" />
            My Grievances
          </h1>
          <p className="text-slate-500 mt-1">Submit and track your queries/complaints to the management.</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          New Grievance
        </button>
      </div>

      <div className="grid gap-4">
        {grievances.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <AlertCircle className="w-12 h-12 text-slate-500 mx-auto mb-3" />
            <p className="text-slate-500">You haven't submitted any grievances yet.</p>
          </div>
        ) : (
          grievances.map((g) => (
            <div key={g.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-500/30 transition-colors">
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-slate-900 text-lg">{g.subject}</h3>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${getStatusColor(g.status)}`}>
                  {g.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-slate-500 text-sm mb-3 whitespace-pre-wrap">{g.description}</p>
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <span>Submitted on: {new Date(g.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white border-r border-slate-200 shadow-sm rounded-xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Submit New Grievance</h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-900 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Brief subject of your grievance"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  required
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  placeholder="Provide detailed information..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 mt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Grievance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
