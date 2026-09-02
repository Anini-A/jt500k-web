// A draft row's contribution to what a credit card owes.
// Amounts are always stored POSITIVE; direction lives in the row's type.
// An income row on a card (a refund/reversal) REDUCES the balance owed.
export function signedRowAmount(row: { type?: string | null; amount: number | string }): number {
  const amt = typeof row.amount === 'number' ? row.amount : parseFloat(String(row.amount))
  if (isNaN(amt)) return 0
  return row.type === 'income' ? -amt : amt
}
