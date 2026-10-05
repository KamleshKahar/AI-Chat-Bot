/** @type {import('next').NextConfig} */
import { getApiOrigin } from './lib/apiOrigin.mjs';

const nextConfig = {
  /**
   * Backend-for-frontend proxy.
   *
   * The browser only ever talks to its own origin, so the API is same-origin:
   * no CORS preflight, no `Authorization` header assembled in client code, and
   * the JWT stays in an httpOnly cookie that JavaScript cannot read.
   *
   * `proxy.js` runs *before* `afterFiles` rewrites (see the execution order in
   * the Next.js docs) and lifts the session cookie into an
   * `Authorization: Bearer` header, which this rewrite forwards upstream.
   */
  async rewrites() {
    const apiOrigin = getApiOrigin();
    return [
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
