# Session archive census — 2026-08-01

Status: initial metadata-only census; transcript ingestion has not started

Snapshot time: `2026-08-01T17:18:11.396Z`

## Result first

The enumerated archive roots contain **8,564 JSONL paths (23.25 GB gross across all file
types)**. Filename-visible identity collapses those paths to a provisional population of:

- **2,599 Codex session IDs**;
- **833 Claude Code session IDs**; and
- **110 Cowork transcript IDs**, alongside **101 `local_<UUID>` Cowork workspace IDs**.

The provider-total filename census is therefore **3,542 visible transcript IDs**, but it is not
yet a denominator. Provider parsing may merge or reject IDs, subagent traces are present, and
definitive content deduplication has not run.

The migrated stores are real but predominantly mirrors, not an additive population. Of the
visible IDs, 1,945 Codex IDs, 452 Claude Code IDs, and 35 Cowork transcript IDs occur in more than
one root. Ninety-five of the 101 Cowork workspace IDs occur in more than one root. The census did
not find a separately labelled Mac mini archive root. It did find nine live Claude project keys
encoding legacy `/Users/houman/...` paths, so some migrated history has been folded into the live
store without retaining a machine label.

This is broader than repository history. It includes Codex, Claude Code, Cowork, shell-recovery
metadata, and secondary document exports. Later defect qualification remains repository-anchored:
non-code sessions can aid discovery, but only a resolvable fix commit that passes the independent
mechanical replay bar can become a recall seed.

## Content-blind method

The census inspected directory entries, filenames, byte sizes, modification times, and filename-
visible UUIDs. It did **not** open, read, or hash transcript or shell-history bodies. The generated
JSON is written mode `0600` to `/tmp/session-archive-census.json` and contains aggregate metadata,
not path lists.

This supersedes the raw-body hashing method for future ingestion. The existing 2026-08-01 trace
experiment's raw SHA-256 manifest remains historical evidence for that completed experiment, but
must not be reused as the ingestion boundary for the expanded census. Content hashing and
content-based deduplication may occur only after an in-memory scrubber has removed credential and
sensitive-history material.

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

## Metadata-visible overlap

### Codex

The five roots contain 5,526 filename-visible session-ID participations but only 2,599 distinct
IDs. Pairwise overlap is not mutually exclusive:

| Root pair | Shared IDs |
|---|---:|
| current archived ↔ MacBook archived | 1,133 |
| Air ↔ current archived | 798 |
| Air ↔ MacBook archived | 677 |
| current archived ↔ MacBook active | 434 |
| current active ↔ MacBook active | 378 |
| Air ↔ MacBook active | 305 |
| current active ↔ Air | 184 |

### Claude Code

The live and MacBook roots contain 1,285 visible session-ID participations but 833 distinct IDs;
452 IDs occur in both roots. The live project-key directory names comprise 340 `/Users/bargs/...`
keys, nine `/Users/houman/...` legacy keys, 14 `/private/...` keys, and three other keys.

### Cowork

The live and partial roots expose 101 distinct `local_<UUID>` workspaces. All 88 workspace IDs in
the non-empty partial migration are present in the live root. All seven workspace IDs in each
Alfred/MacBook archive are present in live, and the two seven-workspace archives mirror each other.
Filename-visible transcript IDs give 110 distinct IDs; this is a second, structurally different
identity signal and must not be conflated with workspace IDs before provider parsing.

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

The earlier session experiment reported 3,517 provider/session IDs. This filename-only census finds
3,542 provisional IDs across the now-visible roots. Because the identity methods differ, the
25-record difference is **not** a claim of 25 new sessions. It does show that the Air and MacBook
migrations do not supply hundreds or thousands of additional independent sessions: most of their
IDs already occur in the live/archived roots used by the earlier parser.

The next recall gain must therefore come from one or more of:

1. a scrub-first parser that recovers event shapes the earlier Codex and Cowork parsers missed;
2. new sessions created after the previous frozen boundary;
3. a separately located Mac mini store, if one still exists outside the enumerated roots; or
4. a separately preregistered recovery channel for non-JSONL exports.

It must not come from counting machine copies as independent sessions or accepting transcript prose
as an oracle.

## Next gate

Before any transcript content is ingested:

1. implement and test an in-memory scrubber for credentials, environment assignments, embedded
   authentication URLs, shell-history lines, and common secret-bearing key shapes;
2. emit only redaction categories/counts plus scrubbed normalized events;
3. hash the scrubbed canonical event stream, never the raw transcript;
4. deduplicate by provider/session ID and scrubbed canonical hash before funnel counts; and
5. preregister parser coverage and a yield prediction before examining candidate identities.

Reproduce the metadata census with:

```sh
node scripts/session-archive-census.mjs /tmp/session-archive-census.json
```
