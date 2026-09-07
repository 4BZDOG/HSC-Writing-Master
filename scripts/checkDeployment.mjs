/**
 * Deployment preflight — catches the configuration mistakes that this app
 * fails *quietly* on.
 *
 * Run: npm run check:deploy                      (audit the local config)
 *      npm run check:deploy -- --url https://…   (also probe a live deployment)
 *
 * Why this exists. Almost every variable here is optional, and the app is
 * deliberately built to keep working when one is missing — that is what makes
 * mock mode and offline hosting possible. The cost of that design is that a
 * half-finished configuration does not announce itself: it deploys green,
 * serves a working-looking UI, and is wrong in a way you only discover from a
 * provider bill, a privacy incident, or a student who cannot sign in. The
 * three that actually hurt:
 *
 *   1. `VITE_SUPABASE_*` set, `SUPABASE_*` not. Real logins in the UI, and an
 *      AI proxy with no auth gate behind them. In production the proxy detects
 *      this and returns 503 (api/_lib/auth.ts), so the symptom is "AI is
 *      broken for everyone" rather than a silent hole — but it is still a
 *      deployment that cannot mark a single answer.
 *   2. A `VITE_` half set without its unprefixed twin (plan overrides, the
 *      monetisation switch, Stripe price ids, free-tier feedback). The UI and
 *      the server then disagree about what is unlocked, in whichever direction
 *      the mismatch runs.
 *   3. `.env.example` copied wholesale to `.env.local`. Its placeholders are
 *      not empty — `VITE_SUPABASE_URL=https://your-project.supabase.co` is a
 *      truthy value, so `isSupabaseConfigured` turns true and the app tries to
 *      authenticate against a project that does not exist.
 *
 * The checks are ordered by what they protect: money and student data first,
 * then things that merely break a feature.
 *
 * ADVISORY, not a gate. It reads configuration, not behaviour, so a clean run
 * means "nothing is obviously contradictory", not "the deployment works". The
 * `--url` probes are the half that talks to the real thing; DEPLOYMENT.md's
 * pre-flight checklist is still the list to work through before going live.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};

if (flag('--help') || flag('-h')) {
  console.log(
    `Deployment preflight for the HSC AI Evaluator.

  node scripts/checkDeployment.mjs [options]

  --env-file <path>  Also read variables from this dotenv file
                     (default: .env.local, then .env, if either exists)
  --no-env-file      Audit process.env only
  --url <origin>     Probe a live deployment as well, e.g.
                     --url https://your-app.vercel.app
  --json             Emit findings as JSON
  --help             This text

Exit code is 1 if any error-level finding is reported, 0 otherwise.`
  );
  process.exit(0);
}

const asJson = flag('--json');
const probeUrl = value('--url');

// ---------------------------------------------------------------------------
// Environment assembly
// ---------------------------------------------------------------------------

/**
 * Minimal dotenv reader. Deliberately not a dependency: this script must run
 * before `npm install` has necessarily been useful, and the format we need is
 * the one `.env.example` already uses — `KEY=value`, `#` comments, optional
 * surrounding quotes. Anything fancier (multi-line values, interpolation) is
 * not used by this project's env files.
 */
const parseDotenv = (text) => {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length > 1) ||
      (val.startsWith("'") && val.endsWith("'") && val.length > 1)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
};

const envFileCandidates = () => {
  const explicit = value('--env-file');
  if (explicit) return [explicit];
  return ['.env.local', '.env'];
};

const loadedFiles = [];
let fileEnv = {};
if (!flag('--no-env-file')) {
  for (const candidate of envFileCandidates()) {
    const path = resolve(ROOT, candidate);
    if (!existsSync(path)) continue;
    fileEnv = { ...parseDotenv(readFileSync(path, 'utf8')), ...fileEnv };
    loadedFiles.push(candidate);
  }
}

// A real environment variable beats a file, matching how a hosting provider
// injects its project settings over anything checked into the repo.
const env = { ...fileEnv, ...process.env };

