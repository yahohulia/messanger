import { describe, it, expect, vi, beforeEach } from 'vitest';

// Schema mocks - simple objects, no real DB needed
vi.mock('@messanger/db', () => ({
  user: { id: 'id', name: 'name' },
  archivedMessage: { senderId: 'senderId', receiverId: 'receiverId', sentAt: 'sentAt' },
}));

vi.mock('drizzle-orm', () => ({
  ne: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  asc: vi.fn(),
}));

// Minimal db mock — select() is a plain vi.fn(), configured per-test in beforeEach
vi.mock('~/server/utils/db', () => ({
  db: { select: vi.fn() },
}));

const mockUsers = [{ id: 'user2', name: 'Bob' }];
const mockMessages = [
  { id: 'msg1', senderId: 'user1', receiverId: 'user2', content: 'Hi', sentAt: new Date() },
];

// Import AFTER mocks are set up
const { db } = await import('~/server/utils/db');
const handler = (await import('../../server/api/chat-data.get')).default as Function;

beforeEach(() => {
  // First select() → users query: .from().where() resolves directly
  // Second select() → messages query: .from().where().orderBy() resolves
  vi.mocked(db.select)
    .mockImplementationOnce(
      () =>
        ({
          from: vi.fn(() => ({
            where: vi.fn().mockResolvedValue(mockUsers),
          })),
        }) as any
    )
    .mockImplementationOnce(
      () =>
        ({
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              orderBy: vi.fn().mockResolvedValue(mockMessages),
            })),
          })),
        }) as any
    );
});

function makeEvent(overrides: Record<string, unknown> = {}) {
  return { context: { user: null, session: null, ...overrides } };
}

describe('GET /api/chat-data', () => {
  it('throws 401 when user is not authenticated', async () => {
    await expect(handler(makeEvent())).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns current user in the response', async () => {
    const user = { id: 'user1', name: 'Alice' };
    const result = await handler(makeEvent({ user, session: {} }));
    expect(result.user).toEqual(user);
  });

  it('returns current session in the response', async () => {
    const session = { token: 'tok' };
    const result = await handler(makeEvent({ user: { id: 'user1' }, session }));
    expect(result.session).toEqual(session);
  });

  it('returns availableUsers from db', async () => {
    const result = await handler(makeEvent({ user: { id: 'user1' }, session: {} }));
    expect(result.availableUsers).toEqual(mockUsers);
  });

  it('returns initialMessages from db', async () => {
    const result = await handler(makeEvent({ user: { id: 'user1' }, session: {} }));
    expect(result.initialMessages).toEqual(mockMessages);
  });
});
