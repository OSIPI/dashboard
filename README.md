# SvelteKit + PocketBase Template

A modern full-stack template using SvelteKit for the frontend and PocketBase as the backend database.




## Tech Stack

- **Frontend**: SvelteKit 2 with Svelte 5
- **Backend**: PocketBase (embedded SQLite database with real-time subscriptions)
- **Styling**: TailwindCSS 4
- **Runtime**: Bun
- **Containerization**: Docker Compose

![readme](./README.excalidraw.png)

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose


## Quick Start

1. **Clone the repository**

```sh
git clone <your-repo-url>
cd top-svelte-pocketbase
```

2. **Start the development environment**

```sh
docker compose up
```

This will start:
- **PocketBase** at `http://localhost:8090`
- **Frontend** at `http://localhost:8080`

**Note**: The `.env` file is optional. Default ports are used if not specified. To customize, create a `.env` file:

```sh
cp .env.example .env
```

3. **Automatic Setup (First Run)**

On first run, PocketBase will automatically:
- Create a superadmin user from environment variables (or defaults from `.env.example`)
- Run all migrations to set up the database schema
- Configure application settings

**Default superadmin credentials:**
- Email: `admin@admin.local`
- Password: `1234567890`

**⚠️ IMPORTANT:** Change these credentials immediately after first login!

To customize the admin credentials, create a `.env` file:
```sh
cp .env.example .env
# Edit POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD
```

4. **Access PocketBase Admin**

Visit `http://localhost:8090/_/` and log in with your superadmin credentials.

### What's Included

The schema includes:
- **users** collection (built-in auth)
  - Email/password authentication
  - Minimum 8 character passwords

- **posts** collection
  - `title` (text, required) - Post title
  - `content` (editor, optional) - Post content (supports rich text/markdown)
  - `published` (boolean, optional) - Publication status
  - `description` (text, optional) - Post description/excerpt
  - Auto-generated `created` and `updated` timestamps
  - API Rules: Public read access (list and view)

- **todos** collection
  - `name` (text, required, max 255) - Todo task name
  - `Description` (text, optional) - Additional details about the todo
  - `completed` (boolean, optional) - Completion status
  - `user` (relation, required) - Owner of the todo (links to users collection)
  - API Rules: Users can only see and manage their own todos
  - Indexes: Optimized for user and completed status queries

## Development

### Using Docker Compose (Recommended)

```sh
# Start services
docker compose up
```


### Schema Management

#### Export Current Schema

To export your current PocketBase schema (useful after making changes):

```sh
./scripts/export-schema.sh
```

This will guide you through exporting collections from the PocketBase admin UI to `pocketbase/pb_schema/collections.json`.

#### Import Schema

To import the schema into a fresh PocketBase instance:

```sh
./scripts/import-schema.sh
```

Or follow the manual steps:
1. Go to `http://localhost:8090/_/`
2. Settings → Import/Export → Import collections
3. Select `pocketbase/pb_schema/collections.json`

#### Migrations

**Code-First Approach:**

This project uses a code-first migration strategy. All database schema changes are defined in migration files in `pocketbase/pb_migrations/`.

**Key Migration Files:**
- `1_initial_setup.js` - Initial setup including superadmin creation and posts collection

**How Migrations Work:**
1. Migrations are automatically run when PocketBase starts (via `--migrationsDir` flag)
2. On first run (empty `pb_data`), the initial migration creates:
   - Superadmin user from environment variables
   - All collections and their schemas
   - Application settings
3. PocketBase tracks which migrations have been applied in the `_migrations` table

**Adding New Migrations:**

To create a new migration:

```sh
# Start PocketBase container
docker compose up -d pocketbase

# Create a new migration file
docker compose exec pocketbase /pb/pocketbase migrate create "your_migration_name"
```

Or manually create a migration file in `pocketbase/pb_migrations/` with the timestamp prefix format.

**Important Notes:**
- Superadmin is only created on first run (when no superusers exist)
- Migration failures will stop PocketBase from starting
- See [PocketBase migrations docs](https://pocketbase.io/docs/js-migrations/) for more details

### Seeding Test Data

For performance testing and development, you can generate bulk test data using the seeding script:

```sh
bun run seed
```

This will prompt you for:
- Admin credentials for authentication
- User email to assign todos to (default: user@user.com)
- Whether to clear existing todos and posts first

The script generates:
- **1000 todos** with realistic names and descriptions
- **500 blog posts** with varied content

Features:
- Uses [Faker.js](https://fakerjs.dev/) for realistic test data
- Batched creation (100 records at a time) to avoid overwhelming the API
- Progress tracking with real-time updates
- Reusable - can be run multiple times

**Note**: Make sure PocketBase is running (`docker compose up`) before running the seed script.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POCKETBASE_PORT` | PocketBase port | 8090 |
| `FRONTEND_PORT` | Frontend dev server port | 8080 |
| `PUBLIC_POCKETBASE_URL` | PocketBase URL for browser | http://localhost:8090 |
| `POCKETBASE_URL` | PocketBase URL for server-side requests | http://pocketbase:8090 |
| `NODE_ENV` | Environment mode | development |
| `POCKETBASE_ADMIN_EMAIL` | Superadmin email (first run only) | admin@admin.local |
| `POCKETBASE_ADMIN_PASSWORD` | Superadmin password (first run only) | 1234567890 |
| `SMTP_ENABLED` | Enable SMTP email sending | false |
| `SMTP_HOST` | SMTP server hostname | - |
| `SMTP_PORT` | SMTP server port | 587 |
| `SMTP_USER` | SMTP username | - |
| `SMTP_PASS` | SMTP password | - |
| `SMTP_FROM` | Email sender (Name \<email@domain.com\>) | - |

## Building for Production

```sh
# Build the frontend
bun run build

# Preview the production build
bun run preview
```

For production deployment, you'll need to:
1. Build the SvelteKit app
2. Deploy PocketBase with persistent storage
3. Configure environment variables for your production URLs

## Additional Commands

```sh
# Format code
bun run format

# Lint code
bun run lint

# Type check
bun run check

# Seed test data
bun run seed
```

## Versioning & Releases

This project uses tag-triggered releases with automatic changelog generation.

### How It Works

- Version comes from git tags (e.g., `v0.3.0`)
- Pushing a tag triggers GitHub Actions to generate a changelog and create a GitHub Release
- Dev server shows your exact git state via `git describe --tags`

### Version Display

| Environment | Example | Meaning |
|---|---|---|
| On a tag | `v0.3.0` | Exactly at release v0.3.0 |
| After commits | `v0.3.0-5-ga1b2c3d` | 5 commits after v0.3.0, at commit a1b2c3d |

### Creating a Release

```sh
# Work with conventional commits
git commit -m "feat: add new feature"
git commit -m "fix: resolve bug"
git push origin main

# When ready to release
git tag v0.4.0
git push --tags
```

### Conventional Commits

| Prefix | Category |
|---|---|
| `feat:` | Features |
| `fix:` | Bug Fixes |
| `docs:` | Documentation |
| `chore:` | Maintenance |
| `feat!:` | Breaking Changes |

## Resources

- [SvelteKit Documentation](https://svelte.dev/docs/kit)
- [Svelte 5 Documentation](https://svelte.dev/docs/svelte)
- [PocketBase Documentation](https://pocketbase.io/docs/)
- [TailwindCSS Documentation](https://tailwindcss.com/docs)
- [Bun Documentation](https://bun.sh/docs)

## License

[Your License Here]
