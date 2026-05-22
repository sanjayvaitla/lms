import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
});

// Attach access token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('lms_access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Track if a refresh is already in progress
let isRefreshing = false;

type QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void };
let failedQueue: QueueItem[] = [];

function processQueue(error: unknown, token: string | null): void {
  failedQueue.forEach((p) => {
    if (error) p.reject(error);
    else p.resolve(token as string);
  });
  failedQueue = [];
}

function clearAuthAndRedirect(): void {
  localStorage.removeItem('lms_access_token');
  localStorage.removeItem('lms_refresh_token');
  localStorage.removeItem('lms_user');
  window.location.href = '/login';
}

// On 401 — try refresh token first, only log out if refresh also fails
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const originalRequest = error.config as (typeof error.config) & { _retry?: boolean };

    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      const refreshToken = localStorage.getItem('lms_refresh_token');

      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const newAccessToken: string = data.data.accessToken;

        localStorage.setItem('lms_access_token', newAccessToken);
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthAndRedirect();
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
