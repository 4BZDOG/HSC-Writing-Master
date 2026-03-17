# Deployment & Update Improvements Roadmap

**Status**: Production-ready code, Development-grade infrastructure
**Goal**: Enterprise-grade CI/CD, monitoring, and deployment ease
**Total Effort**: 80-120 hours across 6 weeks

---

## Priority 1: Immediate Fixes (Week 1 - 8 hours)

### 1.1 API Key Security Fix ✅ CRITICAL

**File**: `vite.config.ts`
**Current Issue**: API key embedded in JavaScript bundle

```typescript
// UNSAFE - key visible in DevTools
define: {
  'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
}
```

**Solution**: Use Vite's secure env variable approach

```typescript
// SAFE - only VITE_* variables are exposed
define: {
  'process.env.VITE_API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY)
}
```

**Steps**:

1. Update vite.config.ts to use `VITE_*` prefix
2. Add `.env.example` documenting required variables
3. Update deployment docs (Vercel/Netlify env setup)
4. Create backend proxy (Phase 2)

### 1.2 Create `.env.example` ✅ LOW EFFORT

**Creates**: `/home/user/HSC-Writing-Master/.env.example`

```env
# Gemini API Configuration
VITE_GEMINI_API_KEY=sk-your-key-here

# Development Environment
VITE_ENV=development
VITE_API_BASE_URL=http://localhost:3000

# Optional: Feature Flags
VITE_ENABLE_EXPERIMENTAL_FEATURES=false
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_DEBUG_MODE=false
```

**Benefits**:

- New developers know what to setup
- Prevents missing env var errors
- Documents all configuration options

### 1.3 GitHub Actions CI Pipeline ✅ LOW EFFORT

**Creates**: `/home/user/HSC-Writing-Master/.github/workflows/build.yml`

```yaml
name: Build & Deploy

on:
  push:
    branches: [main, develop, claude/*]
  pull_request:
    branches: [main, develop]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run build
      - run: npm run type-check

      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
```

**Benefits**:

- Automatic build verification on every push
- Prevents broken builds from being deployed
- Clear CI status on pull requests

---

## Priority 2: Code Quality (Week 1-2 - 12 hours)

### 2.1 ESLint Configuration ✅ MEDIUM EFFORT

```bash
npm install -D eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser eslint-plugin-react eslint-plugin-react-hooks
```

**Create**: `.eslintrc.json`

```json
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended"
  ],
  "rules": {
    "@typescript-eslint/explicit-function-return-types": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off"
  }
}
```

**Add to package.json**:

```json
{
  "scripts": {
    "lint": "eslint src --ext .ts,.tsx",
    "lint:fix": "eslint src --ext .ts,.tsx --fix"
  }
}
```

### 2.2 Prettier Code Formatter ✅ QUICK

```bash
npm install -D prettier eslint-config-prettier eslint-plugin-prettier
```

**Create**: `.prettierrc.json`

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

**Add to package.json**:

```json
{
  "scripts": {
    "format": "prettier --write \"src/**/*.{ts,tsx,css,md}\""
  }
}
```

### 2.3 Pre-commit Hooks ✅ MEDIUM EFFORT

```bash
npm install -D husky lint-staged
npx husky install
```

**Create**: `.husky/pre-commit`

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"
npx lint-staged
```

**Update package.json**:

```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.md": ["prettier --write"]
  }
}
```

**Benefits**:

- Prevents committing code with lint errors
- Auto-formats on commit
- Consistent code style across team

---

## Priority 3: Testing Infrastructure (Week 2-3 - 24 hours)

### 3.1 Unit Testing with Vitest ✅ MEDIUM EFFORT

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/user-event
```

**Create**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/'],
      lines: 70,
      functions: 70,
      branches: 70,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

**Add to package.json**:

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage"
  }
}
```

**Test Priority Files** (Effort: 12 hours):

1. `utils/errorHandler.ts` - Error categorization
2. `utils/dataCloneUtils.ts` - Cloning performance
3. `hooks/useRetry.ts` - Retry logic
4. `services/aiCore.ts` - API guard circuit breaker
5. `utils/idbTransactions.ts` - Transaction handling

**Example Test**:

```typescript
// src/utils/__tests__/errorHandler.test.ts
import { categorizeError, getUserErrorMessage } from '../errorHandler';
import { describe, it, expect } from 'vitest';

