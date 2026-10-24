#!/usr/bin/env node
/**
 * The cost model behind projectDocs/cost-model.md: what an AI call costs, what each
 * plan earns after GST and Stripe, and the margin on each usage profile.
 *
 *   node scripts/costModel.mjs            # the tables, as markdown
 *
 * Every assumption is a named constant below, with where it came from. When a
 * price, the exchange rate or a measured size changes, change it here and re-run;
 * the doc's tables are this script's output.
 */

// ---------------------------------------------------------------------------
// Prices and rates (sources in projectDocs/cost-model.md, checked October 2026)
// ---------------------------------------------------------------------------

/** US dollars per Australian dollar (exchange-rates.org, early October 2026). */
const USD_PER_AUD = 0.694;

/** Gemini standard paid tier, USD per million tokens (ai.google.dev pricing page). */
const MODELS = {
  'gemini-3.1-pro-preview': { input: 2.0, output: 12.0 }, // ≤200k-token prompts
  'gemini-3-flash-preview': { input: 0.5, output: 3.0 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 }, // doubles on 1 January 2027
};

/** Stripe, Australian domestic cards, standard pricing from 1 October 2026. */
const STRIPE_PERCENT = 0.0165;
const STRIPE_FIXED_AUD = 0.3;

/** Consumer prices are taken as GST-inclusive; GST is one eleventh of them. */
const GST_RATE = 0.1;

/** Hosting, USD a month: Vercel Pro (US$20) and Supabase Pro (US$25). */
const FIXED_USD_PER_MONTH = 45;

// ---------------------------------------------------------------------------
// Call sizes, in tokens
// ---------------------------------------------------------------------------

/**
 * Marking: the input is MEASURED. The prompt evaluateAnswer builds was captured for
 * a spread of 169 shipped questions: median 13,100 characters, 90th percentile
 * 15,900. At about 3.8 characters a token that is 3,450 and 4,200 tokens. The
 * output is estimated from the response schema: the feedback JSON is about 650
 * tokens, and the rewrite adds about 350 for a median-length answer. Thinking is
 * capped at 4,096 (the request's thinkingBudget) and billed as output; 2,500 is
 * the central assumption, 1,000 and 4,096 the range.
 */
const MARKING = {
  input: 3450,
  inputHigh: 4200,
  feedbackOutput: 650,
  rewriteOutput: 350,
  thinking: 2500,
  thinkingLow: 1000,
  thinkingHigh: 4096,
};

/** Answer upgrade (improveAnswer): measured median prompt 5,300 characters. Pro thinks by default. */
const UPGRADE = { input: 1400, output: 400, thinking: 1500 };

/** A light call on Flash (an outcome briefing, keywords): estimated. */
const LIGHT = { input: 1500, output: 600, thinking: 500 };

// ---------------------------------------------------------------------------

const audPerUsd = 1 / USD_PER_AUD;
const usd = (model, input, output) =>
  (input * MODELS[model].input + output * MODELS[model].output) / 1e6;
const aud = (usdAmount) => usdAmount * audPerUsd;

const PRO = 'gemini-3.1-pro-preview';
const FLASH = 'gemini-3-flash-preview';

const markingWith = (
  model,
  { rewrite = true, thinking = MARKING.thinking, input = MARKING.input } = {}
) =>
  aud(usd(model, input, MARKING.feedbackOutput + (rewrite ? MARKING.rewriteOutput : 0) + thinking));

export const callCostsAud = {
  markingPaid: markingWith(PRO),
  markingPaidLow: markingWith(PRO, { thinking: MARKING.thinkingLow }),
  markingPaidHigh: markingWith(PRO, { thinking: MARKING.thinkingHigh, input: MARKING.inputHigh }),
  markingFree: markingWith(PRO, { rewrite: false }),
  markingFreeOnFlash: markingWith(FLASH, { rewrite: false }),
  upgrade: aud(usd(PRO, UPGRADE.input, UPGRADE.output + UPGRADE.thinking)),
  light: aud(usd(FLASH, LIGHT.input, LIGHT.output + LIGHT.thinking)),
};

/** What one payment leaves after GST and Stripe, in AUD. */
const netOfPayment = (grossAud, { gstInclusive = true } = {}) => {
  const exGst = gstInclusive ? grossAud / (1 + GST_RATE) : grossAud;
  const charged = gstInclusive ? grossAud : grossAud * (1 + GST_RATE);
  return exGst - (charged * STRIPE_PERCENT + STRIPE_FIXED_AUD);
};

/** Monthly net revenue per subscriber (or per seat), in AUD. */
export const plans = {
  'Plus monthly, A$7.99 (before)': netOfPayment(7.99),
  'Plus yearly, A$59 (before)': netOfPayment(59) / 12,
  'Plus monthly, A$12.99 (now)': netOfPayment(12.99),
  'Plus yearly, A$99 (now)': netOfPayment(99) / 12,
  // A school buys 30 seats in one payment; ex-GST price, GST added on top.
  'School seat, A$4/yr (before)': netOfPayment(4 * 30, { gstInclusive: false }) / 30 / 12,
  'School seat, A$15/yr (now)': netOfPayment(15 * 30, { gstInclusive: false }) / 30 / 12,
};

/** Monthly usage, by count of each kind of call. */
const profiles = {
  free: {
    'Typical active free student': { markingFree: 8, light: 15 },
    'Engaged free student': { markingFree: 30, light: 40 },
    'Free, every allowance used (5 a day, 60 calls)': { markingFree: 150, light: 55 * 30 },
    'Free, every allowance used (3 a day, 30 calls)': { markingFree: 90, light: 27 * 30 },
  },
  plus: {
    'Typical Plus student': { markingPaid: 30, upgrade: 8, light: 50 },
    'Heavy Plus student': { markingPaid: 120, upgrade: 30, light: 150 },
  },
  school: {
    'Typical licensed student': { markingPaid: 4, light: 6 },
    'Active licensed student': { markingPaid: 12, upgrade: 3, light: 20 },
  },
};

