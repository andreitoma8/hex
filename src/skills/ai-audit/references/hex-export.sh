#!/usr/bin/env bash
# HEX EXPORT. Turn 6 step 1 runs it, after assemble.sh. No model judgment runs in here.
#
#   hex-export.sh --dir .hex/ai-audit/runs/{stamp}
#
# reads   dir/winners.tsv   the cross-run winners assemble.sh persisted (15 columns, see there)
#         dir/run-K.md      the run files, for each finding's body (Description + Fix)
# writes  dir/hex-digest.md one block per winner, FINDINGs first — what Turn 6 publishes
#
# The digest exists so Turn 6 never re-reads run files by line number: the geometry lives in
# one place (assemble.sh's indexer) and this script copies bodies through byte for byte.
set -euo pipefail

dir=
while [ $# -gt 0 ]; do
  case "$1" in
    --dir) dir=$2; shift 2 ;;
    *) echo "hex-export.sh: unknown argument $1" >&2; exit 2 ;;
  esac
done
[ -d "$dir" ] || { echo "hex-export.sh: no such directory $dir" >&2; exit 2; }
[ -f "$dir/winners.tsv" ] || { echo "hex-export.sh: $dir/winners.tsv missing — run assemble.sh first" >&2; exit 2; }

out="$dir/hex-digest.md"
part="$out.part"
: > "$part"
say() { printf '%s\n' "$1" >> "$part"; }

N=$(ls "$dir"/run-*.md 2>/dev/null | wc -l | tr -d ' ')
stamp=$(basename "$dir")

say "# Hex digest — scan $stamp"
say ""
say "_One block per key, the winner across $N run file(s). Bodies are copied from the run files unchanged._"

nf=0; nl=0
while IFS=$'\t' read -r k key conf kind agents file pass start end bstart bend title loc lbody memtag; do
  [ -n "${key:-}" ] || continue
  # assemble.sh recorded the run file as it saw the path; resolve it inside this directory.
  run="$dir/$(basename "$file")"
  if [ "$kind" = "FINDING" ]; then nf=$((nf+1)); n=$nf; else nl=$((nl+1)); n=$nl; fi
  say ""
  say "## $kind $n"
  say ""
  say "- key: \`$key\`"
  [ "$kind" = "FINDING" ] && say "- confidence: $conf"
  [ "$agents" != "" ] && [ "$agents" != "-" ] && say "- agents: $agents"
  [ "$N" -gt 1 ] && say "- seen in: $k/$N runs"
  [ -n "${memtag:-}" ] && say "- memory: $memtag"
  say "- location: \`$loc\`"
  say "- title: $title"
  say ""
  if [ "$kind" = "FINDING" ]; then
    if [ -f "$run" ]; then
      awk -v s="$bstart" -v e="$bend" 'NR>=s && NR<=e' "$run" \
        | awk '{ lines[++n] = $0 } END {
            b=1; while (b<=n && lines[b]=="") b++
            while (n>=b && lines[n]=="") n--
            for (i=b; i<=n; i++) print lines[i] }' >> "$part"
    else
      say "**Body missing** — run file $run not found."
    fi
  else
    if [ "$lbody" = "-" ]; then say "**Body missing**"; else say "$lbody"; fi
  fi
done < "$dir/winners.tsv"

[ "$nf" = 0 ] && [ "$nl" = 0 ] && { say ""; say "_None — this scan raised no findings and no leads._"; }

mv "$part" "$out"
echo "exported $out — $nf findings, $nl leads"
