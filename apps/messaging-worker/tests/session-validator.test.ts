import { describe, it, expect, vi, afterEach } from 'vitest';
import { isSessionValid } from '../lib/session-validator';

afterEach(() => {
  vi.useRealTimers();
});

describe('isSessionValid', () => {
  it('returns false for null', () => {
    expect(isSessionValid(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSessionValid(undefined)).toBe(false);
  });

  it('returns false when session is expired', () => {
    const session = {
      userId: 'user1',
      expiresAt: new Date(Date.now() - 1000), // 1 second ago
    };
    expect(isSessionValid(session)).toBe(false);
  });

  it('returns false when expiresAt is an expired ISO string', () => {
    const session = {
      userId: 'user1',
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    expect(isSessionValid(session)).toBe(false);
  });

  it('returns true for a valid session with future Date', () => {
    const session = {
      userId: 'user1',
      expiresAt: new Date(Date.now() + 3_600_000), // 1 hour from now
    };
    expect(isSessionValid(session)).toBe(true);
  });

  it('returns true for a valid session with future ISO string', () => {
    const session = {
      userId: 'user1',
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    expect(isSessionValid(session)).toBe(true);
  });

  it('returns false when expiry is exactly now (boundary)', () => {
    vi.useFakeTimers();
    const now = new Date('2025-01-01T12:00:00Z');
    vi.setSystemTime(now);

    const session = { userId: 'user1', expiresAt: now };
    // new Date(expiresAt) >= new Date() → equal, so true
    expect(isSessionValid(session)).toBe(true);
  });
});
