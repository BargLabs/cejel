#!/bin/sh
# Regenerates the 24 synthetic coverage-shape fixtures used by
# docs/v22-v17-coverage-move-measurement-2026-09-08.md. Every value is
# synthetic/obviously-fake; no cohort repository name, owner, URL, path, or
# content appears anywhere here.
#
# Usage: ./generate-fixtures.sh <outputDir>
set -e
FX="${1:?usage: generate-fixtures.sh <outputDir>}"
mkdir -p "$FX"

mk() { mkdir -p "$FX/$1"; }
pkg() { printf '%s' "$2" > "$FX/$1/package.json"; }

# --- A: package-script command shapes (coverageCommandEvaluation family) ---

mk A1_direct_nyc
pkg A1_direct_nyc '{"name":"fixture-a1","version":"0.0.0","scripts":{"test":"nyc mocha"}}'

mk A2_flag_jest_on
pkg A2_flag_jest_on '{"name":"fixture-a2","version":"0.0.0","scripts":{"test":"jest --coverage"}}'

mk A3_flag_jest_negated
pkg A3_flag_jest_negated '{"name":"fixture-a3","version":"0.0.0","scripts":{"test":"jest --no-coverage"}}'

mk A4_flag_eq_false
pkg A4_flag_eq_false '{"name":"fixture-a4","version":"0.0.0","scripts":{"test":"vitest run --coverage=false"}}'

mk A5_flag_conflict
pkg A5_flag_conflict '{"name":"fixture-a5","version":"0.0.0","scripts":{"test":"jest --coverage --no-coverage"}}'

mk A6_runner_no_flag
pkg A6_runner_no_flag '{"name":"fixture-a6","version":"0.0.0","scripts":{"test":"jest"}}'

mk A7_unclear_flag_heuristic
pkg A7_unclear_flag_heuristic '{"name":"fixture-a7","version":"0.0.0","scripts":{"test":"my-test-runner --coverage"}}'

mk A8_dynamic_unresolved
pkg A8_dynamic_unresolved '{"name":"fixture-a8","version":"0.0.0","scripts":{"test":"pnpm run $TARGET","cov":"jest --coverage"}}'

mk A9_wrapper_reachable/scripts
pkg A9_wrapper_reachable '{"name":"fixture-a9","version":"0.0.0","scripts":{"test":"./scripts/run-tests.sh"}}'
printf '#!/bin/sh\nset -e\njest --coverage\n' > "$FX/A9_wrapper_reachable/scripts/run-tests.sh"

mk A10_ci_direct/.github/workflows
pkg A10_ci_direct '{"name":"fixture-a10","version":"0.0.0","scripts":{"test":"echo noop"}}'
cat > "$FX/A10_ci_direct/.github/workflows/ci.yml" <<'EOF'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: jest --coverage
EOF

mk A11_pytest_cov
pkg A11_pytest_cov '{"name":"fixture-a11","version":"0.0.0","scripts":{"test":"pytest --cov"}}'

mk A12_node_experimental_coverage
pkg A12_node_experimental_coverage '{"name":"fixture-a12","version":"0.0.0","scripts":{"test":"node --test --experimental-test-coverage"}}'

# --- B: config-file coverage keys ---

mk B1_vitest_object_true
pkg B1_vitest_object_true '{"name":"fixture-b1","version":"0.0.0","scripts":{"test":"vitest run"}}'
cat > "$FX/B1_vitest_object_true/vitest.config.js" <<'EOF'
export default {
  test: {
    coverage: { provider: 'v8', reporter: ['text'] },
  },
};
EOF

mk B2_vitest_false
pkg B2_vitest_false '{"name":"fixture-b2","version":"0.0.0","scripts":{"test":"vitest run"}}'
cat > "$FX/B2_vitest_false/vitest.config.js" <<'EOF'
export default {
  test: {
    coverage: false,
  },
};
EOF

mk B3_jest_collectCoverage_true
pkg B3_jest_collectCoverage_true '{"name":"fixture-b3","version":"0.0.0","scripts":{"test":"jest"}}'
cat > "$FX/B3_jest_collectCoverage_true/jest.config.js" <<'EOF'
module.exports = {
  collectCoverage: true,
};
EOF

mk B4_jest_collectCoverage_false
pkg B4_jest_collectCoverage_false '{"name":"fixture-b4","version":"0.0.0","scripts":{"test":"jest"}}'
cat > "$FX/B4_jest_collectCoverage_false/jest.config.js" <<'EOF'
module.exports = {
  collectCoverage: false,
};
EOF

mk B5_package_nyc_static
pkg B5_package_nyc_static '{"name":"fixture-b5","version":"0.0.0","scripts":{"test":"mocha"},"nyc":{"reporter":["text"]}}'

mk B6_nycrc_file
pkg B6_nycrc_file '{"name":"fixture-b6","version":"0.0.0","scripts":{"test":"mocha"}}'
printf '{"reporter":["text"]}\n' > "$FX/B6_nycrc_file/.nycrc"

mk B7_pyproject_toml
printf '[tool.pytest.ini_options]\naddopts = "-q"\n\n[tool.coverage.run]\nbranch = true\n' > "$FX/B7_pyproject_toml/pyproject.toml"

# --- C: recipe files (Makefile/Justfile) ---

mk C1_makefile_test_nyc
pkg C1_makefile_test_nyc '{"name":"fixture-c1","version":"0.0.0"}'
cat > "$FX/C1_makefile_test_nyc/Makefile" <<'EOF'
.PHONY: test
test:
	nyc mocha
EOF

mk C2_makefile_ci_reachable/.github/workflows
pkg C2_makefile_ci_reachable '{"name":"fixture-c2","version":"0.0.0"}'
cat > "$FX/C2_makefile_ci_reachable/Makefile" <<'EOF'
.PHONY: unit
unit:
	jest --coverage
EOF
cat > "$FX/C2_makefile_ci_reachable/.github/workflows/ci.yml" <<'EOF'
name: ci
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: make unit
EOF

mk C3_justfile_test
pkg C3_justfile_test '{"name":"fixture-c3","version":"0.0.0"}'
cat > "$FX/C3_justfile_test/Justfile" <<'EOF'
test:
	pytest --cov
EOF

mk C4_makefile_unreachable
pkg C4_makefile_unreachable '{"name":"fixture-c4","version":"0.0.0"}'
cat > "$FX/C4_makefile_unreachable/Makefile" <<'EOF'
.PHONY: extra
extra:
	jest --coverage
EOF

# --- E: negative control ---

mk E1_no_coverage/src
pkg E1_no_coverage '{"name":"fixture-e1","version":"0.0.0","scripts":{"test":"node --test"}}'
cat > "$FX/E1_no_coverage/src/example.test.js" <<'EOF'
import test from 'node:test';
import assert from 'node:assert';

test('adds', () => {
  assert.strictEqual(1 + 1, 2);
});
EOF

echo "wrote 24 fixtures under $FX"
