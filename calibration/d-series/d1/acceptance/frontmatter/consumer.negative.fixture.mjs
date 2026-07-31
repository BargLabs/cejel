export function approvesRelease(frontmatter, approvers) {
  if (frontmatter.requireNamedApprover === 'true' && approvers.length === 0) return false;
  return approvers.length >= Number(frontmatter.minimumApprovals);
}
