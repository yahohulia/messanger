export interface SessionRecord {
  userId: string;
  expiresAt: Date | string;
}

export function isSessionValid(
  session: SessionRecord | null | undefined
): session is SessionRecord {
  if (!session) return false;
  return new Date(session.expiresAt) >= new Date();
}
