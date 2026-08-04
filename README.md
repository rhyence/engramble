# Engramble

Engramble is a daily study game: Wordle-style daily cadence, Anki-style study sets, and two mini-games pulled from the user's own terms.

This first React pass ports the supplied HTML prototype into a Vite + TypeScript app. It runs in local mode by default and is structured for Supabase Auth + Postgres.

## Current Scope

- Daily screen with Connections and Reveal cards
- My Sets list with edit, delete, and share-link actions
- Create/edit study set form with validation
- Connections game logic and scoring
- Reveal game logic and scoring
- Result card copy
- Local persistence through `localStorage`
- Optional Supabase client initialization
- Supabase schema and RLS policies in `supabase/schema.sql`

## Setup

The machine currently needs free disk space before dependencies can install.

```bash
npm install
npm test
npm run build
npm run dev
```

## Supabase

This project is set up against the Supabase project `engramble`:

- Project ref: `giknuzqnixrzpvyxszxs`
- API URL: `https://giknuzqnixrzpvyxszxs.supabase.co`

Copy `.env.example` to `.env.local` and fill the publishable key from the Supabase dashboard:

```bash
VITE_SUPABASE_URL=https://giknuzqnixrzpvyxszxs.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
```

The initial schema has already been applied to the `engramble` project. Enable Google as an Auth provider in the Supabase dashboard before using real sign-in.

The app keeps working without these variables by using local mode.
