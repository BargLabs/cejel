# Session archive census — 2026-08-01

Status: scope correction complete; corpus ingestion has not started

Snapshot time: `2026-08-01T17:18:11.396Z`

## Result first

The enumerated archive roots contain **8,564 JSONL paths (23.25 GB gross across all file
types)**. Filename-visible identity collapses those paths to a provisional population of:

- **2,599 Codex session IDs**;
- **833 Claude Code session IDs**; and
- **110 Cowork transcript IDs**, alongside **101 `local_<UUID>` Cowork workspace IDs**.

The provider-total filename census therefore remains **3,542 visible transcript IDs**. The six
previously uncovered home-level directories contribute **zero** transcript identities: this scope
correction changes the provisional population by **+0**. Provider parsing may still merge or reject
IDs and subagent traces remain present, so 3,542 is provisional rather than a recall denominator.

Content identity confirms that the migrated stores are predominantly, but not wholly, mirrors.
Ignoring directory and machine labels, **2,426 family-scoped scrubbed content hashes occur in more
than one root**: 1,941 Codex, 452 Claude Code, and 33 Cowork hashes. Of 2,718 distinct identities in
the migration roots, 2,425 have an exact scrubbed-content match in a live/base root, seven have only
an earlier clean prefix under the same base ID, and 286 exist only in migration roots. Those 286
identities were already included in the original 3,542 union; they are not newly discovered by this
correction.

The reachability-scoped machine finding is: **no Mac mini archive is reachable from this host**.
`/Volumes/Macintosh HD` is the only mounted volume. An archive on another machine or an unattached
drive is outside this census and may still exist.

This is broader than repository history. It includes Codex, Claude Code, Cowork, shell-recovery
metadata, and secondary document exports. Later defect qualification remains repository-anchored:
non-code sessions can aid discovery, but only a resolvable fix commit that passes the independent
mechanical replay bar can become a recall seed.

## Metadata census and scrub-first overlap method

The census scanner inspects directory entries, filenames, byte sizes, modification times, and
filename-visible UUIDs. It does **not** open, read, or hash transcript or shell-history bodies. The
generated JSON is written mode `0600` to `/tmp/session-archive-census.json` and contains aggregate
metadata, not path lists.

A separate one-off overlap pass read only filename-identified transcript JSONL files whose
filesystem birth time was at or before the frozen snapshot boundary. It routed shell leaves through
Alfred's `classifyCommand`, routed non-shell leaves through `redactText(raw, 64_000)`, dropped and
counted oversized leaves, normalized operator home and machine labels, canonicalized the scrubbed
event maps, and hashed only that canonical scrubbed stream. It used Alfred redactor commit
`76abe1a45752dd1e59a7e1390bf75b40a0985603`. No raw transcript body was hashed or persisted; no
shell history or denied-path file was read or hashed. The pass dropped 16,771 oversized leaves and
recorded only category/count telemetry.

This supersedes the raw-body hashing method for future ingestion. The existing 2026-08-01 trace
experiment's raw SHA-256 manifest remains historical evidence for that completed experiment, but
must not be reused as the ingestion boundary for the expanded census. Content hashing and
content-based deduplication may occur only after an in-memory scrubber has removed credential and
sensitive-history material.

## Enforced denied root

`~/Library/Caches/claude-cli-nodejs/**` is denied in `scripts/session-archive-census.mjs`. These are
MCP connector caches, not agent transcripts, and their Gmail/database/tool results may contain
third-party content. The decision is path-based: the scanner never opens a file below that root.
`scripts/session-archive-census.node-test.mjs` asserts both the real cache-path shape and that the
metadata walker skips a denied subtree instead of reading its file.

At validation time the denied tree contained **69,461 files**, all with `.jsonl` names, in **3,880
directories**, totalling **64,293,011 bytes**. These are excluded files, not corpus candidates. The
counts come from directory traversal and `lstat` metadata only.

## Enumerated transcript roots

