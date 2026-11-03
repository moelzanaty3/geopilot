# Investigating frameworks the engine does not map

The engine gives T0 URL evidence and T1 hints here. You may locate the code that
probably produces an observed value; label it **agent-suggested** and put it in
insight evidence, not engine provenance.

| Framework | Where head metadata usually lives |
| --- | --- |
| Next.js Pages Router | `pages/**` with `next/head`, `_document`, `_app` |
| React + Vite SPA | `index.html`, `react-helmet(-async)`; content is client-rendered |
| Vue / Nuxt | `useHead` / `useSeoMeta`, `nuxt.config` `app.head` |
| Angular | `Title` / `Meta` services, `index.html` |
| SvelteKit | `<svelte:head>` in `+page.svelte` / `+layout.svelte` |
| Astro | frontmatter + `<head>` in layouts |
| Remix / React Router | `meta` exports on route modules |
| Gatsby / Eleventy / Hugo / Jekyll | head partials / layout templates |
| WordPress / Drupal / Shopify / Webflow / Wix | theme templates or the CMS; often not in the repository |

A URL that passes after your change shows the observed behaviour is fixed. It
does not establish which file was responsible.
