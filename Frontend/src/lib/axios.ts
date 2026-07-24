import axios from "axios";

type QueueItem = { resolve: (v: string) => void; reject: (e: unknown) => void };

/** Per-portal refresh state — prevents student/staff sessions cross-contaminating tokens. */
const refreshState: Record<string, { active: boolean; queue: QueueItem[] }> = {};

function getRefreshState(slot: string) {
  if (!refreshState[slot]) refreshState[slot] = { active: false, queue: [] };
  return refreshState[slot];
}

function processQueue(slot: string, error: unknown, token: string | null = null) {
  const state = getRefreshState(slot);
  state.queue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token!);
  });
  state.queue = [];
}

/** Returns the localStorage slot key suffix for the current tab. */
export function tabSlot(): string {
  return sessionStorage.getItem("lms_tab_slot") ?? "staff";
}

function getToken(): string | null {
  return localStorage.getItem(`lms_access_token_${tabSlot()}`);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(`lms_refresh_token_${tabSlot()}`);
}

function setTokens(accessToken: string, refreshToken?: string) {
  const slot = tabSlot();
  localStorage.setItem(`lms_access_token_${slot}`, accessToken);
  if (refreshToken) {
    localStorage.setItem(`lms_refresh_token_${slot}`, refreshToken);
  }
  try {
    const ch = new BroadcastChannel("lms_auth");
    ch.postMessage({ type: "tokens", slot, accessToken, refreshToken });
    ch.close();
  } catch {
    /* BroadcastChannel unsupported */
  }
}

function clearAuthAndRedirect(reason?: string) {
  const slot = tabSlot();
  localStorage.removeItem(`lms_access_token_${slot}`);
  localStorage.removeItem(`lms_refresh_token_${slot}`);
  localStorage.removeItem(`lms_user_${slot}`);
  sessionStorage.removeItem("lms_tab_slot");
  try {
    const ch = new BroadcastChannel("lms_auth");
    ch.postMessage({ type: "logout", slot });
    ch.close();
  } catch {
    /* ignore */
  }
  const path = window.location.pathname || "";
  // Already on login/signup/forgot — don't hard-reload (preserves toast + other portal slots)
  if (path.startsWith("/login") || path.startsWith("/signup") || path.startsWith("/forgot") || path.startsWith("/reset-password")) {
    return;
  }
  const q = reason ? `?error=${encodeURIComponent(reason)}` : "";
  window.location.href = `/login${q}`;
}

try {
  const ch = new BroadcastChannel("lms_auth");
  ch.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "tokens" && msg.slot === tabSlot() && msg.accessToken) {
      localStorage.setItem(`lms_access_token_${msg.slot}`, msg.accessToken);
      if (msg.refreshToken) {
        localStorage.setItem(`lms_refresh_token_${msg.slot}`, msg.refreshToken);
      }
      api.defaults.headers.common["Authorization"] = `Bearer ${msg.accessToken}`;
      const state = getRefreshState(msg.slot);
      if (state.active) {
        processQueue(msg.slot, null, msg.accessToken);
        state.active = false;
      }
    }
    if (msg.type === "logout" && msg.slot === tabSlot()) {
      localStorage.removeItem(`lms_access_token_${msg.slot}`);
      localStorage.removeItem(`lms_refresh_token_${msg.slot}`);
      localStorage.removeItem(`lms_user_${msg.slot}`);
    }
  };
} catch {
  /* ignore */
}

const INACTIVE_CODES = new Set([
  "ACCOUNT_PENDING",
  "ACCOUNT_REJECTED",
  "ACCOUNT_BLOCKED",
  "ACCOUNT_EXPIRED",
]);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  const url = String(config.url ?? "");
  if (config.method?.toLowerCase() === "get" && url.includes("content-master")) {
    config.params = { ...(config.params as object | undefined), _: Date.now() };
    config.headers["Cache-Control"] = "no-cache";
    config.headers["Pragma"] = "no-cache";
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const status = error.response?.status;
    const code = error.response?.data?.code as string | undefined;
    const slot = tabSlot();
    const state = getRefreshState(slot);
    const url = String(originalRequest.url || "");

    const isPublicAuth =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/forgot-password") ||
      url.includes("/auth/reset-password") ||
      url.includes("/auth/validate-reset-token") ||
      url.includes("/auth/check-email") ||
      url.includes("/auth/refresh");

    // Inactive on an authenticated API → logout that portal only.
    // Never treat public login/register 403 (e.g. ACCOUNT_PENDING) as a session wipe —
    // that wrongly cleared the staff slot when tab_slot defaulted to "staff".
    if (status === 403 && code && INACTIVE_CODES.has(code) && !isPublicAuth) {
      const reason =
        code === "ACCOUNT_PENDING"
          ? "pending_approval"
          : code === "ACCOUNT_EXPIRED"
            ? "account_expired"
            : "account_inactive";
      clearAuthAndRedirect(reason);
      return Promise.reject(error);
    }

    if (status !== 401 || originalRequest._retry || isPublicAuth) {
      return Promise.reject(error);
    }

    if (state.active) {
      return new Promise<string>((resolve, reject) => {
        state.queue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest._retry = true;
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    state.active = true;

    const runRefresh = async (refreshToken: string) => {
      const refreshRes = await axios.post(
        `${import.meta.env.VITE_API_URL}/auth/refresh`,
        { refreshToken },
        { withCredentials: true },
      );
      const newAccessToken = refreshRes.data?.data?.accessToken;
      const newRefreshToken = refreshRes.data?.data?.refreshToken;
      if (!newAccessToken) throw new Error("No access token in refresh response");
      setTokens(newAccessToken, newRefreshToken);
      api.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`;
      return newAccessToken as string;
    };

    try {
      const beforeRefresh = getRefreshToken();
      if (!beforeRefresh) throw new Error("NO_REFRESH");

      let newAccessToken: string;
      if (typeof navigator !== "undefined" && "locks" in navigator) {
        newAccessToken = await navigator.locks.request(
          `lms_refresh_${slot}`,
          { mode: "exclusive" },
          async () => {
            const currentRefresh = getRefreshToken();
            // Peer already rotated while we waited
            if (currentRefresh && currentRefresh !== beforeRefresh) {
              const peerAccess = localStorage.getItem(`lms_access_token_${slot}`);
              if (peerAccess) return peerAccess;
            }
            if (!currentRefresh) throw new Error("NO_REFRESH");
            try {
              return await runRefresh(currentRefresh);
            } catch {
              const afterFail = getRefreshToken();
              if (afterFail && afterFail !== currentRefresh) {
                const peerAccess = localStorage.getItem(`lms_access_token_${slot}`);
                if (peerAccess) return peerAccess;
              }
              throw new Error("REFRESH_FAILED");
            }
          },
        );
      } else {
        newAccessToken = await runRefresh(beforeRefresh);
      }

      processQueue(slot, null, newAccessToken);
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(slot, refreshError, null);
      clearAuthAndRedirect();
      return Promise.reject(refreshError);
    } finally {
      state.active = false;
    }
  },
);

export default api;