| Family | Source | JSONL paths | Visible transcript IDs | Provisional Cowork workspaces | Gross bytes |
|---|---|---:|---:|---:|---:|
| Codex | active | 741 | 741 | — | 785,640,438 |
| Codex | archived | 1,805 | 1,805 | — | 10,601,753,888 |
| Codex | Air migration | 1,035 | 1,035 | — | 2,297,006,821 |
| Codex | MacBook active migration | 812 | 812 | — | 266,992,006 |
| Codex | MacBook archived migration | 1,133 | 1,133 | — | 4,285,690,600 |
| Claude Code | live | 918 | 600 | — | 572,741,718 |
| Claude Code | MacBook migration | 1,001 | 685 | — | 634,733,825 |
| Cowork | live | 643 | 110 | 101 | 2,653,731,913 |
| Cowork | partial migration `141248` | 114 | 28 | 88 | 437,590,845 |
| Cowork | partial migration `142030` | 0 | 0 | 0 | 0 |
| Cowork | Alfred archive | 181 | 7 | 7 | 355,006,533 |
| Cowork | MacBook migration | 181 | 7 | 7 | 355,077,191 |
| **Total paths** | — | **8,564** | — | — | **23,246,107,541** |

Gross Cowork file counts are intentionally omitted from the session denominator: those roots also
contain source snapshots, outputs, images, and tool artifacts. `local_<UUID>` directories are only
provisional workspace units, not proven user sessions.

## Content-hash overlap

Identity buckets below are mutually exclusive and use session ID **or** scrubbed canonical hash
before deciding that a migration identity is additive to its family base. Root names identify where
the bytes were reachable; they are not part of the hash input.

### Codex

The five roots contain 5,526 session-ID participations, 2,599 distinct IDs, and 2,608 distinct
scrubbed hashes. The migration roots contain 1,998 IDs: 1,941 have an exact base-store hash, four
reuse a base ID with different content, and 53 occur in neither base IDs nor base hashes. Pairwise
hash overlap is not mutually exclusive:

| Root pair | Shared scrubbed hashes |
|---|---:|
| current archived ↔ MacBook archived | 1,133 |
| Air ↔ current archived | 793 |
| Air ↔ MacBook archived | 672 |
| current archived ↔ MacBook active | 431 |
| current active ↔ MacBook active | 377 |
| Air ↔ MacBook active | 305 |
| current active ↔ Air | 184 |

### Claude Code

The live and migration roots contain 1,285 session-ID participations, 833 distinct IDs, and 833
distinct scrubbed hashes. The migration root contains 685 IDs: 452 have an exact live-store hash
and 233 occur in neither live IDs nor live hashes. Thus the migration is majority mirror by content
but contains a material additive subset that the 3,542 union already counted. The live project-key
directory names comprise 340 `/Users/bargs/...` keys, nine `/Users/houman/...` legacy keys, 14
`/private/...` keys, and three other keys; those labels do not determine content identity.

### Cowork

The roots expose 110 distinct transcript IDs and 115 distinct scrubbed hashes. The migration roots
contain 35 IDs: 32 have an exact live-store hash, three reuse a live ID with different content, and
none is additive by both ID and hash. Thirty-three scrubbed hashes occur in more than one root.
Separately, the roots expose 101 distinct `local_<UUID>` workspaces; workspace IDs remain a
structurally different identity signal and are not conflated with transcript IDs.

### Same-ID content variants

All seven identities in the mutually exclusive same-ID/different-hash bucket are **partial sync
snapshots**, not divergent edits. In every case the shorter scrubbed event sequence is an exact
line-for-line prefix of the longer sequence, the shorter file has the earlier modification time,
and both files end on complete valid JSON records. There is no evidence of a corrupt mid-record
truncation. Session-ID deduplication is therefore correct and the 3,542 population does not change.

| Family | Transcript ID | Earlier copy → later copy (scrubbed event lines) | Finding |
|---|---|---:|---|
| Codex | `019ee3f1-0faa-7f13-b679-90ea9a88be90` | 1,574 → 1,675 | MacBook active copy is a clean earlier prefix |
| Codex | `019f33cc-c477-7660-b3f3-242540e27611` | 11,723 → 15,546 | MacBook active copy is a clean earlier prefix |
| Codex | `019f33af-a75b-74c1-ab06-fe5823d1b25c` | 10,128 → 14,218 | MacBook active copy is a clean earlier prefix |
| Codex | `019ebf4f-03cf-7501-bbc8-b265d8a3fdb1` | 209 → 274 | MacBook active copy is a clean earlier prefix |
| Cowork | `ac336392-da5b-4f68-abf1-ce796161ec2f` | 7,098 → 8,596 | both archive copies are the same clean earlier prefix of live |
| Cowork | `edf47778-d31d-4eab-ada7-e3b0637f44aa` | 23,918 / 23,929 → 26,944 | two successive archive snapshots are clean prefixes of live |
| Cowork | `0cd010c8-ee13-4fc2-81da-1282a4dde5f2` | 33,493 / 33,508 → 38,335 | two successive archive snapshots are clean prefixes of live |

