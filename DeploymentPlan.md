# HSC AI Evaluator - Deployment Plan

**Version**: 2.2.1 | **Last Updated**: March 2026

---

## 1. Architecture Overview

### Tech Stack
- **Frontend**: React 19 + TypeScript + Vite
- **State**: use-immer (immutable state management)
- **Styling**: Tailwind CSS
- **AI Integration**: Google Gemini 3 (Pro & Flash)
- **Storage**: IndexedDB (offline-first, browser-based)
- **Dependencies**: ESM via CDN (aistudiocdn.com, esm.sh)

### Deployment Model
This is a **static SPA (Single Page Application)** with:
- No backend server required
- No database requirements
- All data stored client-side (IndexedDB)
- API calls directly to Google Gemini
- Build output: Single `dist/` folder for hosting

---

## 2. Deployment Options

### Option A: Vercel (Recommended)
**Best for**: Optimal performance, built-in CI/CD, serverless functions (future)

```bash
# Installation
npm i -g vercel

# Login & deploy
vercel login
vercel

# Or connect GitHub repo: Settings → Integrations → GitHub
```

**Configuration** (`vercel.json`):
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "env": [
    "VITE_GOOGLE_API_KEY"
  ],
  "headers": [
    {
      "source": "/index.html",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=3600" }
      ]
    },
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    }
  ]
}
```

### Option B: Netlify
**Best for**: Git-based workflows, easy rollbacks

```bash
# Via Netlify CLI
npm i -g netlify-cli
netlify login
netlify deploy

# Or connect GitHub → Netlify Dashboard
```

**Configuration** (`netlify.toml`):
```toml
[build]
  command = "npm run build"
  publish = "dist"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Cache-Control = "public, max-age=3600"
```

### Option C: GitHub Pages
**Best for**: Free hosting, no extra credits

```bash
# Update package.json
"homepage": "https://<username>.github.io/HSC-Writing-Master",

# Add to vite.config.ts
export default {
  base: '/HSC-Writing-Master/'
}

# Deploy
npm run build
git add dist/
git commit -m "Deploy to GitHub Pages"
git push
```

### Option D: AWS + CloudFront
**Best for**: Enterprise, custom domain, advanced analytics

1. Build and upload to S3:
   ```bash
   npm run build
   aws s3 sync dist/ s3://hsc-evaluator-prod/
   ```

2. Configure CloudFront distribution
3. Point custom domain to CloudFront endpoint

### Option E: Self-Hosted
**Requirements**: Node.js 18+, HTTPS

```bash
# Build locally
npm run build

# Serve with Caddy / Nginx / Apache
npm install -g serve
serve -s dist -l 3000

# Or use Nginx config:
server {
    listen 443 ssl;
    server_name hsc-evaluator.edu.au;

    root /var/www/hsc-evaluator/dist;
    index index.html;

    location / {
        try_files $uri /index.html;
    }
}
```

---

## 3. Environment & Secrets Management

### Required Environment Variables

```env
# Google Gemini API Configuration
VITE_GOOGLE_API_KEY=sk_live_xxxxxxxxxxxxx
VITE_GEMINI_MODEL_REASONING=gemini-3-pro-preview
VITE_GEMINI_MODEL_SPEED=gemini-3-flash-preview
VITE_GEMINI_THINKING_BUDGET=8000
```

### Setup Instructions by Platform

**Vercel**:
```
Dashboard → Project Settings → Environment Variables → Add Variables
```

**Netlify**:
```
Site settings → Build & deploy → Environment → Edit variables
```

**GitHub Pages**:
```
Settings → Secrets and variables → Actions → New repository secret
# Then reference in workflow: secrets.VITE_GOOGLE_API_KEY
```

---

## 4. Build & Deploy Pipeline

### Local Build
```bash
npm install
npm run build
npm run preview  # Test production build locally
```

### CI/CD Workflow (GitHub Actions)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_GOOGLE_API_KEY: ${{ secrets.VITE_GOOGLE_API_KEY }}

      - name: Deploy to Vercel
        uses: vercel/action@master
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
```

---

## 5. Performance Optimization

### Pre-Deployment Checklist

- [ ] Run `npm run build` and verify `dist/` size < 2MB
- [ ] Enable gzip compression on server
- [ ] Set cache headers for static assets:
  - `index.html`: 1 hour
  - `*.js`, `*.css`: 1 year (with hash in filename)
  - Images: 30 days
- [ ] Enable HTTP/2 or HTTP/3
- [ ] Minify and tree-shake dependencies

### Vite Config Optimization

Update `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: 'terser',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom'],
          'ai': ['@google/genai'],
        }
      }
    }
  }
})
```

