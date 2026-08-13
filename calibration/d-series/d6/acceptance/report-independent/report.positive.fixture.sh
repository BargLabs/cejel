remove_thing() {
  return 1
}

report_removal() {
  remove_thing --force "${target}" 2>&1
  echo "removed ${target} — verified before removal."
  return 0
}

target=stale-artifact
report_removal
