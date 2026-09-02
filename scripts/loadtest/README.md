# Load testing (Phase 2 — traffic)

Run this from a **separate machine**, never from the production server
itself (the test client competing for the same CPU/network as the server
under test invalidates the numbers).

## Install k6

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

## Run

```bash
k6 run -e BASE_URL=http://SERVER_IP scripts/loadtest/search-journey.js
```

Useful overrides:

- `-e TARGET_VUS=200` — concurrent virtual users (start low, e.g. 20-50,
  and step up between runs; don't jump straight to your target number)
- `-e RAMP_SECONDS=30 -e HOLD_SECONDS=120` — ramp-up / steady-state duration
- `-e ORIGIN=THR -e DEST=DXB -e SEARCH_DATE=2026-08-01` — must match a
  route/date that actually has flights on the server you're testing
  (seed data or real data)

## Reading the results

k6 prints `http_req_duration` (p95/p99 latency) and `http_req_failed`
(error rate) at the end. The script's `thresholds` fail the run if p95
latency exceeds 800ms or the error rate exceeds 1% — treat a threshold
failure as "this VU count is past the server's comfortable capacity,"
not as a hard outage.

While a run is in progress, watch the server side too:

```bash
docker compose -f docker-compose.prod.yml stats
docker compose -f docker-compose.prod.yml logs -f backend | grep -i error
```

If `http_req_duration` degrades badly before CPU/memory looks saturated,
suspect Postgres connection-pool exhaustion or the Redis cache not being
hit (check `redis-cli -h <host> info stats | grep keyspace`) before
assuming you need more backend replicas.

## Next step after a baseline run

Once you have one clean run's numbers, scale the backend
(`docker compose -f docker-compose.prod.yml up -d --scale backend=3`,
see `docs/DEPLOY_IP.md`) and re-run the same command to see whether
throughput actually improves — scaling a service that isn't the
bottleneck won't help.