const get = (name) => {
  const raw = env[name];
  if (raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  return trimmed === '' ? undefined : trimmed;
};
const isSet = (name) => get(name) !== undefined;

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

const findings = [];
/** Something that will cost money, leak data, or break the deployment. */
const error = (check, message, fix) => findings.push({ level: 'error', check, message, fix });
/** Something legitimate in some deployments and a mistake in most. */
const warn = (check, message, fix) => findings.push({ level: 'warn', check, message, fix });
/** A fact worth stating so the operator can confirm it is what they intended. */
const info = (check, message) => findings.push({ level: 'info', check, message });

// ---------------------------------------------------------------------------
// 0. Toolchain
// ---------------------------------------------------------------------------

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (Number.isFinite(nodeMajor) && nodeMajor < 20) {
  error(
    'node-version',
    `Node ${process.versions.node} is too old — the build, the workflows and Vercel all run Node 20+.`,
    'Install Node 20 or newer (nvm: `nvm use 20`).'
  );
}

// ---------------------------------------------------------------------------
// 1. Placeholders — the `cp .env.example .env.local` trap
// ---------------------------------------------------------------------------

/**
 * `.env.example` ships illustrative values rather than blanks, because a blank
 * teaches you nothing about the shape of the thing you have to paste in. That
 * is the right call for a template and the wrong one for a live config: every
 * one of these strings is truthy, and truthy is all the app checks.
 */
const PLACEHOLDER_PATTERNS = [
  /your_.*_here$/i,
  /^https:\/\/your-project\.supabase\.co$/i,
  /^price_your_/i,
  /^sk_test_your_/i,
  /^whsec_your_/i,
  /^https:\/\/your-sentry-dsn@/i,
  /^https:\/\/your-app\.vercel\.app$/i,
  /^your_/i,
];

const looksLikePlaceholder = (val) => PLACEHOLDER_PATTERNS.some((re) => re.test(val));

const placeholders = Object.keys(env)
  .filter((key) =>
    /^(VITE_|GEMINI_|ANTHROPIC_|OPENROUTER_|GROQ_|KIMI_|SUPABASE_|STRIPE_)/.test(key)
  )
  .filter((key) => {
    const val = get(key);
    return val !== undefined && looksLikePlaceholder(val);
  });

if (placeholders.length > 0) {
  error(
    'placeholder-values',
    `Template placeholder values are still in place: ${placeholders.join(', ')}.`,
    'Fill in the real value, or comment the line out entirely. A placeholder is ' +
      'not the same as unset — the app treats any non-empty value as configured, ' +
      'so a placeholder Supabase URL produces a deployment that tries to log in ' +
      'against a project that does not exist.'
  );
}

// ---------------------------------------------------------------------------
// 2. Provider keys — never in the bundle
// ---------------------------------------------------------------------------

const PROVIDER_KEYS = [
  'GEMINI_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'KIMI_API_KEY',
  'API_KEY',
];

/**
 * Anything `VITE_`-prefixed is compiled into public JavaScript. A provider key
 * there is not "less secure", it is published — served to every visitor at a
 * URL, and scrapeable. There is no configuration in which this is intended, so
 * it is an error rather than a warning.
 */
const leakedKeys = Object.keys(env).filter(
  (key) =>
    key.startsWith('VITE_') && /(_API_KEY|_SECRET|SECRET_KEY|SERVICE_ROLE)/.test(key) && isSet(key)
);
if (leakedKeys.length > 0) {
  error(
    'key-in-bundle',
    `Secret-shaped variables carry a VITE_ prefix and would be published in the client bundle: ${leakedKeys.join(', ')}.`,
    'Remove the VITE_ prefix — the AI proxy and the billing routes read the ' +
      'unprefixed names server-side. If one of these keys has ever been built ' +
      'and deployed, rotate it.'
  );
}

const configuredProviders = PROVIDER_KEYS.filter((key) => isSet(key));
if (configuredProviders.length === 0) {
  warn(
    'no-provider-key',
    'No AI provider key is set (GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, KIMI_API_KEY).',
    'Set at least GEMINI_API_KEY on the API host. Without one the app still ' +
      'runs — curriculum, writing, drafts — but every AI call fails. That is a ' +
      'legitimate configuration for a GitHub Pages build, and a mistake anywhere else.'
  );
} else {
  info('provider-keys', `AI provider keys set: ${configuredProviders.join(', ')}.`);
}

// ---------------------------------------------------------------------------
// 3. Supabase — the four-or-none rule
// ---------------------------------------------------------------------------

const clientSupabase = isSet('VITE_SUPABASE_URL') && isSet('VITE_SUPABASE_ANON_KEY');
const serverSupabase = isSet('SUPABASE_URL') && isSet('SUPABASE_ANON_KEY');

if (isSet('VITE_SUPABASE_URL') !== isSet('VITE_SUPABASE_ANON_KEY')) {
  error(
    'supabase-client-pair',
    'Only one of VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY is set.',
    'Set both, or neither. One alone leaves the client unable to build a Supabase client at all.'
  );
}
if (isSet('SUPABASE_URL') !== isSet('SUPABASE_ANON_KEY')) {
  error(
    'supabase-server-pair',
    'Only one of SUPABASE_URL / SUPABASE_ANON_KEY is set.',
    'Set both, or neither — api/_lib/auth.ts enables the gate only when it has both.'
  );
}

if (clientSupabase && !serverSupabase) {
  error(
    'supabase-half-configured',
    'Client-side Supabase is configured but the server-side pair (SUPABASE_URL / SUPABASE_ANON_KEY) is not.',
    'Set SUPABASE_URL and SUPABASE_ANON_KEY to the SAME two values on the API ' +
      'host. They are not duplicates of the VITE_ pair: they are the only ' +
      'variables the proxy auth gate reads. Until they are set, a production ' +
      'deployment answers every AI call with 503.'
  );
}

if (serverSupabase && !clientSupabase) {
  warn(
    'supabase-server-only',
    'Server-side Supabase is configured but the client-side pair is not.',
    'The UI will run in offline mock mode while the proxy demands a Supabase ' +
      'bearer token that mock mode cannot produce, so every AI call gets a 401. ' +
      'Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY too.'
  );
}

if (clientSupabase && serverSupabase) {
  if (get('VITE_SUPABASE_URL') !== get('SUPABASE_URL')) {
    error(
      'supabase-url-mismatch',
      'VITE_SUPABASE_URL and SUPABASE_URL point at different projects.',
      'The gate verifies tokens against SUPABASE_URL while the browser signs in ' +
        'against VITE_SUPABASE_URL, so every session it issues will be rejected. Use one project.'
    );
  }
  if (get('VITE_SUPABASE_ANON_KEY') !== get('SUPABASE_ANON_KEY')) {
    warn(
      'supabase-key-mismatch',
      'VITE_SUPABASE_ANON_KEY and SUPABASE_ANON_KEY differ.',
      'They should be the same anon key. A mismatch is usually a paste error, ' +
        'and a service-role key pasted into either is a serious one — the anon key is the right value for both.'
    );
  }
  if (
    get('SUPABASE_ANON_KEY') === get('SUPABASE_SERVICE_ROLE_KEY') &&
    isSet('SUPABASE_SERVICE_ROLE_KEY')
  ) {
    error(
      'service-role-as-anon',
      'SUPABASE_ANON_KEY holds the same value as SUPABASE_SERVICE_ROLE_KEY.',
      'The service-role key bypasses Row-Level Security. It belongs only to the ' +
        'Stripe webhook handler and the seed scripts. Put the anon key in SUPABASE_ANON_KEY and rotate the service-role key.'
    );
  }
}

if (!clientSupabase && !serverSupabase) {
  warn(
    'supabase-absent',
    'No Supabase configured — the app runs in single-user mock mode and /api/gemini is OPEN.',
    'Fine for local development and a private demo. Before any public URL, ' +
      'configure Supabase (projectDocs/SUPABASE_SETUP.md): without it, anyone ' +
      'who finds the endpoint can spend the provider budget, and no quota or ' +
      'free-tier meter is enforced.'
  );
}

// ---------------------------------------------------------------------------
// 4. Who can get an account
// ---------------------------------------------------------------------------

if (clientSupabase) {
  const signupOff = get('VITE_ENABLE_SIGNUP') === 'false';
  const domains = get('VITE_ALLOWED_EMAIL_DOMAINS') ?? get('VITE_SIGNUP_ALLOWED_DOMAINS');
  if (!domains && !signupOff) {
    warn(
      'unrestricted-accounts',
      'Anyone can create an account: VITE_ALLOWED_EMAIL_DOMAINS is unset and self-registration is on.',
      'A new account is a student with a 60-call daily AI budget charged to ' +
        'your provider key. Set VITE_ALLOWED_EMAIL_DOMAINS to your school domain ' +
        '(it governs SSO as well as sign-up), and/or VITE_ENABLE_SIGNUP=false. ' +
        'With Entra, also pin the app registration to a single tenant.'
    );
  }
  const providers = get('VITE_OAUTH_PROVIDERS');
  if (providers) {
    const known = new Set(['google', 'azure', 'github', 'none']);
    const unknown = providers
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter((p) => p && !known.has(p));
    if (unknown.length > 0) {
      error(
        'oauth-provider-unknown',
        `VITE_OAUTH_PROVIDERS lists values the login page does not recognise: ${unknown.join(', ')}.`,
        'Valid values are google, azure, github — or none to hide the section.'
      );
    }
  } else {
    info(
      'oauth-providers',
      'VITE_OAUTH_PROVIDERS is unset, so all three SSO buttons are drawn. Each one ' +
        'fails on click unless that provider is enabled in the Supabase dashboard.'
    );
  }
}

if (get('VITE_ENABLE_DEMO_AUTH') === 'true') {
  if (clientSupabase) {
    error(
      'demo-auth-with-supabase',
      'VITE_ENABLE_DEMO_AUTH=true alongside a configured Supabase project.',
      'This ships a working admin/admin login next to your real accounts. ' +
        'Unset it on any deployment that has Supabase — the Pages workflow sets it ' +
        'for itself, so it does not need to be set in a hosting dashboard.'
    );
  } else {
    warn(
      'demo-auth-public',
      'VITE_ENABLE_DEMO_AUTH=true — the demo accounts (admin/admin, teacher/teacher, user/user) work in this build.',
      'Intended for the offline GitHub Pages demo. Anyone with the URL gets an ' +
        'admin session, so do not set it on a deployment holding real content.'
    );
  }
}

// ---------------------------------------------------------------------------
// 5. Paired client/server policy variables
// ---------------------------------------------------------------------------

/**
 * Each of these exists twice by design: the `VITE_` copy decides what the UI
 * locks, the unprefixed copy decides what the API refuses. Setting one is
 * worse than setting neither — it produces a deployment whose buttons and
 * whose server disagree, in whichever direction the operator got wrong.
 */
const PAIRED = [
  ['VITE_MONETISATION_ENABLED', 'MONETISATION_ENABLED', 'the paywall master switch'],
  ['VITE_PLAN_FEATURE_OVERRIDES', 'PLAN_FEATURE_OVERRIDES', 'the plan policy override'],
  [
    'VITE_FREE_TIER_FULL_FEEDBACK',
    'FREE_TIER_FULL_FEEDBACK',
    'the free-tier full-feedback setting',
  ],
  [
    'VITE_STRIPE_PLUS_MONTHLY_PRICE_ID',
    'STRIPE_PLUS_MONTHLY_PRICE_ID',
    'the Plus monthly price id',
  ],
  ['VITE_STRIPE_PLUS_YEARLY_PRICE_ID', 'STRIPE_PLUS_YEARLY_PRICE_ID', 'the Plus yearly price id'],
  ['VITE_STRIPE_SCHOOL_PRICE_ID', 'STRIPE_SCHOOL_PRICE_ID', 'the school seat price id'],
];

for (const [clientName, serverName, description] of PAIRED) {
  const client = get(clientName);
  const server = get(serverName);
  if (client === undefined && server === undefined) continue;
  if (client === undefined || server === undefined) {
    const missing = client === undefined ? clientName : serverName;
    const present = client === undefined ? serverName : clientName;
    error(
      'paired-variable-missing',
      `${present} is set but ${missing} is not — ${description} is half configured.`,
      `Set ${missing} to the same value. The VITE_ copy drives what the UI ` +
        'locks and the unprefixed copy drives what the server enforces; one ' +
        'without the other shows locks nothing backs, or offers calls the API refuses.'
    );
  } else if (client !== server) {
    error(
      'paired-variable-mismatch',
      `${clientName} and ${serverName} hold different values — ${description} disagrees between the UI and the server.`,
      'Set both to the same value.'
    );
  }
}

const FEATURES = new Set([
  'pdfExport',
  'answerUpgrades',
  'aiContentStudio',
  'advancedQuestions',
  'fullFeedback',
  'sampleAnswers',
  'examMode',
]);
const PLANS = new Set(['free', 'plus', 'school']);

for (const name of ['PLAN_FEATURE_OVERRIDES', 'VITE_PLAN_FEATURE_OVERRIDES']) {
  const raw = get(name);
  if (!raw) continue;
  for (const entry of raw
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean)) {
    const [feature, plan] = entry.split(':').map((p) => p?.trim());
    if (!FEATURES.has(feature) || !PLANS.has(plan)) {
      // The policy parser ignores unrecognised entries and logs — so a typo
      // silently leaves the shipped default in place rather than failing.
      // That is the right runtime behaviour and exactly why it needs saying here.
      warn(
        'plan-override-unrecognised',
        `${name} contains "${entry}", which the policy parser will ignore.`,
        `Use feature:plan, where feature is one of ${[...FEATURES].join(', ')} ` +
          `and plan is one of ${[...PLANS].join(', ')}. An ignored entry falls ` +
          'back to the shipped default, so the gate you meant to change stays as it was.'
      );
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Stripe
// ---------------------------------------------------------------------------

if (isSet('STRIPE_SECRET_KEY')) {
  if (!isSet('STRIPE_WEBHOOK_SECRET')) {
    error(
      'stripe-webhook-secret',
      'STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is not.',
      'An unsigned webhook endpoint lets anyone forge a subscription event and ' +
        'grant themselves a paid plan. In production the handler treats this as a hard failure.'
    );
  }
  if (!isSet('SUPABASE_SERVICE_ROLE_KEY')) {
    error(
      'stripe-service-role',
      'STRIPE_SECRET_KEY is set but SUPABASE_SERVICE_ROLE_KEY is not.',
      'The webhook writes subscription state past Row-Level Security. Without ' +
        'it a payment succeeds and the plan never changes.'
    );
  }
  const anyPrice = [
    'STRIPE_PLUS_MONTHLY_PRICE_ID',
    'STRIPE_PLUS_YEARLY_PRICE_ID',
    'STRIPE_SCHOOL_PRICE_ID',
  ].some((n) => isSet(n));
  if (!anyPrice) {
    warn(
      'stripe-no-prices',
      'STRIPE_SECRET_KEY is set but no STRIPE_*_PRICE_ID is.',
      'The upgrade modal will report "No plans are available for purchase yet."'
    );
  }
  const live = get('STRIPE_SECRET_KEY').startsWith('sk_live_');
  if (live && !serverSupabase) {
    error(
      'stripe-live-without-auth',
      'A LIVE Stripe key is set on a deployment with no server-side Supabase.',
      'There is no identity to attach a subscription to: checkout and the ' +
        'customer portal return 401. Configure Supabase before selling anything.'
    );
  }
  info('stripe-mode', live ? 'Stripe is in LIVE mode.' : 'Stripe is in test mode (sk_test_).');
}

if (!isSet('STRIPE_SECRET_KEY')) {
  const clientPrices = [
    'VITE_STRIPE_PLUS_MONTHLY_PRICE_ID',
    'VITE_STRIPE_PLUS_YEARLY_PRICE_ID',
    'VITE_STRIPE_SCHOOL_PRICE_ID',
  ].filter((n) => isSet(n));
  if (clientPrices.length > 0) {
    warn(
      'stripe-prices-without-key',
      `Price ids are set (${clientPrices.join(', ')}) but STRIPE_SECRET_KEY is not.`,
      'Checkout returns a mock URL, so the upgrade button appears to do nothing. ' +
        'Set the secret key, or clear the price ids to hide the button.'
    );
  }
}

// ---------------------------------------------------------------------------
// 7. Hosting shape
// ---------------------------------------------------------------------------

const basePath = get('DEPLOY_BASE_PATH');
if (basePath && !(basePath.startsWith('/') && basePath.endsWith('/'))) {
  error(
    'base-path-shape',
    `DEPLOY_BASE_PATH is "${basePath}" — it must start and end with "/".`,
    'e.g. /HSC-Writing-Master/. Vite emits every asset URL from this value, so a ' +
      'malformed path produces a page that loads nothing.'
  );
}

const staticHosting = get('VITE_STATIC_HOSTING') === 'true';
const apiBase = get('VITE_API_BASE_URL');

if (staticHosting && apiBase) {
  error(
    'static-hosting-with-api',
    'VITE_STATIC_HOSTING=true and VITE_API_BASE_URL is set — the client will not call the proxy it has been given.',
    'VITE_STATIC_HOSTING declares "there is no proxy to call" and disables every ' +
      'AI feature. Set it to false (or leave it unset) when an API origin is configured.'
  );
} else if (staticHosting) {
  info(
    'static-hosting',
    'VITE_STATIC_HOSTING=true — this build declares itself static, so AI features ' +
      'are switched off client-side rather than failing per call. Correct for a ' +
      'GitHub Pages build with no API host; wrong anywhere the proxy exists.'
  );
}

if (apiBase) {
  if (!/^https?:\/\//.test(apiBase)) {
    error(
      'api-base-shape',
      `VITE_API_BASE_URL is "${apiBase}" — it must be an absolute origin.`,
      'e.g. https://your-app.vercel.app, with no trailing path.'
    );
  }
  info(
    'split-hosting',
    `The frontend calls its AI proxy at ${apiBase}. That origin must set ` +
      "ALLOWED_ORIGIN to this frontend's origin, or the browser's CORS preflight is refused."
  );
}

const allowedOrigin = get('ALLOWED_ORIGIN');
if (allowedOrigin) {
  if (allowedOrigin.includes('*')) {
    error(
      'allowed-origin-wildcard',
      'ALLOWED_ORIGIN contains a wildcard, which api/_lib/cors.ts rejects.',
      'List each exact origin, comma-separated: https://owner.github.io,https://example.com'
    );
  }
  for (const origin of allowedOrigin
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)) {
    if (!/^https?:\/\/[^/]+$/.test(origin)) {
      error(
        'allowed-origin-shape',
        `ALLOWED_ORIGIN entry "${origin}" is not a bare origin.`,
        'An origin is scheme + host (+ port) with no path and no trailing slash — ' +
          'that is exactly what the browser sends in the Origin header, and it is compared literally.'
      );
    }
  }
}

if (get('BUILD_SOURCEMAPS') === 'true') {
  warn(
    'sourcemaps-published',
    'BUILD_SOURCEMAPS=true — the build will write dist/assets/*.js.map.',
    'Every deploy path publishes dist/ wholesale, and `sourcemap: "hidden"` only ' +
      'hides the pointer, not the file. Upload the maps to your error tracker, ' +
      'then delete dist/assets/*.map before deploying.'
  );
}

// ---------------------------------------------------------------------------
// 8. Live probes (--url)
// ---------------------------------------------------------------------------

/**
 * The configuration audit above can only see what it was given. These probes
 * ask the deployed thing itself, which is the only way to catch the mistakes
 * that live between a correct env var and a wrong deployment: the variable set
 * on Preview but not Production, the redeploy that never happened after the
 * variable changed, the base path that broke every asset URL.
 */
const probe = async (origin) => {
  const base = origin.replace(/\/+$/, '');

  const fetchSafe = async (url, init) => {
    try {
      return { res: await fetch(url, init) };
    } catch (e) {
      return { networkError: e instanceof Error ? e.message : String(e) };
    }
  };

  // 8a. Does the site load at all?
  const index = await fetchSafe(base + '/', { redirect: 'follow' });
  if (index.networkError) {
    error('probe-unreachable', `${base}/ could not be reached: ${index.networkError}`);
    return;
  }
  if (!index.res.ok) {
    error('probe-index', `${base}/ returned ${index.res.status}.`);
    return;
  }
  const html = await index.res.text();
  info('probe-index', `${base}/ responds ${index.res.status}.`);

  // 8b. Do the assets the page names actually resolve? This is how a wrong
  // DEPLOY_BASE_PATH shows up: the HTML is served fine and every script 404s,
  // which in a browser is a blank page with no error the operator can read.
  const assetPaths = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]);
  const firstAsset = assetPaths.find((p) => p.includes('assets/'));
  if (firstAsset) {
    const assetUrl = firstAsset.startsWith('http')
      ? firstAsset
      : base + (firstAsset.startsWith('/') ? '' : '/') + firstAsset;
    const asset = await fetchSafe(assetUrl);
    if (asset.networkError || !asset.res.ok) {
      error(
        'probe-assets',
        `The page references ${firstAsset}, which does not resolve (${asset.networkError ?? asset.res.status}).`,
        'Usually a base-path mistake: DEPLOY_BASE_PATH must be "/<repo>/" on ' +
          'GitHub Pages and unset for root hosting. The symptom in a browser is a blank page.'
      );
    } else {
      info('probe-assets', `Bundled assets resolve (checked ${firstAsset}).`);
    }
  } else {
    warn('probe-assets', 'No bundled asset URL found in the served HTML to check.');
  }

  // 8c. Is the curriculum library shipped? Its absence is a working app with
  // an empty library — easy to mistake for a data problem.
  const manifestUrl = base + '/courseData/manifest.json';
  const manifest = await fetchSafe(manifestUrl);
  if (manifest.networkError || !manifest.res.ok) {
    warn(
      'probe-course-data',
      `${manifestUrl} returned ${manifest.networkError ?? manifest.res.status}.`,
      'The bundled curriculum lives in public/courseData/. On a sub-path host it ' +
        'is served under that path — pass --url including the base path, e.g. ' +
        'https://owner.github.io/repo.'
    );
  } else {
    info('probe-course-data', 'The bundled curriculum manifest is served.');
  }

  // 8d. The one that matters: is the AI proxy closed?
  const proxyOrigin = apiBase ?? base;
  const proxyUrl = proxyOrigin.replace(/\/+$/, '') + '/api/gemini';
  const proxy = await fetchSafe(proxyUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (proxy.networkError) {
    error('probe-proxy', `${proxyUrl} could not be reached: ${proxy.networkError}`);
  } else {
    const status = proxy.res.status;
    if (status === 401) {
      info(
        'probe-proxy',
        `${proxyUrl} answered 401 to an unauthenticated call — the auth gate is on and refusing.`
      );
    } else if (status === 503) {
      error(
        'probe-proxy',
        `${proxyUrl} answered 503 — the deployment is half configured.`,
        'It has VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY but not SUPABASE_URL / ' +
          'SUPABASE_ANON_KEY. Set the server-side pair and redeploy. No AI call ' +
          'can succeed until you do.'
      );
    } else if (status === 404) {
      warn(
        'probe-proxy',
        `${proxyUrl} answered 404 — there is no serverless proxy at this origin.`,
        'Expected on GitHub Pages or Netlify. Pair the site with a Vercel API ' +
          '(VITE_API_BASE_URL at build time, ALLOWED_ORIGIN on the Vercel side), ' +
          'or accept that AI features are unavailable.'
      );
    } else if (status === 405) {
      warn('probe-proxy', `${proxyUrl} answered 405 to a POST, which is unexpected.`);
    } else {
      error(
        'probe-proxy',
        `${proxyUrl} answered ${status} to an UNAUTHENTICATED call — the endpoint is open to the internet.`,
        'Anyone who finds this URL can spend your AI budget, and no quota or ' +
          'free-tier meter is enforced. Configure Supabase on both sides ' +
          '(projectDocs/SUPABASE_SETUP.md) and redeploy.'
      );
    }
  }

  // 8e. CORS posture, but only where it is load-bearing.
  if (apiBase) {
    const preflight = await fetchSafe(proxyUrl, {
      method: 'OPTIONS',
      headers: {
        origin: base,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    if (!preflight.networkError) {
      const allow = preflight.res.headers.get('access-control-allow-origin');
      if (preflight.res.status === 403 || !allow) {
        error(
          'probe-cors',
          `The proxy refuses cross-origin calls from ${base} (preflight ${preflight.res.status}).`,
          `Set ALLOWED_ORIGIN=${base} on the API host and redeploy it.`
        );
      } else {
        info('probe-cors', `The proxy allows cross-origin calls from ${allow}.`);
      }
    }
  }
};

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const main = async () => {
  if (probeUrl) await probe(probeUrl);

  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');

  if (asJson) {
    console.log(JSON.stringify({ envFiles: loadedFiles, findings }, null, 2));
    process.exit(errors.length > 0 ? 1 : 0);
  }

  const ICON = { error: '✗', warn: '!', info: '·' };
  console.log('\nDeployment preflight — HSC AI Evaluator\n');
  console.log(
    loadedFiles.length > 0
      ? `Config read from process environment + ${loadedFiles.join(', ')}\n`
      : 'Config read from the process environment only ' +
          '(no .env.local — pass --env-file to point at one)\n'
  );

  for (const level of ['error', 'warn', 'info']) {
    for (const f of findings.filter((x) => x.level === level)) {
      console.log(`${ICON[level]} [${f.check}] ${f.message}`);
      if (f.fix) console.log(`  → ${f.fix}\n`);
    }
  }

  console.log(
    `\n${errors.length} error(s), ${warnings.length} warning(s).` +
      (probeUrl ? '' : '\nAdd --url https://<your-deployment> to probe a live deployment as well.')
  );

  if (errors.length > 0) {
    console.log('\nSee DEPLOYMENT.md for what each of these means in context.');
    process.exit(1);
  }
  process.exit(0);
};

await main();
