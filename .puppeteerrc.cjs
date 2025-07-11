// .puppeteerrc.cjs
const { defineConfig } = require('puppeteer');

module.exports = defineConfig({
  // Caminho onde o Chromium será armazenado no Render
  cacheDirectory: '/opt/render/.cache/puppeteer',
});
