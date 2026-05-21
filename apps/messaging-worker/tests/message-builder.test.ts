import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMessagePayload } from '../lib/message-builder';

afterEach(() => {
  vi.useRealTimers();
});

describe('buildMessagePayload', () => {
  it('uses tempId as the message id', () => {
    const payload = buildMessagePayload('user1', {
      tempId: 'temp-abc-123',
      receiverId: 'user2',
      content: 'Hello',
    });
    expect(payload.id).toBe('temp-abc-123');
  });

  it('sets senderId to the provided userId', () => {
    const payload = buildMessagePayload('user1', {
      tempId: 'temp-abc-123',
      receiverId: 'user2',
      content: 'Hello',
    });
    expect(payload.senderId).toBe('user1');
  });

  it('passes through receiverId and content unchanged', () => {
    const payload = buildMessagePayload('user1', {
      tempId: 'temp-abc-123',
      receiverId: 'user2',
      content: 'Test message',
    });
    expect(payload.receiverId).toBe('user2');
    expect(payload.content).toBe('Test message');
  });

  it('sets sentAt to current ISO timestamp', () => {
    vi.useFakeTimers();
    const fixedTime = new Date('2025-06-01T10:00:00.000Z');
    vi.setSystemTime(fixedTime);

    const payload = buildMessagePayload('user1', {
      tempId: 'temp-abc-123',
      receiverId: 'user2',
      content: 'Hello',
    });

    expect(payload.sentAt).toBe('2025-06-01T10:00:00.000Z');
  });
});
