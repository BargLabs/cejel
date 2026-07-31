export const approvalSchema = {
  minimumApprovals: { type: 'number' },
  requireNamedApprover: { type: 'boolean' },
};

export function validatesApproval(input) {
  return (
    approvalSchema.minimumApprovals.type === 'number' &&
    approvalSchema.requireNamedApprover.type === 'boolean' &&
    typeof input.minimumApprovals === 'number' &&
    typeof input.requireNamedApprover === 'boolean'
  );
}
