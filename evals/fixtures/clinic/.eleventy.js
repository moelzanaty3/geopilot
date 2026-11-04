module.exports = (config) => { config.addPassthroughCopy('src/robots.txt'); config.addPassthroughCopy('src/sitemap.xml'); return { dir: { input: 'src', output: '_site' } }; };
