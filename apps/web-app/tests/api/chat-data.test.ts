import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@messanger/db', () => ({
  user: { id: 'id', name: 'name', username: 'username', image: 'image' },
  archivedMessage: { senderId: 'senderId', receiverId: 'receiverId', sentAt: 'sentAt' },
  hiddenContact: { userId: 'userId', contactId: 'contactId' },
}));

vi.mock('drizzle-orm', () => ({
  ne: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  asc: vi.fn(),
  inArray: vi.fn(),
  notInArray: vi.fn(),
}));

vi.mock('~/server/utils/db', () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
  },
}));

const mockContacts = [{ id: 'user2', name: 'Bob', username: 'bob', image: null }];
const mockMessages = [
  { id: 'msg1', senderId: 'user1', receiverId: 'user2', content: 'Hi', sentAt: new Date() },
];

const { db } = await import('~/server/utils/db');
const handler = (await import('../../server/api/chat-data.get')).default as Function;

// Helper to build a chainable mock that resolves to `value` at the end
function chainMock(value: unknown) {
  const chain: Record<string, unknown> = {};
  const end = vi.fn().mockResolvedValue(value);
  chain.from = vi.fn(() => ({ where: vi.fn(() => ({ orderBy: end, then: end.bind(null, undefined) })) }));
  // make .from().where() itself thenable (resolves without orderBy)
  chain.from = vi.fn(() => ({
    where: vi.fn(() => ({
      orderBy: vi.fn().mockResolvedValue(value),
      then: (resolve: Function) => Promise.resolve(value).then(resolve),
    })),
    then: (resolve: Function) => Promise.resolve(value).then(resolve),
  }));
  return chain;
}

beforeEach(() => {
  // selectDistinct × 2: sentTo (receiverIds), receivedFrom (senderIds)
  vi.mocked(db.selectDistinct)
    .mockImplementationOnce(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([{ id: 'user2' }]) })),
    }) as any)
    .mockImplementationOnce(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })),
    }) as any);

  // select × 3: hidden contacts, contacts by id, initialMessages
  vi.mocked(db.select)
    .mockImplementationOnce(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })), // no hidden contacts
    }) as any)
    .mockImplementationOnce(() => ({
      from: vi.fn(() => ({ where: vi.fn().mockResolvedValue(mockContacts) })), // contacts
    }) as any)
    .mockImplementationOnce(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn().mockResolvedValue(mockMessages),
        })),
      })),
    }) as any);
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

  it('returns contacts from db', async () => {
    const result = await handler(makeEvent({ user: { id: 'user1' }, session: {} }));
    expect(result.contacts).toEqual(mockContacts);
  });

  it('returns initialMessages from db', async () => {
    const result = await handler(makeEvent({ user: { id: 'user1' }, session: {} }));
    expect(result.initialMessages).toEqual(mockMessages);
  });
});
