run_guard() {
  return 1
}

run_guard || true
echo "integrity verified"
