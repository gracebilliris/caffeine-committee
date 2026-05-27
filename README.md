# ☕ Caffeine Committee

> Ranking Sydney CBD coffee, one flat white at a time.

A tiny static site for our team near 50 Martin Place to rate cafes,
see them on a map, and argue about who has the best flat white.

- **Host**: GitHub Pages
- **Backend**: Supabase (free tier — Postgres + Realtime)
- **Map**: Leaflet + OpenStreetMap, geocoding via Nominatim
- **Charts**: Chart.js
- **Styling**: Pico.css
- **Build step**: none — plain HTML/JS

## Project layout

```
caffeine-committee/
├── index.html
├── assets/
│   ├── styles.css
│   └── js/
│       ├── config.js    ← put your Supabase URL + anon key here
│       ├── db.js
│       ├── map.js
│       ├── charts.js
│       └── app.js
└── README.md
```

## Setup

### 1. Supabase project (~5 minutes)

1. [supabase.com](https://supabase.com) → sign in with GitHub → **New project** → name `caffeine-committee`, pick Sydney/Singapore region, free plan.
2. Wait ~2 min for provisioning.
3. **SQL Editor → New query**, paste and run:

   ```sql
   create table ratings (
     id uuid default gen_random_uuid() primary key,
     cafe_name text not null,
     address text,
     lat double precision not null,
     lng double precision not null,
     rating numeric not null check (rating >= 0 and rating <= 10),
     by text not null,
     comment text,
     created_at timestamptz default now()
   );

   alter table ratings enable row level security;

   create policy "public read"  on ratings for select using (true);
   create policy "public write" on ratings for insert
     with check (
       cafe_name is not null and "by" is not null
       and rating >= 0 and rating <= 10
     );
   ```

4. **Database → Replication** → toggle `ratings` on under `supabase_realtime`.
5. **Project Settings → API** → copy the **Project URL** and **anon public** key.
6. Paste both into `assets/js/config.js`, replacing the `REPLACE_ME` placeholders.

### 2. Deploy

1. Push to `main`.
2. Repo **Settings → Pages** → Source: **Deploy from a branch** → `main` / `/ (root)`.
3. Live at `https://<username>.github.io/caffeine-committee/` within ~1 minute.

## Local preview

No build step needed:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data shape

Table: `ratings`

| column       | type              | notes                |
|--------------|-------------------|----------------------|
| `id`         | uuid              | auto                 |
| `cafe_name`  | text              | required             |
| `address`    | text              | optional             |
| `lat`        | double precision  | required             |
| `lng`        | double precision  | required             |
| `rating`     | numeric           | 0–10, required       |
| `by`        | text              | required             |
| `comment`    | text              | optional             |
| `created_at` | timestamptz       | defaults to `now()`  |

## Caveats

- No auth — anyone with the URL can submit ratings. Fine for an internal tool.
- The Supabase `anon` key is public. That's by design; Row Level Security protects writes.
- Be gentle with Nominatim — search is human-triggered and well within fair-use.
- Duplicate cafes can happen; clean up manually in the Supabase Table Editor.
