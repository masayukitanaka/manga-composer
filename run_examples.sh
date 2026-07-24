#!/bin/bash
# Run the TypeScript CLI (manga-composer) over every .manga file in
# examples and examples2, writing each PNG next to its source .manga
# (overwriting the existing .png). Runs directly from the project source
# via tsx — no npm install / build step required.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLI="npx --no-install tsx $SCRIPT_DIR/src/cli.ts"
PASS=0
FAIL=0

for SUB in examples examples2; do
    EXAMPLES_DIR="$SCRIPT_DIR/$SUB"
    [ -d "$EXAMPLES_DIR" ] || continue

    for manga_file in "$EXAMPLES_DIR"/*.manga; do
        [ -e "$manga_file" ] || continue
        name="$(basename "$manga_file")"
        output="${manga_file%.manga}.png"

        printf "%-40s" "$SUB/$name"
        if $CLI "$manga_file" -o "$output" >/dev/null 2>&1; then
            echo "OK"
            ((PASS++))
        else
            echo "FAIL"
            ((FAIL++))
        fi
    done
done

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ]