Five additional Codex IDs have a shorter Air prefix **and** an exact full MacBook-archived copy, so
they remain in the exact-match identity bucket: `019eb434-08ff-7172-a01a-8cb981e67ded` (936/946
lines), `019eaf08-b742-7ee1-9de3-ca573fe281f3` (41,636/44,812),
`019ea388-291b-7613-ab2f-dbd4ac7e4902` (49,319/50,163),
`019ea021-b9e4-7d30-8ad8-b24d3f3ec5a5` (227/237), and
`019e8b6f-7974-70f2-b6c6-1f669e68b78d` (87,621/93,260). This is why “seven” is the mutually
exclusive no-exact-copy bucket, not the total number of roots containing an earlier prefix.

## Six previously uncovered home directories

None was in the original census roots. Archive member names were inspected where necessary, but
no transcript body was opened merely to classify a path. The content-hash input rule requires a
provider-shaped JSONL file with a visible non-subagent transcript UUID; none of the six directories
produced a candidate, so each contributes zero hashes and zero additive IDs.

| Directory | Metadata/member-name classification | Hash/additivity result |
|---|---|---:|
| `~/backups` | 2 files; one small Alfred/Maeve untracked-files tarball; no JSONL members | no candidate; +0 |
| `~/reps` | 6,842 files; an Express source/dependency checkout; no JSONL files | no candidate; +0 |
| `~/_stash-triage` | 7 Markdown/TypeScript goal and schema files; no JSONL files | no candidate; +0 |
| `~/egbert-archive-inspect` | 118 Git-object/patch files; no JSONL files | no candidate; +0 |
| `~/egbert-backup-2026-07-21` | 18 backup files; three archive-member JSONLs are Egbert trading data by path, not agent transcripts | no candidate; +0 |
| `~/alfred-stash-2026-07-27` | 27 presentation/audit files; two `.inspect.ndjson` presentation inspection outputs; no transcript UUIDs | no candidate; +0 |

## Shell recovery and secondary exports

Shell material was statted only. It was not read.

| Recovery source | Files | Bytes | Role |
|---|---:|---:|---|
| live zsh history | 1 | 160,922 | recovery metadata only |
| zsh session fragments | 5 | 5,285 | recovery metadata only |
| live Codex shell snapshots | 10 | 69,480 | recovery metadata only |
| live Claude shell snapshots | 8 | 51,406 | recovery metadata only |
| MacBook shell-history snapshot | 1 | 161,182 | recovery metadata only |
| MacBook Codex shell snapshots | 5 | 29,870 | recovery metadata only |

Secondary, non-JSONL exports also exist: 18 iCloud Claude documents, 84 Alfred session Markdown
documents, 10 Therasyn session Markdown documents, and 32 lab-session PDFs. They are outside the
structured primary parser. They may become a separately preregistered recovery channel, but prose
cannot establish red, green, or an oracle.

## What this changes

The earlier session experiment reported 3,517 provider/session IDs. This census finds 3,542
provisional IDs across the frozen roots. Because the identity methods differ, the 25-record
difference is **not** a claim of 25 new sessions. The scope correction in this document adds **zero**
to 3,542. A live rerun later on 2026-08-01 saw 18 post-snapshot Codex IDs; those are new activity
after the frozen boundary, not archive discoveries, and are not folded into this result.

Those 18 IDs are durably recorded in
`docs/experiments/session-archive-census-post-snapshot-ids-2026-08-01.json`, with the frozen cutoff,
capture time, source, and filesystem birth time. The scanner now emits the frozen 3,542 population
separately from post-snapshot IDs, and its test asserts both the ledger's 18 unique entries and that
the live filesystem still re-derives 3,542 IDs at the frozen boundary. Later activity can increase
the live count without silently changing this result.

