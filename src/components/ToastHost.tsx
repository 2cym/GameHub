import styles from './ToastHost.module.css'
import { useToast } from '../stores/toast'

export function ToastHost() {
  const { toasts, dismiss } = useToast()
  if (toasts.length === 0) return null

  return (
    <div className={styles.host} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`${styles.toast} ${styles[t.kind]}`}
          onClick={() => dismiss(t.id)}
        >
          <span className={styles.icon}>
            {t.kind === 'success' ? '✅' : t.kind === 'error' ? '⚠️' : '💡'}
          </span>
          {t.text}
        </div>
      ))}
    </div>
  )
}
