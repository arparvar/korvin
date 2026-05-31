const https = require('https');
const { sanitize } = require('../security/defender');

function makeSearxngRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Korvin/1.0' }, timeout: 10000
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`SearXNG status ${res.statusCode}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('error', reject);
      res.on('end', () => {
        try {
          resolve((JSON.parse(data).results || [])
            .map(({ title = '', content = '', url = '' }) => `${title}: ${content} (${url})`)
            .join('\n')
            .substring(0, 3000));
        } catch (err) { reject(err); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('SearXNG request timed out')); });
  });
}

async function researchTopic(topic) {
  const searxngUrl = process.env.KORVIN_SEARXNG_URL;
  if (searxngUrl && searxngUrl.trim()) {
    try {
      const q = encodeURIComponent(topic);
      const text = await makeSearxngRequest(`${searxngUrl}/search?q=${q}&format=json&language=en`);
      return sanitize(text);
    } catch (err) { void err; }
  }

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
