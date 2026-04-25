## Learned User Preferences

## Learned Workspace Facts
- Use **Bun** for installs and scripts (`bun install`, `bun run …`); `bun.lock` is the only committed lockfile—do not add `package-lock.json`.
- Stonkseer is a stock catalyst-tracking app: users enter a ticker, research upcoming catalysts for the next 12 months, then can save selected events to portfolios.
- The app uses Next.js and React with shadcn UI, Convex for backend data and reactivity, Clerk Google SSO for auth, and the Vercel AI SDK for structured research.
- The MVP intentionally allows one anonymous ticker research trial before sign-in; saving to a portfolio requires Google sign-in.
- Anonymous research protection uses layered controls: hashed IP bucket, signed browser token, ticker normalization and cache reuse, and lower-cost research limits.
- The anonymous research endpoint is a Next.js Route Handler because it needs request headers, IP-derived signals, and HTTP-only cookie handling; authenticated portfolio saves should use Convex mutations.
- Research includes scheduled refresh support via Convex cron/internal actions, stale tracked-stock queueing, cache TTLs, retry and budget controls, and cost-tracking fields.
- The GitHub repository is `https://github.com/0xGuvnor/stonkseer`, with `master` tracking `origin/master`, and the Vercel project is connected to that repository.
- The Vercel project `0xguvnors-projects/stonkseer` is deployed at `https://stonkseer.vercel.app`.
- The Clerk JWT issuer for Convex belongs in Convex deployment environment variables, while Clerk frontend and server keys belong in local Next.js environment variables.
- The Convex dashboard project is named `stonkseer`, and the local CLI has been connected to it.
- On Vercel, `NEXT_PUBLIC_*` values (including `NEXT_PUBLIC_CONVEX_URL`) are inlined at build time, so they must be set in the project's environment variables for each environment that production or preview builds use.
- If Clerk publishable and secret keys are set in local and Vercel environment, Clerk's keyless `.clerk/` local fallback is not required; keep generated `.clerk/` content out of git.