const monthlyCost = (usage) =>
  Object.entries(usage).reduce((sum, [kind, count]) => sum + callCostsAud[kind] * count, 0);

const money = (n) => `${n < 0 ? '−' : ''}A$${Math.abs(n).toFixed(2)}`;
const cents = (n) => `A$${n.toFixed(3)}`;

const out = [];
out.push('### Cost of one call\n');
out.push('| Call | Model | Cost (AUD) |');
out.push('| --- | --- | --- |');
out.push(
  `| Marking, paid plan (with rewrite) | Gemini 3.1 Pro | ${cents(callCostsAud.markingPaid)} (range ${cents(callCostsAud.markingPaidLow)} to ${cents(callCostsAud.markingPaidHigh)}) |`
);
out.push(
  `| Marking, free plan (no rewrite) | Gemini 3.1 Pro | ${cents(callCostsAud.markingFree)} |`
);
out.push(
  `| Marking, free plan, if moved to Flash | Gemini 3 Flash | ${cents(callCostsAud.markingFreeOnFlash)} |`
);
out.push(`| Answer upgrade | Gemini 3.1 Pro | ${cents(callCostsAud.upgrade)} |`);
out.push(`| Light call (briefing, keywords) | Gemini 3 Flash | ${cents(callCostsAud.light)} |`);

out.push('\n### Net revenue a month, after GST and Stripe\n');
out.push('| Plan | Net a month |');
out.push('| --- | --- |');
for (const [name, net] of Object.entries(plans)) out.push(`| ${name} | ${money(net)} |`);

out.push('\n### Monthly cost of each usage profile\n');
out.push('| Profile | Usage a month | Cost a month |');
out.push('| --- | --- | --- |');
for (const group of Object.values(profiles)) {
  for (const [name, usage] of Object.entries(group)) {
    const desc = Object.entries(usage)
      .map(
        ([k, v]) =>
          `${v} ${k.startsWith('marking') ? 'markings' : k === 'upgrade' ? 'upgrades' : 'light calls'}`
      )
      .join(', ');
    out.push(`| ${name} | ${desc} | ${money(monthlyCost(usage))} |`);
  }
}

out.push('\n### Margin a month\n');
out.push('| Plan | Typical | Heavy |');
out.push('| --- | --- | --- |');
const pairs = [
  ['Plus monthly, A$7.99 (before)', 'plus'],
  ['Plus yearly, A$59 (before)', 'plus'],
  ['Plus monthly, A$12.99 (now)', 'plus'],
  ['Plus yearly, A$99 (now)', 'plus'],
  ['School seat, A$4/yr (before)', 'school'],
  ['School seat, A$15/yr (now)', 'school'],
];
for (const [plan, group] of pairs) {
  const [typical, heavy] = Object.values(profiles[group]).map(monthlyCost);
  const net = plans[plan];
  const pct = (m) => `${Math.round((m / net) * 100)}%`;
  out.push(
    `| ${plan} | ${money(net - typical)} (${pct(net - typical)}) | ${money(net - heavy)} (${pct(net - heavy)}) |`
  );
}

// A population, not one student: most subscribers are typical, a few are heavy.
const MIX_HEAVY_SHARE = 0.2;
out.push(`\n### Margin across a population (${Math.round(MIX_HEAVY_SHARE * 100)}% heavy users)\n`);
out.push('| Plan | Margin a month |');
out.push('| --- | --- |');
for (const [plan, group] of pairs) {
  const [typical, heavy] = Object.values(profiles[group]).map(monthlyCost);
  const mixed = plans[plan] - ((1 - MIX_HEAVY_SHARE) * typical + MIX_HEAVY_SHARE * heavy);
  out.push(`| ${plan} | ${money(mixed)} (${Math.round((mixed / plans[plan]) * 100)}%) |`);
}

out.push('\n### What the free tier costs per conversion\n');
const freeTypical = monthlyCost(profiles.free['Typical active free student']);
const freeTypicalFlash =
  profiles.free['Typical active free student'].markingFree * callCostsAud.markingFreeOnFlash +
  profiles.free['Typical active free student'].light * callCostsAud.light;
const plusMargin =
  plans['Plus monthly, A$12.99 (now)'] - monthlyCost(profiles.plus['Typical Plus student']);
out.push(
  `- A typical active free student costs ${money(freeTypical)} a month on Gemini 3.1 Pro, ` +
    `${money(freeTypicalFlash)} if free marking moved to Gemini 3 Flash.`
);
out.push(
  `- Free costs are covered when ${((freeTypical / plusMargin) * 100).toFixed(1)}% of active free ` +
    `students convert to monthly Plus (${((freeTypicalFlash / plusMargin) * 100).toFixed(1)}% with Flash marking).`
);

const perMarkingSession = callCostsAud.markingPaid + 2 * callCostsAud.light;
out.push('\n### Break-even\n');
for (const plan of Object.keys(plans).filter((p) => p.startsWith('Plus'))) {
  out.push(
    `- ${plan}: ${Math.floor(plans[plan] / perMarkingSession)} markings a month (each with two light calls).`
  );
}
const fixedAud = aud(FIXED_USD_PER_MONTH);
out.push(
  `- Hosting, ${money(fixedAud)} a month, is covered by ${Math.ceil(fixedAud / (plans['Plus monthly, A$12.99 (now)'] - monthlyCost(profiles.plus['Typical Plus student'])))} typical Plus subscribers at the monthly price.`
);

console.log(out.join('\n'));
