import { describe, it, expect } from 'vitest';

// Import handler after globals are stubbed in setup.ts
const handler = (await import('../../server/api/session.get')).default as Function;

function makeEvent(overrides: Record<string, unknown> = {}) {
  return { context: { user: null, session: null, ...overrides } };
}

describe('GET /api/session', () => {
  it('returns null user and session when unauthenticated', async () => {
    const result = await handler(makeEvent());
    expect(result).toEqual({ user: null, session: null });
  });

  it('returns the user from event context', async () => {
    const user = { id: 'user1', name: 'Alice', email: 'alice@example.com' };
    const result = await handler(makeEvent({ user }));
    expect(result.user).toEqual(user);
  });

  it('returns the session from event context', async () => {
    const session = { id: 'sess1', token: 'tok', userId: 'user1' };
    const result = await handler(makeEvent({ session }));
    expect(result.session).toEqual(session);
  });

  it('returns both user and session together', async () => {
    const user = { id: 'user1', name: 'Alice' };
    const session = { token: 'tok', userId: 'user1' };
    const result = await handler(makeEvent({ user, session }));
    expect(result).toEqual({ user, session });
  });
});
