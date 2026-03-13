#!/usr/bin/env bash
# Receives a print job from the print server on standard input, checks it,
# and starts printing in the background so the website gets an answer right away.
set -euo pipefail

dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python="$dir/brailink-venv/bin/python"
[ -x "$python" ] || python=python3

job="$(mktemp "${TMPDIR:-/tmp}/brailink-job.XXXXXX")"
cat > "$job"

# Errors here (bad job, printer busy) go back to the website.
if ! "$python" "$dir/completetest.py" --check "$job"; then
  rm -f "$job"
  exit 1
fi

# Detach completely so the SSH session can close while printing continues.
nohup "$python" "$dir/completetest.py" "$job" >> "$dir/brailink-print.log" 2>&1 < /dev/null &
echo "Printing started"
