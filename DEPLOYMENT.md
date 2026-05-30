# Badminton Game Cloud Deployment

This project is prepared for Supabase-backed online multiplayer and Vercel static deployment.

## Supabase

Apply the migration in `supabase/migrations/202605300001_create_match_results.sql`.

The migration creates `public.match_results`, enables RLS, and allows public client inserts/selects so browser clients can save match results with the publishable key.

Required client values:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

`SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY` can be used as a fallback for older projects.

The default frontend configuration points at the `badminton` Supabase project:

- Project ID: `hsasqrbdodluijskxvyu`
- URL: `https://hsasqrbdodluijskxvyu.supabase.co`

## Vercel

Set these environment variables in Vercel before deploying:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The Vercel build runs `cd game && npm run build`, copies Three.js into `game/public/vendor`, and generates `game/public/env.js` from the environment variables.

## GitHub

After committing, add a GitHub remote and push:

```powershell
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

If Vercel is connected to that GitHub repository, future pushes to `main` will deploy automatically.
