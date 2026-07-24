import { toast } from 'sonner';

/** Consistent, understated auth session notifications */
export const authToast = {
  welcome(firstName: string) {
    toast.success(`Welcome back, ${firstName}`, {
      description: 'Signed in successfully',
      duration: 2600,
    });
  },
  signedOut() {
    toast.success('Signed out', {
      description: 'Your session has ended',
      duration: 2400,
    });
  },
};