### Content Delivery Strategy

1. **Lazy Load UI Components**: Code-split modal components
2. **Defer Non-Critical Scripts**: Load analytics after interactive
3. **Cache Busting**: Use Vite's asset hashing (automatic)
4. **Resource Hints**: Add preconnect to Google APIs

Update `index.html`:

```html
<link rel="preconnect" href="https://aistudiocdn.com">
<link rel="preconnect" href="https://generativelanguage.googleapis.com">
<link rel="dns-prefetch" href="https://fonts.googleapis.com">
```

---

## 6. Monitoring & Observability

### Core Metrics to Track

1. **API Health**
   - Google Gemini API response times
   - Rate limiting (429) errors
   - Quota exhaustion alerts

2. **Application Performance**
   - Page load time (LCP, FCP, CLS)
   - JS bundle size
   - Error rates

3. **User Experience**
   - Session duration
   - Feature usage (evaluation count, question generation)
   - IndexedDB storage utilization

### Monitoring Stack

**Option 1: Vercel Analytics** (built-in)
- Enable in Vercel dashboard
- Real User Monitoring (RUM)

**Option 2: Sentry**

Install and configure:
```bash
npm install @sentry/react @sentry/tracing
```

In `index.tsx`:
```typescript
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: process.env.VITE_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

**Option 3: Google Analytics 4**

```html
<!-- Add to index.html -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

---

## 7. Security Best Practices

### API Key Management

❌ **DON'T**:
- Commit `.env` files
- Expose keys in client-side code (visible in network tab)
- Use development keys in production

✅ **DO**:
- Use platform-specific secret management (Vercel, Netlify, AWS Secrets)
- Rotate keys quarterly
- Monitor API key usage in Google Cloud Console
- Implement client-side API guard (circuit breaker already present)

### HTTPS & CSP

Ensure deployment platform provides:
- [ ] HTTPS by default (all platforms do)
- [ ] HTTP → HTTPS redirect
- [ ] HSTS header: `Strict-Transport-Security: max-age=31536000`

Content Security Policy (`index.html` or header):
```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'self';
  script-src 'self' https://cdn.tailwindcss.com https://cdnjs.cloudflare.com https://aistudiocdn.com https://www.googletagmanager.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://generativelanguage.googleapis.com https://aistudiocdn.com;
  img-src 'self' data: https:;
  frame-ancestors 'none';
">
```

### Data Privacy

- **IndexedDB Storage**: Clear on logout
- **No Analytics on First Load**: Respect DNT header
- **GDPR Compliance**: Add privacy policy & terms
- **Data Export**: Implement export functionality (already exists)

---

## 8. Scaling Considerations

### Current Limitations
- Single user per browser (IndexedDB is per-origin)
- No multi-device sync (would require backend)
- Google Gemini API quota limits (check Google Cloud Console)

### Future Architecture (Multi-User)

If scaling beyond single-user:

```
┌─────────────────┐
│   React SPA     │
│  (index.html)   │
└────────┬────────┘
         │
    ┌────┴────┐
    │          │
    ▼          ▼
[IndexedDB] [Node.js Backend]
            (Optional)
              │
              ▼
        [PostgreSQL]
        [Firebase]
        [Supabase]
```

**Backend Requirements**:
- User authentication (OAuth2)
- Curriculum data sync
- Evaluation history storage
- Audit logs

---

## 9. Rollback Strategy

### Vercel
```bash
# View deployments
vercel deployments

# Rollback to previous
vercel rollback
```

### GitHub Pages
```bash
git revert <commit-hash>
git push origin main
```

### Manual Rollback
1. Keep previous `dist/` snapshot
2. Re-upload previous version
3. Point DNS/CDN to old version
4. Post-mortem on failed deployment

---

## 10. Domain & SSL

### Custom Domain Setup

**Vercel**:
- Dashboard → Project Settings → Domains
- Add custom domain
- Follow DNS instructions

**Netlify**:
- Site settings → Domain management
- Add custom domain
- Auto-managed SSL via Let's Encrypt

**Self-Hosted**:
```bash
# Use certbot for Let's Encrypt
sudo certbot certonly --webroot -w /var/www/hsc-evaluator/dist -d hsc-evaluator.edu.au
```

### DNS Configuration
```
Type    Name                        Value
A       hsc-evaluator.edu.au        <platform-ip>
CNAME   www.hsc-evaluator.edu.au    <platform-cname>
```

---

## 11. Backup & Disaster Recovery

