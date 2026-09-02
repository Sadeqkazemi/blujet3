#!/bin/sh
set -eu

compose_file="${1:-docker-compose.prod.yml}"

check_service() {
  service="$1"
  health_url="$2"
  expected_service="$3"
  docker compose -f "$compose_file" exec -T "$service" node -e '
    const [url, expectedService] = process.argv.slice(1);
    const expectedCommit = process.env.GIT_COMMIT_SHA;
    if (!expectedCommit || !/^[0-9a-f]{40}$/.test(expectedCommit)) {
      throw new Error("container has no exact deployed commit");
    }
    fetch(url)
      .then(async (response) => {
        const body = await response.json();
        const actualCommit = body.commit ?? body.info?.build?.commit;
        if (!response.ok || body.service !== expectedService) {
          throw new Error(`unexpected ${expectedService} health response`);
        }
        if (actualCommit !== expectedCommit) {
          throw new Error(`${expectedService} commit mismatch`);
        }
      })
      .catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exit(1);
      });
  ' "$health_url" "$expected_service"
}

check_service backend http://localhost:3000/health blujet-backend
check_service pss-service http://localhost:3100/health blujet-pss

echo "Service health and deploy identity verified"
