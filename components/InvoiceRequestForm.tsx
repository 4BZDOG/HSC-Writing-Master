import React, { useEffect, useId, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  Loader2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  fetchMyLicenceRequests,
  invoicedLicencesEnabled,
  submitInvoiceRequest,
  type ColleagueLicenceRequest,
  type LicenceRequest,
} from '../services/licenceRequestService';
import {
  ABN_HINT,
  AU_STATE_CODES,
  abnFeedback,
  draftFromRequest,
  emptyInvoiceDraft,
  INVOICE_FIELD_LIMITS,
  INVOICE_FIELD_ORDER,
  validateInvoiceDraft,
  type InvoiceDraft,
  type InvoiceField,
  type InvoiceFormErrors,
} from '../utils/invoiceRequestForm';
import {
  formatAbn,
  formatRequestDate,
  seatsPhrase,
  selectInvoiceView,
} from '../utils/invoiceRequestState';

/**
 * Pay by invoice or purchase order, for a school that cannot pay by card.
 *
 * It sits under the School seat picker, behind a disclosure, so the card path
 * stays the headline. Nothing here charges anyone: the request is recorded, a
 * platform administrator decides it, and only then is an invoice issued. The
 * copy says what happens next at each step, and never says the school has been
 * billed before it has.
 *
 * Once opened, the panel shows the person's own request in place of the form
 * (pending, approved or declined). The form returns when there is nothing to
 * show, or when they are asking again after a decline.
 */

interface InvoiceRequestFormProps {
  /** The seat count from the picker above, so the invoice is for what the person chose. */
  seats: number;
  className?: string;
}

type LoadState = 'idle' | 'loading' | 'ready' | 'failed';

/** Where focus goes after a change the person made. Set after the state has rendered. */
type FocusTarget = 'disclosure' | 'heading' | 'alert' | InvoiceField;

const FIELD_LABELS: Record<InvoiceField, string> = {
  billingName: 'Name on the invoice',
  billingEmail: 'Accounts email',
  line1: 'Street address',
  line2: 'Address line 2',
  city: 'Suburb or town',
  state: 'State',
  postcode: 'Postcode',
  abn: 'ABN',
  poNumber: 'Purchase order number',
  note: 'Note for the administrator',
};

const HINTS: Partial<Record<InvoiceField, string>> = {
  billingName:
    'The school or accounts office, written as it should appear on the invoice. For example, Parramatta High School.',
  billingEmail: 'Where the invoice is sent. Use the address the accounts office reads.',
  postcode: 'Four digits.',
  poNumber: 'Quote it if the accounts office issued one. It prints on the invoice.',
  note: 'For the platform administrator, for example the date the school needs the invoice by.',
};

const INPUT_BASE =
  'w-full min-h-11 sm:min-h-0 sm:py-2 px-3 py-2.5 rounded-xl text-base sm:text-sm font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-dim))] bg-[rgb(var(--color-bg-surface-inset))] border focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-transparent disabled:opacity-60';

const inputClass = (invalid: boolean): string =>
  `${INPUT_BASE} ${
    invalid
      ? 'border-red-500/70 light:border-red-500'
      : 'border-[rgb(var(--color-border-secondary))]/30 light:border-slate-400'
  }`;

/**
 * The aria wiring every control shares. An error is announced through its
 * `-error` paragraph, otherwise the hint's `-hint` paragraph describes it. The
 * `Labelled` wrapper renders exactly those two ids, so the reference cannot
 * point at nothing.
 */
const ariaFor = (id: string, error?: string | null, hint?: string | null) => ({
  'aria-invalid': error ? (true as const) : undefined,
  'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
});

/** A label, its control, and the hint or error that describes it. Module scope, so the control keeps its identity between keystrokes. */
const Labelled: React.FC<{
  id: string;
  label: string;
  optional?: boolean;
  hint?: string | null;
  error?: string | null;
  children: React.ReactNode;
}> = ({ id, label, optional, hint, error, children }) => (
  <div>
    <label
      htmlFor={id}
      className="block text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-800"
    >
      {label}
      {optional && (
        <span className="font-medium text-[rgb(var(--color-text-muted))]"> (optional)</span>
      )}
    </label>
    <div className="mt-1.5">{children}</div>
    {error ? (
      <p
        id={`${id}-error`}
        className="mt-1.5 flex items-start gap-1.5 text-xs font-medium leading-relaxed text-red-500 light:text-red-600"
      >
        <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{error}</span>
      </p>
    ) : hint ? (
      <p
        id={`${id}-hint`}
        className="mt-1.5 text-xs leading-relaxed text-[rgb(var(--color-text-muted))]"
      >
        {hint}
      </p>
    ) : null}
  </div>
);

