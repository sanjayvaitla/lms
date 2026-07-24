import { useEffect, useState } from 'react';
import api from '../../lib/axios';
import { toast } from 'sonner';
import { useAuth } from '../../store/AuthContext';
import { Activity, Users, MousePointerClick, RefreshCcw, Monitor, Clock, X, CalendarDays, Hourglass, ArrowRight } from 'lucide-react';
import { Skeleton } from '../components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';

interface DashboardStats {
  studentResources: { resourceType: string; role: string; views: string }[];
  staffResources: { resourceType: string; role: string; views: string }[];
  recentLogins: { id: string; userId: string; ipAddress: string; createdAt: string; user?: { name: string; role: string; email: string } }[];
  summary: { actionType: string; count: string }[];
}

interface TimelineEvent {
  id: string;
  actionType: string;
  resourceType: string | null;
  createdAt: string;
  durationMs: number;
  durationFormatted: string;
  ipAddress: string;
}

export default function AnalyticsDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'STUDENTS' | 'STAFF'>('OVERVIEW');

  const [selectedUserTimeline, setSelectedUserTimeline] = useState<{ id: string, name: string, role: string } | null>(null);
  const [timelineData, setTimelineData] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      setLoading(true);
      const res = await api.get('/analytics/dashboard');
      setStats(res.data.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to fetch analytics');
    } finally {
      setLoading(false);
    }
  }

  async function openTimeline(userId: string, name: string, role: string) {
    setSelectedUserTimeline({ id: userId, name, role });
    try {
      setTimelineLoading(true);
      const res = await api.get(`/analytics/timeline/${userId}`);
      setTimelineData(res.data.data);
    } catch (err: any) {
      toast.error('Failed to load user timeline');
    } finally {
      setTimelineLoading(false);
    }
  }

  const totalLogins = stats?.summary.find((s) => s.actionType === 'LOGIN')?.count || '0';
  const totalViews = stats?.summary.reduce((acc, curr) => (curr.actionType !== 'LOGIN' ? acc + Number(curr.count) : acc), 0) || 0;

  // Filter logins based on active tab
  const displayLogins = activeTab === 'OVERVIEW' 
    ? stats?.recentLogins 
    : activeTab === 'STUDENTS' 
      ? stats?.recentLogins.filter(l => l.user?.role === 'STUDENT')
      : stats?.recentLogins.filter(l => l.user?.role !== 'STUDENT');

  // Filter resources based on active tab
  const displayResources = activeTab === 'OVERVIEW'
    ? [...(stats?.studentResources || []), ...(stats?.staffResources || [])]
    : activeTab === 'STUDENTS'
      ? stats?.studentResources
      : stats?.staffResources;

  // Group resources for OVERVIEW (since student and staff resources might overlap)
  let groupedResources = displayResources || [];
  if (activeTab === 'OVERVIEW') {
    const grouped = new Map<string, number>();
    (displayResources || []).forEach(r => {
      grouped.set(r.resourceType, (grouped.get(r.resourceType) || 0) + Number(r.views));
    });
    groupedResources = Array.from(grouped.entries()).map(([type, views]) => ({ resourceType: type, role: 'ALL', views: String(views) }));
  }

  // Sort by highest views
  groupedResources.sort((a, b) => Number(b.views) - Number(a.views));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-blue-600" />
            Comprehensive Analytics
          </h1>
          <p className="text-slate-500 mt-2">Monitor detailed student navigation, staff usage, and session timelines.</p>
        </div>
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 transition-all shadow-sm self-start md:self-auto"
        >
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Data
        </button>
      </div>

      {loading && !stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <div className="md:col-span-3">
            <Skeleton className="h-12 rounded-xl w-1/3 mb-6" />
          </div>
          <div className="md:col-span-2">
            <Skeleton className="h-96 rounded-2xl" />
          </div>
          <div>
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl shadow-blue-500/20 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-blue-100 font-medium mb-1">Total Platform Logins</p>
                <h3 className="text-4xl font-bold">{Number(totalLogins).toLocaleString()}</h3>
              </div>
              <Users className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" />
            </div>

            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-6 text-white shadow-xl shadow-emerald-500/20 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-emerald-100 font-medium mb-1">Total Page Views</p>
                <h3 className="text-4xl font-bold">{Number(totalViews).toLocaleString()}</h3>
              </div>
              <MousePointerClick className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" />
            </div>

            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-6 text-white shadow-xl shadow-amber-500/20 relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-amber-100 font-medium mb-1">Active Masters</p>
                <h3 className="text-4xl font-bold">{groupedResources.length}</h3>
              </div>
              <Monitor className="absolute -bottom-4 -right-4 w-32 h-32 text-white/10" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-slate-200">
            {['OVERVIEW', 'STUDENTS', 'STAFF'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={`px-6 py-3 font-semibold text-sm transition-colors border-b-2 ${
                  activeTab === tab 
                    ? 'border-indigo-600 text-indigo-700' 
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                {tab.charAt(0) + tab.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Popular Resources Chart/List */}
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-100 shadow-sm">
              <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-500" />
                Most Visited Masters ({activeTab.charAt(0) + activeTab.slice(1).toLowerCase()})
              </h3>
              
              <div className="h-[300px] w-full mt-4">
                {groupedResources.length === 0 ? (
                  <p className="text-slate-500 text-sm italic text-center mt-10">No navigation data recorded for this category.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={groupedResources} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" />
                      <YAxis 
                        dataKey="resourceType" 
                        type="category" 
                        width={120} 
                        tickFormatter={(value) => value.toLowerCase().replace('_', ' ')} 
                        tick={{ fontSize: 12, fontWeight: 500 }}
                      />
                      <Tooltip 
                        cursor={{fill: 'rgba(0,0,0,0.05)'}} 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="views" name="Total Views" radius={[0, 4, 4, 0]} barSize={24}>
                        {groupedResources.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#6366f1' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Recent Logins */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm flex flex-col h-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-orange-500" />
                  Recent Logins
                </h3>
                <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-lg">Live</span>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 h-[400px]">
                {displayLogins?.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6">
                    <Clock className="w-12 h-12 text-slate-200 mb-3" />
                    <p className="text-slate-500 text-sm italic">No recent logins for {activeTab.toLowerCase()}.</p>
                  </div>
                )}
                {displayLogins?.map((login) => {
                  const displayName = login.user?.name || `User ${login.userId.substring(0, 4)}`;
                  const initials = displayName.substring(0, 2).toUpperCase();
                  const role = login.user?.role?.replace('_', ' ') || 'Unknown';
                  
                  return (
                    <div 
                      key={login.id} 
                      onClick={() => openTimeline(login.userId, displayName, role)}
                      className="group flex items-start gap-3 p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-indigo-100 cursor-pointer shadow-sm bg-white"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center text-indigo-700 font-bold shrink-0">
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <p className="text-sm font-bold text-slate-800 truncate pr-2 group-hover:text-indigo-600 transition-colors">{displayName}</p>
                          <span className="text-[10px] font-medium text-slate-400 shrink-0">
                            {new Date(login.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold tracking-wider uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              {role}
                            </span>
                          </div>
                          <button className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 font-semibold">
                            View Session
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Timeline Modal */}
      {selectedUserTimeline && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                  {selectedUserTimeline.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">{selectedUserTimeline.name}'s Timeline</h2>
                  <p className="text-sm text-slate-500 font-medium">{selectedUserTimeline.role} • Detailed Session Activity</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedUserTimeline(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
              {timelineLoading ? (
                <div className="space-y-6">
                  <Skeleton className="h-24 rounded-2xl w-full" />
                  <Skeleton className="h-24 rounded-2xl w-full ml-8" />
                  <Skeleton className="h-24 rounded-2xl w-full ml-16" />
                </div>
              ) : timelineData.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-slate-500">No session data found for this user.</p>
                </div>
              ) : (
                <div className="relative border-l-2 border-indigo-200 ml-4 space-y-6 pb-4">
                  {timelineData.map((event, index) => {
                    const isLogin = event.actionType === 'LOGIN';
                    return (
                      <div key={event.id} className="relative pl-8">
                        {/* Timeline Node */}
                        <div className={`absolute -left-[9px] top-4 w-4 h-4 rounded-full border-2 border-white shadow-sm ${isLogin ? 'bg-emerald-500' : 'bg-indigo-500'}`} />
                        
                        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              {isLogin ? <Users className="w-4 h-4 text-emerald-500" /> : <Activity className="w-4 h-4 text-indigo-500" />}
                              <span className="font-bold text-slate-700">
                                {isLogin ? 'Logged In' : `Viewed ${event.resourceType || 'Page'}`}
                              </span>
                            </div>
                            <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-1 rounded-md flex items-center gap-1">
                              <CalendarDays className="w-3 h-3" />
                              {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 mt-3 text-sm">
                            <div className="flex items-center gap-1.5 text-slate-500 font-medium bg-slate-50 px-2 py-1 rounded">
                              <Hourglass className="w-4 h-4 text-orange-500" />
                              Time Spent: {event.durationFormatted}
                            </div>
                            {event.actionType !== 'LOGIN' && (
                              <div className="text-slate-400 text-xs">
                                Action: {event.actionType}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
