/**
 * PermissionsContext — fetches the current user's permissions once on mount
 * and exposes a `can(permission)` helper used throughout the app.
 *
 * Non-trainer roles (SUPER_ADMIN, ADMIN) always get full access.
 * Trainers get whatever the Super Admin has configured.
 */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import api from '../lib/axios';
import { useAuth } from './AuthContext';
import type { TrainerPermissions } from '../types/api';

const FULL_ACCESS: TrainerPermissions = {
  trainerId:            '',
  canEditCourses:       true,
  canDeleteCourses:     true,
  canEditBatches:       true,
  canDeleteBatches:     true,
  canEditLearners:      true,
  canDeleteLearners:    true,
  canEditAssignments:   true,
  canDeleteAssignments: true,
  canEditQuizzes:       true,
  canDeleteQuizzes:     true,
  canEditAttendance:    true,
  canDeleteAttendance:  true,
  canSoftDeleteOnly:    false,
  canViewCourses:       true,
  canViewBatches:       true,
  canViewLearners:      true,
  canViewAssignments:   true,
  canViewQuizzes:       true,
  canViewAttendance:    true,
  canViewContent:       true,
  canViewRecordings:    true,
  updatedAt:            '',
  updatedByName:        null,
};

const NO_ACCESS: TrainerPermissions = {
  trainerId:            '',
  canEditCourses:       false,
  canDeleteCourses:     false,
  canEditBatches:       false,
  canDeleteBatches:     false,
  canEditLearners:      false,
  canDeleteLearners:    false,
  canEditAssignments:   false,
  canDeleteAssignments: false,
  canEditQuizzes:       false,
  canDeleteQuizzes:     false,
  canEditAttendance:    false,
  canDeleteAttendance:  false,
  canSoftDeleteOnly:    false,
  canViewCourses:       false,
  canViewBatches:       false,
  canViewLearners:      false,
  canViewAssignments:   false,
  canViewQuizzes:       false,
  canViewAttendance:    false,
  canViewContent:       false,
  canViewRecordings:    false,
  updatedAt:            '',
  updatedByName:        null,
};

const OPERATIONAL_MANAGER_ACCESS: TrainerPermissions = {
  ...FULL_ACCESS,
  canDeleteCourses:     false,
  canDeleteBatches:     false,
  canEditLearners:      false,
  canDeleteLearners:    false,
  canEditAssignments:   false,
  canDeleteAssignments: false,
  canEditQuizzes:       false,
  canDeleteQuizzes:     false,
  canEditAttendance:    false,
  canDeleteAttendance:  false,
};

interface PermissionsContextValue {
  permissions: TrainerPermissions | null;
  can: (key: keyof Omit<TrainerPermissions, 'trainerId' | 'updatedAt' | 'updatedByName'>) => boolean;
  isLoading: boolean;
  refresh: () => void;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<TrainerPermissions | null>(null);
  const [isLoading, setIsLoading]     = useState(false);
  const [tick, setTick]               = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) { setPermissions(null); return; }

    // Non-trainers always have full access — no API call needed
    if (user.role !== 'TRAINER') {
      if (user.role === 'OPERATIONAL_MANAGER') {
        setPermissions({ ...OPERATIONAL_MANAGER_ACCESS, trainerId: user.id });
      } else {
        setPermissions({ ...FULL_ACCESS, trainerId: user.id });
      }
      return;
    }

    setIsLoading(true);
    api.get('/permissions/me')
      .then(({ data }) => setPermissions(data.data))
      .catch(() => setPermissions({ ...NO_ACCESS, trainerId: user.id })) // fallback to no access
      .finally(() => setIsLoading(false));
  }, [isAuthenticated, user, tick]);

  function can(key: keyof Omit<TrainerPermissions, 'trainerId' | 'updatedAt' | 'updatedByName'>): boolean {
    if (!permissions) return false;
    return permissions[key] as boolean;
  }

  return (
    <PermissionsContext.Provider value={{ permissions, can, isLoading, refresh: () => setTick((t) => t + 1) }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used inside <PermissionsProvider>');
  return ctx;
}
