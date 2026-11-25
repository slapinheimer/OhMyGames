#!/bin/sh
# Pregenerate daily crosswords into data/crossword/puzzles/<game>/<date>.json.
#
#   tools/gen_crosswords.sh                    # 2026-01-01 (launch) .. today+400, all three games
#   tools/gen_crosswords.sh 2027-01-01 365     # custom start + number of days
#   GAMES="mini" tools/gen_crosswords.sh       # just one game
#
# Needs only macOS's built-in JavaScriptCore. Runs chunks in parallel.
set -e
cd "$(dirname "$0")/.."
JSC=${JSC:-/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc}
START=${1:-2026-01-01}
if [ -n "$2" ]; then
  DAYS=$2
else
  DAYS=$(python3 -c "import datetime as d;s=d.date.fromisoformat('$START');print((d.date.today()-s).days+401)")
fi
GAMES=${GAMES:-"mini midi crossword"}
CHUNKS=${CHUNKS:-8}
for g in $GAMES; do
  mkdir -p "data/crossword/puzzles/$g"
  per=$(( (DAYS + CHUNKS - 1) / CHUNKS ))
  i=0
  while [ $i -lt $CHUNKS ]; do
    off=$(( i * per ))
    if [ $off -lt "$DAYS" ]; then
      n=$per; [ $(( off + n )) -gt "$DAYS" ] && n=$(( DAYS - off ))
      s=$(python3 -c "import datetime as d;print(d.date.fromisoformat('$START')+d.timedelta(days=$off))")
      "$JSC" -m tools/gen_crosswords.mjs -- daily "$g" "$s" "$n" &
    fi
    i=$(( i + 1 ))
  done
done
wait
for g in $GAMES; do echo "$g: $(ls data/crossword/puzzles/$g | wc -l) puzzles"; done