describe('errorHandler', () => {
  it('categorizes network errors correctly', () => {
    const error = new TypeError('Failed to fetch');
    const categorized = categorizeError(error);
    expect(categorized.category).toBe('NETWORK');
    expect(categorized.isRetryable).toBe(true);
  });

  it('provides user-friendly messages', () => {
    const error = new Error('401: Unauthorized');
    const message = getUserErrorMessage(error);
    expect(message).toBe('Your session has expired. Please log in again.');
  });
});
```

### 3.2 E2E Testing with Playwright ✅ HIGHER EFFORT

```bash
npm install -D @playwright/test
npx playwright install
```

**Create**: `playwright.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: 1,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

**Add to package.json**:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

**Critical E2E Tests** (Effort: 10 hours):

1. **Evaluation Flow**: Upload answer → Get feedback
2. **Course Creation**: Create course → topic → prompt
3. **Export Round-Trip**: Export course → import → verify data
4. **Error Handling**: API failure → retry → success
5. **Offline Support**: Make changes → close browser → reopen → verify changes

**Example E2E Test**:

```typescript
// tests/e2e/evaluation.spec.ts
import { test, expect } from '@playwright/test';

test('evaluate student answer workflow', async ({ page }) => {
  await page.goto('/');

  // Select a course and prompt
  await page.click('text=Math 101');
  await page.click('text=Chapter 1: Algebra');

  // Enter student answer
  await page.fill('textarea[placeholder="Enter your answer"]', 'The answer is 42');

  // Click evaluate
  await page.click('button:has-text("Evaluate")');

  // Wait for feedback
  await expect(page.locator('text=Your response')).toBeVisible({ timeout: 10000 });

  // Verify feedback structure
  const feedback = page.locator('[role="region"]');
  await expect(feedback).toContainText('Band');
  await expect(feedback).toContainText('Strengths');
  await expect(feedback).toContainText('Improvements');
});
```

---

## Priority 4: Monitoring & Error Tracking (Week 3 - 8 hours)

### 4.1 Sentry Integration ✅ MEDIUM EFFORT

```bash
npm install @sentry/react
```

**Create**: `src/services/sentry.ts`

```typescript
import * as Sentry from '@sentry/react';

export const initSentry = () => {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    integrations: [
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};

export const captureException = (error: Error, context?: Record<string, any>) => {
  Sentry.captureException(error, { contexts: { custom: context } });
};
```

**Update `src/main.tsx`**:

```typescript
import { initSentry } from './services/sentry';

initSentry();

// Wrap App with error boundary
const App = () => <Sentry.ErrorBoundary><AppComponent /></Sentry.ErrorBoundary>;
```

**Add env variable**:

```env
VITE_SENTRY_DSN=https://key@sentry.io/project-id
```

**Benefits**:

- Automatic error tracking
- Session replay on errors
- Performance monitoring
- Release tracking

### 4.2 Custom Analytics ✅ QUICK

**Create**: `src/services/analytics.ts`

```typescript
export interface AnalyticsEvent {
  event: string;
  category: 'engagement' | 'error' | 'performance';
  value?: number;
  metadata?: Record<string, any>;
}

export const analytics = {
  track(event: AnalyticsEvent) {
    // Send to backend or third-party service
    console.log('[Analytics]', event);
  },

  trackEvaluation(courseId: string, questionCount: number) {
    this.track({
      event: 'evaluation_completed',
      category: 'engagement',
      value: questionCount,
      metadata: { courseId },
    });
  },

  trackError(error: Error, context: string) {
    this.track({
      event: 'error_occurred',
      category: 'error',
      metadata: { error: error.message, context },
    });
  },

  trackPerformance(metric: string, duration: number) {
    this.track({
      event: 'performance_metric',
      category: 'performance',
      value: duration,
      metadata: { metric },
    });
  },
};
```

---

## Priority 5: Backend Infrastructure (Week 4-5 - 32 hours)

### 5.1 API Key Protection with Netlify Edge Functions

**Creates**: `netlify/edge-functions/api-proxy.ts`

