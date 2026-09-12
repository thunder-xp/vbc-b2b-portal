#!/usr/bin/env sh
set -eu

curl --fail-with-body --silent --show-error \
  --connect-timeout 2 \
  --max-time 5 \
  http://127.0.0.1:8091/health
printf '\n'
