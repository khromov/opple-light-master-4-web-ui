import { appendFileSync } from 'node:fs'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig, type Plugin } from 'vite'

/**
 * Dev only: POST /__log appends the page's diagnostics log to $LM4_LOG_FILE,
 * so BLE traffic from a real meter can be inspected outside the browser.
 */
function devLogSink(): Plugin {
  return {
    name: 'lm4-dev-log-sink',
    apply: 'serve',
    configureServer(server) {
      const file = process.env.LM4_LOG_FILE
      if (!file) return
      server.middlewares.use('/__log', (req, res) => {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          appendFileSync(file, body.endsWith('\n') ? body : body + '\n')
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// Relative base so the build works under any GitHub Pages sub-path.
export default defineConfig({
  base: './',
  plugins: [svelte(), devLogSink()],
})