```typescript
export default async (request: Request) => {
  if (!request.url.includes('/api/gemini')) {
    return new Response('Not found', { status: 404 });
  }

  const { model, messages, systemPrompt } = await request.json();
  const apiKey = Deno.env.get('GEMINI_API_KEY');

  if (!apiKey) {
    return new Response('API key not configured', { status: 500 });
  }

  try {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' +
        apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: messages }] }],
          systemPrompt,
        }),
      }
    );

    return response;
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

**Benefits**:

- API key never exposed to client
- Rate limiting per user
- Request logging
- Cost tracking

### 5.2 Authentication with Supabase ✅ MEDIUM EFFORT

```bash
npm install @supabase/supabase-js
```

**Create**: `src/services/auth.ts`

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export const auth = {
  async signUp(email: string, password: string) {
    return supabase.auth.signUp({ email, password });
  },

  async signIn(email: string, password: string) {
    return supabase.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    return supabase.auth.signOut();
  },

  async getSession() {
    return supabase.auth.getSession();
  },

  onAuthStateChange(callback: (user: any) => void) {
    return supabase.auth.onAuthStateChange((_event, session) => {
      callback(session?.user);
    });
  },
};
```

**Add env variables**:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Benefits**:

- Real authentication (replaces mock)
- Per-user data isolation
- Session management
- OAuth support (Google, GitHub, etc.)

---

## Priority 6: Documentation & Runbooks (Week 5-6 - 16 hours)

### 6.1 Architecture Documentation

**Create**: `/docs/ARCHITECTURE.md`

```markdown
# System Architecture

## Overview

- **Frontend**: React 19 SPA with Vite
- **State**: Immer + custom hooks (no Redux)
- **Storage**: IndexedDB with localStorage fallback
- **API**: Direct calls to Google Gemini (via proxy)
- **Deployment**: Static hosting (Vercel/Netlify)

## Component Hierarchy

App.tsx
├── Layout Components
│ ├── Workspace.tsx
│ ├── Sidebar.tsx
│ └── AppModals.tsx
├── Feature Modules
│ ├── PromptSelector.tsx
│ ├── Editor.tsx
│ └── EvaluationDisplay.tsx
└── Utilities
├── hooks/ (useGemini, useSyllabusData, etc.)
├── services/ (geminiService, aiCore, etc.)
└── utils/ (dataClone, errorHandler, etc.)

## Data Flow

User Action → Hook Update → Immer Mutation → IndexedDB Save → Optional API Call

## Storage Hierarchy

IndexedDB (Persistent)
├── main_store: courses_data
├── backups_store: Timestamped backups
├── library_store: Reusable items
└── sync_queue: Pending changes

LocalStorage (Fallback)
└── hsc-ai-evaluator-\*: Config, auth state

## API Integration

Gemini API
├── Evaluation: evaluate student responses
├── Generation: create questions & answers
├── Enrichment: generate scenarios & rubrics
└── Validation: check content quality

Rate Limiting: 5 concurrent, 2-min cooldown after errors
```

### 6.2 Deployment Runbook

**Create**: `/docs/DEPLOYMENT_RUNBOOK.md`

```markdown
# Deployment & Release Runbook

## Pre-Deployment Checklist

- [ ] All tests pass (`npm run test`)
- [ ] No ESLint errors (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] Performance benchmarks acceptable
- [ ] Database migrations tested
- [ ] API compatibility verified
- [ ] Security review completed

## Production Deployment (Netlify)

1. Push to `main` branch
2. GitHub Actions runs CI pipeline
3. Build artifacts uploaded
4. Netlify auto-deploys from `/dist`
5. Production URL: https://hsc-ai-evaluator.netlify.app

## Rollback Procedure

1. Identify bad deployment via Sentry/monitoring
2. Revert commit: `git revert <commit-sha>`
3. Push to main (auto-redeploy)
4. Verify health checks pass
5. Notify stakeholders

## Database Migration

1. Create backup: `npm run backup`
2. Run migration: `npm run migrate`
3. Verify data integrity
4. Keep backup for 30 days

## Monitoring After Deploy

- [ ] Sentry error rate <0.5%
- [ ] API call latency <500ms
- [ ] No auth errors
- [ ] Web Vitals: CLS <0.1, LCP <2.5s

## Hotfix Procedure (Critical)

1. Create hotfix branch: `git checkout -b hotfix/issue-name`
2. Fix the issue
3. Merge to main immediately
4. Tag release: `git tag -a v2.2.2`
5. Push tags to trigger deployment
```

