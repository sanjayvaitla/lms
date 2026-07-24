import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../../store/AuthContext';

interface ActivityEvent {
  actionType: string;
  resourceType: string | null;
  resourceId: string | null;
  timestamp: string;
  metadata?: any;
}

export function ActivityTracker() {
  const location = useLocation();
  const { user, accessToken: token } = useAuth();
  
  // Buffer to store events
  const eventsBuffer = useRef<ActivityEvent[]>([]);

  // Function to actually send the buffer to the backend
  const flushEvents = (forceKeepalive = false) => {
    if (eventsBuffer.current.length === 0 || !user || !token) return;

    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:6000/api/v1';
    const url = `${baseUrl}/analytics/log`;
    
    const payload = JSON.stringify({ events: eventsBuffer.current });

    // Clear buffer immediately so we don't double-send if another flush is triggered
    eventsBuffer.current = [];

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: payload,
      keepalive: forceKeepalive // Crucial for unload/hidden events
    }).catch(console.error);
  };

  // Function to push to buffer
  const logActivity = (actionType: string, resourceType: string | null = null, resourceId: string | null = null) => {
    eventsBuffer.current.push({
      actionType,
      resourceType,
      resourceId,
      timestamp: new Date().toISOString(),
      metadata: { userAgent: navigator.userAgent }
    });
  };

  // Timer to flush events every 30 seconds
  useEffect(() => {
    if (!user) return;
    const intervalId = setInterval(() => {
      flushEvents(false);
    }, 30000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Track page views on route change
  useEffect(() => {
    if (!user) return;
    
    let pageName = location.pathname;
    
    if (pageName === '/') pageName = 'Dashboard';
    else if (pageName.startsWith('/my-courses') || pageName.startsWith('/courses')) {
      if (pageName.includes('/session/')) pageName = 'Course Session View';
      else if (pageName.includes('/quiz/')) pageName = 'Course Quiz View';
      else if (pageName.split('/').length > 2) pageName = 'Course Detail View';
      else pageName = 'Courses';
    }
    else if (pageName.startsWith('/my-assignments') || pageName.startsWith('/assignments')) pageName = 'Assignments';
    else if (pageName.startsWith('/my-quizzes') || pageName.startsWith('/quizzes')) pageName = 'Quizzes';
    else if (pageName.startsWith('/my-attendance') || pageName.startsWith('/attendance')) pageName = 'Attendance';
    else if (pageName.startsWith('/my-coding') || pageName.startsWith('/coding-tests')) pageName = 'Coding Tests';
    else if (pageName.startsWith('/my-profile') || pageName.startsWith('/profile')) pageName = 'Profile';
    else if (pageName.startsWith('/activity-logs')) pageName = 'Activity Logs';
    else if (pageName.startsWith('/login')) pageName = 'Login';
    else {
      // Fallback: Just get the first part of the path and capitalize it, ignoring long IDs
      const firstPart = pageName.split('/')[1];
      if (firstPart && !firstPart.includes('-')) {
        pageName = firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
      } else if (firstPart) {
        // e.g. my-courses -> My Courses
        pageName = firstPart.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }
    }

    logActivity('PAGE_VIEW', pageName);
  }, [location.pathname, user]);

  // Track tab close / unload
  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      logActivity('TAB_CLOSED');
      flushEvents(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        logActivity('TAB_CLOSED');
        flushEvents(true);
      } else if (document.visibilityState === 'visible') {
        let pageName = location.pathname;
        if (pageName === '/') pageName = 'Dashboard';
        logActivity('PAGE_VIEW', pageName);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Flush any remaining when component unmounts
      flushEvents(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token, location.pathname]);

  return null;
}
