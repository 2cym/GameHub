import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 顶层错误边界：单个页面/游戏崩溃时只替换该区域，
 * 不至于让整个站点变成白屏。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('渲染出错:', error, info.componentStack)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={`container ${styles.wrap}`}>
        <h1 className={styles.title}>😵 这一页出问题了</h1>
        <p className={styles.text}>
          我们已经记录下这个错误。你可以重试，或者回到首页继续玩其他游戏。
        </p>
        <pre className={styles.detail}>{error.message}</pre>
        <div className={styles.actions}>
          <button type="button" className="btn btn-primary" onClick={this.reset}>
            重试
          </button>
          <a className="btn" href="/">
            返回首页
          </a>
        </div>
      </div>
    )
  }
}
