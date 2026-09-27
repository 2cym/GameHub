import { useCallback, useEffect, useRef, useState } from 'react'
import type { ShareCardOpts } from '../lib/shareCard'
import { copyImageToClipboard, downloadBlob, drawShareCard } from '../lib/shareCard'
import { toast } from '../stores/toast'
import styles from './ScoreShareCard.module.css'

interface Props {
  open: boolean
  card: ShareCardOpts | null
  onClose: () => void
}

/**
 * 一局结束后的分享卡片：生成一张成绩图，可以存到相册、复制到剪贴板，
 * 或直接打开挑战链接把目标分数发给别人。
 */
export function ScoreShareCard({ open, card, onClose }: Props) {
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const blobRef = useRef<Blob | null>(null)

  useEffect(() => {
    if (!open) {
      setPreviewUrl('')
      blobRef.current = null
    }
  }, [open])

  // Escape 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const makeCard = useCallback(async (): Promise<Blob> => {
    if (blobRef.current) return blobRef.current
    if (!card) throw new Error('缺少成绩信息')
    setBusy(true)
    try {
      const blob = await drawShareCard(card)
      blobRef.current = blob
      setPreviewUrl(URL.createObjectURL(blob))
      return blob
    } finally {
      setBusy(false)
    }
  }, [card])

  const handleSave = async () => {
    if (busy || !card) return
    try {
      const blob = await makeCard()
      downloadBlob(blob, `${card.gameName}-${card.score}-成绩卡.png`)
      toast('成绩卡已保存', 'success')
    } catch {
      toast('图片生成失败，请重试', 'error')
    }
  }

  const handleCopy = async () => {
    if (busy || !card) return
    try {
      const blob = await makeCard()
      if (await copyImageToClipboard(blob)) {
        toast('已复制到剪贴板', 'success')
      } else {
        downloadBlob(blob, `${card.gameName}-${card.score}-成绩卡.png`)
        toast('当前浏览器不支持复制图片，已改为下载', 'info')
      }
    } catch {
      toast('图片生成失败，请重试', 'error')
    }
  }

  if (!open || !card) return null

  return (
    <div className={styles.backdrop} onClick={onClose} role="presentation">
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="分享成绩"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.head}>
          <h2 className={styles.title}>🏆 成绩卡</h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className={styles.previewWrap}>
          {previewUrl ? (
            <img className={styles.preview} src={previewUrl} alt="成绩卡预览" />
          ) : (
            <div className={styles.placeholder}>
              {busy ? '生成中…' : '🖼 点下面按钮生成卡片'}
            </div>
          )}
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={busy}
          >
            💾 保存图片
          </button>
          <button
            type="button"
            className="btn"
            onClick={handleCopy}
            disabled={busy}
          >
            📋 复制到剪贴板
          </button>
          <a
            className="btn"
            href={card.challengeUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            🎯 发起挑战
          </a>
        </div>
        <p className={styles.tip}>发给朋友：他打开挑战链接就能看到你的分数，然后试着超过你</p>
      </div>
    </div>
  )
}