/** Only an https link is shown as one. The URL comes from Stripe, and nothing else is ever made a link. */
const invoiceLinkFor = (url: string | null): string | null =>
  url && /^https:\/\//i.test(url) ? url : null;

// ---------------------------------------------------------------------------
// Request states
// ---------------------------------------------------------------------------

type Tone = 'pending' | 'approved' | 'declined';

const TONE_CLASSES: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  pending: {
    box: 'bg-amber-500/10 light:bg-amber-50 border-amber-500/40 light:border-amber-300',
    icon: 'text-amber-500 light:text-amber-700',
    Icon: Clock,
  },
  approved: {
    box: 'bg-emerald-500/10 light:bg-emerald-50 border-emerald-500/40 light:border-emerald-300',
    icon: 'text-emerald-500 light:text-emerald-700',
    Icon: CheckCircle2,
  },
  declined: {
    box: 'bg-[rgb(var(--color-bg-surface-inset))] border-[rgb(var(--color-border-secondary))]/30 light:border-slate-400',
    icon: 'text-[rgb(var(--color-text-muted))]',
    Icon: XCircle,
  },
};

const StatusCard: React.FC<{
  tone: Tone;
  headingId: string;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  heading: string;
  children: React.ReactNode;
}> = ({ tone, headingId, headingRef, heading, children }) => {
  const { box, icon, Icon } = TONE_CLASSES[tone];
  return (
    <section aria-labelledby={headingId} className={`rounded-2xl border p-4 ${box}`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 w-4 h-4 shrink-0 ${icon}`} aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2.5">
          <h4
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-sm font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none"
          >
            {heading}
          </h4>
          {children}
        </div>
      </div>
    </section>
  );
};

const BodyText: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-800">
    {children}
  </p>
);

const Detail: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-wrap gap-x-2 text-xs leading-relaxed">
    <dt className="font-bold text-[rgb(var(--color-text-muted))]">{label}</dt>
    <dd className="min-w-0 break-words text-[rgb(var(--color-text-secondary))] light:text-slate-800">
      {value}
    </dd>
  </div>
);

const RequestDetails: React.FC<{ request: LicenceRequest }> = ({ request }) => (
  <dl className="space-y-1">
    <Detail label="Seats" value={seatsPhrase(request.seats)} />
    <Detail label="Name on the invoice" value={request.billingName} />
    <Detail label="Accounts email" value={request.billingEmail} />
    {request.poNumber && <Detail label="Purchase order" value={request.poNumber} />}
    {request.abn && <Detail label="ABN" value={formatAbn(request.abn)} />}
  </dl>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const InvoiceRequestForm: React.FC<InvoiceRequestFormProps> = ({ seats, className = '' }) => {
  const baseId = useId();
  const disclosureId = `${baseId}-disclosure`;
  const panelId = `${baseId}-panel`;
  const headingId = `${baseId}-state`;
  const fieldId = (field: InvoiceField | 'form') => `${baseId}-${field}`;

  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [requests, setRequests] = useState<LicenceRequest[]>([]);
  const [colleague, setColleague] = useState<ColleagueLicenceRequest | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(emptyInvoiceDraft);
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [abnTouched, setAbnTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusRequest, setFocusRequest] = useState<{ target: FocusTarget; n: number } | null>(null);

  const disclosureRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  // Read once, the first time the disclosure opens. Later opens show what was
  // read, so a reopened panel does not flash a spinner or lose a typed draft.
  useEffect(() => {
    if (!open || startedRef.current) return;
    startedRef.current = true;
    setLoadState('loading');
    void fetchMyLicenceRequests().then((rows) => {
      if (rows === null) {
        setLoadState('failed');
        return;
      }
      setRequests(rows);
      const view = selectInvoiceView(rows);
      // Asking again after a decline starts from the last request, so the
      // person corrects a field rather than retyping the lot.
      if (view.kind === 'declined') setDraft(draftFromRequest(view.request));
      setLoadState('ready');
    });
  }, [open]);

  // Moves focus once the element it refers to has rendered.
  useEffect(() => {
    if (!focusRequest) return;
    const { target } = focusRequest;
    if (target === 'disclosure') disclosureRef.current?.focus();
    else if (target === 'heading') headingRef.current?.focus();
    else if (target === 'alert') alertRef.current?.focus();
    else document.getElementById(`${baseId}-${target}`)?.focus();
  }, [focusRequest, baseId]);

  if (!invoicedLicencesEnabled()) return null;

  const toggle = () => {
    setEverOpened(true);
    setOpen((value) => !value);
  };

  const cancel = () => {
    setOpen(false);
    setFocusRequest({ target: 'disclosure', n: Date.now() });
  };

  const setField = (field: keyof InvoiceDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    // An error clears as soon as the person edits its field. The whole form is
    // checked again on submit, so nothing slips through.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const { errors: found, payload } = validateInvoiceDraft(draft, seats);
    setAbnTouched(true);
    setErrors(found);
    if (!payload) {
      const firstBad = INVOICE_FIELD_ORDER.find((field) => found[field]);
      setFormError(found.seats ?? 'Check the highlighted details, then send the request again.');
      setFocusRequest({ target: firstBad ?? 'alert', n: Date.now() });
      return;
    }

    setFormError(null);
    setSubmitting(true);
    const result = await submitInvoiceRequest(payload);
    setSubmitting(false);

    if (result.ok === false) {
      setFormError(result.error);
      setFocusRequest({ target: 'alert', n: Date.now() });
      return;
    }
    if (result.kind === 'own') {
      const own = result.request;
      setRequests((rows) => [own, ...rows.filter((row) => row.id !== own.id)]);
    } else {
      setColleague(result.request);
    }
    setFocusRequest({ target: 'heading', n: Date.now() });
  };

  // A colleague's request, seen only after sending, outranks the person's own
  // history. Until the list has loaded there is no view to choose.
  const view = loadState === 'ready' || loadState === 'failed' ? selectInvoiceView(requests) : null;
  const abnNote = errors.abn
    ? { tone: 'error' as const, message: errors.abn }
    : abnFeedback(draft.abn, abnTouched);
  const abnError = abnNote?.tone === 'error' ? abnNote.message : null;
  const abnHint = abnNote?.tone === 'hint' ? abnNote.message : null;

  const renderForm = () => (
    <form noValidate onSubmit={onSubmit} aria-busy={submitting || undefined} className="space-y-4">
      <BodyText>
        Nothing is charged, and no invoice is sent, until a platform administrator approves the
        request. That usually takes two working days.
      </BodyText>

      {formError && (
        <div
          id={fieldId('form')}
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-2 rounded-xl border border-red-500/40 light:border-red-400 bg-red-500/10 light:bg-red-50 px-3 py-2.5 text-xs font-medium leading-relaxed text-red-500 light:text-red-700 focus:outline-none"
        >
          <AlertCircle className="mt-0.5 w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{formError}</span>
        </div>
      )}

      <Labelled
        id={fieldId('billingName')}
        label={FIELD_LABELS.billingName}
        hint={HINTS.billingName}
        error={errors.billingName}
      >
        <input
          id={fieldId('billingName')}
          type="text"
          value={draft.billingName}
          onChange={(e) => setField('billingName', e.target.value)}
          autoComplete="organization"
          maxLength={INVOICE_FIELD_LIMITS.name}
          disabled={submitting}
          {...ariaFor(fieldId('billingName'), errors.billingName, HINTS.billingName)}
          className={inputClass(Boolean(errors.billingName))}
        />
      </Labelled>

      <Labelled
        id={fieldId('billingEmail')}
        label={FIELD_LABELS.billingEmail}
        hint={HINTS.billingEmail}
        error={errors.billingEmail}
      >
        <input
          id={fieldId('billingEmail')}
          type="email"
          inputMode="email"
          value={draft.billingEmail}
          onChange={(e) => setField('billingEmail', e.target.value)}
          autoComplete="email"
          disabled={submitting}
          {...ariaFor(fieldId('billingEmail'), errors.billingEmail, HINTS.billingEmail)}
          className={inputClass(Boolean(errors.billingEmail))}
        />
      </Labelled>

      <fieldset className="space-y-4">
        <legend className="text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-800">
          Billing address
          <span className="block font-medium leading-relaxed text-[rgb(var(--color-text-muted))]">
            Australian addresses only. Invoices cannot be sent overseas.
          </span>
        </legend>

        <Labelled id={fieldId('line1')} label={FIELD_LABELS.line1} error={errors.line1}>
          <input
            id={fieldId('line1')}
            type="text"
            value={draft.line1}
            onChange={(e) => setField('line1', e.target.value)}
            autoComplete="address-line1"
            maxLength={INVOICE_FIELD_LIMITS.addressLine}
            disabled={submitting}
            {...ariaFor(fieldId('line1'), errors.line1)}
            className={inputClass(Boolean(errors.line1))}
          />
        </Labelled>

        <Labelled id={fieldId('line2')} label={FIELD_LABELS.line2} optional error={errors.line2}>
          <input
            id={fieldId('line2')}
            type="text"
            value={draft.line2}
            onChange={(e) => setField('line2', e.target.value)}
            autoComplete="address-line2"
            maxLength={INVOICE_FIELD_LIMITS.addressLine}
            disabled={submitting}
            {...ariaFor(fieldId('line2'), errors.line2)}
            className={inputClass(Boolean(errors.line2))}
          />
        </Labelled>

        <Labelled id={fieldId('city')} label={FIELD_LABELS.city} error={errors.city}>
          <input
            id={fieldId('city')}
            type="text"
            value={draft.city}
            onChange={(e) => setField('city', e.target.value)}
            autoComplete="address-level2"
            maxLength={INVOICE_FIELD_LIMITS.city}
            disabled={submitting}
            {...ariaFor(fieldId('city'), errors.city)}
            className={inputClass(Boolean(errors.city))}
          />
        </Labelled>

        <div className="grid grid-cols-2 gap-3">
          <Labelled id={fieldId('state')} label={FIELD_LABELS.state} error={errors.state}>
            <select
              id={fieldId('state')}
              value={draft.state}
              onChange={(e) => setField('state', e.target.value)}
              autoComplete="address-level1"
              disabled={submitting}
              {...ariaFor(fieldId('state'), errors.state)}
              className={inputClass(Boolean(errors.state))}
            >
              <option value="">Choose</option>
              {AU_STATE_CODES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Labelled>

          <Labelled
            id={fieldId('postcode')}
            label={FIELD_LABELS.postcode}
            hint={HINTS.postcode}
            error={errors.postcode}
          >
            <input
              id={fieldId('postcode')}
              type="text"
              inputMode="numeric"
              value={draft.postcode}
              onChange={(e) => setField('postcode', e.target.value)}
              autoComplete="postal-code"
              maxLength={4}
              disabled={submitting}
              {...ariaFor(fieldId('postcode'), errors.postcode, HINTS.postcode)}
              className={inputClass(Boolean(errors.postcode))}
            />
          </Labelled>
        </div>
      </fieldset>

      <Labelled
        id={fieldId('abn')}
        label={FIELD_LABELS.abn}
        optional
        hint={abnHint ?? ABN_HINT}
        error={abnError}
      >
        <input
          id={fieldId('abn')}
          type="text"
          inputMode="numeric"
          value={draft.abn}
          onChange={(e) => setField('abn', e.target.value)}
          onBlur={() => setAbnTouched(true)}
          disabled={submitting}
          {...ariaFor(fieldId('abn'), abnError, abnHint)}
          className={inputClass(Boolean(abnError))}
        />
      </Labelled>

      <Labelled
        id={fieldId('poNumber')}
        label={FIELD_LABELS.poNumber}
        optional
        hint={HINTS.poNumber}
        error={errors.poNumber}
      >
        <input
          id={fieldId('poNumber')}
          type="text"
          value={draft.poNumber}
          onChange={(e) => setField('poNumber', e.target.value)}
          maxLength={INVOICE_FIELD_LIMITS.poNumber}
          disabled={submitting}
          {...ariaFor(fieldId('poNumber'), errors.poNumber, HINTS.poNumber)}
          className={inputClass(Boolean(errors.poNumber))}
        />
      </Labelled>

      <Labelled
        id={fieldId('note')}
        label={FIELD_LABELS.note}
        optional
        hint={HINTS.note}
        error={errors.note}
      >
        <textarea
          id={fieldId('note')}
          value={draft.note}
          onChange={(e) => setField('note', e.target.value)}
          rows={3}
          disabled={submitting}
          {...ariaFor(fieldId('note'), errors.note, HINTS.note)}
          className={`${inputClass(Boolean(errors.note))} resize-y`}
        />
      </Labelled>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={cancel}
          disabled={submitting}
          className="min-h-11 px-4 py-2.5 rounded-xl text-sm font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-800 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-400 hover:bg-white/5 light:hover:bg-slate-100 transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          {submitting ? 'Sending request…' : `Request an invoice for ${seatsPhrase(seats)}`}
        </button>
      </div>
    </form>
  );

  const renderState = (): React.ReactNode => {
    if (colleague) {
      return (
        <StatusCard
          tone="pending"
          headingId={headingId}
          headingRef={headingRef}
          heading="A request is already waiting for your school"
        >
          <BodyText>
            A request for {seatsPhrase(colleague.seats)} was received on{' '}
            {formatRequestDate(colleague.createdAt) || 'an earlier date'} and is waiting for
            approval. Only the person who raised it can see its billing details. A school can have
            one request waiting at a time, so there is nothing more to send. No invoice has been
            sent yet.
          </BodyText>
        </StatusCard>
      );
    }

    if (!view) {
      return (
        <p
          role="status"
          className="flex items-center gap-2 text-xs font-medium text-[rgb(var(--color-text-muted))]"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          Checking for a request your school has already sent…
        </p>
      );
    }

    if (view.kind === 'pending') {
      const { request } = view;
      return (
        <StatusCard
          tone="pending"
          headingId={headingId}
          headingRef={headingRef}
          heading="Invoice request received"
        >
          <BodyText>
            Received on {formatRequestDate(request.createdAt) || 'the day it was sent'}. We will
            email an invoice to {request.billingEmail} once it is approved, usually within two
            working days.
          </BodyText>
          <RequestDetails request={request} />
        </StatusCard>
      );
    }

    if (view.kind === 'approved') {
      const { request } = view;
      const href = invoiceLinkFor(request.hostedInvoiceUrl);
      const decided = formatRequestDate(request.decidedAt);
      return (
        <StatusCard
          tone="approved"
          headingId={headingId}
          headingRef={headingRef}
          heading={decided ? `Invoice approved on ${decided}` : 'Invoice approved'}
        >
          <BodyText>
            The invoice for {seatsPhrase(request.seats)} was emailed to {request.billingEmail}.
            {href ? '' : ' The link to pay it is not on this page yet, so check that email.'}
          </BodyText>
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center text-xs font-bold text-indigo-500 light:text-indigo-700 underline underline-offset-2"
            >
              View the invoice (opens in a new tab)
            </a>
          )}
          <BodyText>
            Members get School access within five minutes of opening the app. Pay the invoice by the
            due date printed on it.
          </BodyText>
          <RequestDetails request={request} />
        </StatusCard>
      );
    }

    if (view.kind === 'declined') {
      const { request } = view;
      const decided = formatRequestDate(request.decidedAt);
      return (
        <>
          <StatusCard
            tone="declined"
            headingId={headingId}
            headingRef={headingRef}
            heading="This request was not approved"
          >
            <BodyText>
              {decided ? `Decided on ${decided}.` : 'It has been decided.'}
              {request.decisionNote && (
                <>
                  {' '}
                  The administrator’s note:{' '}
                  <span className="font-medium">{request.decisionNote}</span>
                </>
              )}
            </BodyText>
            <BodyText>
              To ask again, check the details below and send the request once more. Nothing has been
              charged.
            </BodyText>
          </StatusCard>
          <div className="mt-4">{renderForm()}</div>
        </>
      );
    }

    if (loadState === 'failed') {
      return (
        <>
          <p className="mb-4 text-xs leading-relaxed text-[rgb(var(--color-text-muted))]">
            We could not check for a request your school has already sent. Send this form, and the
            current request will be shown if one is waiting.
          </p>
          {renderForm()}
        </>
      );
    }

    return renderForm();
  };

  return (
    <div className={className}>
      <p className="text-xs font-medium leading-relaxed text-[rgb(var(--color-text-muted))] light:text-slate-600">
        Invoices and purchase orders are accepted for school licences.
      </p>
      <button
        ref={disclosureRef}
        type="button"
        id={disclosureId}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="mt-1 min-h-11 inline-flex items-center gap-2 text-xs font-bold text-indigo-400 light:text-indigo-600 hover:underline"
      >
        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
        Pay by invoice or purchase order
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {everOpened && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={disclosureId}
          hidden={!open}
          className="mt-3 rounded-2xl border border-indigo-500/20 light:border-indigo-200 bg-[rgb(var(--color-bg-surface))] p-4"
        >
          {renderState()}
        </div>
      )}
    </div>
  );
};

export default InvoiceRequestForm;
