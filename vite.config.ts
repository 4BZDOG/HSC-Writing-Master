import path from 'path';
import { readFileSync } from 'fs';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8')) as {
  version: string;
};

// Dev-only middleware that mirrors the Vercel serverless proxy (api/gemini.ts)
// so `npm run dev` can call /api/gemini without running `vercel dev`. The key
// is read server-side from the environment and never exposed to the client.
function fetchUrlDevProxy(): Plugin {
  return {
    name: 'fetch-url-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/fetch-url', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);

        let body: { url?: string };
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
          return;
        }

        const handler = (await import('./api/fetch-url')).default;
        const resAdapter: any = {
          status: (code: number) => {
            res.statusCode = code;
            return resAdapter;
          },
          json: (data: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          setHeader: (name: string, value: string) => res.setHeader(name, value),
          end: () => res.end(),
        };
        await handler(
          { method: 'POST', body, headers: req.headers as Record<string, string> },
          resAdapter
        );
      });
    },
  };
}

function geminiDevProxy(env: Record<string, string>): Plugin {
  return {
    name: 'gemini-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        // Mirror the production handler's opt-in CORS (api/_lib/cors.ts) so
        // split hosting (frontend on another origin) is testable locally.
        const { corsHeadersFor } = await import('./api/_lib/cors');
        const cors = corsHeadersFor(
          req.headers.origin,
          env.ALLOWED_ORIGIN || process.env.ALLOWED_ORIGIN
        );
        if (cors) {
          for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
        }
        if (req.method === 'OPTIONS') {
          res.statusCode = cors ? 204 : 403;
          res.end();
          return;
        }

        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }

        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
          return;
        }

        const { runAiProxy } = await import('./api/_lib/providers');
        // Prefer .env files (loadEnv), but fall back to a real injected
        // process env var (e.g. AI Studio's API_KEY).
        const keys = {
          gemini:
            env.GEMINI_API_KEY || env.API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY,
          anthropic: env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY,
          openrouter: env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY,
          groq: env.GROQ_API_KEY || process.env.GROQ_API_KEY,
          kimi: env.KIMI_API_KEY || process.env.KIMI_API_KEY,
        };
        const result = await runAiProxy(body, keys);

        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.body));
      });
    },
  };
}

function billingDevProxy(): Plugin {
  return {
    name: 'billing-dev-proxy',
    configureServer(server) {
      const proxyRoute = async (
        route: string,
        req: import('http').IncomingMessage,
        res: import('http').ServerResponse
      ) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed. Use POST.' }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        let body: unknown;
        try {
          const raw = Buffer.concat(chunks).toString();
          body = raw ? JSON.parse(raw) : {};
        } catch {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
          return;
        }

        const handler = (await import(`./api/${route}`)).default;
        const resAdapter: any = {
          status: (code: number) => {
            res.statusCode = code;
            return resAdapter;
          },
          json: (data: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          },
          setHeader: (name: string, value: string) => res.setHeader(name, value),
          end: () => res.end(),
        };
        await handler(
          {
            method: 'POST',
            body,
            rawBody: Buffer.concat(chunks).toString(),
            headers: req.headers as Record<string, string>,
          },
          resAdapter
        );
      };

      for (const route of ['create-checkout', 'customer-portal', 'stripe-webhook']) {
        server.middlewares.use(`/api/${route}`, (req, res) => {
          proxyRoute(route, req, res).catch((e) => {
            console.error(`[billing-dev-proxy] /${route}:`, e);
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Dev proxy error.' }));
          });
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all env vars (including non-VITE_ server-side keys) for the dev proxy.
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // Sub-path hosting (e.g. GitHub Pages serves at /<repo>/). Leave unset for
    // root hosting (Vercel, custom domain). Must start and end with '/'.
    base: env.DEPLOY_BASE_PATH || '/',
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    plugins: [react(), fetchUrlDevProxy(), geminiDevProxy(env), billingDevProxy()],
    define: {
      // Only expose VITE_* variables (Vite's secure env approach).
      // API keys must never be in the bundle — they go through /api/gemini.
      // The package.json version, so UI surfaces (login footer) never show a
      // stale hard-coded number.
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      sourcemap: true,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor';
            }

            if (id.includes('@google/genai')) {
              return 'gemini';
            }

            // Keep the (large, lazily imported) PDF engine in its own chunk so
            // it never rides along with the eager vendor bundle.
            if (id.includes('node_modules/jspdf')) {
              return 'pdf-engine';
            }

            if (id.includes('lucide-react')) {
              return 'ui';
            }

            if (id.includes('/data/commandTerms')) {
              return 'commandTerms';
            }

            if (id.includes('/components/admin/')) {
              return 'admin';
            }

            if (id.includes('/components/dataManager/')) {
              return 'dataManager';
            }

            if (id.includes('/components/Workspace') || id.includes('/components/Evaluation')) {
              return 'workspace';
            }

            if (
              id.includes('/components/Prompt') ||
              id.includes('/components/SampleAnswer') ||
              id.includes('/components/ReferenceMaterials')
            ) {
              return 'prompts';
            }

            if (
              id.includes('/components/AppModals') ||
              id.includes('/components/ManifestImportModal')
            ) {
              return 'modals';
            }
          },
        },
      },
    },
  };
});
