# Production Runbook (repo-juq1)

Date: 2026-07-30
Repository: orfebreria-app/repo
Branch: main

## Live Public URLs
- App: https://repo-juq1.vercel.app
- Public verifier: https://repo-juq1.vercel.app/verificar

## Last Known Good State
- Commit: a328278 (dashboard fail-soft loading)
- Deployment used during recovery: repo-e97qso529-orfebreria-apps-projects.vercel.app
- Alias command:
  - vercel alias set repo-e97qso529-orfebreria-apps-projects.vercel.app repo-juq1.vercel.app

## Required Vercel Production Environment Variables
- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY
- VITE_PUBLIC_SITE_URL
- VITE_PUBLIC_VERIFICATION_URL

Expected URL values:
- VITE_PUBLIC_SITE_URL=https://repo-juq1.vercel.app
- VITE_PUBLIC_VERIFICATION_URL=https://repo-juq1.vercel.app

## Why it failed before
- Variables existed in Vercel but had empty values, so login and startup could fail even when the domain resolved.

## Recovery Checklist
1. Verify URLs are reachable:
   - curl.exe -I -L "https://repo-juq1.vercel.app/"
   - curl.exe -I -L "https://repo-juq1.vercel.app/verificar"
2. Verify environment variables are present:
   - vercel env ls
3. If a value is wrong/empty, replace and redeploy:
   - vercel env rm <NAME> production -y
   - vercel env add <NAME> production
   - vercel --prod
4. Repoint alias if needed:
   - vercel alias set <deployment-url> repo-juq1.vercel.app

## Stability fixes already included in code
- src/lib/supabase.js
  - Stable Supabase client caching per mode (production/demo) to avoid bootstrap instability.
- src/pages/Dashboard.jsx
  - Parallel loading and fail-soft behavior for facturas/tickets to avoid UI blocking.
