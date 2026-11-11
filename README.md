# Friendsgiving Lunch Sign-Up

Shared sign-up page for Friendsgiving lunch (Saturday, Nov 14). Friends claim a dish or add their own; everyone sees the same list.

- `index.html` – the page
- `api/items.js` – Vercel function that stores sign-ups in Upstash Redis

## Deploy
1. Import this repo in Vercel (Add New → Project).
2. In the project, Storage → Create Database → Upstash Redis, and connect it.
3. Redeploy so the site picks up the database.
