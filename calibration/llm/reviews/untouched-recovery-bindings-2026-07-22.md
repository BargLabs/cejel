# Untouched-cohort recovery bindings — 2026-07-22

- Incident-record byte SHA-256:
  `9447c2dcb1eeab948ac35af43eb90110bc302e219ef537f88dea47b7b75c1cdb`
- Retired untouched v1.1 manifest byte SHA-256:
  `0833da4f4ca16f73327b28ba0a3c6ba89c7031bb5c05492e0e7ccced73750e8f`
- Retired untouched v1.1 candidate byte SHA-256:
  `1d27ab86c85980e8ee516c672dc37934ee1df9b13842200ad20f2f28d826eeb3`
- Replacement v1.2 candidate byte SHA-256:
  `483e634d8f7536605bd8508e02857819fd8660702ac8b61bf1c6684323852085`
- Replacement selection-record byte SHA-256:
  `b758cbfd75f7cd9aad839d5f75882c3f86ee34c59c49ee55df25193e8b5cf848`
- Replacement selection-record canonical self-hash:
  `d81190691bff5001399dce5bcae3bf08f2a4e3926e12731b90b5d0b72cb55aa0`

The v1.1 manifests remain immutable in Git history and are not silently overwritten. Current
measurement tooling names the v1.2 candidate and manifest paths explicitly; an unversioned v1.1
untouched path is never accepted as a fallback.
