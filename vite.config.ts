import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import compression from 'vite-plugin-compression2'
import fs from 'node:fs'
import path from 'node:path'

// Dev only: serve api/*.ts (incl. api/x/[param].ts) through Vite, so `npm run dev` can run the
// booking engine without `vercel dev`. Production uses real Vercel Functions; this plugin is not built.
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv('development', process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const url = new URL(req.url, 'http://localhost')
        const parts = url.pathname.replace(/^\/api\//, '').split('/').filter(Boolean)
        const query: Record<string, string> = Object.fromEntries(url.searchParams)
        let file = path.resolve('api', ...parts) + '.ts'
        if (!fs.existsSync(file)) {
          const dir = path.resolve('api', ...parts.slice(0, -1))
          const dyn = fs.existsSync(dir) ? fs.readdirSync(dir).find(f => /^\[.+\]\.ts$/.test(f)) : undefined
          if (!dyn) return next()
          query[dyn.slice(1, dyn.indexOf(']'))] = parts[parts.length - 1]
          file = path.join(dir, dyn)
        }

        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const raw = Buffer.concat(chunks).toString()
        const ct = String(req.headers['content-type'] || '')
        const body = !raw ? undefined
          : ct.includes('json') ? JSON.parse(raw)
          : ct.includes('urlencoded') ? Object.fromEntries(new URLSearchParams(raw))
          : raw

        const vres: any = Object.assign(res, {
          status(code: number) { res.statusCode = code; return vres },
          json(obj: unknown) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return vres },
          send(b: string) { res.end(b); return vres },
        })
        try {
          const mod = await server.ssrLoadModule(file)
          // rawBody: exact bytes as received, alongside the parsed `body` — payment webhook signature
          // verification (DOKU) needs the untouched string, not a re-serialized JSON.stringify(body).
          await mod.default(Object.assign(req, { query, body, rawBody: raw }), vres)
        } catch (err) {
          console.error('[api-dev]', err)
          if (!res.headersSent) { res.statusCode = 500; res.end('dev api error') }
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    vercelApiDev(),
    compression({ algorithm: 'gzip' }),
    compression({ algorithm: 'brotliCompress', filename: '[path][base].br' }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-splide': ['@splidejs/react-splide'],
          'vendor-ui': ['lucide-react', 'lenis'],
          'vendor-daypicker': ['react-day-picker'],
        },
      },
    },
  },
})
