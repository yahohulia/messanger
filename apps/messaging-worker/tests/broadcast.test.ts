import { describe, it, expect, vi } from 'vitest';
import { WebSocket } from 'ws';
import { broadcast } from '../lib/broadcast';

function makeMockSocket(readyState: number): WebSocket {
  return { readyState, send: vi.fn() } as unknown as WebSocket;
}

describe('broadcast', () => {
  it('sends payload to all sockets except the excluded user', () => {
    const socketA = makeMockSocket(WebSocket.OPEN);
    const socketB = makeMockSocket(WebSocket.OPEN);
    const socketC = makeMockSocket(WebSocket.OPEN);

    const userSockets = new Map([
      ['userA', socketA],
      ['userB', socketB],
      ['userC', socketC],
    ]);

    broadcast(userSockets, 'userA', { type: 'user_online', userId: 'userA' });

    expect(socketA.send).not.toHaveBeenCalled();
    expect(socketB.send).toHaveBeenCalledOnce();
    expect(socketC.send).toHaveBeenCalledOnce();
  });

  it('sends correct JSON-serialised payload', () => {
    const socket = makeMockSocket(WebSocket.OPEN);
    const userSockets = new Map([['userB', socket]]);
    const payload = { type: 'user_online', userId: 'userA' };

    broadcast(userSockets, 'userA', payload);

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify(payload));
  });

  it('skips sockets that are not OPEN', () => {
    const closing = makeMockSocket(WebSocket.CLOSING);
    const closed = makeMockSocket(WebSocket.CLOSED);
    const connecting = makeMockSocket(WebSocket.CONNECTING);

    const userSockets = new Map([
      ['userB', closing],
      ['userC', closed],
      ['userD', connecting],
    ]);

    broadcast(userSockets, 'userA', { type: 'ping' });

    expect(closing.send).not.toHaveBeenCalled();
    expect(closed.send).not.toHaveBeenCalled();
    expect(connecting.send).not.toHaveBeenCalled();
  });

  it('does nothing when userSockets is empty', () => {
    expect(() => broadcast(new Map(), 'userA', { type: 'ping' })).not.toThrow();
  });
});