Content hashing also narrows the earlier mirror statement. Most migration identities have exact
base-store content, but 53 Codex and 233 Claude Code IDs exist only in migration roots. They were
already present in the 3,542 union. The machine labels attached to those roots provide no evidence
about which physical Mac produced them and are not used in the conclusion.

The next recall gain must therefore come from one or more of:

1. a scrub-first parser that recovers event shapes the earlier Codex and Cowork parsers missed;
2. new sessions created after the previous frozen boundary;
3. a Mac mini store reachable only from another machine or an unattached drive; or
4. a separately preregistered recovery channel for non-JSONL exports.

It must not come from counting machine copies as independent sessions or accepting transcript prose
as an oracle.

## Existing-redactor reuse assessment

The required first choice is **reuse**, not a second credential-pattern implementation. Alfred's
`packages/operator-trace/src/redactor.ts` at
`5a8e496c33e783b2271827e78096e5f515f656a0` already provides:

- `classifyCommand(raw)` for shell payloads, with fail-closed command-head classification;
- `redactText(raw, maxLength)` for free text from non-shell sources;
- whole-payload replacement on a secret match rather than partial masking; and
- fail-closed rejection of unclassified high-entropy text.

Its targeted `guard1-fail-closed-redaction.test.ts` suite passes **8/8**, including the static
classification-before-write guard and the free-text cases. The transcript parser should import a
shared/pinned form of this module; it must not copy the patterns into a Cejel-local scrubber that can
drift independently.

`redactText` is reusable at the **parsed text-leaf** boundary, but it is not by itself a transcript-
body ingester:

1. it is not recursive or event-aware; applying it to a complete JSONL record would flatten
   whitespace, truncate at the default 240 characters, and destroy tool/result structure;
2. it returns a replacement string but no redaction category/count ledger;
3. shell commands need `classifyCommand`, whose command-head allowlist is stricter than
   `redactText` and is part of the fail-closed guarantee;
4. transcript event maps need explicit handling for nested environment values, generic embedded-
   credential URLs, workflow secret expressions, and complete private-key bodies before a safe leaf
   can be retained; and
5. a secret in one leaf should drop that leaf while preserving non-sensitive event metadata such as
   provider, session ID, timestamp, exit status, and event type. Whole-record replacement would make
   the structural funnel unusable.

The required addition is therefore a thin structured adapter around the existing redactor: parse
provider JSON, allowlist retained structural fields, route shell text through `classifyCommand`,
route non-shell text leaves through `redactText`, and emit category/count telemetry without raw
values. That adapter is format handling, not a competing scrubber.

### Corpus text-length contract

Corpus ingestion must **never** inherit `redactText`'s 240-character default. That default is for
display-sized log lines and summaries; applying it here could silently remove a retraction or
qualifier at the end of an otherwise usable claim. The adapter must define
`CORPUS_TEXT_MAX_LENGTH = 64_000`, reject a raw non-shell text leaf longer than that limit before
calling the redactor, record the rejection as `oversize` telemetry without the raw value, and call
`redactText(raw, CORPUS_TEXT_MAX_LENGTH)` for retained leaves. This precheck guarantees that the
redactor cannot produce an ellipsis on the corpus path. The 240-character default remains valid
only for a later display projection derived from the scrubbed corpus.

Adapter tests must prove that a retraction qualifier beyond character 240 survives unchanged, that
a 64,001-character leaf is dropped and counted rather than truncated, and that no corpus-ingestion
call site invokes `redactText` without an explicit maximum. This makes length loss auditable before
any transcript body is read.

## Next gate

Before any transcript content is retained as corpus material:

1. expose the Alfred redactor through a shared/pinned import and implement the structured adapter
   above, including the explicit corpus text-length contract, without duplicating its credential-
   pattern engine;
2. add transcript-format tests for nested environment maps, embedded-authentication URLs, workflow
   secret expressions, private-key bodies, and per-leaf fail-closed retention;
3. emit only redaction categories/counts plus scrubbed normalized events;
4. hash the scrubbed canonical event stream, never the raw transcript;
5. deduplicate by provider/session ID and scrubbed canonical hash before funnel counts; and
6. preregister parser coverage and a yield prediction before examining candidate identities.

Reproduce the metadata census with:

```sh
node scripts/session-archive-census.mjs /tmp/session-archive-census.json
```
