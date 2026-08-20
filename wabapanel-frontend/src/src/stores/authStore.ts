import { create } from 'zustand';
import { isAxiosError } from 'axios';
import type { User, Workspace } from '@/types';
import { authApi, workspaceApi } from '@/lib/api';
import { connectSocket, disconnectSocket, joinWorkspace } from '@/lib/socket';

interface AuthState {
  user: User | null;
  features: Record<string, boolean>;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ requires2FA?: boolean; method?: string; challengeToken?: string } | void>;
  complete2FALogin: (challengeToken: string, code: string) => Promise<void>;
  adminLogin: (email: string, password: string) => Promise<{ requires2FA?: boolean; method?: string; challengeToken?: string } | void>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
  loadUser: () => Promise<void>;
  switchWorkspace: (workspaceId: string) => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  features: {},
  workspaces: [],
  currentWorkspace: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email, password) => {
    const res = await authApi.login({ email, password });
    if (res.data.requires2FA) {
      return { requires2FA: true, method: res.data.method, challengeToken: res.data.challengeToken };
    }
    const { token, user, workspaces } = res.data.data;
    localStorage.setItem('token', token);
    if (user.currentWorkspace?._id) localStorage.setItem('workspaceId', user.currentWorkspace._id);
    connectSocket(token);
    if (user.currentWorkspace?._id) joinWorkspace(user.currentWorkspace._id);
    set({
      token, user, workspaces: workspaces || [],
      currentWorkspace: user.currentWorkspace || null,
      isAuthenticated: true, isLoading: false,
    });
  },

  complete2FALogin: async (challengeToken, code) => {
    const res = await authApi.twoFactorLoginVerify({ challengeToken, code });
    const { token, user, workspaces } = res.data.data;
    localStorage.setItem('token', token);
    if (user.currentWorkspace?._id) localStorage.setItem('workspaceId', user.currentWorkspace._id);
    connectSocket(token);
    if (user.currentWorkspace?._id) joinWorkspace(user.currentWorkspace._id);
    set({
      token, user, workspaces: workspaces || [],
      currentWorkspace: user.currentWorkspace || null,
      isAuthenticated: true, isLoading: false,
    });
  },

  adminLogin: async (email, password) => {
    const res = await authApi.adminLogin({ email, password });
    if (res.data.requires2FA) {
      return { requires2FA: true, method: res.data.method, challengeToken: res.data.challengeToken };
    }
    const { token, user } = res.data.data;
    localStorage.setItem('token', token);
    // For vendor role, also load workspaces so client panel works
    if (user.role === 'vendor') {
      connectSocket(token);
      let workspaces: Workspace[] = [];
      try {
        const wsRes = await workspaceApi.list();
        workspaces = wsRes.data.data || [];
      } catch { /* no workspaces */ }
      const currentWorkspace = workspaces.length > 0 ? workspaces[0] : null;
      if (currentWorkspace?._id) {
        localStorage.setItem('workspaceId', currentWorkspace._id);
        joinWorkspace(currentWorkspace._id);
      }
      set({ token, user, workspaces, currentWorkspace, isAuthenticated: true, isLoading: false });
    } else {
      set({ token, user, isAuthenticated: true, isLoading: false });
    }
  },

  register: async (name, email, password) => {
    const res = await authApi.register({ name, email, password });
    if (res.data.requiresVerification) return true;
    const { token, user, workspace } = res.data.data;
    localStorage.setItem('token', token);
    if (workspace?._id) localStorage.setItem('workspaceId', workspace._id);
    connectSocket(token);
    if (workspace?._id) joinWorkspace(workspace._id);
    set({
      token, user, workspaces: workspace ? [workspace] : [],
      currentWorkspace: workspace || null,
      isAuthenticated: true, isLoading: false,
    });
    return false;
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('workspaceId');
    disconnectSocket();
    set({ user: null, workspaces: [], currentWorkspace: null, token: null, isAuthenticated: false, isLoading: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) { set({ isLoading: false }); return; }
    try {
      const res = await authApi.getMe();
      const meData = res.data.data;
      const user = meData.user || meData;
      connectSocket(token);
      let workspaces: Workspace[] = meData.workspaces || [];
      if (!workspaces.length) {
        try {
          const wsRes = await workspaceApi.list();
          workspaces = wsRes.data.data || [];
        } catch { /* no workspaces */ }
      }
      const currentWorkspace = typeof user.currentWorkspace === 'object' && user.currentWorkspace
        ? user.currentWorkspace
        : workspaces.length > 0 ? workspaces[0] : null;
      if (currentWorkspace?._id) {
        localStorage.setItem('workspaceId', currentWorkspace._id);
        joinWorkspace(currentWorkspace._id);
      }
      set({ user, features: meData.features || {}, workspaces, currentWorkspace, token, isAuthenticated: true, isLoading: false });
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 401) localStorage.removeItem('token');
      set({ isLoading: false });
    }
  },

  switchWorkspace: async (workspaceId) => {
    await authApi.switchWorkspace(workspaceId);
    localStorage.setItem('workspaceId', workspaceId);
    const ws = get().workspaces.find(w => w._id === workspaceId) || null;
    if (ws) joinWorkspace(ws._id);
    set({ currentWorkspace: ws });
    window.location.reload();
  },

  updateUser: (data) => {
    const user = get().user;
    if (user) set({ user: { ...user, ...data } });
  },
}));
