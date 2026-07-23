import type { CejelLlmPackArtifact } from './artifact.js';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCejelLlmPackHtml(artifact: CejelLlmPackArtifact): string {
  const { result } = artifact;
  const findings = result.findings
    .map(
      (finding) =>
        `<li><strong>${escapeHtml(finding.ruleId)}</strong> ` +
        `<span>${escapeHtml(finding.severity)} / ${escapeHtml(finding.confidence)}</span>` +
        `<p>${escapeHtml(finding.summary)}</p>` +
        `<code>${escapeHtml(finding.evidence.path)}:${finding.evidence.line}</code></li>`,
    )
    .join('\n');
  const limitations = result.coverage.limitations
    .map((limitation) => `<li>${escapeHtml(limitation)}</li>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cejel Free LLM Pack</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;color:#17202a}code{background:#f2f4f7;padding:2px 5px}li{margin:14px 0}.boundary{border-left:4px solid #b7791f;padding:10px 14px;background:#fffaf0}</style></head>
<body><h1>Cejel Free LLM Pack</h1>
<p><strong>Status:</strong> ${escapeHtml(result.status)} · <strong>Findings:</strong> ${result.findings.length}</p>
<p><strong>Pack:</strong> ${escapeHtml(result.packVersion)} · <strong>Generated:</strong> ${escapeHtml(artifact.generatedAt)}</p>
<p class="boundary">${escapeHtml(artifact.claimBoundary)}</p>
<h2>Evidence-backed findings</h2>${findings ? `<ol>${findings}</ol>` : '<p>No rule evidence matched. This is not proof that every control exists.</p>'}
<h2>Coverage limitations</h2><ul>${limitations}</ul>
<p>Assurance: unsigned, self-generated. Source snapshot SHA-256: <code>${escapeHtml(artifact.inputSourceSha256)}</code>. Base report SHA-256: <code>${escapeHtml(artifact.baseReportSha256)}</code>.</p>
</body></html>\n`;
}

export function renderCejelLlmPackTerminal(artifact: CejelLlmPackArtifact): string {
  const { result } = artifact;
  const lines = [
    'Free LLM Pack',
    `  Status: ${result.status}`,
    `  Findings: ${result.findings.length}`,
    `  Coverage: ${result.coverage.supportedLanguages.join(', ')}`,
    '  Boundary: static application-integrity evidence; not a hallucination rate.',
  ];
  return `${lines.join('\n')}\n`;
}
