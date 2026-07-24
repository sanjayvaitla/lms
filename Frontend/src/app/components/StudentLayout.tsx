import { Suspense, lazy, useState, useRef } from 'react';
import { Outlet, useLocation } from 'react-router';
import { StudentSidebar } from './StudentSidebar';
import { BackToTop } from './ui/BackToTop';
import { Menu } from 'lucide-react';

const ChatbotWidget = lazy(() =>
  import('./ChatbotWidget').then((m) => ({ default: m.ChatbotWidget })),
);

export function StudentLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Hide the AI Chatbot on pages where students are taking tests or assignments
  const hideChatbot = ['quiz', 'assignment', 'assessment', 'coding', 'my-mock-interviews', 'mock-interviews']
    .some(path => location.pathname.includes(path));

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <StudentSidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
      
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="lg:hidden h-14 bg-white border-b border-gray-200 px-4 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-300 ease-out lms-press"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img src="/logo.png" alt="Vtricks" className="h-8 object-contain" />
          </div>
        </header>

        <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain scroll-smooth">
          <div className="p-4 sm:p-6 min-h-full pb-24 sm:pb-8 lms-page">
            <Outlet />
          </div>
          <BackToTop scrollRef={mainRef} />
        </main>
      </div>

      {!hideChatbot && (
        <Suspense fallback={null}>
          <ChatbotWidget />
        </Suspense>
      )}
    </div>
  );
}
