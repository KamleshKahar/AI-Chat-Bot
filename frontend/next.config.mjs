/** @type {import('next').NextConfig} */
import { getApiOrigin } from './lib/apiOrigin.mjs';
import { getAiOrigin } from './lib/aiOrigin.mjs';

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
   * `Authorization: Bearer` header, which these rewrites forward upstream.
   *
   * `/api/ai/*` is matched first and sent to the AI orchestrator; everything
   * else under `/api/*` goes to the FlowPilot REST backend. Because both pass
   * through `proxy.js`, the AI backend receives the requesting user's token and
   * never a shared or service credential.
   */
  async rewrites() {
    const apiOrigin = getApiOrigin();
    const aiOrigin = getAiOrigin();
    return [
      {
        source: '/api/ai/:path*',
        destination: `${aiOrigin}/api/:path*`,
      },
      {
        source: '/api/:path*',
        destination: `${apiOrigin}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
