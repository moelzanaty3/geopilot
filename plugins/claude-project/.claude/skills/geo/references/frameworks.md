# Where to look, by framework

Start from `package.json` and the project layout. Don't stop because a framework isn't listed: find where it writes `<head>`, how it renders pages, and where it keeps public files.

| Framework | Metadata | Rendering | robots.txt and sitemap |
| --- | --- | --- | --- |
| Next.js App Router | `metadata`, `generateMetadata` in `app/**/layout.*` and `page.*` | Server by default; `'use client'` pages need checking | `app/robots.*`, `app/sitemap.*`, `public/` |
| Next.js Pages Router | `next/head`, `pages/_document`, `pages/_app` | `getServerSideProps` and `getStaticProps` render on the server; otherwise check for browser-only data | `public/`, `next-sitemap` |
| React with Vite or CRA | `index.html`, `react-helmet(-async)` | Browser only unless prerendered | `public/` |
| Vue or Nuxt | `useHead`, `useSeoMeta`, `nuxt.config` `app.head` | Nuxt renders on the server by default; plain Vue is browser only | `public/`, `@nuxtjs/sitemap` |
| Angular | `Title` and `Meta` services, `index.html` | Browser only unless SSR or prerendering is configured | `src/`, `public/`, `angular.json` assets |
| SvelteKit | `<svelte:head>` in `+page.svelte`, `+layout.svelte` | Server by default; check `ssr = false` | `static/`, `+server` routes |
| Astro | Frontmatter and `<head>` in layouts | Static by default; `client:only` needs checking | `public/`, `@astrojs/sitemap` |
| Remix or React Router | `meta` exports on route modules | Server in framework mode; browser only in SPA mode | `public/`, resource routes |
| Gatsby, Eleventy, Hugo, Jekyll | Head partials and layout templates | Static | `static/`, `public/`, plugin config |
| WordPress, Drupal, Shopify, Webflow, Wix | Theme templates or the CMS | Server | Often outside the repository, so report Can't tell |
