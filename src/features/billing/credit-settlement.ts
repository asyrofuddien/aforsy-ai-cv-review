/** Keep FIFO consumption and return the unused matching credit to its original lot. */
export function planCreditSettlement<T>(
  allocations: Array<{ lotId: T; credits: number }>,
  totalCredits: number,
  releasedCredits: number,
) {
  if (
    !Number.isInteger(totalCredits) ||
    totalCredits < 1 ||
    !Number.isInteger(releasedCredits) ||
    releasedCredits < 0 ||
    releasedCredits > totalCredits ||
    allocations.some((item) => !Number.isInteger(item.credits) || item.credits < 1) ||
    allocations.reduce((sum, item) => sum + item.credits, 0) !== totalCredits
  ) {
    throw new Error('Credit reservation allocations do not reconcile.');
  }
  let remainingCapture = totalCredits - releasedCredits;
  return allocations.map((item) => {
    const captured = Math.min(item.credits, remainingCapture);
    remainingCapture -= captured;
    return {
      lotId: item.lotId,
      credits: item.credits,
      captured,
      released: item.credits - captured,
    };
  });
}
