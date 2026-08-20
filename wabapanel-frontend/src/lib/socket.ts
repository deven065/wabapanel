import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket | null => socket;

export const connectSocket = (token: string): Socket => {
  if (socket?.connected) return socket;

  socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5000'), {
    path: process.env.NEXT_PUBLIC_SOCKET_PATH || '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  socket.on('connect_error', (err) => console.error('Socket error:', err.message));

  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const joinWorkspace = (workspaceId: string) => {
  socket?.emit('join_workspace', workspaceId);
};

export const leaveWorkspace = (workspaceId: string) => {
  socket?.emit('leave_workspace', workspaceId);
};

export const joinConversation = (conversationId: string) => {
  socket?.emit('join_conversation', conversationId);
};

export const leaveConversation = (conversationId: string) => {
  socket?.emit('leave_conversation', conversationId);
};

export const emitTyping = (conversationId: string, isTyping: boolean) => {
  socket?.emit(isTyping ? 'typing_start' : 'typing_stop', { conversationId });
};
