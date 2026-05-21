import { WebSocket } from 'ws';

export function broadcast(
  userSockets: Map<string, WebSocket>,
  excludeUserId: string,
  payload: unknown
): void {
  const data = JSON.stringify(payload);
  userSockets.forEach((socket, uid) => {
    if (uid !== excludeUserId && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  });
}
