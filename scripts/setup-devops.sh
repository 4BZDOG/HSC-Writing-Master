#!/bin/bash
# HSC Writing Master - DevOps Setup Script
# Automates installation of linting, testing, and pre-commit infrastructure
# Usage: bash scripts/setup-devops.sh [phase]
# Phases: all, lint, test, hooks, ci, sentry

set -e

PHASE=${1:-all}
PROJECT_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

echo "🚀 HSC Writing Master - DevOps Setup"
echo "======================================"
echo "Phase: $PHASE"
echo "Project: $PROJECT_ROOT"
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

# Phase 1: Linting & Formatting
setup_lint() {
  echo ""
  echo "📝 Setting up ESLint & Prettier..."

  npm install -D \
    eslint \
    @typescript-eslint/eslint-plugin \
    @typescript-eslint/parser \
    eslint-plugin-react \
    eslint-plugin-react-hooks \
    eslint-config-prettier \
    eslint-plugin-prettier \
    prettier

  # Create .eslintrc.json
  cat > "$PROJECT_ROOT/.eslintrc.json" << 'EOF'
{
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:prettier/recommended"
  ],
  "env": {
    "browser": true,
    "es2021": true,
    "node": true
  },
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module",
    "ecmaFeatures": {
      "jsx": true
    }
  },
  "rules": {
    "@typescript-eslint/explicit-function-return-types": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "@typescript-eslint/no-explicit-any": "warn",
    "react/react-in-jsx-scope": "off",
    "react/prop-types": "off",
    "prettier/prettier": "warn"
  }
}
EOF

  # Create .prettierrc.json
  cat > "$PROJECT_ROOT/.prettierrc.json" << 'EOF'
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
EOF

  # Create .prettierignore
  cat > "$PROJECT_ROOT/.prettierignore" << 'EOF'
node_modules
dist
build
.next
coverage
*.min.js
*.min.css
EOF

  # Update package.json scripts
  echo ""
  log_info "Added ESLint & Prettier configuration"
  echo "Add these scripts to package.json:"
  echo "  \"lint\": \"eslint src --ext .ts,.tsx\""
  echo "  \"lint:fix\": \"eslint src --ext .ts,.tsx --fix\""
  echo "  \"format\": \"prettier --write \\\"src/**/*.{ts,tsx,css,md}\\\"\""
  echo "  \"format:check\": \"prettier --check \\\"src/**/*.{ts,tsx,css,md}\\\"\""
}

# Phase 2: Testing Infrastructure
setup_test() {
  echo ""
  echo "🧪 Setting up Vitest & Playwright..."

  npm install -D \
    vitest \
    @vitest/ui \
    jsdom \
    @testing-library/react \
    @testing-library/user-event \
    @testing-library/dom \
    @playwright/test

  # Create vitest.config.ts
  cat > "$PROJECT_ROOT/vitest.config.ts" << 'EOF'
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/index.ts',
      ],
      lines: 70,
      functions: 70,
      branches: 70,
      statements: 70,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
EOF

  # Create playwright.config.ts
  cat > "$PROJECT_ROOT/playwright.config.ts" << 'EOF'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
EOF

  # Create tests directory
  mkdir -p "$PROJECT_ROOT/tests/e2e"
  mkdir -p "$PROJECT_ROOT/src/__tests__"

  log_info "Added Vitest & Playwright configuration"
  echo "Add these scripts to package.json:"
  echo "  \"test\": \"vitest\""
  echo "  \"test:ui\": \"vitest --ui\""
  echo "  \"test:coverage\": \"vitest --coverage\""
  echo "  \"test:e2e\": \"playwright test\""
  echo "  \"test:e2e:ui\": \"playwright test --ui\""
  echo "  \"test:e2e:debug\": \"playwright test --debug\""
}

# Phase 3: Pre-commit Hooks
setup_hooks() {
  echo ""
  echo "🪝 Setting up Husky & lint-staged..."

  npm install -D husky lint-staged
  npx husky install

  # Create pre-commit hook
  mkdir -p "$PROJECT_ROOT/.husky"
  cat > "$PROJECT_ROOT/.husky/pre-commit" << 'EOF'
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
EOF
  chmod +x "$PROJECT_ROOT/.husky/pre-commit"

  # Update package.json with lint-staged config
  echo ""
  log_info "Added Husky & lint-staged configuration"
  echo "Add this to package.json:"
  echo "  \"lint-staged\": {"
  echo "    \"*.{ts,tsx}\": [\"eslint --fix\", \"prettier --write\"],"
  echo "    \"*.{css,md,json}\": [\"prettier --write\"]"
  echo "  }"
}

