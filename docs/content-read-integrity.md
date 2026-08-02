# Content-read integrity

Cejel treats repository content it could not read as a measurement gap, not as evidence that a
rule did not match.

## Scoring decision

When a criterion attempts to read a relevant file and the filesystem refuses the read, Cejel
discards that criterion's partial evidence and publishes it as `insufficient_data`. The criterion
does not receive a pass or fail verdict. Unlike an ordinarily absent signal, however, a
read-failure abstention remains in its category's composite denominator with a conservative zero
contribution. That zero is arithmetic for the headline only, not a measured criterion result. It
enforces the invariant that losing readable evidence can never improve a certificate. If every
free-core criterion is unmeasured, the existing whole-report insufficient-evidence abstention
applies.

Expected filesystem failures are caught at the individual read boundary and classified by errno.
Unexpected non-filesystem exceptions are rethrown, so the guard cannot hide detector bugs.

This changes neither a rubric criterion nor a threshold. It defines what happens when the evidence
needed to apply the existing rubric was unavailable.

## Certificate disclosure

Every generated report carries `contentReadSummary`, with a total and counts for:

- unreadable content, broken down by errno class;
- files excluded because they exceeded the bounded-walk size limit;
- files excluded from content inspection by extension;
- paths denied by the repository boundary or hard directory exclusions; and
- non-regular entries such as FIFOs, device nodes, and symlinks.

The summary also names affected criterion IDs. It never includes skipped repository paths. Paths
already emitted as ordinary certificate evidence remain governed by the existing evidence schema.

Directory-inventory exclusions do not automatically invalidate every criterion. A criterion
abstains only when its collector actually attempts a content read and receives a filesystem errno,
or the entry ceases to be a regular file at that read boundary. Size bounds, extension exclusions,
denied directories, and non-regular entries found during inventory remain visible in the counts but
do not by themselves imply that a criterion lost evidence. This keeps expected boundary exclusions
(for example `node_modules` and non-regular filesystem objects) visible without claiming they were
evidence for an unrelated criterion.

The fallback directory walk stays on the filesystem device containing the requested scan root.
Mounted filesystems are counted as denied paths rather than traversed. This makes a filesystem-root
scan finite and prevents virtual trees such as `/proc` and `/sys` from becoming repository evidence.

## Why the closure matters

The original directory walk had already been hardened while sibling content reads were left
unguarded. That is the same defect shape as paired publication guards implemented only in part:
repairing one named call site is not closure when equivalent siblings remain. The regression guard
therefore inventories the complete content-read surface and asserts the skip counts and abstention,
not merely a successful process exit.
