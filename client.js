window.__ModuleLoader__.load({
  id: 'skill-management',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    /** Shared identity for the empty rows snapshot (stable no-op repairs). */
    const EMPTY_ITEMS = []

    // ---------- icons ----------
    function SkillIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M8 1.4l1.45 3.88L13.3 6.7 9.45 8.15 8 12l-1.45-3.85L2.7 6.7l3.85-1.42L8 1.4z', fill: 'currentColor' }),
        h('circle', { cx: 12.4, cy: 12.3, r: 1.25, fill: 'currentColor' }))
    }
    function GearIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', {
          d: 'M8 5.2A2.8 2.8 0 1 0 8 10.8 2.8 2.8 0 0 0 8 5.2zm0 1.5A1.3 1.3 0 1 1 8 9.3 1.3 1.3 0 0 1 8 6.7zM7.2 1.5h1.6l.25 1.55c.42.13.82.32 1.18.57l1.42-.62.8 1.39-1.13.98c.09.36.13.74.13 1.13s-.04.77-.13 1.13l1.13.98-.8 1.39-1.42-.62c-.36.25-.76.44-1.18.57L8.8 14.5H7.2l-.25-1.55a4.6 4.6 0 0 1-1.18-.57l-1.42.62-.8-1.39 1.13-.98A3.9 3.9 0 0 1 4.55 8c0-.39.04-.77.13-1.13L3.55 5.89l.8-1.39 1.42.62c.36-.25.76-.44 1.18-.57L7.2 1.5z',
          fill: 'currentColor',
        }))
    }
    function FolderPlusIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M2 3.5A1.5 1.5 0 0 1 3.5 2h2.3c.4 0 .78.16 1.06.44L7.8 3.3h4.7A1.5 1.5 0 0 1 14 4.8v6.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-8z', stroke: 'currentColor', 'stroke-width': '1.3' }),
        h('path', { d: 'M8 6.6v3.6M6.2 8.4h3.6', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round' }))
    }
    function BackIcon({ size = 16 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M10 3.5 5.5 8l4.5 4.5', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))
    }
    function TrashIcon({ size = 14 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.5 4.5h9M6.2 4.5V3.2A.7.7 0 0 1 6.9 2.5h2.2a.7.7 0 0 1 .7.7v1.3M4.6 4.5l.5 8a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.5-8', stroke: 'currentColor', 'stroke-width': '1.2', 'stroke-linecap': 'round' }))
    }

    // ---------- local prefs (enable/disable + deletions) ----------
    const PREFS_KEY = 'dsh-skill-menu.prefs.v1'
    const memoryStore = {}
    const storage = typeof localStorage !== 'undefined'
      ? localStorage
      : { getItem: k => memoryStore[k] ?? null, setItem: (k, v) => { memoryStore[k] = v } }
    /** Bumped on every prefs write; part of the visible-rows memo key. */
    let prefsVersion = 0

    function loadPrefs() {
      try {
        const parsed = JSON.parse(storage.getItem(PREFS_KEY) || '{}')
        return {
          disabled: new Set(Array.isArray(parsed.disabled) ? parsed.disabled : []),
          deleted: new Set(Array.isArray(parsed.deleted) ? parsed.deleted : []),
          pendingDeletes: Array.isArray(parsed.pendingDeletes) ? parsed.pendingDeletes : [],
        }
      } catch {
        return { disabled: new Set(), deleted: new Set(), pendingDeletes: [] }
      }
    }
    function savePrefs(prefs) {
      storage.setItem(PREFS_KEY, JSON.stringify({
        disabled: [...prefs.disabled],
        deleted: [...prefs.deleted],
        pendingDeletes: prefs.pendingDeletes,
      }))
      prefsVersion += 1
    }

    // ---------- host management API ----------
    function apiBase(path) {
      // Mirror the shipped file-upload client: resolve against the document
      // base and send credentials, or the desktop access gate refuses it.
      const base = typeof document !== 'undefined' ? document.baseURI : undefined
      return base ? new URL(path, base).href : path
    }
    async function api(action, body) {
      const res = await fetch(apiBase(`/skill-menu/${action}`), {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const error = new Error(`skill-menu/${action} failed (${res.status})`)
        error.status = res.status
        error.code = data?.error
        throw error
      }
      return data
    }
    async function probeApi(cwd) {
      try {
        const res = await fetch(apiBase(`/skill-menu/state?cwd=${encodeURIComponent(cwd || '')}`), {
          credentials: 'include',
        })
        if (!res.ok) return { ok: false, roots: { user: [], workspace: [] } }
        const data = await res.json()
        return { ok: true, roots: data.roots ?? { user: [], workspace: [] } }
      } catch {
        return { ok: false, roots: { user: [], workspace: [] } }
      }
    }
    async function flushPendingDeletes(cwd) {
      const prefs = loadPrefs()
      if (prefs.pendingDeletes.length === 0) return
      const keep = []
      for (const item of prefs.pendingDeletes) {
        try { await api('delete', { ...item, cwd }) }
        catch { keep.push(item) }
      }
      if (keep.length !== prefs.pendingDeletes.length) {
        prefs.pendingDeletes = keep
        savePrefs(prefs)
      }
    }

    // ---------- panel state ----------
    const panelState = {
      value: { open: false, sessionId: undefined },
      listeners: new Set(),
      get() { return this.value },
      set(next) {
        this.value = next
        for (const fn of [...this.listeners]) fn()
      },
      subscribe(fn) {
        this.listeners.add(fn)
        return () => this.listeners.delete(fn)
      },
    }
    function openManager(sessionId) {
      panelState.set({ open: true, sessionId })
    }
    function closeManager() {
      panelState.set({ open: false, sessionId: undefined })
    }

    const AVATAR_COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6']
    function avatarColor(name) {
      let sum = 0
      for (const ch of name) sum += ch.codePointAt(0)
      return AVATAR_COLORS[sum % AVATAR_COLORS.length]
    }
    const clamp2 = {
      display: '-webkit-box',
      WebkitLineClamp: '2',
      WebkitBoxOrient: 'vertical',
      overflow: 'hidden',
    }

    function ToggleSwitch({ checked, onChange, disabled }) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': checked,
        disabled: disabled === true,
        onClick: onChange,
        style: {
          position: 'relative', flex: 'none', width: '34px', height: '20px', borderRadius: '10px',
          border: 'none', padding: 0, cursor: disabled ? 'default' : 'pointer',
          background: checked ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l2)',
          transition: 'background 120ms ease',
        },
      }, h('span', {
        style: {
          position: 'absolute', top: '2px', left: '2px', width: '16px', height: '16px', borderRadius: '50%',
          background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transform: checked ? 'translateX(14px)' : 'none', transition: 'transform 120ms ease',
        },
      }))
    }

    return {
      inject: ['inputTriggers', 'sessions', 'slots', 'locale', 'remote', 'remote.skills'],
      apply(ctx) {
        const sessions = ctx.sessions
        const remoteSkills = ctx.remote.skills
        const isZh = () => ctx.locale.getLocale().active.toLowerCase().startsWith('zh')
        const cwdOf = (sessionId) => sessions.list.getSnapshot().byId[sessionId]?.cwd ?? ''
        /** sessionId -> catalog fetch with a stable rows snapshot. */
        const fetches = new Map()
        /**
         * sessionId -> the exact hit object of the open plus-menu. Kept OUT of
         * the bridge component on purpose: composer remount churn must not
         * orphan the toggleSource wrapper's target.
         */
        const plusHits = new Map()
        /** sessionId -> bridge { controller, repair } installed by the overlay entry. */
        const bridges = new Map()
        /** rows snapshot -> memoized visible rows (filter state keyed by prefsVersion). */
        const rowMemos = new WeakMap()
        let prefs = loadPrefs()

        const notifyBridges = (sessionId) => { bridges.get(sessionId)?.repair() }
        const notifyAll = () => { for (const sessionId of [...bridges.keys()]) notifyBridges(sessionId) }

        /** Composer notice for action feedback (the menu closes on pick). */
        const notice = (sessionId, text) => {
          try {
            const actx = sessions.scope(sessionId)
            const conversation = actx?.get('conversation')
            conversation?.input?.for(actx)?.notify('info', text)
          } catch {
            console.error('[skill-menu] notice:', text)
          }
        }

        /**
         * Add a skill from local disk: the desktop's native folder-dialog
         * bridge first, then a host copy into the user skills directory.
         * `undefined` means no picker was available; `null` means cancel.
         */
        async function pickSkillFolder() {
          const bridge = globalThis.__DSH_DIRECTORY_PICKER__
          const pick = bridge !== null && typeof bridge === 'object' ? bridge.pick : undefined
          if (typeof pick === 'function') {
            try {
              const value = await pick.call(bridge)
              // A present bridge answering with anything but a path is a cancel.
              return typeof value === 'string' && value !== '' ? value : null
            } catch (error) {
              console.error('[skill-menu] native picker failed:', error)
            }
          }
          try {
            const picked = await ctx.remote.directoryPicker.pick()
            const value = picked && typeof picked === 'object' && 'ok' in picked
              ? (picked.ok ? picked.value : null)
              : picked
            return typeof value === 'string' && value !== '' ? value : (value == null ? null : undefined)
          } catch (error) {
            console.error('[skill-menu] directory picker remote failed:', error)
            return undefined
          }
        }

        async function importSkill(sessionId) {
          const zh = isZh()
          let sourceDir
          try {
            sourceDir = await pickSkillFolder()
          } catch {
            sourceDir = undefined
          }
          if (sourceDir === null) return // user cancelled
          if (typeof sourceDir !== 'string' || sourceDir === '') {
            try {
              await api('open-dir', { cwd: cwdOf(sessionId) })
              notice(sessionId, zh ? '已打开本地技能目录，可手动放入技能文件夹' : 'Opened the local skills folder; copy skill folders there manually')
            } catch {
              notice(sessionId, zh ? '无法弹出文件选择，请重启 DSH 后重试' : 'File picker unavailable; restart DSH and retry')
            }
            return
          }
          try {
            const result = await api('import', { sourceDir, cwd: cwdOf(sessionId) })
            invalidate(sessionId)
            fetchSkills(sessionId).promise.catch(() => {})
            notice(sessionId, zh ? `已导入技能：${result.name ?? sourceDir}` : `Imported skill: ${result.name ?? sourceDir}`)
            openManager(sessionId)
          } catch (error) {
            const code = error && error.code
            const message = code === 'exists'
              ? (zh ? '已存在同名技能，先在管理页删除旧的再导入' : 'A skill with this name already exists; delete it in the manager first')
              : code === 'no-skill-md'
                ? (zh ? '所选文件夹里没有 SKILL.md，请选择技能文件夹' : 'No SKILL.md in the selected folder')
                : code === 'not-a-directory'
                  ? (zh ? '请选择一个文件夹' : 'Select a folder')
                  : String((error && error.message) || error)
            notice(sessionId, zh ? `导入失败：${message}` : `Import failed: ${message}`)
          }
        }

        function actionRows() {
          const zh = isZh()
          const manage = zh ? '管理技能' : 'Manage skills'
          const add = zh ? '从本地添加技能' : 'Add skill from local'
          return [
            {
              // name === label: the menu renders a name alias whenever the
              // two differ, so internal markers ride `value` instead.
              name: manage,
              label: manage,
              value: '__manage__',
              description: zh ? '启用、停用或删除技能' : 'Enable, disable or delete skills',
              icon: GearIcon,
              section: zh ? '技能' : 'Skills',
            },
            {
              name: add,
              label: add,
              value: '__add__',
              description: zh ? '选择文件夹并导入技能' : 'Pick a folder and import the skill',
              icon: FolderPlusIcon,
              section: zh ? '技能' : 'Skills',
            },
          ]
        }

        function buildRows(skills) {
          const zh = isZh()
          return skills.map(skill => ({
            name: skill.name,
            label: skill.name,
            description: skill.modelInvocable === false
              ? `${zh ? '仅用户' : 'user-only'} · ${skill.description || ''}`.trim()
              : (skill.description || ''),
            icon: SkillIcon,
            section: zh ? '技能' : 'Skills',
          }))
        }

        /** Enabled + undeleted skill rows plus the two management action rows. */
        function visibleRows(sessionId) {
          const entry = fetches.get(sessionId)
          const rows = entry?.rows
          if (rows === undefined) return undefined
          let memo = rowMemos.get(rows)
          if (memo === undefined || memo.version !== prefsVersion) {
            const shown = rows.filter(row => !prefs.deleted.has(row.name) && !prefs.disabled.has(row.name))
            memo = { version: prefsVersion, result: [...shown, ...actionRows()] }
            rowMemos.set(rows, memo)
          }
          return memo.result
        }

        function fetchSkills(sessionId, force = false) {
          if (force) {
            const stale = fetches.get(sessionId)
            if (stale !== undefined) {
              fetches.delete(sessionId)
              stale.abort.abort()
            }
          }
          const existing = fetches.get(sessionId)
          if (existing !== undefined) return existing
          const abort = new AbortController()
          const entry = { promise: null, abort, skills: undefined, rows: undefined, failed: false }
          entry.promise = (async () => {
            if (sessions.binding(sessionId) === undefined) {
              throw new Error(`skill catalog requires a retained session "${sessionId}"`)
            }
            return sessions.using(sessionId, { source: 'skillMenuCatalog', signal: abort.signal }, async (reference) => {
              abort.signal.throwIfAborted()
              const state = reference.binding.session.getSnapshot()
              if (state.openState !== 'open') {
                throw state.openError ?? new Error(`session "${sessionId}" is not open`)
              }
              const result = await remoteSkills.list({ sessionId }, abort.signal)
              abort.signal.throwIfAborted()
              if (!result.ok) {
                throw new Error(`skills/list failed: ${result.error.code}: ${result.error.message}`)
              }
              return result.value.skills
            })
          })()
          fetches.set(sessionId, entry)
          entry.promise.then(
            (skills) => {
              entry.skills = skills
              entry.rows = buildRows(skills)
              notifyBridges(sessionId)
            },
            () => {
              entry.failed = true
              entry.skills = []
              entry.rows = EMPTY_ITEMS
              notifyBridges(sessionId)
            },
          )
          return entry
        }

        function invalidate(sessionId) {
          const entry = fetches.get(sessionId)
          if (entry === undefined) return
          fetches.delete(sessionId)
          entry.abort.abort()
          notifyBridges(sessionId)
        }

        function clearAll() {
          for (const sessionId of [...fetches.keys()]) invalidate(sessionId)
        }

        /**
         * Splice the skills group into the open plus-menu. The plus launcher
         * (the `+` button) seeds exactly one 'command' group; this adds the
         * skills group above it and keeps its rows fresh as catalogs settle.
         */
        function repairMenu(sessionId) {
          const bridge = bridges.get(sessionId)
          if (bridge === undefined) return
          // Subagent composers stay untouched: the skill catalog RPC can
          // resume a cold persisted subagent, which merely viewing its
          // composer must never do (the built-in skill source opts out too).
          if (sessions.subagentAddress(sessionId) !== undefined) return
          const state = bridge.controller.menu.getSnapshot()
          if (!state.open) {
            plusHits.delete(sessionId)
            return
          }
          // Object identity: the plus launcher's synthetic hit is recorded by
          // the toggleSource wrapper below. A typed `/` menu must stay untouched.
          const plusMenu = state.hit !== null && state.hit === plusHits.get(sessionId)
          const current = state.groups.find(group => group.source === 'skill-menu')
          if (!plusMenu) {
            if (current !== undefined && (current.status !== 'ready' || current.items !== EMPTY_ITEMS)) {
              bridge.controller.menu.set({
                ...state,
                groups: state.groups.map(group => (group.source === 'skill-menu'
                  ? { ...group, status: 'ready', items: EMPTY_ITEMS }
                  : group)),
                highlight: state.highlight?.source === 'skill-menu' ? null : state.highlight,
              })
            }
            return
          }
          fetchSkills(sessionId)
          const rows = visibleRows(sessionId)
          const status = rows === undefined ? 'pending' : 'ready'
          const items = rows ?? EMPTY_ITEMS
          const first = state.groups[0]?.source === 'skill-menu'
          if (current !== undefined && first && current.status === status && current.items === items) return
          const group = { source: 'skill-menu', showGroupTitle: false, status, items }
          const groups = [group, ...state.groups.filter(group => group.source !== 'skill-menu')]
          let highlight = state.highlight
          if (items.length > 0 && (highlight === null || highlight.source === 'command')) {
            highlight = { source: 'skill-menu', index: 0 }
          }
          bridge.controller.menu.set({ ...state, groups, highlight })
        }

        // The slash source supplies pick routing and settle refreshes inside
        // the plus-menu; it stays invisible on the typed `/` menu so the
        // built-in skill group there is never duplicated.
        const source = {
          trigger: '/',
          name: 'skill-menu',
          order: 100,
          showGroupTitle: false,
          async candidates(session, request) {
            if (sessions.subagentAddress(session.sessionId) !== undefined) return []
            const bridge = bridges.get(session.sessionId)
            if (bridge === undefined) return []
            const entry = fetchSkills(session.sessionId)
            try {
              await entry.promise
            } catch {
              return []
            }
            if (request.signal.aborted) return []
            const state = bridge.controller.menu.getSnapshot()
            return state.hit !== null && state.hit === plusHits.get(session.sessionId)
              ? (visibleRows(session.sessionId) ?? EMPTY_ITEMS)
              : []
          },
          onPick(pick) {
            const marker = pick.candidate.value
            const sessionId = pick.session.sessionId
            if (marker === '__manage__') {
              openManager(sessionId)
              return 'handled'
            }
            if (marker === '__add__') {
              void importSkill(sessionId)
              return 'handled'
            }
            // The input pipeline owns insertion and its revision guard; this
            // only names the literal text (the host loads the skill body).
            return { text: `/${pick.candidate.name} ` }
          },
          warm(session) {
            if (sessions.subagentAddress(session.sessionId) === undefined) {
              fetchSkills(session.sessionId).promise.catch(() => {})
            }
          },
        }

        ctx.effect(() => {
          const unregister = ctx.inputTriggers.registerSource(source)
          return () => {
            unregister()
            clearAll()
          }
        }, 'skill-menu: slash source')

        // A mounted bridge watches its session's native menu store, marks the
        // plus launcher's exact hit, and repairs the skills group.
        function SkillMenuBridge(props) {
          const sessionId = props.sessionId
          React.useEffect(() => {
            try {
              if (sessionId === undefined) return undefined
              const actx = sessions.scope(sessionId)
              if (actx === undefined) return undefined
              const controller = ctx.inputTriggers.sessionOf(actx)
              const bridge = {
                sessionId,
                controller,
                repair: () => {
                  try {
                    repairMenu(sessionId)
                  } catch (error) {
                    console.error('[skill-menu] repair failed:', error)
                  }
                },
              }
              // The `+` button is the only caller of toggleSource('command'):
              // wrapping the instance method identifies the plus-menu exactly.
              // The hit goes in the SESSION-level map so composer remounts and
              // bridge churn can never orphan it; installed once per controller
              // and deliberately survives bridge cleanup.
              const originalToggle = controller.toggleSource
              if (typeof originalToggle === 'function' && controller.__skillMenuWrapped !== true) {
                controller.__skillMenuWrapped = true
                controller.toggleSource = function toggleSource(name, hit) {
                  if (name === 'command') plusHits.set(sessionId, hit)
                  originalToggle.call(this, name, hit)
                  if (name === 'command') notifyBridges(sessionId)
                }
              }
              bridges.set(sessionId, bridge)
              const unsubscribe = controller.menu.subscribe(bridge.repair)
              bridge.repair()
              return () => {
                unsubscribe()
                if (bridges.get(sessionId) === bridge) bridges.delete(sessionId)
              }
            } catch (error) {
              console.error('[skill-menu] bridge setup failed:', error)
              return undefined
            }
          }, [sessionId])
          return null
        }

        ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
          name: 'conversation.input.overlay',
          id: 'skill-menu-bridge',
          order: 5,
        }, SkillMenuBridge))

        // ---------- management panel ----------
        function SkillManagerPanel() {
          const panel = panelState.get()
          const [, bump] = React.useReducer(x => x + 1, 0)
          React.useEffect(() => panelState.subscribe(bump), [])
          const [ready, setReady] = React.useState(false)
          const [skills, setSkills] = React.useState([])
          const [roots, setRoots] = React.useState({ user: [], workspace: [] })
          const [apiOk, setApiOk] = React.useState(false)
          const [query, setQuery] = React.useState('')
          const [batch, setBatch] = React.useState(false)
          const [selected, setSelected] = React.useState(() => new Set())
          const [confirming, setConfirming] = React.useState(null)
          const [toast, setToast] = React.useState(null)
          const zh = isZh()

          React.useEffect(() => {
            if (!panel.open) return undefined
            const onKey = (event) => {
              if (event.key === 'Escape') closeManager()
            }
            document.addEventListener('keydown', onKey)
            return () => document.removeEventListener('keydown', onKey)
          }, [panel.open])

          React.useEffect(() => {
            if (!panel.open || panel.sessionId === undefined) return undefined
            let cancelled = false
            ;(async () => {
              setReady(false)
              const cwd = cwdOf(panel.sessionId)
              const probe = await probeApi(cwd)
              if (probe.ok) await flushPendingDeletes(cwd)
              let catalog = []
              try {
                const entry = fetchSkills(panel.sessionId, true)
                catalog = (await entry.promise) ?? []
              } catch {
                catalog = []
              }
              if (cancelled) return
              prefs = loadPrefs()
              setApiOk(probe.ok)
              setRoots(probe.roots)
              setSkills(catalog.filter(skill => !prefs.deleted.has(skill.name)))
              setReady(true)
            })()
            return () => { cancelled = true }
          }, [panel.open, panel.sessionId])

          if (!panel.open) return null

          const matchesRoot = (p, root) => p !== '' && (p === root || p.startsWith(root + '\\') || p.startsWith(root + '/'))
          const groupOf = (skill) => {
            const p = skill.path || ''
            if (/app\.asar|node_modules/i.test(p)) return 'builtin'
            if (roots.user.some(root => matchesRoot(p, root))) return 'user'
            if (roots.workspace.some(root => matchesRoot(p, root))) return 'workspace'
            // API unavailable: classify by path shape so user/workspace skills
            // are not mislabeled as built-in and lose their delete affordance.
            const cwd = cwdOf(panel.sessionId) || ''
            if (cwd !== '' && matchesRoot(p, cwd)) return 'workspace'
            if (/[\\/]\.(?:dsh|agents)[\\/]skills[\\/]/i.test(p)) return 'user'
            return p === '' ? 'builtin' : 'user'
          }
          const deletable = (skill) => {
            const g = groupOf(skill)
            return (g === 'user' || g === 'workspace') && !!skill.path && !/app\.asar|node_modules/i.test(skill.path)
          }

          const queryText = query.trim().toLowerCase()
          const filtered = queryText === ''
            ? skills
            : skills.filter(s => s.name.toLowerCase().includes(queryText)
              || (s.description || '').toLowerCase().includes(queryText))
          const groups = [
            { key: 'user', title: zh ? '用户自定义' : 'User-defined', rows: filtered.filter(s => groupOf(s) === 'user') },
            { key: 'workspace', title: zh ? '工作区' : 'Workspace', rows: filtered.filter(s => groupOf(s) === 'workspace') },
            { key: 'builtin', title: zh ? '内置' : 'Built-in', rows: filtered.filter(s => groupOf(s) === 'builtin') },
          ].filter(g => g.rows.length > 0)

          const setEnabled = (name, enabled) => {
            const next = loadPrefs()
            if (enabled) next.disabled.delete(name)
            else next.disabled.add(name)
            savePrefs(next)
            prefs = next
            notifyAll()
            bump()
          }
          const doDelete = async (skill) => {
            const cwd = cwdOf(panel.sessionId) || ''
            const next = loadPrefs()
            next.deleted.add(skill.name)
            if (apiOk && skill.path) {
              try {
                await api('delete', { name: skill.name, path: skill.path, cwd })
              } catch {
                next.pendingDeletes.push({ name: skill.name, path: skill.path })
                setToast(zh ? '文件暂不可清理，重启 DSH 后会自动处理' : 'File cleanup waits for a DSH restart')
              }
            } else if (skill.path) {
              next.pendingDeletes.push({ name: skill.name, path: skill.path })
              setToast(zh ? '已隐藏；删除文件需重启 DSH 后生效' : 'Hidden; file deletion activates after a DSH restart')
            }
            savePrefs(next)
            prefs = next
            setSkills(list => list.filter(s => s.name !== skill.name))
            setConfirming(null)
            notifyAll()
          }
          const setBatchEnabled = (enabled) => {
            const next = loadPrefs()
            for (const name of selected) {
              if (enabled) next.disabled.delete(name)
              else next.disabled.add(name)
            }
            savePrefs(next)
            prefs = next
            setSelected(new Set())
            notifyAll()
            bump()
          }

          const inputStyle = {
            height: '30px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)',
            background: 'transparent', color: 'var(--dsw-alias-label-primary)', padding: '0 10px',
            fontSize: '12px', outline: 'none', width: '220px',
          }
          const buttonStyle = {
            height: '30px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2)',
            background: 'transparent', color: 'var(--dsw-alias-label-primary)', padding: '0 12px',
            fontSize: '12px', cursor: 'pointer',
          }

          return h('div', {
            style: { position: 'fixed', inset: '0', zIndex: 1000 },
            role: 'dialog', 'aria-modal': 'true', 'aria-label': zh ? '技能管理' : 'Skill manager',
          },
            h('div', {
              style: { position: 'absolute', inset: '0', background: 'rgba(0,0,0,0.38)' },
              onClick: closeManager,
            }),
            h('div', {
              style: {
                position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
                width: 'min(960px, calc(100vw - 48px))', height: 'min(680px, calc(100vh - 48px))',
                background: 'var(--dsw-specific-input-major)', border: '1px solid var(--dsw-alias-border-l1)',
                borderRadius: 'var(--dsw-radius-panel)', boxShadow: 'var(--dsw-elevation-prominent)',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
                color: 'var(--dsw-alias-label-primary)', fontSize: '13px',
              },
            },
              // header
              h('div', {
                style: {
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 18px',
                  borderBottom: '1px solid var(--dsw-alias-border-l1)', flex: 'none',
                },
              },
                h('button', {
                  type: 'button', onClick: closeManager,
                  'aria-label': zh ? '返回' : 'Back',
                  style: {
                    width: '28px', height: '28px', borderRadius: '8px', border: 'none', padding: 0,
                    background: 'transparent', color: 'var(--dsw-alias-label-secondary)', cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  },
                }, h(BackIcon)),
                h('div', { style: { fontSize: '15px', fontWeight: 600 } },
                  zh ? `已安装技能 (${skills.length})` : `Installed skills (${skills.length})`),
                h('div', { style: { flex: '1' } }),
                h('input', {
                  value: query,
                  onChange: e => setQuery(e.target.value),
                  placeholder: zh ? '搜索已安装的技能' : 'Search installed skills',
                  style: inputStyle,
                }),
                h('button', {
                  type: 'button',
                  style: { ...buttonStyle, ...(batch ? { borderColor: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-state-business-primary)' } : {}) },
                  onClick: () => { setBatch(v => !v); setSelected(new Set()) },
                }, batch ? (zh ? '完成' : 'Done') : (zh ? '批量管理' : 'Batch manage')),
              ),
              // body
              h('div', { style: { flex: '1', overflowY: 'auto', padding: '18px' } },
                toast !== null && h('div', {
                  role: 'status',
                  style: {
                    marginBottom: '12px', padding: '8px 12px', borderRadius: '8px',
                    background: 'var(--dsw-alias-interactive-bg-hover)', color: 'var(--dsw-alias-label-secondary)', fontSize: '12px',
                  },
                }, toast),
                !ready
                  ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', padding: '32px 0', textAlign: 'center' } },
                    zh ? '加载中…' : 'Loading…')
                  : groups.length === 0
                    ? h('div', { style: { color: 'var(--dsw-alias-label-tertiary)', padding: '32px 0', textAlign: 'center' } },
                      zh ? '没有匹配的技能' : 'No matching skills')
                    : groups.map(group => h('div', { key: group.key },
                      h('div', {
                        style: {
                          fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', margin: '14px 0 10px',
                        },
                      }, `${group.title} (${group.rows.length})`),
                      h('div', {
                        style: {
                          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px',
                        },
                      }, group.rows.map(skill => {
                        const enabled = !prefs.disabled.has(skill.name)
                        const isSelected = selected.has(skill.name)
                        return h('div', {
                          key: skill.name,
                          onClick: batch
                            ? () => {
                              setSelected(prev => {
                                const next = new Set(prev)
                                if (next.has(skill.name)) next.delete(skill.name)
                                else next.add(skill.name)
                                return next
                              })
                            }
                            : undefined,
                          style: {
                            border: `1px solid ${batch && isSelected ? 'var(--dsw-alias-state-business-primary)' : 'var(--dsw-alias-border-l1)'}`,
                            borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px',
                            cursor: batch ? 'pointer' : 'default',
                            ...(batch && isSelected ? { background: 'var(--dsw-alias-interactive-bg-hover)' } : {}),
                          },
                        },
                          h('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
                            h('div', {
                              style: {
                                width: '36px', height: '36px', borderRadius: '50%', flex: 'none',
                                background: avatarColor(skill.name), color: '#fff',
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '15px', fontWeight: 600,
                              },
                            }, batch ? (isSelected ? '✓' : (skill.name[0] || '?').toUpperCase()) : (skill.name[0] || '?').toUpperCase()),
                            h('div', { style: { flex: '1', minWidth: '0' } },
                              h('div', {
                                style: {
                                  fontSize: '13px', fontWeight: 600, overflow: 'hidden',
                                  textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                },
                              }, skill.name),
                              h('div', {
                                style: {
                                  ...clamp2, marginTop: '3px', fontSize: '12px', lineHeight: '18px',
                                  color: 'var(--dsw-alias-label-tertiary)',
                                },
                              }, skill.description || (zh ? '暂无描述' : 'No description'))),
                            batch
                              ? null
                              : h(ToggleSwitch, {
                                checked: enabled,
                                onChange: () => setEnabled(skill.name, !enabled),
                              }),
                          ),
                          !batch && h('div', {
                            style: { display: 'flex', alignItems: 'center', gap: '8px', minHeight: '22px' },
                          },
                            deletable(skill)
                              ? (confirming === skill.name
                                ? h('div', { style: { display: 'flex', gap: '8px' } },
                                  h('button', {
                                    type: 'button',
                                    onClick: () => { void doDelete(skill) },
                                    style: {
                                      border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '12px',
                                      cursor: 'pointer', background: 'var(--dsw-alias-state-error-primary)', color: '#fff',
                                    },
                                  }, zh ? '确认删除' : 'Confirm delete'),
                                  h('button', {
                                    type: 'button',
                                    onClick: () => setConfirming(null),
                                    style: {
                                      border: 'none', borderRadius: '6px', padding: '3px 10px', fontSize: '12px',
                                      cursor: 'pointer', background: 'transparent',
                                      color: 'var(--dsw-alias-label-secondary)',
                                    },
                                  }, zh ? '取消' : 'Cancel'))
                                : h('button', {
                                  type: 'button',
                                  onClick: () => {
                                    setConfirming(skill.name)
                                    window.setTimeout(() => setConfirming(v => v === skill.name ? null : v), 4000)
                                  },
                                  style: {
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    border: 'none', borderRadius: '6px', padding: '3px 8px', fontSize: '12px',
                                    cursor: 'pointer', background: 'transparent',
                                    color: 'var(--dsw-alias-label-tertiary)',
                                  },
                                }, h(TrashIcon), zh ? '删除' : 'Delete'))
                              : h('span', { style: { fontSize: '11px', color: 'var(--dsw-alias-label-tertiary)' } },
                                zh ? '内置技能不可删除，仅可停用' : 'Built-in: disable only'),
                          ),
                        )
                      })),
                    )),
              ),
              // batch footer
              batch && h('div', {
                style: {
                  flex: 'none', display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 18px',
                  borderTop: '1px solid var(--dsw-alias-border-l1)',
                },
              },
                h('div', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
                  zh ? `已选 ${selected.size} 个` : `${selected.size} selected`),
                h('div', { style: { flex: '1' } }),
                h('button', {
                  type: 'button', style: buttonStyle,
                  onClick: () => setSelected(new Set(filtered.map(s => s.name))),
                }, zh ? '全选' : 'Select all'),
                h('button', {
                  type: 'button', style: buttonStyle,
                  onClick: () => setBatchEnabled(true),
                }, zh ? '批量启用' : 'Enable selected'),
                h('button', {
                  type: 'button', style: buttonStyle,
                  onClick: () => setBatchEnabled(false),
                }, zh ? '批量停用' : 'Disable selected'),
              ),
            ),
          )
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'skill-menu-panel',
          order: 20,
        }, SkillManagerPanel))

        // ---------- cache invalidation wiring ----------
        ctx.remote.$on('agent-preset/selected', (sessionId) => { invalidate(sessionId) })
        ctx.remote.$on('plugin-manager/changed', clearAll)
        ctx.on('connection/reset', clearAll)
        ctx.on('locale/change', () => {
          for (const entry of fetches.values()) {
            if (entry.skills !== undefined && entry.failed !== true) entry.rows = buildRows(entry.skills)
          }
          notifyAll()
        })
      },
    }
  },
})
