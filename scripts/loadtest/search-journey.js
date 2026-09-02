import http from 'k6/http';
import { check, sleep } from 'k6';

// Phase 2 (traffic) load test — read-only golden path: health check,
// airport list, flight search. Deliberately does NOT create bookings by
// default (that would consume real seed inventory on whatever server this
// runs against) — see the BOOK_FLOW block below to opt into that.
//
// Usage against the deployed server:
//   k6 run -e BASE_URL=http://SERVER_IP scripts/loadtest/search-journey.js
//
// Ramps to TARGET_VUS concurrent virtual users over RAMP_SECONDS, holds for
// HOLD_SECONDS, then ramps down — adjust via -e to match what you're
// actually trying to validate (e.g. "can we handle ~10k requests/hour").
const BASE_URL = __ENV.BASE_URL || 'http://localhost';
const ORIGIN = __ENV.ORIGIN || 'THR';
const DEST = __ENV.DEST || 'DXB';
// Search date defaults to 10 days out — override with -e SEARCH_DATE=YYYY-MM-DD
// to match a date that actually has seeded/real flights on the target server.
const SEARCH_DATE =
  __ENV.SEARCH_DATE ||
  new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const TARGET_VUS = Number(__ENV.TARGET_VUS || 50);
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 30);
const HOLD_SECONDS = Number(__ENV.HOLD_SECONDS || 120);

export const options = {
  stages: [
    { duration: `${RAMP_SECONDS}s`, target: TARGET_VUS },
    { duration: `${HOLD_SECONDS}s`, target: TARGET_VUS },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // CLAUDE.md doesn't set an SLO explicitly; these are a starting point —
    // tighten once you have a real baseline from a first run.
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const health = http.get(`${BASE_URL}/health`);
  check(health, { 'health is 200': (r) => r.status === 200 });

  const airports = http.get(`${BASE_URL}/search/airports`);
  check(airports, { 'airports is 200': (r) => r.status === 200 });

  const search = http.get(
    `${BASE_URL}/search/flights?origin=${ORIGIN}&dest=${DEST}&date=${SEARCH_DATE}`,
  );
  check(search, {
    'search is 200': (r) => r.status === 200,
    'search returns an envelope': (r) => {
      try {
        return JSON.parse(r.body).success === true;
      } catch {
        return false;
      }
    },
  });

  sleep(1);
}
