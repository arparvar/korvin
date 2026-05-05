const https = require('https');
const { sanitize } = require('../security/defender');

async function researchTopic(topic) {
  const q = encodeURIComponent(topic);
  const url = `https://lite.duckduckgo.com/lite?q=${q}`;

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Korvin/1.0)',
        'Accept': 'text/html'
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        // Strip HTML tags and clean up whitespace
        const text = data
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#039;/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 3000);
        resolve(sanitize(text));
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Research request timed out'));
    });
  });
}

module.exports = { researchTopic };