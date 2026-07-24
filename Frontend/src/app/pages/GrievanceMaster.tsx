import { useState, useEffect } from 'react';
import { Mail, CheckCircle, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';

interface Grievance {
  id: string;
  student: { id: string; name: string; email: string };
  subject: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  created_at: string;
}

export default function GrievanceMaster() {
  const [grievances, setGrievances] = useState<Grievance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGrievances();
  }, []);

  const fetchGrievances = async () => {
    try {
      const res = await api.get('/grievances');
      setGrievances(res.data);
    } catch (err: any) {
      toast.error('Failed to fetch grievances');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
      await api.patch(`/grievances/${id}/status`, { status: newStatus });
      toast.success('Grievance status updated');
      setGrievances((prev) =>
        prev.map((g) => (g.id === id ? { ...g, status: newStatus as any } : g))
      );
    } catch (err: any) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (id: string, subject: string) => {
    if (!confirm(`Delete grievance "${subject}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/grievances/${id}`);
      toast.success('Grievance deleted');
      setGrievances((prev) => prev.filter((g) => g.id !== id));
    } catch {
      toast.error('Failed to delete grievance');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'IN_PROGRESS': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'RESOLVED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="w-6 h-6 text-cyan-600" />
            Grievance Master
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Manage and resolve student grievances.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        {grievances.length === 0 ? (
          <div className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No grievances found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="p-4 font-medium border-b border-gray-100">Student</th>
                  <th className="p-4 font-medium border-b border-gray-100">Subject & Description</th>
                  <th className="p-4 font-medium border-b border-gray-100">Date</th>
                  <th className="p-4 font-medium border-b border-gray-100 text-center">Status</th>
                  <th className="p-4 font-medium border-b border-gray-100 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {grievances.map((g) => (
                  <tr key={g.id} className="hover:bg-gray-50 transition-colors">
                    <td className="p-4 align-top">
                      <div className="font-medium text-gray-900 text-sm">{g.student?.name}</div>
                      <div className="text-xs text-gray-500">{g.student?.email}</div>
                    </td>
                    <td className="p-4 align-top max-w-md">
                      <div className="font-semibold text-gray-900 text-sm mb-1">{g.subject}</div>
                      <div className="text-sm text-gray-500 line-clamp-2" title={g.description}>
                        {g.description}
                      </div>
                    </td>
                    <td className="p-4 align-top whitespace-nowrap text-sm text-gray-500">
                      {new Date(g.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 align-top text-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${getStatusColor(g.status)}`}>
                        {g.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="p-4 align-top text-right whitespace-nowrap space-x-2">
                      {g.status !== 'IN_PROGRESS' && g.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleStatusChange(g.id, 'IN_PROGRESS')}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                          title="Mark In Progress"
                        >
                          <Clock className="w-4 h-4" /> In Progress
                        </button>
                      )}
                      {g.status !== 'RESOLVED' && (
                        <button
                          onClick={() => handleStatusChange(g.id, 'RESOLVED')}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                          title="Mark Resolved"
                        >
                          <CheckCircle className="w-4 h-4" /> Resolve
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(g.id, g.subject)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-medium"
                        title="Delete Grievance"
                      >
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
