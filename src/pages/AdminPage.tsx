import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, aiSettingsApi, fileApi, messageApi, type AiProvider, type AiSettingsResponse, type AiTestResult, type AdminAnalytics, type AdminDebug, type AdminStats, type AdminUserDetail, type AdminUserRow, type FileRow, type MessageRow, type StorageInfo } from '../lib/api'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Admin.module.css'

type Tab = 'dashboard' | 'users' | 'analytics' | 'debug' | 'messages' | 'files' | 'settings'

const PAGE_SIZE = 15

function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function fmtDateTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AdminPage() {
  const { user } = useAuth()
  const [tab, setTab] = useState<Tab>('dashboard')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [debug, setDebug] = useState<AdminDebug | null>(null)
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [userTotal, setUserTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<AdminUserDetail | null>(null)
  const [busy, setBusy] = useState(false)

  if (!user?.isAdmin) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.noAccess}>
          <span style={{ fontSize: 48 }}>🔒</span>
          <h2>需要管理员权限</h2>
          <p>你没有权限访问管理后台。请使用管理员账号登录。</p>
          <Link to="/" className="btn btn-primary">返回首页</Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>管理后台</h1>
          <p className={styles.subtitle}>欢迎，{user.username}</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {(
          [
            ['dashboard', '系统概览'],
            ['settings', 'AI 设置'],
            ['users', '用户管理'],
            ['analytics', '流量监控'],
            ['messages', '留言板'],
            ['files', '网盘'],
            ['debug', 'Debug 诊断'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'dashboard' && (
        <DashboardTab
          stats={stats}
          loading={loading}
          onLoad={() => { setLoading(true); adminApi.stats().then(setStats).catch(() => toast('加载失败', 'error')).finally(() => setLoading(false)) }}
        />
      )}

      {tab === 'settings' && <AiSettingsTab />}

      {tab === 'users' && (
        <UsersTab
          users={users}
          total={userTotal}
          page={page}
          search={search}
          loading={loading}
          busy={busy}
          onSearch={(s) => { setSearch(s); setPage(1); doFetchUsers(s, 1) }}
          onPage={(p) => { setPage(p); doFetchUsers(search, p) }}
          onAction={doUserAction}
          onViewDetail={doViewDetail}
          onInitialLoad={() => doFetchUsers(search, page)}
        />
      )}

      {tab === 'analytics' && (
        <AnalyticsTab
          analytics={analytics}
          loading={loading}
          onLoad={() => { setLoading(true); adminApi.analytics().then(setAnalytics).catch(() => toast('加载失败', 'error')).finally(() => setLoading(false)) }}
        />
      )}

      {tab === 'messages' && (
        <MessagesTab
          messages={messages}
          loading={loading}
          onLoad={() => { setLoading(true); messageApi.list(100, 0).then((r) => setMessages(r.messages)).catch(() => toast('加载失败', 'error')).finally(() => setLoading(false)) }}
          onDelete={doDeleteMessage}
        />
      )}

      {tab === 'files' && <FilesTab />}

      {tab === 'debug' && (
        <DebugTab
          debug={debug}
          loading={loading}
          onLoad={() => { setLoading(true); adminApi.debug().then(setDebug).catch(() => toast('加载失败', 'error')).finally(() => setLoading(false)) }}
        />
      )}

      {detail && (
        <UserDetailDrawer
          detail={detail}
          busy={busy}
          onClose={() => setDetail(null)}
          onAction={async (action, id) => {
            await doUserAction(action, id)
            setDetail(await adminApi.userDetails(id).catch(() => null))
          }}
        />
      )}
    </div>
  )

  // ---------- 数据加载 ----------

  async function doFetchUsers(searchStr: string, pageNum: number) {
    setLoading(true)
    try {
      const res = await adminApi.users(searchStr, pageNum, PAGE_SIZE)
      setUsers(res.users)
      setUserTotal(res.total)
    } catch {
      toast('加载用户列表失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function doViewDetail(id: string) {
    try {
      setDetail(await adminApi.userDetails(id))
    } catch {
      toast('加载用户详情失败', 'error')
    }
  }

  async function doUserAction(action: string, id: string) {
    if (id === user!.id) {
      toast('不能对自己执行此操作', 'error')
      return
    }
    setBusy(true)
    try {
      if (action === 'ban') {
        const res = await adminApi.toggleBan(id)
        toast(res.isBanned ? '已封禁用户' : '已解封用户', 'success')
      } else if (action === 'admin') {
        const res = await adminApi.toggleAdmin(id)
        toast(res.isAdmin ? '已提升为管理员' : '已取消管理员权限', 'success')
      } else if (action === 'delete') {
        if (!confirm('确定要永久删除该用户及其所有数据吗？此操作不可撤销。')) return
        await adminApi.deleteUser(id)
        toast('用户已删除', 'success')
        setDetail(null)
        doFetchUsers(search, page)
      } else if (action === 'password') {
        const np = prompt('请输入新密码（至少 6 位）：')
        if (!np || np.length < 6) {
          toast('密码至少 6 位', 'error')
          return
        }
        await adminApi.resetPassword(id, np)
        toast('密码已重置', 'success')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : '操作失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  async function doDeleteMessage(id: number) {
    if (!confirm('确定删除此留言？')) return
    try {
      await messageApi.delete(id)
      toast('留言已删除', 'success')
      messageApi.list(100, 0).then((r) => setMessages(r.messages)).catch(() => {})
    } catch {
      toast('删除失败', 'error')
    }
  }
}

// ---------- Dashboard Tab ----------

function DashboardTab({
  stats, loading, onLoad,
}: {
  stats: AdminStats | null
  loading: boolean
  onLoad: () => void
}) {
  useEffect(() => { onLoad() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !stats) return <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>

  if (!stats) return <div className={styles.loading}>暂无数据</div>

  const maxGame = Math.max(...stats.gameDistribution.map(g => g.cnt), 1)

  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
          <div className={styles.statValue}>{stats.totalUsers}</div>
          <div className={styles.statLabel}>总用户数</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardCyan}`}>
          <div className={styles.statValue}>{stats.totalScores}</div>
          <div className={styles.statLabel}>总分数记录</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGold}`}>
          <div className={styles.statValue}>{stats.totalFavorites}</div>
          <div className={styles.statLabel}>总收藏数</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statValue}>{stats.newUsers7d}</div>
          <div className={styles.statLabel}>近 7 日新增</div>
        </div>
      </div>

      {stats.gameDistribution.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>各游戏分数分布</h2>
          <div className={styles.chartWrap}>
            {stats.gameDistribution.map(g => (
              <div key={g.gameId} className={styles.chartRow}>
                <span className={styles.chartLabel}>{g.gameId}</span>
                <div className={styles.chartBarWrap}>
                  <div className={styles.chartBar} style={{ width: `${(g.cnt / maxGame) * 100}%` }} />
                </div>
                <span className={styles.chartCount}>{g.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.recentRegistrations.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>最近注册</h2>
          <table className={styles.recentTable}>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>注册时间</th>
                <th>角色</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentRegistrations.map((u, i) => (
                <tr key={i}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    <span className={u.isAdmin ? styles.badgeAdmin : styles.badgeNormal}>
                      {u.isAdmin ? '管理员' : '普通用户'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ---------- AI Settings Tab ----------

const PROVIDER_LABEL: Record<AiProvider, string> = {
  api: 'API 接口',
  cloudflare: 'Cloudflare Workers AI',
  off: '关闭',
}

function AiSettingsTab() {
  const [data, setData] = useState<AiSettingsResponse | null>(null)
  const [provider, setProvider] = useState<AiProvider>('api')
  const [apiModel, setApiModel] = useState('')
  const [cfModel, setCfModel] = useState('')
  const [reasoning, setReasoning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<AiTestResult | null>(null)

  useEffect(() => {
    aiSettingsApi
      .get()
      .then((r) => {
        setData(r)
        setProvider(r.settings.provider)
        setApiModel(r.settings.apiModel)
        setCfModel(r.settings.cfModel)
        setReasoning(r.settings.reasoning)
      })
      .catch(() => toast('加载 AI 设置失败', 'error'))
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
  }

  const models = provider === 'cloudflare' ? data.cfModels : data.apiModels
  const modelId = provider === 'cloudflare' ? cfModel : apiModel
  const current = models.find((m) => m.id === modelId)
  const patch = { provider, apiModel, cfModel, reasoning }

  const save = async () => {
    setSaving(true)
    try {
      const res = await aiSettingsApi.save(patch)
      setData((d) => (d ? { ...d, settings: res.settings, capabilities: res.capabilities } : d))
      toast('AI 设置已保存，下一手棋生效', 'success')
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await aiSettingsApi.test(patch))
    } catch (e) {
      setTestResult({
        ok: false,
        provider,
        model: modelId,
        error: e instanceof Error ? e.message : '请求失败',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>AI 提供方</h2>
        <div className={styles.segGroup}>
          {(['api', 'cloudflare', 'off'] as AiProvider[]).map((p) => (
            <button
              key={p}
              className={`${styles.seg} ${provider === p ? styles.segActive : ''}`}
              onClick={() => { setProvider(p); setTestResult(null) }}
            >
              {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
        <div className={styles.capRow}>
          <span className={`${styles.checkDot} ${data.capabilities.api.configured ? styles.checkDotOk : styles.checkDotFail}`} />
          <span>
            API 接口{data.capabilities.api.configured
              ? `：已配置 ${data.capabilities.api.baseUrl}`
              : '：凭据未配置（AI_BASE_URL / AI_API_KEY）'}
          </span>
        </div>
        <div className={styles.capRow}>
          <span className={`${styles.checkDot} ${data.capabilities.cloudflare.available ? styles.checkDotOk : styles.checkDotFail}`} />
          <span>
            {data.capabilities.cloudflare.available
              ? 'Workers AI：可用'
              : 'Workers AI：未开通（Cloudflare 控制台 → Workers & Pages → Workers AI 启用）'}
          </span>
        </div>
      </div>

      {provider === 'off' ? (
        <div className={styles.section}>
          <p className={styles.hint}>
            已关闭：四个棋类的中等/困难难度全部使用本地 AI，不会调用任何外部模型，也不会产生费用。
          </p>
        </div>
      ) : (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>模型</h2>
          <select
            className={`input ${styles.selectField}`}
            value={modelId}
            onChange={(e) => {
              if (provider === 'cloudflare') setCfModel(e.target.value)
              else setApiModel(e.target.value)
              setTestResult(null)
            }}
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          {current && <p className={styles.hint}>{current.desc}</p>}
          {current?.temp !== undefined && (
            <p className={styles.hint}>该模型仅接受 temperature={current.temp}，已自动固定。</p>
          )}
        </div>
      )}

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>模型推理</h2>
        <div className={styles.segGroup}>
          <button
            className={`${styles.seg} ${!reasoning ? styles.segActive : ''}`}
            onClick={() => { setReasoning(false); setTestResult(null) }}
          >
            关闭（推荐）
          </button>
          <button
            className={`${styles.seg} ${reasoning ? styles.segActive : ''}`}
            onClick={() => { setReasoning(true); setTestResult(null) }}
          >
            开启
          </button>
        </div>
        <p className={styles.hint}>
          {reasoning
            ? '开启：模型先思考再落子，判断可能更好，但单手耗时可能从 1–4 秒升到 20–40 秒；部分模型会把 token 预算烧在推理上、返回空正文，此时自动回落本地 AI。'
            : '关闭：模型直接输出候选走法，单手约 1–4 秒。实测各模型关闭推理后都能正常返回候选。'}
          {provider === 'cloudflare' ? '（该选项仅对 API 接口生效）' : ''}
        </p>
      </div>

      <div className={styles.section}>
        <div className={styles.toolbar}>
          <button className="btn btn-primary" disabled={saving || testing} onClick={save}>
            {saving ? '保存中…' : '保存设置'}
          </button>
          <button className="btn btn-ghost" disabled={saving || testing || provider === 'off'} onClick={runTest}>
            {testing ? '测试中…' : '测试当前配置'}
          </button>
        </div>
        <p className={styles.hint}>
          测试会真实调用一次模型（用国际象棋开局局面），确认它能返回合法候选后再切换。
        </p>
        {testResult && (
          <div className={`${styles.testResult} ${testResult.ok ? styles.testOk : styles.testFail}`}>
            <div className={styles.testTitle}>
              <span>{testResult.ok ? '✓ 配置可用' : '✕ 配置不可用'}</span>
              <span className="font-mono">
                {testResult.model}
                {typeof testResult.ms === 'number' ? ` · ${testResult.ms}ms` : ''}
              </span>
            </div>
            {testResult.ok && testResult.parsed && (
              <div className="font-mono">{JSON.stringify(testResult.parsed)}</div>
            )}
            {!testResult.ok && testResult.error && <div>{testResult.error}</div>}
            {testResult.raw && <pre className={styles.testRaw}>{testResult.raw}</pre>}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Users Tab ----------

function UsersTab({
  users, total, page, search, loading, busy,
  onSearch, onPage, onAction, onViewDetail, onInitialLoad,
}: {
  users: AdminUserRow[]
  total: number
  page: number
  search: string
  loading: boolean
  busy: boolean
  onSearch: (s: string) => void
  onPage: (p: number) => void
  onAction: (action: string, id: string) => Promise<void>
  onViewDetail: (id: string) => void
  onInitialLoad: () => void
}) {
  useEffect(() => { onInitialLoad() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            className="input"
            style={{ paddingLeft: 38 }}
            type="text"
            placeholder="搜索用户名或邮箱…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
      ) : (
        <>
          <table className={styles.userTable}>
            <thead>
              <tr>
                <th>用户名</th>
                <th>邮箱</th>
                <th>注册时间</th>
                <th>角色</th>
                <th>状态</th>
                <th>分数 / 收藏</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-faint)', padding: 30 }}>暂无用户</td></tr>
              )}
              {users.map(u => (
                <tr key={u.id}>
                  <td>
                    <button className="actionBtn" onClick={() => onViewDetail(u.id)} style={{ cursor: 'pointer', background: 'transparent', border: 'none', color: 'var(--text)', fontWeight: 600, padding: 0, fontSize: 'inherit' }}>
                      {u.username}
                    </button>
                  </td>
                  <td style={{ fontSize: 13, color: 'var(--text-dim)' }}>{u.email}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    <span className={u.isAdmin ? styles.badgeAdmin : styles.badgeNormal}>
                      {u.isAdmin ? '管理员' : '普通'}
                    </span>
                  </td>
                  <td>
                    <span className={u.isBanned ? styles.badgeBanned : styles.badgeOk}>
                      {u.isBanned ? '已封禁' : '正常'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {u.scoreCount} / {u.favCount}
                  </td>
                  <td>
                    <div className={styles.actions}>
                      <button
                        className={`${styles.actionBtn} ${u.isBanned ? styles.actionBtnBanned : styles.actionBtnWarn}`}
                        onClick={() => onAction('ban', u.id)}
                        disabled={busy}
                      >
                        {u.isBanned ? '解封' : '封禁'}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnAdmin}`}
                        onClick={() => onAction('admin', u.id)}
                        disabled={busy}
                      >
                        {u.isAdmin ? '降权' : '提权'}
                      </button>
                      <button
                        className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
                        onClick={() => onAction('delete', u.id)}
                        disabled={busy}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className={styles.pagination}>
              <button className={styles.pageBtn} disabled={page <= 1} onClick={() => onPage(page - 1)}>上一页</button>
              <span>{page} / {totalPages}（共 {total} 人）</span>
              <button className={styles.pageBtn} disabled={page >= totalPages} onClick={() => onPage(page + 1)}>下一页</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------- Debug Tab ----------

function DebugTab({
  debug, loading, onLoad,
}: {
  debug: AdminDebug | null
  loading: boolean
  onLoad: () => void
}) {
  useEffect(() => { onLoad() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !debug) return <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
  if (!debug) return <div className={styles.loading}>暂无数据</div>

  const checks = [
    { label: 'D1 数据库', status: debug.db === 'connected' ? 'ok' : 'fail', detail: debug.db },
    { label: 'JWT 密钥', status: debug.jwtSecret === 'configured' ? 'ok' : 'fail', detail: debug.jwtSecret },
    { label: 'Resend 邮件密钥', status: debug.resendKey === 'configured' ? 'ok' : 'warn', detail: debug.resendKey },
    { label: '管理员邮箱', status: debug.adminEmail !== 'NOT_SET' ? 'ok' : 'warn', detail: debug.adminEmail },
    { label: '发件地址', status: 'ok', detail: debug.mailFrom },
  ]

  return (
    <div>
      <div className={styles.debugGrid}>
        <div className={styles.debugCard}>
          <div className={styles.debugCardTitle}>D1 数据库</div>
          <div className={`${styles.debugValue} ${debug.db === 'connected' ? styles.statusOk : styles.statusFail}`}>
            {debug.db}
          </div>
        </div>
        <div className={styles.debugCard}>
          <div className={styles.debugCardTitle}>Worker 版本</div>
          <div className={styles.debugValue}>{debug.workerVersion}</div>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>环境配置检查</h2>
        <ul className={styles.checklist}>
          {checks.map(c => (
            <li key={c.label} className={styles.checkItem}>
              <span className={`${styles.checkDot} ${c.status === 'ok' ? styles.checkDotOk : c.status === 'warn' ? styles.checkDotWarn : styles.checkDotFail}`}>
                {''}
              </span>
              <span style={{ flex: 1 }}>{c.label}</span>
              <span className={`font-mono ${c.status === 'ok' ? styles.statusOk : c.status === 'warn' ? styles.statusWarn : styles.statusFail}`} style={{ fontSize: 13 }}>
                {c.detail}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>配置变量</h2>
        <div className={styles.debugGrid} style={{ gridTemplateColumns: '1fr' }}>
          <div className={styles.debugCard}>
            <div className={styles.debugCardTitle}>ADMIN_EMAIL</div>
            <div className={styles.debugValue}>{debug.adminEmail}</div>
          </div>
          <div className={styles.debugCard}>
            <div className={styles.debugCardTitle}>MAIL_FROM</div>
            <div className={styles.debugValue}>{debug.mailFrom}</div>
          </div>
          <div className={styles.debugCard}>
            <div className={styles.debugCardTitle}>JWT_SECRET</div>
            <div className={styles.debugValue}>
              {debug.jwtSecret === 'configured'
                ? <span className={styles.statusOk}>已配置</span>
                : <span className={styles.statusFail}>未配置</span>}
            </div>
          </div>
          <div className={styles.debugCard}>
            <div className={styles.debugCardTitle}>RESEND_API_KEY</div>
            <div className={styles.debugValue}>
              {debug.resendKey === 'configured'
                ? <span className={styles.statusOk}>已配置</span>
                : <span className={styles.statusWarn}>未配置（邮件功能不可用）</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------- User Detail Drawer ----------

function UserDetailDrawer({
  detail, busy, onClose, onAction,
}: {
  detail: AdminUserDetail
  busy: boolean
  onClose: () => void
  onAction: (action: string, id: string) => Promise<void>
}) {
  return (
    <div className={styles.drawerBackdrop} onClick={onClose}>
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        <button className={`btn btn-ghost ${styles.drawerClose}`} onClick={onClose}>✕</button>

        <div className={styles.drawerUser}>
          <div className={styles.drawerAvatar}>{detail.username[0].toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{detail.username}</div>
            <div className={styles.drawerMeta}>{detail.email}</div>
            <div className={styles.drawerMeta} style={{ marginTop: 4 }}>注册于 {fmtDateTime(detail.createdAt)}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
          <span className={detail.isAdmin ? styles.badgeAdmin : styles.badgeNormal}>
            {detail.isAdmin ? '管理员' : '普通用户'}
          </span>
          <span className={detail.isBanned ? styles.badgeBanned : styles.badgeOk}>
            {detail.isBanned ? '已封禁' : '正常'}
          </span>
        </div>

        <div className={styles.drawerSection}>
          <h3 className={styles.sectionTitle} style={{ fontSize: 14 }}>最高分</h3>
          {detail.bests.length > 0 ? (
            <div className={styles.bestsMini}>
              {detail.bests.map(b => (
                <span key={b.gameId} className={styles.bestMini}>
                  {b.gameId} <span className={styles.bestMiniScore}>{b.best}</span>
                </span>
              ))}
            </div>
          ) : (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>暂无分数记录</div>
          )}
        </div>

        <div className={styles.drawerSection}>
          <h3 className={styles.sectionTitle} style={{ fontSize: 14 }}>收藏游戏</h3>
          {detail.favorites.length > 0 ? (
            <div className={styles.bestsMini}>
              {detail.favorites.map(g => <span key={g} className={styles.bestMini}>{g}</span>)}
            </div>
          ) : (
            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>无收藏</div>
          )}
        </div>

        <div className={styles.drawerActions}>
          <button className={`${styles.drawerBtn} ${!detail.isBanned ? styles.drawerBtnDanger : ''}`} disabled={busy} onClick={() => onAction('ban', detail.id)}>
            {detail.isBanned ? '解封' : '封禁'}
          </button>
          <button className={styles.drawerBtn} disabled={busy} onClick={() => onAction('admin', detail.id)}>
            {detail.isAdmin ? '降权' : '提权'}
          </button>
          <button className={styles.drawerBtn} disabled={busy} onClick={() => onAction('password', detail.id)}>
            重置密码
          </button>
          <button className={`${styles.drawerBtn} ${styles.drawerBtnDanger}`} disabled={busy} onClick={() => onAction('delete', detail.id)}>
            删除用户
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Analytics Tab ----------

function AnalyticsTab({
  analytics,
  loading,
  onLoad,
}: {
  analytics: AdminAnalytics | null
  loading: boolean
  onLoad: () => void
}) {
  useEffect(() => { onLoad() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && !analytics) return <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
  if (!analytics) return <div className={styles.loading}>暂无数据</div>

  const maxPath = Math.max(...analytics.pathDistribution.map(p => p.cnt), 1)
  const maxHourly = Math.max(...analytics.hourlyTraffic.map(h => h.cnt), 1)

  return (
    <div>
      <div className={styles.statsGrid}>
        <div className={`${styles.statCard} ${styles.statCardCyan}`}>
          <div className={styles.statValue}>{analytics.totalViews.toLocaleString()}</div>
          <div className={styles.statLabel}>总访问量</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
          <div className={styles.statValue}>{analytics.viewsToday.toLocaleString()}</div>
          <div className={styles.statLabel}>今日访问</div>
        </div>
        <div className={`${styles.statCard} ${styles.statCardGold}`}>
          <div className={styles.statValue}>{analytics.viewsWeek.toLocaleString()}</div>
          <div className={styles.statLabel}>近 7 天</div>
        </div>
      </div>

      {analytics.pathDistribution.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>热门页面（近 24 小时）</h2>
          <div className={styles.chartWrap}>
            {analytics.pathDistribution.map(p => (
              <div key={p.path} className={styles.chartRow}>
                <span className={styles.chartLabel} title={p.path}>{p.path}</span>
                <div className={styles.chartBarWrap}>
                  <div className={styles.chartBar} style={{ width: `${(p.cnt / maxPath) * 100}%` }} />
                </div>
                <span className={styles.chartCount}>{p.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analytics.hourlyTraffic.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>每小时流量（近 7 天）</h2>
          <div className={styles.chartWrap}>
            {analytics.hourlyTraffic.slice().reverse().map(h => (
              <div key={h.hour} className={styles.chartRow}>
                <span className={styles.chartLabel} title={h.hour}>{fmtDateTimeStr(h.hour)}</span>
                <div className={styles.chartBarWrap}>
                  <div className={styles.chartBar} style={{ width: `${(h.cnt / maxHourly) * 100}%`, background: 'linear-gradient(90deg, var(--accent), var(--primary))' }} />
                </div>
                <span className={styles.chartCount}>{h.cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function fmtDateTimeStr(iso: string): string {
  const d = new Date(iso)
  return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:00`
}

// ---------- Messages Tab ----------

function MessagesTab({
  messages, loading, onLoad, onDelete,
}: {
  messages: MessageRow[]
  loading: boolean
  onLoad: () => void
  onDelete: (id: number) => void
}) {
  const [addName, setAddName] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addBusy, setAddBusy] = useState(false)

  useEffect(() => { onLoad() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const addMessage = async () => {
    const name = addName.trim()
    const content = addContent.trim()
    if (!name || !content) { toast('请填写昵称和留言', 'error'); return }
    setAddBusy(true)
    try {
      await messageApi.create(name, content)
      setAddContent('')
      toast('留言已添加', 'success')
      onLoad()
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', 'error')
    } finally {
      setAddBusy(false)
    }
  }

  if (loading && messages.length === 0) return <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>

  return (
    <div>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>留言板（{messages.length} 条）</h2>
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <input className="input" style={{ maxWidth: 160 }} type="text" placeholder="昵称" maxLength={20}
            value={addName} onChange={(e) => setAddName(e.target.value)} />
          <input className="input" style={{ flex: 1, minWidth: 200 }} type="text" placeholder="留言内容…" maxLength={500}
            value={addContent} onChange={(e) => setAddContent(e.target.value)} />
          <button className="btn btn-primary" disabled={addBusy} onClick={addMessage}>
            {addBusy ? '添加中…' : '添加留言'}
          </button>
        </div>
        {messages.length === 0 ? (
          <div className={styles.loading}>暂无留言</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--accent))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {m.username[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <strong style={{ fontSize: 14 }}>{m.username}</strong>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{fmtDateTime(m.createdAt)}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: 'var(--text)' }}>{m.content}</p>
                </div>
                <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => onDelete(m.id)} style={{ flexShrink: 0 }}>删除</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Files Tab (网盘) ----------

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`
}

function FilesTab() {
  const [files, setFiles] = useState<FileRow[]>([])
  const [storage, setStorage] = useState<StorageInfo>({ used: 0, limit: 104857600, percent: 0 })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)

  const loadAll = () => {
    setLoading(true)
    Promise.all([fileApi.list(), fileApi.storage()])
      .then(([f, s]) => { setFiles(f.files); setStorage(s) })
      .catch(() => toast('加载失败', 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadAll() }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast('单个文件不能超过 5MB', 'error')
      return
    }
    if (storage.used + file.size > storage.limit) {
      toast('存储空间不足', 'error')
      return
    }
    setUploading(true)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await fileApi.upload(file.name, base64, file.type || 'application/octet-stream')
      toast('上传成功', 'success')
      loadAll()
    } catch (e) {
      toast(e instanceof Error ? e.message : '上传失败', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除此文件？')) return
    setBusy(true)
    try {
      await fileApi.remove(id)
      toast('已删除', 'success')
      loadAll()
    } catch {
      toast('删除失败', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleDownload = async (id: number) => {
    try {
      await fileApi.download(id)
    } catch {
      toast('下载失败', 'error')
    }
  }

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleUpload(file)
    e.target.value = ''
  }

  const usedPct = Math.min(100, (storage.used / storage.limit) * 100)
  const barColor = usedPct > 90 ? '#ef4444' : usedPct > 70 ? '#f59e0b' : '#22c55e'

  return (
    <div>
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>存储用量</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 20, background: 'var(--surface-2)', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ width: `${usedPct}%`, height: '100%', background: barColor, borderRadius: 10, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, whiteSpace: 'nowrap' }}>
            {fmtSize(storage.used)} / 100MB ({storage.percent}%)
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>上传文件</h2>
        <label style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10, padding: 32, border: '2px dashed var(--border-strong)', borderRadius: 12,
          cursor: 'pointer', transition: 'border-color 0.15s',
        }}
          onDragOver={(e) => { e.preventDefault() }}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
        >
          <span style={{ fontSize: 36 }}>📁</span>
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>
            {uploading ? '上传中…' : '点击或拖拽文件到此处（单个文件最大 5MB）'}
          </span>
          <input type="file" style={{ display: 'none' }} onChange={onFileSelect} disabled={uploading} />
        </label>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>文件列表（{files.length}）</h2>
        {loading ? (
          <div className={styles.loading}><span className={styles.spinner} /> 加载中…</div>
        ) : files.length === 0 ? (
          <div className={styles.loading}>暂无文件</div>
        ) : (
          <table className={styles.userTable}>
            <thead>
              <tr>
                <th>文件名</th>
                <th>大小</th>
                <th>分块</th>
                <th>上传时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.filename}>
                    📄 {f.filename}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{fmtSize(f.size)}</td>
                  <td>{f.totalChunks}</td>
                  <td>{fmtDateTime(f.createdAt)}</td>
                  <td>
                    <div className={styles.actions}>
                      <button className={styles.actionBtn} disabled={busy} onClick={() => handleDownload(f.id)}>下载</button>
                      <button className={`${styles.actionBtn} ${styles.actionBtnDanger}`} disabled={busy} onClick={() => handleDelete(f.id)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
