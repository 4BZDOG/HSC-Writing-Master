/**
 * The note a teacher pastes to their administrator when they cannot buy a
 * School licence themselves (not attached to a school, or the school already
 * holds one bought by someone else).
 *
 * Pure, with no imports, so it can be tested without mounting the component
 * that copies it. The caller passes what the deployment says: the seat price as
 * displayed, whether the school can pay by invoice, and the app's address.
 *
 * Plain and first person, because it is the teacher's own message to a
 * colleague. No pressure: it says what the licence covers and how it is paid
 * for, and it leaves the decision with the school.
 */
export interface LicenceNoteInput {
  /** The school's name, when the teacher's account knows it. */
  schoolName?: string | null;
  /** The per-student price as shown to the buyer, for example "A$4". */
  seatPrice: string;
  /** The GST words beside that price ("incl. GST", "+ GST"), or null to say nothing. */
  seatGst?: string | null;
  /** How often that price is charged. A yearly price is the default. */
  seatInterval?: 'month' | 'year';
  /** The product's name, as the admin will find it (LEGAL_CONFIG.productName). */
  productName: string;
  /** Whether this deployment offers an invoice against a purchase order. */
  invoicing: boolean;
  /** The address of the app, as the admin would open it. */
  appUrl: string;
}

export const buildLicenceNote = ({
  schoolName,
  seatPrice,
  seatGst,
  seatInterval = 'year',
  productName,
  invoicing,
  appUrl,
}: LicenceNoteInput): string => {
  const school = schoolName?.trim() ? schoolName.trim() : 'the school';
  const seatTax = seatGst ? ` ${seatGst}` : '';
  const payment = invoicing
    ? 'It can be paid by card, or by invoice against a purchase order.'
    : 'It is paid by card.';
  return [
    // The product's own name: the repository's name ("HSC Writing Master") was
    // written here, and an admin searching for that would not find the app.
    `I would like the school to look at a School licence for ${productName}.`,
    `It covers every student and teacher at ${school} for ${seatPrice} per student a ${seatInterval}${seatTax}, ` +
      'and it includes the class and school progress reports for staff.',
    payment,
    `The app is at ${appUrl}. A teacher or administrator whose account is attached to the school ` +
      'can buy the licence in the app.',
  ].join(' ');
};
