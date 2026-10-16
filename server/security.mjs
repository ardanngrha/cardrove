export function appCsp(backendUrl = '') {
  const origin = backendUrl ? new URL(backendUrl).origin : '';
  if (origin && !/^https?:\/\/[^\s;]+$/.test(origin)) throw Error('Invalid backend origin');
  return [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`.trim(),
    `media-src 'self' blob: ${origin}`.trim(),
    `font-src 'self' ${origin}`.trim(),
    `connect-src 'self' ${origin}`.trim(),
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
  ].join('; ');
}