### User Data Protection
- **Automatic Exports**: Implement hourly `idb` snapshots to localStorage
- **Download Feature**: Enable data export (already implemented)
- **Time Machine**: Keep 30-day rolling backup of IndexedDB

### Source Code
- [ ] GitHub repository (primary)
- [ ] Automated backups to S3/Backblaze
- [ ] Version tags for each release

### Disaster Recovery Procedures
1. **Lost API Key**: Regenerate in Google Cloud Console (automatic)
2. **Compromised Deployment**: Revert to previous GitHub tag
3. **Data Corruption**: Users export from their IndexedDB locally

---

## 12. Maintenance Schedule

### Daily
- Monitor API health (alert on 429 errors)
- Check deployment logs for errors

### Weekly
- Review Sentry error reports
- Check Google Cloud API quota usage
- Test evaluation engine with sample inputs

### Monthly
- Update dependencies: `npm update`
- Review performance metrics (LCP, CLS)
- Audit security (check for vulnerable packages)

### Quarterly
- Rotate API keys
- Security audit of CSP and headers
- Performance profiling with Lighthouse

### Annually
- Full security assessment
- Load testing simulation
- Disaster recovery drill
- Review and update deployment docs

---

## 13. Cost Estimation

### Deployment Platform
| Platform | Cost | Notes |
|----------|------|-------|
| Vercel (Hobby) | $0 | Perfect for production use |
| Netlify (Starter) | $0 | 300 build minutes/month |
| GitHub Pages | $0 | Unlimited |
| AWS (CloudFront) | $0.085/GB | Lowest bandwidth cost at scale |

### Google Gemini API
- **Free Tier**: 60 requests/minute, 1.5M tokens/day
- **Paid**: $0.075-0.30 per 1M input tokens (varies by model)
- **Estimate**: 500 users × 10 evals/day × 2000 tokens = ~10M tokens/day = ~$3/day

### Domain & SSL
| Item | Cost |
|------|------|
| Custom domain (.edu.au) | $15/year |
| SSL certificate | Free (Let's Encrypt) |
| Email (optional) | $0-10/month |

**Total Monthly Cost**: $0-100 (mostly API usage)

---

## 14. Pre-Launch Checklist

### Code Quality
- [ ] TypeScript strict mode enabled
- [ ] No `any` types in critical paths
- [ ] Unit tests for evaluation engine
- [ ] E2E tests for core workflows

### Performance
- [ ] Bundle size < 2MB
- [ ] Lighthouse score > 90
- [ ] First Contentful Paint < 2s
- [ ] Largest Contentful Paint < 3s

### Security
- [ ] No API keys in source
- [ ] CSP headers configured
- [ ] HTTPS enforced
- [ ] CORS properly restricted
- [ ] Dependency audit passed (`npm audit`)

### Monitoring
- [ ] Sentry/error tracking configured
- [ ] Analytics enabled
- [ ] Uptime monitoring configured
- [ ] Alerts set for API failures

### Documentation
- [ ] Deployment guide complete
- [ ] Runbook for common issues
- [ ] API key rotation procedure documented
- [ ] Team access & permissions documented

---

## 15. Troubleshooting Guide

### Build Failures
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build

# Check Node version (should be 18+)
node --version
```

### API Rate Limiting (429 Errors)
- Check `ApiGuard` circuit breaker is active
- Verify API key quota in Google Cloud Console
- Implement exponential backoff (already in `services/`)
- Consider increasing quota limits

### IndexedDB Issues
- User needs to clear browser storage and reload
- Implement data migration for schema changes
- Test in incognito mode (fresh IndexedDB)

### Slow Performance
```bash
# Profile with Vite
npm run build -- --profile

# Check bundle size
npm run build
du -sh dist/

# Lighthouse audit (Vercel does automatically)
```

### Domain/SSL Issues
- DNS propagation takes 24-48 hours
- Clear browser DNS cache: `chrome://net-internals/#dns`
- Verify certificate with: `openssl s_client -connect domain:443`

---

## 16. Contacts & Resources

### Key Links
- [Vite Docs](https://vitejs.dev/)
- [Google Gemini API](https://ai.google.dev/)
- [React 19 Docs](https://react.dev/)
- [Vercel Deployment Docs](https://vercel.com/docs)

### Team Contacts
- **API Key Rotation**: Google Cloud Console owner
- **Domain Management**: Registrar admin
- **Emergency Access**: GitHub repo admin

### Support
- Vercel: [vercel.com/support](https://vercel.com/support)
- Netlify: [support.netlify.com](https://support.netlify.com)
- Google: [ai.google.dev/help](https://ai.google.dev/help)

---

**Document Version**: 1.0 | **Next Review**: June 2026
