export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname.startsWith('/guides')) {
    setResponseHeader(event, 'X-Robots-Tag', 'noindex');
  }
});
