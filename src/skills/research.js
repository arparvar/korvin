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

// --- Advanced scraper helpers (KORVIN_ADVANCED_SCRAPER=1 only) ---

function fetchRaw(url, timeoutMs, extraHeaders) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: Object.assign({ 'User-Agent': 'Korvin/1.0' }, extraHeaders || {}),
      timeout: timeoutMs
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function isAllowedByRobots(targetUrl) {
  try {
    const { origin } = new URL(targetUrl);
    const { status, body } = await fetchRaw(`${origin}/robots.txt`, 3000);
    if (status !== 200) return true;
    let inStar = false;
    for (const raw of body.split('\n')) {
      const line = raw.trim();
      if (/^user-agent:\s*\*/i.test(line)) { inStar = true; continue; }
      if (/^user-agent:/i.test(line)) { inStar = false; continue; }
      if (inStar && /^disallow:/i.test(line)) {
        const path = line.replace(/^disallow:\s*/i, '');
        if (path && new URL(targetUrl).pathname.startsWith(path)) return false;
      }
    }
    return true;
  } catch { return true; }
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

async function scrapeUrl(url) {
  const { body } = await fetchRaw(url, 10000, { 'Accept': 'text/html' });
  try {
    const cheerio = require('cheerio');
    const $ = cheerio.load(body);
    return $('p, article, main, h1, h2, h3').map((_, el) => $(el).text()).get().join(' ').replace(/\s+/g, ' ').trim();
  } catch { return stripHtml(body); }
}

async function fetchWithConcurrency(urls) {
  const os = require('os');
  const limit = os.freemem() < 419430400 ? 1 : 3;
  const results = [];
  for (let i = 0; i < urls.length; i += limit) {
    const batch = urls.slice(i, i + limit).map(u => scrapeUrl(u).catch(() => ''));
    results.push(...await Promise.all(batch));
  }
  return results.join('\n');
}

// --- Main export ---

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

  if (process.env.KORVIN_ADVANCED_SCRAPER === '1') {
    const { body } = await fetchRaw(url, 15000, { 'User-Agent': 'Mozilla/5.0 (compatible; Korvin/1.0)', 'Accept': 'text/html' });
    const linkRe = /href="(https?:\/\/[^"]+)"/g;
    const seen = new Set();
    const candidates = [];
    let m;
    while ((m = linkRe.exec(body)) !== null && candidates.length < 6) {
      const u = m[1];
      if (!seen.has(u)) { seen.add(u); candidates.push(u); }
    }
    const allowed = (await Promise.all(candidates.map(async u => (await isAllowedByRobots(u)) ? u : null))).filter(Boolean);
    const scraped = allowed.length ? await fetchWithConcurrency(allowed) : stripHtml(body);
    return sanitize(scraped.substring(0, 3000));
  }

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
