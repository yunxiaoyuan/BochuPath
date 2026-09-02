import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

function bochuPathLocalData(): Plugin {
  const runtimeDirectory = process.env.BOCHUPATH_DATA_DIRECTORY
    ? resolve(process.env.BOCHUPATH_DATA_DIRECTORY)
    : resolve(process.cwd(), '.bochupath');
  const runtimeFile = resolve(runtimeDirectory, 'bochupath-data.json');
  const seedFile = resolve(process.cwd(), 'public', 'bochupath-data.json');
  const ensureRuntimeFile = () => {
    if (existsSync(runtimeFile)) return;
    mkdirSync(runtimeDirectory, { recursive: true });
    writeFileSync(runtimeFile, readFileSync(seedFile, 'utf8'), 'utf8');
  };

  return {
    name: 'bochupath-local-shared-json',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/bochupath-data.json') {
          next();
          return;
        }
        ensureRuntimeFile();
        if (request.method === 'GET') {
          response.statusCode = 200;
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.setHeader('Cache-Control', 'no-store');
          response.end(readFileSync(runtimeFile, 'utf8'));
          return;
        }
        if (request.method !== 'PUT') {
          response.statusCode = 405;
          response.end('Method Not Allowed');
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        request.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 20 * 1024 * 1024) request.destroy();
          else chunks.push(chunk);
        });
        request.on('end', () => {
          try {
            const input = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
            if ((input.schemaVersion !== '1.0' && input.schemaVersion !== '1.1') || !Array.isArray(input.diagrams)) {
              throw new Error('Invalid BochuPath shared state');
            }
            writeFileSync(runtimeFile, `${JSON.stringify(input, null, 2)}\n`, 'utf8');
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end('true');
          } catch {
            response.statusCode = 400;
            response.end('Invalid JSON');
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), bochuPathLocalData()],
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./src/test/setup.ts'],
    coverage: { reporter: ['text', 'html'] },
  },
});
