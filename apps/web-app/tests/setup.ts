// Stub Nuxt auto-imported server globals so handlers can be imported in plain Vitest
(global as any).defineEventHandler = (fn: Function) => fn;
(global as any).createError = ({ statusCode, message }: { statusCode: number; message: string }) => {
  const err = new Error(message) as any;
  err.statusCode = statusCode;
  return err;
};
