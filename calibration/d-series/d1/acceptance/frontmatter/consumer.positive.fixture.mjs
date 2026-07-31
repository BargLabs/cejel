export function approvesRelease(frontmatter, approvers) {
  return approvers.length >= Number(frontmatter.minimumApprovals);
}
