cleanup_staging_directory() {
  return 1
}

cleanup_staging_directory || true
echo "cleanup is best effort"
