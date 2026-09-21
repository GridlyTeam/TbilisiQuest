# Tbilisi Quest

A location-based quest app for Tbilisi, built as an installable PWA.

## Stack

- **Vite + React + TypeScript** — build tooling and UI
- **vite-plugin-pwa** — service worker, offline caching, home-screen install
- **MapLibre GL** — maps, no API key or billing account required
- **Cloudflare Pages** — hosting, auto-deploys on push to `main`

## Local development

```bash
npm install
npm run dev
```

Geolocation requires a secure context. `localhost` counts as secure, so the dev
server works, but testing on a physical phone over the LAN needs HTTPS — the
simplest route is to test against the deployed Cloudflare preview URL instead.

## Build

```bash
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
```

## Deployment

Cloudflare Pages is connected to this repository. Pushing to `main` triggers a
production deploy; pull requests get their own preview URL.

| Setting          | Value           |
| ---------------- | --------------- |
| Build command    | `npm run build` |
| Build output dir | `dist`          |
