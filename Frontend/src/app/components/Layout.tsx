import { useState, useRef } from 'react';
import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { BackToTop } from './ui/BackToTop';

export function Layout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden transition-opacity duration-200"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuToggle={() => setSidebarOpen(true)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto overscroll-contain scroll-smooth">
          <div className="p-4 sm:p-6 pb-24 sm:pb-8 lms-page">
            <Outlet />
          </div>
          <BackToTop scrollRef={mainRef} />
        </main>
      </div>
    </div>
  );
}
