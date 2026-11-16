#!/usr/bin/env node
/**
 * Records a live sandbox response into the adapter test fixtures.
 *
 *   npm run fixtures:record        (reads credentials from .env)
 *
 * Then run the tests: expectations that check specific fixture values need
 * updating to match what the sandbox returned.
 */
import { writeFile } from 'node:fs/promises';

const env = process.env;
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const outbound = inDays(60);

async function save(path, res) {
  const text = await res.text();
  if (!res.ok) {
    console.error(`  x HTTP ${res.status}: ${text.slice(0, 300)}`);
    process.exitCode = 1;
    return;
  }
  const json = text ? JSON.parse(text) : null;
  await writeFile(path, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ok -> ${path}`);
}

console.log('Duffel offer request');
if (!env.DUFFEL_ACCESS_TOKEN) {
  console.log('  skipped (DUFFEL_ACCESS_TOKEN not set)');
} else {
  await save(
    'apps/duffel-adapter/test/fixtures/offer-request.json',
    await fetch('https://api.duffel.com/air/offer_requests?return_offers=true', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.DUFFEL_ACCESS_TOKEN}`,
        'Duffel-Version': 'v2',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          slices: [{ origin: 'LHR', destination: 'BCN', departure_date: outbound }],
          passengers: [{ type: 'adult' }, { age: 7 }],
          cabin_class: 'economy',
          max_connections: 1,
        },
      }),
    }),
  );
}
