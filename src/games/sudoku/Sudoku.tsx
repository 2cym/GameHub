import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameProps, GameStatus } from '../../lib/types'
import { GameOverlay } from '../shared/GameOverlay'
import { useGameKeys } from '../shared/useGameKeys'
import { toast } from '../../stores/toast'
import shared from '../shared/game.module.css'
import styles from './Sudoku.module.css'
import {
  allConflicts,
  generateSudoku,
  isSolved,
  type Difficulty,
  type Grid,
} from './sudokuLogic'

const DIFFS: Array<{ id: Difficulty; label: string; base: number }> = [
  { id: 'easy', label: '简单', base: 300 },
  { id: 'medium', label: '中等', base: 600 },
  { id: 'hard', label: '困难', base: 1000 },
]

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

type Notes = Record<number, Set<number>>

export default function Sudoku({ onGameOver }: GameProps) {
  const [status, setStatus] = useState<GameStatus>('idle')
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [givens, setGivens] = useState<boolean[]>([])
  const [grid, setGrid] = useState<Grid>(() => new Array(81).fill(0))
  const [solution, setSolution] = useState<Grid>(() => new Array(81).fill(0))
  const [notes, setNotes] = useState<Notes>({})
  const [selected, setSelected] = useState(-1)
  const [noteMode, setNoteMode] = useState(false)
  const [mistakes, setMistakes] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [score, setScore] = useState(0)

  const statusRef = useRef(status)
  statusRef.current = status
  const gridRef = useRef(grid)
  gridRef.current = grid
  const notesRef = useRef(notes)
  notesRef.current = notes
  const selRef = useRef(selected)
  selRef.current = selected
  const noteModeRef = useRef(noteMode)
  noteModeRef.current = noteMode
  const startTimeRef = useRef(0)
  const gameOverRef = useRef(onGameOver)
  gameOverRef.current = onGameOver
  const finishedRef = useRef(false)

  const conflicts = useMemo(() => allConflicts(grid), [grid])

  useEffect(() => {
    if (status !== 'running') return
    const t = window.setInterval(
      () => setElapsed(Date.now() - startTimeRef.current),
      500,
    )
    return () => window.clearInterval(t)
  }, [status])

  const start = useCallback((d: Difficulty) => {
    const { puzzle, solution: sol } = generateSudoku(d)
    setGivens(puzzle.map((v) => v !== 0))
    setGrid(puzzle)
    setSolution(sol)
    setNotes({})
    setSelected(-1)
    setNoteMode(false)
    setMistakes(0)
    setElapsed(0)
    setScore(0)
    finishedRef.current = false
    startTimeRef.current = Date.now()
    setStatus('running')
  }, [])

  const finish = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    const timeMs = Date.now() - startTimeRef.current
    const base = DIFFS.find((d) => d.id === difficulty)?.base ?? 300
    // 时间加成：最多 base，随用时线性衰减（10 分钟内拿满加成）
    const timeBonus = Math.max(
      0,
      Math.round(base * (1 - Math.min(1, timeMs / 600000))),
    )
    // 校验扣分：每次错误 -30
    const penalty = mistakes * 30
    const final = Math.max(10, base + timeBonus - penalty)
    setScore(final)
    setStatus('over')
    setElapsed(timeMs)
    gameOverRef.current(final)
  }, [difficulty, mistakes])

  const placeNumber = useCallback(
    (val: number) => {
      if (statusRef.current !== 'running') return
      const idx = selRef.current
      if (idx < 0) return
      if (givens[idx]) {
        toast('这是题目给出的数字，不能修改', 'info')
        return
      }

      if (noteModeRef.current) {
        // 笔记模式
        const cur = notesRef.current[idx] ?? new Set<number>()
        const next = new Set(cur)
        if (next.has(val)) next.delete(val)
        else next.add(val)
        setNotes({ ...notesRef.current, [idx]: next })
        return
      }

      const next = [...gridRef.current]
      next[idx] = val
      // 填数后清空该格笔记
      const nn = { ...notesRef.current }
      delete nn[idx]
      setNotes(nn)
      setGrid(next)

      if (val !== solution[idx]) {
        setMistakes((m) => m + 1)
      }
      if (isSolved(next, solution)) {
        finish()
      }
    },
    [givens, solution, finish],
  )

  const erase = useCallback(() => {
    if (statusRef.current !== 'running') return
    const idx = selRef.current
    if (idx < 0 || givens[idx]) return
    const next = [...gridRef.current]
    next[idx] = 0
    setGrid(next)
  }, [givens])

  const moveSelection = useCallback((d: number) => {
    setSelected((prev) => {
      const cur = prev < 0 ? 0 : prev
      const r = Math.floor(cur / 9)
      const c = cur % 9
      let nr = r
      let nc = c
      if (d === 0) nr = (r + 8) % 9
      else if (d === 1) nr = (r + 1) % 9
      else if (d === 2) nc = (c + 8) % 9
      else nc = (c + 1) % 9
      return nr * 9 + nc
    })
  }, [])

  useGameKeys({
    '1': () => placeNumber(1),
    '2': () => placeNumber(2),
    '3': () => placeNumber(3),
    '4': () => placeNumber(4),
    '5': () => placeNumber(5),
    '6': () => placeNumber(6),
    '7': () => placeNumber(7),
    '8': () => placeNumber(8),
    '9': () => placeNumber(9),
    backspace: erase,
    delete: erase,
    '0': erase,
    n: () => setNoteMode((v) => !v),
    arrowup: () => moveSelection(0),
    arrowdown: () => moveSelection(1),
    arrowleft: () => moveSelection(2),
    arrowright: () => moveSelection(3),
  })

  const check = useCallback(() => {
    if (statusRef.current !== 'running') return
    let wrong = 0
    let empty = 0
    for (let i = 0; i < 81; i++) {
      if (gridRef.current[i] === 0) empty++
      else if (gridRef.current[i] !== solution[i]) wrong++
    }
    if (wrong > 0) toast(`有 ${wrong} 格不正确，红色已标出`, 'error')
    else if (empty > 0) toast(`目前没有错误，还剩 ${empty} 格`, 'success')
    else toast('全部正确！', 'success')
  }, [solution])

  const hint = useCallback(() => {
    if (statusRef.current !== 'running') return
    const idx = selRef.current
    let target = idx
    if (target < 0 || givens[target] || gridRef.current[target] !== 0) {
      // 找一个空格
      target = gridRef.current.findIndex((v, i) => v === 0 && !givens[i])
      if (target === -1) return
    }
    const next = [...gridRef.current]
    next[target] = solution[target]
    setGrid(next)
    setSelected(target)
    setMistakes((m) => m + 2) // 提示代价：计为 2 次错误
    toast('已填入一个提示数字（会计入扣分）', 'info')
    if (isSolved(next, solution)) finish()
  }, [givens, solution, finish])

  return (
    <div className={shared.frame}>
      <div className={shared.hud}>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>难度</span>
          <span className={shared.hudValue}>
            {DIFFS.find((d) => d.id === difficulty)?.label}
          </span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>用时</span>
          <span className={shared.hudValue}>{formatTime(elapsed)}</span>
        </div>
        <div className={shared.hudItem}>
          <span className={shared.hudLabel}>错误</span>
          <span className={shared.hudValue}>{mistakes}</span>
        </div>
      </div>

      <div className={styles.layout}>
        <div className={`${shared.stage} ${styles.stagePad}`}>
          <div className={styles.board}>
            {grid.map((v, i) => {
              const r = Math.floor(i / 9)
              const c = i % 9
              const isSel = i === selected
              const isConflict = conflicts.has(i)
              const sameNum =
                selected >= 0 && v !== 0 && grid[selected] === v
              const cellNotes = notes[i]
              return (
                <button
                  key={i}
                  type="button"
                  className={[
                    styles.cell,
                    givens[i] ? styles.given : '',
                    isSel ? styles.sel : '',
                    isConflict ? styles.conflict : '',
                    sameNum && !isSel ? styles.same : '',
                    c === 2 || c === 5 ? styles.br : '',
                    r === 2 || r === 5 ? styles.bb : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => setSelected(i)}
                >
                  {v !== 0 ? (
                    <span className={styles.num}>{v}</span>
                  ) : cellNotes && cellNotes.size > 0 ? (
                    <span className={styles.notes}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                        <i key={n}>{cellNotes.has(n) ? n : ''}</i>
                      ))}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <GameOverlay
            status={status}
            score={score}
            scoreLabel="本局得分"
            onStart={() => start(difficulty)}
            onResume={() => setStatus('running')}
            onRestart={() => start(difficulty)}
            idleTitle="数独"
            idleHint="选择难度后开始。点击格子输入数字，完成后自动结算得分"
          />
        </div>

        <div className={styles.side}>
          <div className={styles.diffRow}>
            {DIFFS.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`${styles.chip} ${
                  difficulty === d.id ? styles.chipOn : ''
                }`}
                onClick={() => {
                  setDifficulty(d.id)
                  if (statusRef.current === 'running') start(d.id)
                }}
              >
                {d.label}
              </button>
            ))}
          </div>

          <div className={styles.pad}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
              <button
                key={n}
                type="button"
                className={styles.padBtn}
                onClick={() => placeNumber(n)}
              >
                {n}
              </button>
            ))}
            <button type="button" className={styles.padBtn} onClick={erase}>
              ⌫
            </button>
            <button
              type="button"
              className={`${styles.padBtn} ${noteMode ? styles.noteOn : ''}`}
              onClick={() => setNoteMode((v) => !v)}
              title="笔记模式 (N)"
            >
              ✎
            </button>
            <button type="button" className={styles.padBtn} onClick={hint}>
              💡
            </button>
          </div>

          <button type="button" className="btn" onClick={check}>
            ✓ 校验
          </button>
        </div>
      </div>
    </div>
  )
}
