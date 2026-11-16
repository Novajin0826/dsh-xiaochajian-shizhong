/**
 * Skill menu host half: the management API used by the client panel.
 * - GET  /skill-menu/state       probe + skill roots for grouping
 * - POST /skill-menu/delete      move one removable skill folder to trash
 * - POST /skill-menu/import      copy a picked skill folder into the user skills dir
 * - POST /skill-menu/open-dir    open the user skills directory locally
 * Prefs (enable/disable) live client-side; this half only owns filesystem
 * effects that the browser cannot perform.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx) {
  const web = ctx.get('webServer')
  if (web === undefined) {
    console.warn('[skill-menu] webServer unavailable; delete/open-dir stay disabled')
    return
  }

  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const trashRoot = path.join(dshHome, 'skill-menu-trash')

  const rootsFor = (cwd) => ({
    user: [path.join(dshHome, 'skills'), path.join(os.homedir(), '.agents', 'skills')],
    workspace: typeof cwd === 'string' && cwd !== ''
      ? [path.join(cwd, '.dsh', 'skills'), path.join(cwd, '.agents', 'skills')]
      : [],
  })

  const send = (res, code, body) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(body))
  }

  const readJson = (req) => new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch (error) { reject(error) }
    })
    req.on('error', reject)
  })

  ctx.effect(() => web.register({
    kind: 'prefix',
    path: '/skill-menu',
    handler: async (req, res) => {
      try {
        const origin = req.headers.origin
        const host = req.headers.host
        if (origin && host && origin !== 'null') {
          // The desktop webview may send a null origin; only block an origin
          // that parses to a different authority than the request host.
          let foreign = false
          try { foreign = new URL(origin).host !== host } catch { foreign = false }
          if (foreign) return send(res, 403, { error: 'origin' })
        }
        const url = new URL(req.url, 'http://localhost')
        const action = url.pathname.slice('/skill-menu/'.length).replace(/\/$/, '') || 'state'
        const method = (req.method || 'GET').toUpperCase()

        if (method === 'GET' && action === 'state') {
          return send(res, 200, { ok: true, roots: rootsFor(url.searchParams.get('cwd') || '') })
        }
        if (method !== 'POST') return send(res, 405, { error: 'method' })

        const body = await readJson(req)
        if (action === 'delete') {
          const target = String(body.path || '')
          const cwd = String(body.cwd || '')
          const roots = rootsFor(cwd)
          const dir = path.dirname(target)
          const allowed = [...roots.user, ...roots.workspace]
          const inside = target !== '' && allowed.some(root => dir.startsWith(root + path.sep))
          if (!inside) return send(res, 400, { error: 'not-deletable' })
          if (!fs.existsSync(dir)) return send(res, 200, { ok: true, gone: true })
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          const dest = path.join(trashRoot, `${stamp}-${path.basename(dir)}`)
          fs.mkdirSync(trashRoot, { recursive: true })
          fs.renameSync(dir, dest)
          return send(res, 200, { ok: true, moved: dest })
        }
        if (action === 'import') {
          const source = path.resolve(String(body.sourceDir || ''))
          const cwd = String(body.cwd || '')
          let stat
          try { stat = fs.statSync(source) } catch { stat = undefined }
          if (stat === undefined || !stat.isDirectory()) return send(res, 400, { error: 'not-a-directory' })
          if (!fs.existsSync(path.join(source, 'SKILL.md'))) return send(res, 400, { error: 'no-skill-md' })
          const name = path.basename(source)
          if (name === '' || name === '.' || name === '..') return send(res, 400, { error: 'bad-name' })
          const dest = path.join(rootsFor(cwd).user[0], name)
          if (fs.existsSync(dest)) return send(res, 409, { error: 'exists', name })
          if (dest.startsWith(source + path.sep)) return send(res, 400, { error: 'bad-destination' })
          fs.mkdirSync(path.dirname(dest), { recursive: true })
          fs.cpSync(source, dest, { recursive: true })
          return send(res, 200, { ok: true, dir: dest, name })
        }
        if (action === 'open-dir') {
          const roots = rootsFor(String(body.cwd || ''))
          const dir = roots.user[0]
          fs.mkdirSync(dir, { recursive: true })
          const opener = process.platform === 'win32' ? ['explorer.exe', [dir]]
            : process.platform === 'darwin' ? ['open', [dir]]
              : ['xdg-open', [dir]]
          // The opener may fail asynchronously; an unhandled child 'error'
          // event would take down the Host process.
          const child = spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' })
          child.on('error', error => { console.warn('[skill-menu] open-dir failed:', error?.message || error) })
          child.unref()
          return send(res, 200, { ok: true, dir })
        }
        return send(res, 404, { error: 'unknown' })
      } catch (error) {
        return send(res, 500, { error: String((error && error.message) || error) })
      }
    },
  }), 'skill-menu: management API')
}
