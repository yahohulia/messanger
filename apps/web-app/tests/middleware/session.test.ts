import { describe, it, expect, vi } from 'vitest';

const mockGetSession = vi.fn();

vi.mock('~/server/utils/auth', () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

vi.mock('h3', () => ({
  getRequestHeaders: vi.fn(() => ({})),
}));

const handler = (await import('../../server/middleware/session')).default as Function;

function makeEvent() {
  return { context: {} as Record<string, unknown> };
}

describe('session middleware', () => {
  it('sets user and session on event.context when session exists', async () => {
    const user = { id: 'user1', name: 'Alice' };
    const session = { token: 'tok', userId: 'user1' };
    mockGetSession.mockResolvedValueOnce({ user, session });

    const event = makeEvent();
    await handler(event);

    expect(event.context.user).toEqual(user);
    expect(event.context.session).toEqual(session);
  });

  it('sets user and session to null when no session exists', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const event = makeEvent();
    await handler(event);

    expect(event.context.user).toBeNull();
    expect(event.context.session).toBeNull();
  });

  it('sets user and session to null when auth returns undefined', async () => {
    mockGetSession.mockResolvedValueOnce(undefined);

    const event = makeEvent();
    await handler(event);

    expect(event.context.user).toBeNull();
    expect(event.context.session).toBeNull();
  });

  it('calls getSession with request headers', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const event = makeEvent();
    await handler(event);
    expect(mockGetSession).toHaveBeenCalledWith({ headers: expect.any(Headers) });
  });
});
