# Security

## Reporting Vulnerabilities

Please do not open public issues for security vulnerabilities.

Report security concerns through a private channel to the project maintainers, or contact the OSIPI maintainers through the OSIPI Slack workspace if no maintainer-specific contact is available.

## Scope

OSIPY Dashboard is currently a frontend-only SvelteKit application. Login, account creation, PocketBase, and seed scripts are intentionally out of scope until persistence is needed.

Security-sensitive areas include:

- User-provided files, paths, or metadata if future OSIPY runner integration is added.
- Build-time and deployment configuration for GitHub Pages.
- Third-party JavaScript, Svelte, Vite, Tailwind, and Bun dependencies.
- Any future bridge between the dashboard and local or remote OSIPY execution.

## Maintainer Expectations

- Keep dependency updates reviewable and tested.
- Avoid committing secrets, credentials, or private imaging data.
- Document assumptions when adding persistence, authentication, networking, or execution features.
- Treat patient or participant data as sensitive and keep it out of the repository.
