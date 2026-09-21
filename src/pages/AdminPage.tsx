import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, type AdminAnalytics, type AdminDebug, type AdminStats, type AdminUserDetail, type AdminUserRow } from '../lib/api'
import { useAuth } from '../stores/auth'
import { toast } from '../stores/toast'
import styles from './Admin.module.css'

type Tab = 'dashboard' | 'users' | 'analytics' | 'debug'

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
            ['users', '用户管理'],
            ['analytics', '流量监控'],
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
