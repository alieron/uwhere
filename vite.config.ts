import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { DELETE, GET, POST, PUT } from './api/group.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, import.meta.dirname, ''))

  return {
    plugins: [react(), tailwindcss(), {
      name: 'local-group-api',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (!request.url || new URL(request.url, 'http://localhost').pathname !== '/api/group') return next()

          const handlers = { DELETE, GET, POST, PUT }
          const handler = handlers[request.method as keyof typeof handlers]
          if (!handler) {
            response.statusCode = 405
            return response.end()
          }

          try {
            const headers = new Headers()
            for (const [name, value] of Object.entries(request.headers)) {
              for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) headers.append(name, item)
            }
            const chunks: Uint8Array[] = []
            for await (const chunk of request) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
            const bytes = Buffer.concat(chunks)
            const result = await handler(new Request(
              new URL(request.url, `http://${request.headers.host ?? 'localhost'}`),
              {
                method: request.method,
                headers,
                body: bytes.length ? new Uint8Array(bytes) : undefined,
              },
            ))
            response.statusCode = result.status
            result.headers.forEach((value, name) => response.setHeader(name, value))
            response.end(Buffer.from(await result.arrayBuffer()))
          } catch (error) {
            next(error)
          }
        })
      },
    }],
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
  }
})