# Phase 4: GitHub Actions CI
setup_ci() {
  echo ""
  echo "🔄 Setting up GitHub Actions CI..."

  mkdir -p "$PROJECT_ROOT/.github/workflows"

  # Create build workflow
  cat > "$PROJECT_ROOT/.github/workflows/build.yml" << 'EOF'
name: Build & Test

on:
  push:
    branches: [main, develop, claude/*]
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run format:check

  build:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/

  test:
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test -- --run --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
EOF

  # Create deploy workflow
  cat > "$PROJECT_ROOT/.github/workflows/deploy.yml" << 'EOF'
name: Deploy to Netlify

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: netlify/actions/build@master
        with:
          functions-dir: ./netlify/functions
          publish-dir: ./dist
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
          VITE_GEMINI_API_KEY: ${{ secrets.VITE_GEMINI_API_KEY }}
          VITE_SENTRY_DSN: ${{ secrets.VITE_SENTRY_DSN }}
EOF

  log_info "Added GitHub Actions CI/CD workflows"
  echo "Next steps:"
  echo "  1. Push to GitHub"
  echo "  2. Go to Actions tab to see workflows running"
  echo "  3. Configure secrets in Settings > Secrets"
}

# Phase 5: Environment Setup
setup_env() {
  echo ""
  echo "🔐 Setting up environment variables..."

  # Create .env.example
  cat > "$PROJECT_ROOT/.env.example" << 'EOF'
# Gemini API Configuration
VITE_GEMINI_API_KEY=sk-your-key-here

# Development Environment
VITE_ENV=development
VITE_API_BASE_URL=http://localhost:3000
VITE_API_TIMEOUT=30000

# Feature Flags
VITE_ENABLE_EXPERIMENTAL_FEATURES=false
VITE_ENABLE_PERFORMANCE_MONITORING=true
VITE_ENABLE_DEBUG_MODE=false

# Monitoring (Optional)
VITE_SENTRY_DSN=https://key@sentry.io/project-id

# Analytics (Optional)
VITE_SEGMENT_KEY=your-segment-key
VITE_MIXPANEL_TOKEN=your-mixpanel-token
EOF

  # Create .env file if it doesn't exist
  if [ ! -f "$PROJECT_ROOT/.env" ]; then
    cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
    log_warn "Created .env file from .env.example - UPDATE WITH YOUR KEYS!"
  fi

  log_info "Created .env.example - Copy to .env and update with your keys"
}

# Phase 6: Sentry Integration (Optional)
setup_sentry() {
  echo ""
  echo "📊 Setting up Sentry error tracking..."

  npm install @sentry/react @sentry/tracing

  # Create sentry.ts
  mkdir -p "$PROJECT_ROOT/src/services"
  cat > "$PROJECT_ROOT/src/services/sentry.ts" << 'EOF'
import * as Sentry from '@sentry/react';
import { BrowserTracing } from '@sentry/tracing';

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    console.warn('Sentry DSN not configured');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
    integrations: [
      new BrowserTracing(),
      new Sentry.Replay({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
};

export const captureException = (
  error: Error,
  context?: Record<string, any>
) => {
  Sentry.captureException(error, {
    contexts: { custom: context },
  });
};

export const captureMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
  Sentry.captureMessage(message, level);
};
EOF

  log_info "Added Sentry configuration"
  echo "Next: Update src/main.tsx to call initSentry()"
}

# Main execution
case $PHASE in
  all)
    setup_env
    setup_lint
    setup_test
    setup_hooks
    setup_ci
    setup_sentry
    echo ""
    log_info "✨ All DevOps tools installed!"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Review and update .env file with your API keys"
    echo "  2. Update package.json scripts (see above)"
    echo "  3. Run 'npm run lint:fix' to auto-format code"
    echo "  4. Run 'npm run test' to verify testing setup"
    echo "  5. Run 'npm run format' to format code"
    echo "  6. Commit and push to trigger CI/CD"
    ;;
  lint)
    setup_lint
    ;;
  test)
    setup_test
    ;;
  hooks)
    setup_hooks
    ;;
  ci)
    setup_ci
    ;;
  env)
    setup_env
    ;;
  sentry)
    setup_sentry
    ;;
  *)
    log_error "Unknown phase: $PHASE"
    echo "Available phases: all, lint, test, hooks, ci, env, sentry"
    exit 1
    ;;
esac

echo ""
log_info "Setup complete!"
