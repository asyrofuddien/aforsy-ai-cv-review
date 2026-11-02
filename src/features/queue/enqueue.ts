export async function enqueueWithCompensation<TRecord, TResult>(input: {
  record: TRecord;
  enqueue: () => Promise<TResult>;
  compensate: (record: TRecord, error: unknown) => Promise<unknown>;
}): Promise<TResult> {
  try {
    return await input.enqueue();
  } catch (error) {
    await input.compensate(input.record, error);
    throw error;
  }
}
