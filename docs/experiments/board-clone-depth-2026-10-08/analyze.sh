#!/usr/bin/env bash
# analyze.sh <root>: one TSV row per board row, shallow -> full, plus gate and A2 history notes.
# PUBLISHED_REPORTS: directory of the board's published <row>.json reports.
# FULL_HISTORY_ROW: the one row the board publishes from full history; its gate compares the full arm.
root="$1"; PUB="${PUBLISHED_REPORTS:?set PUBLISHED_REPORTS}"; FULL_ROW="${FULL_HISTORY_ROW:-}"
proj='[.overallScore,.codeTrustScore,.processTrustScore,.verdict,[.criteria[]|{id,score,status,metrics:[.metrics[]?|{name,value,max}]}]]'
printf 'row\tcommits S/F\tgate\tB2 ratio S->F\tB2 S->F\tprocess S->F\tcode S->F\toverall S->F\tverdict S->F\tA2 S->F\tA2 history pass S/F\tA2 history findings S/F\tother criteria changed\n'
for d in "$root"/out/*/; do
  n=$(basename "$d"); s="$d/shallow/report.json"; f="$d/full/report.json"
  [ -s "$s" ] && [ -s "$f" ] || { printf '%s\tMISSING REPORT\n' "$n"; continue; }
  cs=$(sed -n 's/^commits=//p' "$d/shallow/meta.txt"); cf=$(sed -n 's/^commits=//p' "$d/full/meta.txt")
  # reproduction gate: depth-1 arm vs published, except the row published from full history: full arm vs published
  ref="$s"; [ "$n" = "$FULL_ROW" ] && ref="$f"
  if diff <(jq -c "$proj" "$PUB/$n.json") <(jq -c "$proj" "$ref") >/dev/null; then gate=PASS; else gate=FAIL; fi
  [ "$n" = "$FULL_ROW" ] && gate="$gate(full=pub)"
  b2r() { jq -r '[.criteria[]|select(.id=="B2")|.metrics[]?|select(.name=="pr_merge_ratio")|"\(.value)/\(.max)"][0] // "-"' "$1"; }
  crit() { jq -r --arg id "$2" '[.criteria[]|select(.id==$id)|"\(.score) \(.status)"][0] // "-"' "$1"; }
  top() { jq -r --arg k "$2" '.[$k]|tostring' "$1"; }
  # history pass skipped under v17 when the current tree already yields a committed-secret finding
  hp() { if jq -e '[.criteria[]|select(.id=="A2")|.findings[]?|.evidence.label|select(test("^Committed secret-shaped value"))]|length>0' "$1" >/dev/null; then echo skipped; elif jq -e '[.criteria[]|select(.id=="A2" and .status!="not_applicable")]|length>0' "$1" >/dev/null; then echo ran; else echo "n/a(A2 not applicable)"; fi; }
  hf() { jq -r '[.criteria[]|select(.id=="A2")|.findings[]?|((.summary // "") + " " + (.evidence.label // ""))|select(test("git history|history secret scan";"i"))|if test("coverage bound|safety valve";"i") then "BOUND" elif test("\\.env";"i") then "env" else "secret" end] | if length==0 then "0" else join("+") end' "$1"; }
  other=$(jq -n -r --slurpfile a "$s" --slurpfile b "$f" '[$a[0].criteria[] as $x | $b[0].criteria[] | select(.id==$x.id and .id!="A2" and .id!="B2") | select((.score!=$x.score) or (.status!=$x.status) or ([.metrics[]?|{name,value,max}] != [$x.metrics[]?|{name,value,max}])) | .id] | join(",")')
  printf '%s\t%s/%s\t%s\t%s -> %s\t%s -> %s\t%s -> %s\t%s -> %s\t%s -> %s\t%s -> %s\t%s -> %s\t%s/%s\t%s/%s\t%s\n' \
    "$n" "$cs" "$cf" "$gate" "$(b2r "$s")" "$(b2r "$f")" "$(crit "$s" B2)" "$(crit "$f" B2)" \
    "$(top "$s" processTrustScore)" "$(top "$f" processTrustScore)" "$(top "$s" codeTrustScore)" "$(top "$f" codeTrustScore)" \
    "$(top "$s" overallScore)" "$(top "$f" overallScore)" "$(top "$s" verdict)" "$(top "$f" verdict)" \
    "$(crit "$s" A2)" "$(crit "$f" A2)" "$(hp "$s")" "$(hp "$f")" "$(hf "$s")" "$(hf "$f")" "${other:-none}"
done
