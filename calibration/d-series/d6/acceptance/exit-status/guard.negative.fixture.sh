run_guard() {
  return 1
}

if ! run_guard; then
  echo "integrity check failed" >&2
  exit 1
fi
echo "integrity verified"
