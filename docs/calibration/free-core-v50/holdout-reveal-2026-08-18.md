# v17 holdout reveal — 2026-08-18

**Frame status: RETIRED. Never to be reused.**

## What this is

This document is the formal, deliberate retirement-reveal of the v17/free-core-v50
calibration holdout — a single-use, 200-repository frame frozen 2026-07-24 under
`rubricVersion: witan-rubric-v17-2026-07-24` and measured in July 2026. Per the commit-then-
reveal doctrine (this frame's own retroactive first case) and the disclosure boundary
(`_studio/disclosure_boundary_2026-08-18.md`): frame membership is secret while a frame is
live, and revealed at retirement by design. Post-use secrecy over membership was never the
protection this design needed and is no longer claimed. What stays closed indefinitely,
per the same boundary, is the adjudication labels and evidence corpora — the blind-review
ground truth is not part of this or any retirement-reveal.

## Why this reveal exists now, and why it's earlier than planned

The commit-then-reveal scheme was designed for frames from v22 forward, with a published
digest at freeze time and a reveal at planned retirement. v17 predates the scheme — no
digest was published at its 2026-07-24 freeze. On 2026-08-18, a routine leak audit (see the
register's Fifth 18 August update) found that this frame's full 200-member manifest had
been committed in plaintext to three public, unprotected `origin` branches of this
repository on 2026-08-05, with no PR review on two of the three, and had been publicly
fetchable for approximately thirteen days before discovery. The exposure was accidental —
a byproduct of a private accuracy-rebind rehearsal being pushed to shared remote branches,
not an intentional disclosure — and unrelated to any design decision about when this frame
should retire.

The operator ruling the same night: preserve the three branches' content privately
(bundled off the public remote before any deletion, verified byte-for-byte, retained
alongside BargLabs/alfred PR #826's private retained-scan record of the same commit), then
delete the branches from the public repository, then formalize what was already
functionally public as a deliberate reveal rather than leave a compromised secret standing
under a claim of protection it no longer had. Deleting the branches does not unpublish
history that was fetchable for thirteen days; this document does not pretend otherwise.

## The commitment

This reveal cannot be verified against a digest published at freeze time, because none
was published in 2026-07 — the commit-then-reveal scheme did not yet exist. What can be
verified: the frame's own preregistration record
(`docs/calibration/free-core-v50/preregistration.md`) self-reports a freeze date of
2026-07-24, and the record's publication commit is GPG-signed and merged on this public
repository (PR #41, `2515814c`, merged no later than 2026-07-28) — third-party,
server-side-timestamped evidence that a sealed reference to this frame existed by that
date, weaker than a same-day published digest but not nothing.

From this reveal forward, the following digest is the authoritative commitment for this
member list, computable by anyone from the JSON block below using the repository's
standard convention (`rfc8785-sha256-v1`, defined in
`docs/calibration/hash-conventions.md`, canonicalize per
`calibration/llm/scripts/freeze-cohorts.mjs`'s `canonicalize`/`sha256Canonical`, computed
over this object with `manifest_sha256` itself excluded):

```
manifest_sha256: 8d3c9150fbebf2f8d043600149f96c4acba8bab78512fbd05f87f7eff2efa970
memberCount: 200
```

The `members` array below is ordered by plain code-unit comparison of `fullName` (JS's
default `<`/`>` on strings — NOT `localeCompare`, which is locale/ICU-dependent and would
make the digest non-reproducible across environments; this order matches Python's default
`sorted()` on the same strings). Canonicalization itself preserves array order rather than
re-sorting it, so this ordering is part of what the digest commits to — reproduce it
exactly, not just the set of entries.

## What a reader CAN do with this reveal

- Recompute `manifest_sha256` from the JSON block below and confirm it matches the value
  published here (byte-exact, algorithm named, no ambiguity about which convention applies).
- Re-run any of the 200 pinned revisions (each entry names a `fullName` and a 40-hex commit
  `revision`) through the detector and compare outputs against this frame's published
  aggregate results in `docs/calibration/free-core-v50/terminal-go.md` and `VERIFY.md`.
- Verify that results published for this frame predate this reveal and were computed
  before the 2026-08-05 exposure — the sealed-result and freeze-record digests in
  `VERIFY.md` are independent of, and unaffected by, the branch-content incident described
  above.

## What a reader CANNOT do with this reveal

- Recompute this frame's measured accuracy figures from this list alone. The adjudication
  labels — the blind-review ground truth for which findings were true/false positives —
  are not published here, are not derivable from this list, and remain withheld
  indefinitely as a separate, closed category under the disclosure boundary. Any future
  release of labels is a distinct operator decision with its own redaction review; it is
  not implied or scheduled by this reveal.

## Members (fullName + pinned commit only)

The list below is exactly what the commitment digest above covers — no other fields from
the original selection manifest (stars, size, language, selection stratum, etc.) are
published, per the disclosure boundary's "members + pinned commits ONLY" rule for
retirement-reveals.

```json
{
  "schemaVersion": 1,
  "benchmarkId": "cejel-free-core-untouched-v50-2026-07-24-wave-1",
  "hashContract": "rfc8785-sha256-v1; entry excludes entry_sha256; manifest excludes manifest_sha256",
  "memberCount": 200,
  "members": [
    {
      "fullName": "15r10nk/inline-snapshot",
      "revision": "9ec2ed9862ac263ff0506e1eaba098ef686c6f14"
    },
    {
      "fullName": "1j01/jspaint",
      "revision": "53be67ab8c47cc0d2168899e7481bc04839c4c81"
    },
    {
      "fullName": "7kms/react-illustration-series",
      "revision": "1e71a14310bcb92cd29ef98dddb45f462df4b546"
    },
    {
      "fullName": "AMAI-GmbH/AI-Expert-Roadmap",
      "revision": "a4c66c2670d9004385ed0faa4fb2a729aa6b18d4"
    },
    {
      "fullName": "AnInsomniacy/motrix-next",
      "revision": "9f5ba37bf8403f219399f5593ee7b711839fdb0f"
    },
    {
      "fullName": "Anil-matcha/awesome-openclaw",
      "revision": "120be4b88c23bf40d4f4b24f7ddd170c9a94d5e2"
    },
    {
      "fullName": "BCUninstaller/Bulk-Crap-Uninstaller",
      "revision": "f39663316ad5d593c4d160b0445841ce7eb6a35f"
    },
    {
      "fullName": "BasixKOR/awesome-activitypub",
      "revision": "b1591f93ded26168c6baf38501588fd30b96143b"
    },
    {
      "fullName": "CapSoftware/Cap",
      "revision": "5b81ee5b0e807b37a0df1cd59ff4eaf2a20aa102"
    },
    {
      "fullName": "CopyTranslator/CopyTranslator",
      "revision": "5b73e4262625cdcd0b4621d0e6d5f59ed08de4ef"
    },
    {
      "fullName": "DeepTecher/awesome-autonomous-vehicle",
      "revision": "67e1d837d0277ffbaadb28867f19e58bdb4f0ff2"
    },
    {
      "fullName": "Dokploy/dokploy",
      "revision": "73e4fdd757da90fb1fe347a92b92237e6712f98d"
    },
    {
      "fullName": "DyegoCosta/trabalhando-remoto",
      "revision": "ec904b6b9716be2d8a510a123e4eeb2df968b6ab"
    },
    {
      "fullName": "EinGuterWaran/awesome-opensource-boilerplates",
      "revision": "6003f4058c8fcd892ebcb0038ce2ab64c6a08f62"
    },
    {
      "fullName": "EutropicAI/Final2x",
      "revision": "0a8cf13bae9fa026f1ee8692735d68cca8e6dac3"
    },
    {
      "fullName": "FancyGrid/awesome-grid",
      "revision": "bfedbc9a1b11e8d92af270b8033f4bcbb93ef06e"
    },
    {
      "fullName": "FredrikNoren/ungit",
      "revision": "b1df1a168b9208766342070ebd42782036dfd18d"
    },
    {
      "fullName": "HKUDS/CLI-Anything",
      "revision": "bc536c9bebb7c3d9f7bb2736a732609139c1acdb"
    },
    {
      "fullName": "JuliaPy/PyCall.jl",
      "revision": "e5dfc313d701391d4965871c832a88fe27309ccd"
    },
    {
      "fullName": "Kenshin/simpread",
      "revision": "d6534a7d67ab606e0390ff7172360fac88af4422"
    },
    {
      "fullName": "Kilo-Org/kilocode",
      "revision": "f80ebff83b32550333da7c50c91c4755e4524d0d"
    },
    {
      "fullName": "MrS0m30n3/youtube-dl-gui",
      "revision": "c5c18e55cb7e04fb6d6d8e64024a7dbac1f6b431"
    },
    {
      "fullName": "NVIDIA/personaplex",
      "revision": "3428dfd95309a7f3c84fd93259ded0f810d1ff91"
    },
    {
      "fullName": "NanmiCoder/cc-haha",
      "revision": "27901ee3110c7007dd090af0ce28041110378a8c"
    },
    {
      "fullName": "Nek5000/Nek5000",
      "revision": "41d17942b3f4ef4e045665d30adc81a167611122"
    },
    {
      "fullName": "OctoPrint/OctoPrint",
      "revision": "6aa63dad10ae51ddd95885a2eeba76d2578c8406"
    },
    {
      "fullName": "PatrickJS/awesome-angular",
      "revision": "4f460c30fdb2f32ba37c3e4e36eca8cd9206f726"
    },
    {
      "fullName": "Piebald-AI/claude-code-system-prompts",
      "revision": "b9895f5556e962e6aec60aba7cccfc18790ace3a"
    },
    {
      "fullName": "Project-DARC/DARC",
      "revision": "482bd1acfcf3dfde617189461ea7ce90c2f924ed"
    },
    {
      "fullName": "Quick/Quick",
      "revision": "2b4547b230e94d84320724fd6df65e418b058be2"
    },
    {
      "fullName": "QuivrHQ/quivr",
      "revision": "947a785415c6c35ab2ae8157222b4720b0710b4d"
    },
    {
      "fullName": "RVC-Project/Retrieval-based-Voice-Conversion-WebUI",
      "revision": "4338f12c3c28c80b3ac015e2d0df66c41592746d"
    },
    {
      "fullName": "SWivid/F5-TTS",
      "revision": "9c614e9657089213efc6a7421b30630be138a3f5"
    },
    {
      "fullName": "SillyTavern/SillyTavern",
      "revision": "8172dcd0ee672d3cd9a5e5f7af134f91a45cd2b8"
    },
    {
      "fullName": "TanStack/table",
      "revision": "ba45ea109f559f79e44dca19409747e330be8a84"
    },
    {
      "fullName": "ThePrimeagen/vim-be-good",
      "revision": "0ae3de14eb8efc6effe7704b5e46495e91931cc5"
    },
    {
      "fullName": "VoltAgent/awesome-openclaw-skills",
      "revision": "6afb5d4e3e6f36ff181a33b3b6f88054348bc70a"
    },
    {
      "fullName": "WangRongsheng/awesome-LLM-resources",
      "revision": "d0fca3041ecca2659e81a57b01b8b94aef90136f"
    },
    {
      "fullName": "WebGoat/WebGoat",
      "revision": "5142935bf7c279882c3b0fc0ecec42c447de6fd5"
    },
    {
      "fullName": "XiaomingX/indie-hacker-tools-plus",
      "revision": "db8b986f1dbd92b9fa7c0832d8c04a4132598fc1"
    },
    {
      "fullName": "a2ui-project/a2ui",
      "revision": "fc4e91d7e95cfaeae58ac70a54f9a22a1c5ddeac"
    },
    {
      "fullName": "abhisheknaiidu/awesome-github-profile-readme",
      "revision": "7cb2691619d0b8bb3017289c699f3a0d16dc9c70"
    },
    {
      "fullName": "adobe-webplatform/Snap.svg",
      "revision": "c8e483c9694517e24b282f8f59f985629f4994ce"
    },
    {
      "fullName": "ag-ui-protocol/ag-ui",
      "revision": "1a78c2701e44afbb12337c5de6c3be832efaad74"
    },
    {
      "fullName": "akira/exq",
      "revision": "ffa446eb3992fa22dea2db3d4f7bd594f5326952"
    },
    {
      "fullName": "akveo/ngx-admin",
      "revision": "dc6a442704bfef34b776b5eb15faf852d9e2f75c"
    },
    {
      "fullName": "alibaba/lowcode-engine",
      "revision": "f6305c2284950d79b9729781f081f24f113de345"
    },
    {
      "fullName": "allenai/olmocr",
      "revision": "f7cfe4c22098b154c76b6ec950d1c0a464eecf8d"
    },
    {
      "fullName": "anilbas/3DMMasSTN",
      "revision": "c6562b5fda5c2f742a27dc1b4a7ff15ec5e83837"
    },
    {
      "fullName": "ansible-community/awesome-ansible",
      "revision": "a9aede5266ab7933e1be53ea87ab173cc3cb6949"
    },
    {
      "fullName": "ant-design/ant-design-mobile",
      "revision": "6823d807f0f8857b894ac60d188b228082ab0277"
    },
    {
      "fullName": "any86/any-rule",
      "revision": "43abe0f89526d0bfd4e53c2c83bb176216ab5645"
    },
    {
      "fullName": "astrid-runtime/sdk-js",
      "revision": "229401ba8b48d0c2fba205646a980f475e9f3916"
    },
    {
      "fullName": "automerge/automerge-classic",
      "revision": "0605308926a03353eb1072c3afa2a3a8580fcef9"
    },
    {
      "fullName": "awesome-mqtt/awesome-mqtt",
      "revision": "375e2844ae8383042db7b4a4ef5a078cb9b9d6ed"
    },
    {
      "fullName": "baomidou/mybatis-plus",
      "revision": "db0b3c4bb58a38bad9c3d78b7269d8a477cc6a63"
    },
    {
      "fullName": "benbusby/whoogle-search",
      "revision": "5580d07311a81067ddb90b9abe6d6547080984b9"
    },
    {
      "fullName": "blacklanternsecurity/bbot",
      "revision": "eabac72a46fa50897ef3f3dc5a19ad57f029c33f"
    },
    {
      "fullName": "bmaltais/kohya_ss",
      "revision": "45088f04af78e11cec5407ff4652ea3ed2c14422"
    },
    {
      "fullName": "boardgameio/boardgame.io",
      "revision": "65ca73beb62ef2afd980bb9f569b10dabfc60075"
    },
    {
      "fullName": "bojieli/ai-agent-book",
      "revision": "c2ed3c18a6ee7539e83ccb25cf5beaecc28cb0ec"
    },
    {
      "fullName": "busyloop/lolcat",
      "revision": "f4cca5601ea57df2b5b3c98feea8ad05f4421039"
    },
    {
      "fullName": "coderamp-labs/gitingest",
      "revision": "4e259a02fe72115bee538271622f1234a81c8e1a"
    },
    {
      "fullName": "codingknite/frontend-development",
      "revision": "e8d886ee79dec315ac592d1700056ab09711802f"
    },
    {
      "fullName": "cool-RR/PySnooper",
      "revision": "4be5c156ffc3315011c42ba521c4d8487052d289"
    },
    {
      "fullName": "coryhouse/react-slingshot",
      "revision": "a7b0c6111cceaf88ffa4c24df3b38401f045a3d1"
    },
    {
      "fullName": "craft-ai-agents/craft-agents-oss",
      "revision": "a60ebc1a5a7cb0a6af7a77d5eed0512c5fc07658"
    },
    {
      "fullName": "cs01/gdbgui",
      "revision": "773b9161729e75a6de57fb47bd084576e31de59a"
    },
    {
      "fullName": "d-kitamura/ILRMA",
      "revision": "71a285b10ef6177738c46a173b9afb1623febcca"
    },
    {
      "fullName": "damask-multiphysics/DAMASK",
      "revision": "28b38afc0cba4f132763bb0e665f3d7771e92ffd"
    },
    {
      "fullName": "decalage2/awesome-security-hardening",
      "revision": "11b15e279de65ac31bdef88d443390945e935cce"
    },
    {
      "fullName": "decaporg/decap-cms",
      "revision": "e50c1b16fb22421adaaea6aa104cf68045ebdbbf"
    },
    {
      "fullName": "deepseek-ai/DeepSeek-Coder",
      "revision": "2f9fd85927c669dae3c0fbb2d607274023af243e"
    },
    {
      "fullName": "deepseek-ai/DeepSeek-OCR",
      "revision": "09eaf526153e7a01ed16c9dea8c96282aaea29c0"
    },
    {
      "fullName": "dimsemenov/PhotoSwipe",
      "revision": "cd41cb587a460634e4cae53134f3d01d06e284a6"
    },
    {
      "fullName": "divScorp/Java-Programs",
      "revision": "f56d6112ac921bd644beecb92e5a9e6ac9ab50e7"
    },
    {
      "fullName": "documize/community",
      "revision": "e19bcd02ab20750a904fc2e3815cd453e877fa54"
    },
    {
      "fullName": "dottxt-ai/outlines",
      "revision": "be2cd151855c64a81262c4daace2428400b109ff"
    },
    {
      "fullName": "duckdb/duckdb",
      "revision": "5cd70f2c703e8d65b8559c0607d9eb711215c76a"
    },
    {
      "fullName": "dyad-sh/dyad",
      "revision": "74acfeeaf69f57e427080e97d7293c09f349c38e"
    },
    {
      "fullName": "editor-js/awesome-editorjs",
      "revision": "7453310ed4f90ad4c4efc02a848846c26bd58ffb"
    },
    {
      "fullName": "electron/minimal-repro",
      "revision": "9e596ffbcc4cec5715aa015e1a3c50a2cfc58b01"
    },
    {
      "fullName": "emberjs/ember.js",
      "revision": "0da747613f85bfd8b92e05cb894cf0d5df5a5180"
    },
    {
      "fullName": "emilk/egui",
      "revision": "e6eb00a31c7089d4458c55fcbe5f1253311a7176"
    },
    {
      "fullName": "ethers-io/ethers.js",
      "revision": "3ea4c226dd0b3a074abf90748de9d11192027f4f"
    },
    {
      "fullName": "every-app/open-seo",
      "revision": "f56972639f14e7e766498a8a2f6441913eb83c0c"
    },
    {
      "fullName": "fabacab/awesome-cybersecurity-blueteam",
      "revision": "d2231996bf67d4b5f86f09825a128b951324f915"
    },
    {
      "fullName": "fabacab/awesome-lockpicking",
      "revision": "508b99f6bfdaa945be5144f8a6e72feb2e9ac592"
    },
    {
      "fullName": "fabricjs/fabric.js",
      "revision": "e009409980c199ee2c1bcbc42ef1a3689105f1db"
    },
    {
      "fullName": "facefusion/facefusion",
      "revision": "3f81a8a78454089d720b8f318a12ae1702c4633b"
    },
    {
      "fullName": "feross/lxjs-chat",
      "revision": "b77905286f955dbc33e47a222ff0344933141372"
    },
    {
      "fullName": "firecrawl/firecrawl-mcp-server",
      "revision": "7232b6d1cdd80335107d53a33b80c902b515a334"
    },
    {
      "fullName": "freemocap/freemocap",
      "revision": "3dd269dc0d0e29198845aa15dd96d16a616600fe"
    },
    {
      "fullName": "ganeshrvel/openmtp",
      "revision": "ac02705fa9bcb81715ae328fb6c7324e126b2483"
    },
    {
      "fullName": "garethgeorge/backrest",
      "revision": "626156cd8e15745b84bfe86099457d9db8372c5d"
    },
    {
      "fullName": "garrytan/gbrain",
      "revision": "1f319e6d5aff7674d8f48f289768ff75911a9ea8"
    },
    {
      "fullName": "get-convex/convex-backend",
      "revision": "d6825caac38e9e1cd9a78b90a01bf52e4c3edc97"
    },
    {
      "fullName": "ghcjs/ghcjs",
      "revision": "b7711fbca7c3f43a61f1dba526e6f2a2656ef44c"
    },
    {
      "fullName": "glanceapp/glance",
      "revision": "91324e8de762702e97b0ac5c8e36271d644d8642"
    },
    {
      "fullName": "goharbor/harbor",
      "revision": "89dbf8fbf7a60f2843f64ed7af11cf3d07be0bc8"
    },
    {
      "fullName": "graphql/graphql-js",
      "revision": "c31db12474208c522abdee1768a652b522bfd635"
    },
    {
      "fullName": "greyshirtguy/ProPresenter7-Proto",
      "revision": "1b63dda196eb7e079721a8a4a7e7773520cb5ad2"
    },
    {
      "fullName": "howtographql/howtographql",
      "revision": "bdec337878fe66cab3ec2868630a7eab72dfa34e"
    },
    {
      "fullName": "huggingface/lerobot",
      "revision": "0d383d09f2051444de211739196a28cc94736861"
    },
    {
      "fullName": "hyperapp/hyperapp",
      "revision": "5a113fa00450302be9234e0a74ee634ed5574243"
    },
    {
      "fullName": "instaloader/instaloader",
      "revision": "ad03b392db9a965d1ece316ececab82b242cdad6"
    },
    {
      "fullName": "inversify/InversifyJS",
      "revision": "fdd9186891e777884012984c64c271e576155f08"
    },
    {
      "fullName": "javalin/javalin",
      "revision": "6600d23a36eca699d57cca14110c3fb181222ed9"
    },
    {
      "fullName": "jbranchaud/awesome-react-design-systems",
      "revision": "23041e1e5b697ead69dc4127509ea02fb5378e99"
    },
    {
      "fullName": "katspaugh/wavesurfer.js",
      "revision": "ae8d3cd32ebb27273051935c01fc6e4001cde3af"
    },
    {
      "fullName": "kdeldycke/awesome-engineering-team-management",
      "revision": "73acd826fade09d647e154919da9f5185609c44e"
    },
    {
      "fullName": "kepano/defuddle",
      "revision": "6152604f54593bd05fc4dc401810069882658340"
    },
    {
      "fullName": "kern/filepizza",
      "revision": "3258673e790145ba86637114a35388165a651ff3"
    },
    {
      "fullName": "klaufel/awesome-design-systems",
      "revision": "b3430a94d33f0189fa6e770709a79ab1fa73210b"
    },
    {
      "fullName": "klis87/redux-requests",
      "revision": "36eff89a778f0d61ce6da6cfb977d3f1023aef23"
    },
    {
      "fullName": "langchain-ai/local-deep-researcher",
      "revision": "38f769f84380f2065de76021ac7c5215f88aa39e"
    },
    {
      "fullName": "lauragift21/awesome-learning-resources",
      "revision": "0e9afa0c8b67df6f8ffa0a8d46847476a56ccd1b"
    },
    {
      "fullName": "leomaurodesenv/game-datasets",
      "revision": "bada0406219b624c1427ed5f2459366939534318"
    },
    {
      "fullName": "letta-ai/letta",
      "revision": "b76da9092518cbaa2d09042e52fdcbde69243e18"
    },
    {
      "fullName": "linkerd/linkerd",
      "revision": "ea82499d386e44e8958be58e0386f593e639645b"
    },
    {
      "fullName": "linsa-io/books",
      "revision": "d08c699579b113ee6e9b6d8773d96ca6093fb530"
    },
    {
      "fullName": "lissy93/web-check",
      "revision": "9154bd43e8276c0310c29c86ac70648e1ed4eda5"
    },
    {
      "fullName": "liuchong/awesome-roadmaps",
      "revision": "eef56f927116c468f4276cd3c89026d61a33d64f"
    },
    {
      "fullName": "lmammino/awesome-learn-by-playing",
      "revision": "eba22584d739227c8908e6de549b1aeff8c01372"
    },
    {
      "fullName": "locomotivemtl/locomotive-scroll",
      "revision": "b6bcc569e8035334face5c1f88684590bc4d567f"
    },
    {
      "fullName": "lucidrains/DALLE2-pytorch",
      "revision": "680dfc4d93b70f9ab23c814a22ca18017a738ef6"
    },
    {
      "fullName": "lucidrains/denoising-diffusion-pytorch",
      "revision": "d93647ad3cf97d786a064ef80429ee6c3e5ebd55"
    },
    {
      "fullName": "luin/medis",
      "revision": "12c87a5a2cc3fd7fa616beb2eaed79413538769a"
    },
    {
      "fullName": "luongnv89/claude-howto",
      "revision": "97fc961a8cc68ade7e74f2dbd5c9dc5491ce55bb"
    },
    {
      "fullName": "malwaredllc/byob",
      "revision": "b4946908b8a3691f75a7e15ffe6883ef509afc91"
    },
    {
      "fullName": "markodenic/web-development-resources",
      "revision": "672b380ba41e45d286d2ef9521646ca8662341ce"
    },
    {
      "fullName": "metafizzy/zdog",
      "revision": "dde8684be686bc6d3cbedb6be49875c0a03a14c0"
    },
    {
      "fullName": "mezod/awesome-indie",
      "revision": "de8dab3f6668fab08a169d8904e3fca447c56f1d"
    },
    {
      "fullName": "microsoft/agent-framework",
      "revision": "d0a0d5a3df680ee1d6ee59258cd95cfd2f7b426e"
    },
    {
      "fullName": "microsoft/pyright",
      "revision": "93ea6468a40c7c8cdab5643f66411da5e0414742"
    },
    {
      "fullName": "mikf/gallery-dl",
      "revision": "d93587c8e10b98b02af06c407c6be22d13e51f8d"
    },
    {
      "fullName": "modelcontextprotocol/inspector",
      "revision": "ac3c1a122a5e072a200c99869fc0cd8bfa660ece"
    },
    {
      "fullName": "modelscope/FunASR",
      "revision": "a28ee6b39dde8319edcc977a8994abf2bcab9ce2"
    },
    {
      "fullName": "mohi-devhub/antivibe",
      "revision": "5fa8933b18bad20568396c0067397e0ce3d8dce9"
    },
    {
      "fullName": "nodejs/undici",
      "revision": "21a8e1ed1843e74c3004a2926c12bb0ceaca6b71"
    },
    {
      "fullName": "open-gsd/gsd-core",
      "revision": "0f46fa366f8b5807c51c627832c2129ea9e140b7"
    },
    {
      "fullName": "opendatadiscovery/awesome-data-catalogs",
      "revision": "35af5ab0779df32623a219ef73f69e15440ce742"
    },
    {
      "fullName": "openreplay/openreplay",
      "revision": "dbb68105e865052d6ec0d49c9d2d13cf5d5f4aef"
    },
    {
      "fullName": "openstf/stf",
      "revision": "2b9649009722794dee9efd32b71bccbcbfe9d794"
    },
    {
      "fullName": "oz123/awesome-c",
      "revision": "b0ee2cfbc085a5eec84fe41efd2b1576c5f59887"
    },
    {
      "fullName": "pa7/heatmap.js",
      "revision": "4e64f5ae5754c84fea363f0fcf24bea4795405ff"
    },
    {
      "fullName": "papermark/papermark",
      "revision": "1f810ab832b58e8e260c605f137f1101029e9194"
    },
    {
      "fullName": "pdone/lx-music-source",
      "revision": "e9ba570a8a04518cd1928a12d5e56823f7252cd8"
    },
    {
      "fullName": "phanan/htaccess",
      "revision": "72179f90f0bef880768c2aa6da14f90826ed3b17"
    },
    {
      "fullName": "pomber/didact",
      "revision": "bb72345b2300dd4658b4736b65843e05dac39643"
    },
    {
      "fullName": "pterodactyl/panel",
      "revision": "c39a7be8f55a4537a4eaa4a134be6a3b975b14ec"
    },
    {
      "fullName": "pure-css/pure",
      "revision": "d35fb6fcbcd888da11a7215fe61d1efeda374699"
    },
    {
      "fullName": "pypa/pip",
      "revision": "6a4aad81b1aa692974b9eedb12a02689f2fff6ba"
    },
    {
      "fullName": "python/mypy",
      "revision": "3d657d66915fe8b12bebb7ce12a44e5dc59d66f8"
    },
    {
      "fullName": "pytube/pytube",
      "revision": "a32fff39058a6f7e5e59ecd06a7467b71197ce35"
    },
    {
      "fullName": "rclone/rclone",
      "revision": "c99b2d11edb0986cd2b1190e9fa25a58a3f12661"
    },
    {
      "fullName": "redhuntlabs/Awesome-Asset-Discovery",
      "revision": "ec8ef35b3b7ccffd50905af1088a451de6ce9257"
    },
    {
      "fullName": "redux-utilities/redux-actions",
      "revision": "3fa4c50dfeab54fa1f2110764757ee4c10c8e3ac"
    },
    {
      "fullName": "remix-run/remix",
      "revision": "593e568f1b3ca9bac861f3f86a69dda1d2b836b3"
    },
    {
      "fullName": "robjhyndman/forecast",
      "revision": "10d097e82da5e4b5d0360f745081c3588a8528cc"
    },
    {
      "fullName": "sczhou/CodeFormer",
      "revision": "b33cc7d639d6545bfcccc7e0bc6ae51f24e79c2b"
    },
    {
      "fullName": "simolus3/drift",
      "revision": "461e8fa45b553f5dbc3fe0ffc6abfbd4facf8b17"
    },
    {
      "fullName": "sindresorhus/modern-normalize",
      "revision": "27c3f5fe3109b4041a835a0fa569e09c77022bf8"
    },
    {
      "fullName": "sonicoder86/awesome-vue-3",
      "revision": "175616ad1e432a6c2fca6e02b61fedbc456617ba"
    },
    {
      "fullName": "soumyajit4419/Portfolio",
      "revision": "60c3c08f5f5c25ca4a3a85d795a6d1450a947f40"
    },
    {
      "fullName": "spacedriveapp/spacedrive",
      "revision": "60369e9f00b5abe07f4518626bf36f6a7453476f"
    },
    {
      "fullName": "spaceship-prompt/spaceship-prompt",
      "revision": "fd0d6653a134fe28f498eae1784fbb46d27f20f3"
    },
    {
      "fullName": "stax76/awesome-mpv",
      "revision": "53c6c186f55b380924ce4fc9f6035a12267f00c0"
    },
    {
      "fullName": "sveltejs/kit",
      "revision": "2c08533799212e4bf9d63f40ea352dd56ab1876d"
    },
    {
      "fullName": "terkelg/prompts",
      "revision": "58771d2911fc2a9c3751a0143ed66cf4321c8514"
    },
    {
      "fullName": "terraform-aws-modules/terraform-aws-security-group",
      "revision": "58d8e895915f5573767081142d063b7caf7a2b47"
    },
    {
      "fullName": "testthedocs/awesome-docs",
      "revision": "592759461424797d2605b5a48678089461c254a5"
    },
    {
      "fullName": "tmcw/awesome-geojson",
      "revision": "2feacc5f65d814a868ab61ec5ae31c21109f1f3a"
    },
    {
      "fullName": "trekhleb/learn-python",
      "revision": "5e4fad5903ce5a76cc1f90838d69a220968e1494"
    },
    {
      "fullName": "tspeterkim/flash-attention-minimal",
      "revision": "00f8f46712d493665c900c32fa3a261c8ef3e20c"
    },
    {
      "fullName": "tuupola/lazyload",
      "revision": "d3ad81c12332a0f950c6c703ff975b60350405a4"
    },
    {
      "fullName": "typeddjango/awesome-python-typing",
      "revision": "8407aa965dcfe409c69c7974f8dfb3f8ed3b4c03"
    },
    {
      "fullName": "typicode/lowdb",
      "revision": "8a6fce9b72f769b22533f0979fbc2e73180f8112"
    },
    {
      "fullName": "ultrafunkamsterdam/undetected-chromedriver",
      "revision": "757ed6a22052f0674bb7c9f765ca884d15dcb780"
    },
    {
      "fullName": "upgundecha/howtheysre",
      "revision": "4fd5a3a05bcc69cef122842714fd9bbd60041d32"
    },
    {
      "fullName": "uvdesk/community-skeleton",
      "revision": "6f35040f447f7fe1dcd254e259e7b7e0a9f7a79f"
    },
    {
      "fullName": "vercel/swr",
      "revision": "fc7ac116b2a2bfdfa43ec8b08753a77d6c3de93e"
    },
    {
      "fullName": "virattt/dexter",
      "revision": "823052ed687a6f3ef0e48b5e7025c73e86d95775"
    },
    {
      "fullName": "webfuse-com/awesome-autoresearch",
      "revision": "2dc7dfa9ba826bcfaf63ac7f8849eae433141c89"
    },
    {
      "fullName": "wekan/wekan",
      "revision": "4e18400faa3fb73a314d5519157c7dd2720f0f3b"
    },
    {
      "fullName": "wg-easy/wg-easy",
      "revision": "94a9967dd11759ae3e971966e90e0b52d5b463b8"
    },
    {
      "fullName": "wifiphisher/wifiphisher",
      "revision": "4ae336518bf29eed13d3b09f2ee6a16e7973c997"
    },
    {
      "fullName": "winstonjs/winston",
      "revision": "ff0b79de8562bb322c390fbc82fe71c11f373428"
    },
    {
      "fullName": "wix/react-native-ui-lib",
      "revision": "5110454db9304b433f2e8d67a17d0b2e94b3a327"
    },
    {
      "fullName": "wq2012/awesome-diarization",
      "revision": "9e284d76f983b922183beb0f7bd6cc68c99fa062"
    },
    {
      "fullName": "xiaoyuyang0901/Simulation-platform",
      "revision": "e485176717c8ee79539895024ec950980474a7bb"
    },
    {
      "fullName": "yaronn/blessed-contrib",
      "revision": "45a7db64c81f179327b1edb5d4d662bcf661ff2b"
    },
    {
      "fullName": "yemount/pose-animator",
      "revision": "cb2be70a3501e57e66fe185daca44cc2afe18ce8"
    },
    {
      "fullName": "yewstack/yew",
      "revision": "0e4a05472fac4e5fce1befe60fa4a1e43a36b6a3"
    },
    {
      "fullName": "yissachar/awesome-dart",
      "revision": "116107d93b8bd5afe467728ee1f59f0b79e94d87"
    },
    {
      "fullName": "yizhiyanhua-ai/fireworks-tech-graph",
      "revision": "50c819d68fd4fee330b3010988cd13e98b678d44"
    },
    {
      "fullName": "zacharywhitley/awesome-ocr",
      "revision": "36ae290728eb5a14f1d3db6035119a027f0a7a39"
    },
    {
      "fullName": "zai-org/ChatGLM2-6B",
      "revision": "cb8e8b43c0951b32614f25c03e1ab593a0603a1c"
    },
    {
      "fullName": "zarazhangrui/frontend-slides",
      "revision": "9906a34d640d2111f724544cbc50f7f130569ae1"
    },
    {
      "fullName": "zemmsoares/awesome-rices",
      "revision": "8e3fd966a4a9a3efa7199daee28d43dfd24f8ef8"
    }
  ],
  "manifest_sha256": "8d3c9150fbebf2f8d043600149f96c4acba8bab78512fbd05f87f7eff2efa970"
}
```
