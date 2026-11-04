export default defineNuxtConfig({
  ssr: false,
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      meta: [{ name: 'description', content: 'Walking routes and trail guides.' }],
    },
  },
});
