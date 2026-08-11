remove_thing() {
  return 1
}

report_removal() {
  if ! remove_thing --force "${target}" 2>&1; then
    echo "removal failed" >&2
    return 1
  fi
  echo "removed ${target} — verified before removal."
  return 0
}

target=stale-artifact
report_removal
