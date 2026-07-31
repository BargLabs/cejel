export const approvalConfig = {
  minimumApprovals: 0,
  requireNamedApprover: true,
};

export function approvesRelease(approvers) {
  return approvers.length >= approvalConfig.minimumApprovals;
}
