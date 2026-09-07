#!/usr/bin/env bash
set -euo pipefail

# Explicit, operator-driven parity sample. It never discovers or prints user
# identifiers; callers must provide the bounded UUID sample themselves.
if [[ "${LOYALTY_SHADOW_ENABLED:-}" != "true" ]]; then
  printf '%s\n' 'Loyalty shadow sampling requires LOYALTY_SHADOW_ENABLED=true.' >&2
  exit 1
fi

if (( $# < 1 || $# > 32 )); then
  printf '%s\n' 'Provide between 1 and 32 user UUIDs.' >&2
  exit 1
fi

declare -A counts=(
  [MATCH]=0
  [MISMATCH]=0
  [INCONCLUSIVE]=0
  [UNAVAILABLE]=0
)

for user_id in "$@"; do
  if [[ ! "$user_id" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$ ]]; then
    printf '%s\n' 'Every sample value must be a UUID.' >&2
    exit 1
  fi

  set +e
  report=$(npm --prefix backend run --silent loyalty:compare:shadow -- "$user_id" 2>/dev/null)
  exit_code=$?
  set -e

  status=$(printf '%s' "$report" | node -e '
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => {
      try {
        const parsed = JSON.parse(input);
        const allowed = new Set(["MATCH", "MISMATCH", "INCONCLUSIVE", "UNAVAILABLE"]);
        if (typeof parsed.status !== "string" || !allowed.has(parsed.status)) process.exitCode = 1;
        else process.stdout.write(parsed.status);
      } catch {
        process.exitCode = 1;
      }
    });
  ' 2>/dev/null || true)

  if [[ -z "$status" ]]; then
    status=UNAVAILABLE
  fi
  if [[ "$exit_code" -eq 1 ]]; then
    status=UNAVAILABLE
  fi
  counts["$status"]=$((counts["$status"] + 1))
done

printf '{"sampled":%d,"match":%d,"mismatch":%d,"inconclusive":%d,"unavailable":%d}\n' \
  "$#" "${counts[MATCH]}" "${counts[MISMATCH]}" \
  "${counts[INCONCLUSIVE]}" "${counts[UNAVAILABLE]}"

if (( counts[MISMATCH] > 0 || counts[INCONCLUSIVE] > 0 || counts[UNAVAILABLE] > 0 )); then
  exit 2
fi
