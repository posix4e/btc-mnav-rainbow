#!/usr/bin/env node

/*
 Fetch MicroStrategy (MSTR) Class A and Class B shares outstanding from SEC EDGAR filings
 and write them to data/share_classes.json with forward-usable dates.

 Sources:
 - SEC Submissions API: https://data.sec.gov/submissions/CIK0001050446.json
 - Filing primary document HTML: parse text for "shares of Class A/B common stock outstanding"

 Usage:
   node scripts/fetch-share-classes.js
*/

const fs = require('fs');
const path = require('path');
const https = require('https');

const CIK = '0001050446';
const SUBMISSIONS_URL = `https://data.sec.gov/submissions/CIK${CIK}.json`;
const UA = process.env.SEC_USER_AGENT || 'btc-mnav-rainbow/1.0 (+https://github.com/posix4e/btc-mnav-rainbow)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function toInt(str) {
  if (!str) return null;
  const clean = String(str).replace(/[,\s]/g, '');
  const n = parseInt(clean, 10);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  console.log('🔎 Fetching SEC submissions for MSTR...');
  const sub = await fetchJson(SUBMISSIONS_URL);
  const rec = sub && sub.filings && sub.filings.recent;
  if (!rec) throw new Error('Unexpected SEC submissions schema');

  const out = [];
  const n = rec.accessionNumber.length;
  for (let i = 0; i < n; i++) {
    const form = rec.form[i];
    if (!['10-K', '10-Q', 'DEF 14A'].includes(form)) continue;
    const accession = rec.accessionNumber[i]; // e.g., "0001558370-24-002345"
    const accessionNoDashes = accession.replace(/-/g, '');
    const primary = rec.primaryDocument[i];
    const filingDate = rec.filingDate[i];
    const base = `https://www.sec.gov/Archives/edgar/data/${parseInt(CIK, 10)}/${accessionNoDashes}`;
    const docUrl = `${base}/${primary}`;

    console.log(`• ${form} ${filingDate} -> ${primary}`);
    let html;
    try {
      html = await fetchText(docUrl);
    } catch (e) {
      console.warn(`  ⚠️  Failed primary doc fetch: ${e.message}`);
      continue;
    }

    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    // Patterns for class A/B shares outstanding
    const aMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s+shares of Class\s*A\s+common stock\s+outstanding/i);
    const bMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})+)\s+shares of Class\s*B\s+common stock\s+outstanding/i);
    if (!aMatch && !bMatch) {
      // Alternate phrasing found in some filings
      const aAlt = text.match(/Class\s*A\s+common stock[^\d]*([0-9]{1,3}(?:,[0-9]{3})+)\s+shares\s+outstanding/i);
      const bAlt = text.match(/Class\s*B\s+common stock[^\d]*([0-9]{1,3}(?:,[0-9]{3})+)\s+shares\s+outstanding/i);
      if (aAlt || bAlt) {
        out.push({ date: filingDate, classAShares: toInt(aAlt && aAlt[1]), classBShares: toInt(bAlt && bAlt[1]), classBtoA: 1 });
      }
      continue;
    }
    out.push({ date: filingDate, classAShares: toInt(aMatch && aMatch[1]), classBShares: toInt(bMatch && bMatch[1]), classBtoA: 1 });
  }

  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const destDir = path.join(process.cwd(), 'data');
  const dest = path.join(destDir, 'share_classes.json');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out, null, 2));
  console.log(`✅ Wrote ${out.length} records to ${dest}`);
}

main().catch((e) => {
  console.error('❌ Failed to fetch share classes:', e);
  process.exit(1);
});

