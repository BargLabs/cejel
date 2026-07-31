export const approvalSchema = {
  minimumApprovals: { type: 'number' },
  requireNamedApprover: { type: 'boolean' },
};

export function validatesApproval(input) {
  return (
    approvalSchema.minimumApprovals.type === 'number' &&
    typeof input.minimumApprovals === 'number'
  );
}
