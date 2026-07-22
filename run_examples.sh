#!/bin/bash
# Run the TypeScript CLI (manga-composer) over every .manga file in
# manga-gen-python/examples and manga-gen-python/examples2, writing each PNG
# next to its source .manga (overwriting the existing .png).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_ROOT="$SCRIPT_DIR/manga-gen-python"
PASS=0
FAIL=0

for SUB in examples examples2; do
    EXAMPLES_DIR="$SRC_ROOT/$SUB"
    [ -d "$EXAMPLES_DIR" ] || continue

    for manga_file in "$EXAMPLES_DIR"/*.manga; do
        [ -e "$manga_file" ] || continue
        name="$(basename "$manga_file")"
        output="${manga_file%.manga}.png"

        printf "%-40s" "$SUB/$name"
        if npm run --silent cli -- "$manga_file" -o "$output" >/dev/null 2>&1; then
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
