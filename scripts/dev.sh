#!/usr/bin/env bash
# Alias — starts the full local stack (see start-local.sh).
exec "$(cd "$(dirname "$0")" && pwd)/start-local.sh" "$@"
