## Learned User Preferences

- For UI, **default to shadcn/ui**: look under `components/ui/` for the primitive; if it is not installed yet, add it with `bunx shadcn@latest add <component>` (then compose from it) instead of hand-rolling tables, dialogs, forms, etc., unless the user explicitly asks for a custom implementation.
- For catalyst research, avoid hardcoded ticker/company-specific event maps; use general discovery patterns that can surface branded or recurring events for any proper company.
- When debugging missing catalyst results, do not attribute first-run misses to cache without evidence; treat them as retrieval or extraction quality issues first.

## Learned Workspace Facts
- Use **Bun** for installs and scripts (`bun install`, `bun run …`); `bun.lock` is the only committed lockfile—do not add `package-lock.json`.
- Stonkseer is a stock catalyst-tracking app: users enter a ticker, research upcoming catalysts for the next 12 months, then can save all catalysts from a completed run to a portfolio.
- The app uses Next.js and React with shadcn UI, Convex for backend data and reactivity, Clerk Google SSO for auth, and the Vercel AI SDK for structured research.
- Global client providers (Convex+Clerk bridge, theme, auth sync, and similar) live under `components/providers/`; wire the tree in `components/providers/app-providers.tsx` and keep `app/layout.tsx` thin—add new app-wide providers there rather than under `app/` or loose `components/` files unless they are route-only.
- The MVP intentionally allows one anonymous ticker research trial before sign-in; saving to a portfolio requires Google sign-in.
- Anonymous research protection uses layered controls: deterministic ticker normalization/validation, hashed IP bucket, signed browser token, cache reuse, lower-cost research limits, and invalid tickers must not consume the anonymous trial.
- The anonymous research endpoint is a Next.js Route Handler because it needs request headers, IP-derived signals, and HTTP-only cookie handling; authenticated portfolio saves should use Convex mutations.
- Research runs in Convex actions: validate tickers deterministically using Finnhub market data when `FINNHUB_API_KEY` is set, gather Tavily web snippets when `TAVILY_API_KEY` is set, use the Vercel AI SDK for structured extraction, support scheduled refresh/cache TTLs, and keep provider/model keys (including AI gateway) in Convex deployment env—not only in Next.js `.env.local`.
- The GitHub repository is `https://github.com/0xGuvnor/stonkseer`, with `master` tracking `origin/master`; the connected Vercel project is `0xguvnors-projects/stonkseer` at `https://stonkseer.vercel.app`.
- The Clerk JWT issuer for Convex belongs in Convex deployment environment variables, while Clerk frontend/server keys belong in local Next.js/Vercel environment variables; if real Clerk keys are set, keyless `.clerk/` fallback is not required and generated `.clerk/` content stays out of git.
- The Convex dashboard project is named `stonkseer`, and the local CLI has been connected to it.
- On Vercel, `NEXT_PUBLIC_*` values (including `NEXT_PUBLIC_CONVEX_URL`) are inlined at build time, so they must be set in the project's environment variables for each environment that production or preview builds use.
