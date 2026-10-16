export async function readJsonBody(req: Request, maxBytes = 2_000_000) {
  const fail = (message: string, status: number): never => {
    throw Object.assign(Error(message), { status });
  };
  const reader = req.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let total = 0,
    raw = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        fail('Permintaan terlalu besar.', 413);
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const data = raw ? JSON.parse(raw) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data))
      fail('Data JSON tidak valid.', 400);
    return data;
  } catch {
    return fail('Data JSON tidak valid.', 400);
  }
}
