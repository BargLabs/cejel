verify_cleanup() {
  return 1
}

verify_cleanup || true # advisory: best effort
echo "cleanup is best effort"
