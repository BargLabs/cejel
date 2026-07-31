export const approvalConfig = {
  minimumApprovals: 0,
  requireNamedApprover: true,
};

export function approvesRelease(approvers) {
  if (approvalConfig.requireNamedApprover && approvers.length === 0) return false;
  return approvers.length >= approvalConfig.minimumApprovals;
}
