#!/usr/bin/env bash
# Record a cloud-fs TUI demo against RustFS as an asciinema cast, then render to GIF.
# Prerequisites: RustFS running on port 9002 (via infra/docker-compose.yml)
# Usage: bash scripts/record-demo.sh
set -euo pipefail

CAST_FILE="docs/public/images/cloud-fs-demo.cast"
GIF_FILE="docs/public/images/cloud-fs-demo.gif"

# Create a script that pipes commands with realistic timing
DEMO_SCRIPT=$(mktemp)
cat > "$DEMO_SCRIPT" << 'DEMO'
#!/usr/bin/env bash
# Simulates interactive TUI usage for the recording.

export TERM=xterm-256color
export COLUMNS=90
export LINES=24
export AWS_ACCESS_KEY_ID=rustfsadmin
export AWS_SECRET_ACCESS_KEY=rustfsadmin

FIFO=$(mktemp -u)
mkfifo "$FIFO"

bun src/cli-tui.ts s3 s3://demo-bucket --endpoint http://localhost:9002 --seed-demo < "$FIFO" &
TUI_PID=$!

exec 3>"$FIFO"

sleep 1.5

# ls — show root directory
echo "ls" >&3
sleep 1.5

# cd into data
echo "cd data" >&3
sleep 1

# ls in data
echo "ls" >&3
sleep 1

# cat the csv
echo "cat users.csv" >&3
sleep 1.5

# cd back up
echo "cd .." >&3
sleep 0.8

# cat config.json and pipe to jq
echo "cat config.json | jq '.database'" >&3
sleep 2

# grep across files
echo "grep -r error logs/" >&3
sleep 1.5

# find json files
echo "find -name '*.json'" >&3
sleep 1.5

# wc on a file
echo "cat README.md | wc" >&3
sleep 1.5

# exit
echo "exit" >&3
sleep 1

exec 3>&-
rm -f "$FIFO"
wait "$TUI_PID" 2>/dev/null || true
DEMO
chmod +x "$DEMO_SCRIPT"

mkdir -p "$(dirname "$CAST_FILE")"

# Create demo bucket via mc
echo "Preparing RustFS demo bucket..."
docker run --rm --network host --entrypoint sh minio/mc:latest \
  -c "mc alias set rustfs http://localhost:9002 rustfsadmin rustfsadmin && mc mb rustfs/demo-bucket --ignore-existing" \
  2>/dev/null || true

echo "Recording demo..."
asciinema rec "$CAST_FILE" \
  --cols 90 --rows 24 \
  --overwrite \
  --command "bash $DEMO_SCRIPT"

rm -f "$DEMO_SCRIPT"

echo "Rendering GIF..."
/tmp/agg "$CAST_FILE" "$GIF_FILE" \
  --theme monokai \
  --font-size 14 \
  --cols 90 \
  --rows 24 \
  --speed 1.5

echo "Done!"
echo "  Cast: $CAST_FILE"
echo "  GIF:  $GIF_FILE"
ls -lh "$GIF_FILE"
