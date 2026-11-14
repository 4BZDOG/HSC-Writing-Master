/**
 * "1 mark", "3 marks": a mark count with its noun in the singular for one.
 * Lower case throughout, as the rest of the app writes marks. A chip that is
 * set in Title Case by design says so at its own call site instead.
 */
export const marksLabel = (n: number): string => `${n} ${n === 1 ? 'mark' : 'marks'}`;