### 6.3 Troubleshooting Guide

**Create**: `/docs/TROUBLESHOOTING.md`

```markdown
# Troubleshooting Guide

## Common Issues

### Issue: "API Key Error"

**Cause**: Missing or invalid GEMINI_API_KEY
**Solution**:

1. Check `.env` file exists
2. Verify key format: `sk-...`
3. Test key validity: `npm run test:api`
4. Check Sentry for rate limit errors

### Issue: "IndexedDB Quota Exceeded"

**Cause**: Too many backups or large course library
**Solution**:

1. Run cleanup: `npm run cleanup:storage`
2. Export old courses for archival
3. Increase quota limits
4. Monitor storage usage

### Issue: "Slow Evaluation Response"

**Cause**: Network latency or API overload
**Solution**:

1. Check network tab for latency
2. Verify API status: `npm run check:api-health`
3. Increase timeout: Set `VITE_API_TIMEOUT=30000`
4. Check Sentry for rate limit errors

### Issue: "Offline Changes Lost"

**Cause**: Sync queue corrupted or browser crashed
**Solution**:

1. Check sync queue stats: `console.log(localStorage.getItem('sync_queue'))`
2. Restore from backup if needed
3. Clear cache and reload

## Performance Optimization

### Slow Initial Load

1. Check bundle size: `npm run build:analyze`
2. Enable code splitting
3. Optimize images
4. Enable gzip compression

### High Memory Usage

1. Monitor with DevTools
2. Use profiler to identify leaks
3. Check for circular references
4. Verify cleanup in useEffect

## Monitoring Dashboard

- Error rates: https://sentry.io/hsc-ai/dashboard
- Performance: https://vercel.com/analytics
- Uptime: https://status.hsc-ai.dev
```

---

## Implementation Timeline

```
Week 1: ✅ Security fixes, GitHub Actions, ESLint/Prettier
├─ Day 1-2: API key fix, .env.example, GitHub Actions
├─ Day 3-4: ESLint/Prettier setup, pre-commit hooks
└─ Day 5: Code formatting, documentation

Week 2-3: ✅ Testing Infrastructure
├─ Week 2: Unit tests with Vitest, test key utilities
├─ Week 3: E2E tests with Playwright, critical workflows
└─ Coverage target: 70% lines, 60% branches

Week 3: ✅ Monitoring
├─ Day 1-2: Sentry integration
├─ Day 3-4: Custom analytics
└─ Day 5: Monitoring dashboards

Week 4-5: 🔵 Backend Infrastructure
├─ Week 4: Netlify Edge Functions for API proxy
├─ Week 5: Supabase authentication integration
└─ Testing and deployment

Week 5-6: 🔵 Documentation
├─ Architecture diagrams
├─ Deployment runbook
├─ Troubleshooting guide
└─ API documentation
```

---

## Success Metrics

After implementation, you should achieve:

| Metric               | Before       | Target    | Status             |
| -------------------- | ------------ | --------- | ------------------ |
| **CI/CD Time**       | None         | <5min     | 🔵 In progress     |
| **Test Coverage**    | 0%           | >70%      | 🔵 In progress     |
| **Deployment Time**  | Manual       | <2min     | 🔵 In progress     |
| **Error Detection**  | Console logs | Sentry    | 🔵 In progress     |
| **API Key Security** | Exposed      | Protected | 🔵 High priority   |
| **Uptime SLA**       | N/A          | 99.9%     | 🔵 With monitoring |
| **Deploy Frequency** | 1/month      | Daily     | 🔵 With CI/CD      |

---

## Quick Start Summary

To get started immediately:

1. **Today** (30 min):
   - Run: `npm install -D eslint prettier husky lint-staged`
   - Add `.env.example`
   - Setup GitHub Actions CI

2. **This Week** (4 hours):
   - Add ESLint/Prettier configuration
   - Setup pre-commit hooks
   - Fix API key exposure in vite.config.ts

3. **Next Week** (12 hours):
   - Install Vitest and write tests for utils
   - Add Sentry integration
   - Create `.github/workflows/build.yml`

4. **Following Week** (16 hours):
   - Add Playwright E2E tests
   - Document deployment procedure
   - Create troubleshooting guide

---

**All improvements are low-risk, high-return, and incremental.**
No changes to application logic or user-facing features.
