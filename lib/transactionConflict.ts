/** Prisma query/commit and PostgreSQL adapter report retryable conflicts differently. */
export function isTransactionConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === 'P2034') return true
  if ('code' in error && error.code === 'P2010' && 'meta' in error && error.meta && typeof error.meta === 'object' && 'code' in error.meta && (error.meta.code === '40001' || error.meta.code === '40P01')) return true
  if ('code' in error && error.code === 'P2010' && 'meta' in error && error.meta && typeof error.meta === 'object' && 'driverAdapterError' in error.meta) return isTransactionConflict(error.meta.driverAdapterError)
  if (!('name' in error) || error.name !== 'DriverAdapterError' || !('cause' in error)) return false
  const cause = error.cause
  if (!cause || typeof cause !== 'object' || !('kind' in cause)) return false
  if (cause.kind === 'TransactionWriteConflict') return true
  return cause.kind === 'postgres' && 'code' in cause && (cause.code === '40001' || cause.code === '40P01')
}
