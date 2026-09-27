import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { GameProps } from '../lib/types'

export type GameCategory = '街机' | '益智' | '休闲' | '棋类'

export interface GameMeta {
  id: string
  name: string
  emoji: string
  category: GameCategory
  description: string
  howToPlay: string
  controls: Array<{ keys: string; label: string }>
  /** 卡片封面渐变 */
  gradient: string
  Component: LazyExoticComponent<ComponentType<GameProps>>
}

export const GAMES: GameMeta[] = [
  {
    id: 'snake',
    name: '贪吃蛇',
    emoji: '🐍',
    category: '街机',
    description: '经典街机之作，吞下光点不断变长，小心别咬到自己。',
    howToPlay: '控制小蛇移动吃掉光点，每吃一个得 10 分，蛇身变长、速度加快。撞墙或咬到自己即结束。',
    controls: [
      { keys: '↑ ↓ ← →', label: '改变方向' },
      { keys: 'P', label: '暂停 / 继续' },
    ],
    gradient: 'linear-gradient(135deg, #0ea86f, #7ceeff)',
    Component: lazy(() => import('./snake/SnakeGame')),
  },
  {
    id: 'contra',
    name: '魂斗罗',
    emoji: '🔫',
    category: '街机',
    description: '经典横版卷轴射击过关，单人突袭敌阵，跳跃射击一气呵成。',
    howToPlay: '左右移动、跳跃躲避、射击消灭敌兵。拾取武器胶囊升级火力（散射 S / 激光 L），击败每关 Boss 即可过关。共 3 关，2 场 Boss 战。',
    controls: [
      { keys: '← → / A D', label: '左右移动' },
      { keys: '↑ / W / 空格', label: '跳跃' },
      { keys: 'J / Z', label: '射击' },
      { keys: 'P', label: '暂停 / 继续' },
    ],
    gradient: 'linear-gradient(135deg, #2a4d3a, #ff6b3d)',
    Component: lazy(() => import('./contra/ContraGame')),
  },
  {
    id: 'g2048',
    name: '2048',
    emoji: '🔢',
    category: '益智',
    description: '滑动合并相同数字，冲击 2048 的终极目标。',
    howToPlay: '滑动方块，相同数字碰撞即合并翻倍，得分等于每次合并产生的数字之和。无法移动时游戏结束。',
    controls: [
      { keys: '↑ ↓ ← → / 滑动', label: '移动方块' },
      { keys: 'P', label: '暂停 / 继续' },
    ],
    gradient: 'linear-gradient(135deg, #f7b733, #fc4a1a)',
    Component: lazy(() => import('./g2048/Game2048')),
  },
  {
    id: 'tetris',
    name: '俄罗斯方块',
    emoji: '🧱',
    category: '街机',
    description: '旋转与堆叠，消行得分，挑战更高等级。',
    howToPlay: '移动、旋转下落的方块，填满一整行即可消除得分。速度随等级提升，方块堆到顶部即结束。',
    controls: [
      { keys: '← →', label: '左右移动' },
      { keys: '↑ / X', label: '旋转' },
      { keys: '↓', label: '软降' },
      { keys: '空格', label: '硬降' },
      { keys: 'P', label: '暂停 / 继续' },
    ],
    gradient: 'linear-gradient(135deg, #7c5cff, #00e5ff)',
    Component: lazy(() => import('./tetris/Tetris')),
  },
  {
    id: 'minesweeper',
    name: '扫雷',
    emoji: '💣',
    category: '益智',
    description: '推理数字背后的雷区，用最短时间排除全部地雷。',
    howToPlay: '翻开所有非雷格子即获胜。数字表示周围雷数，右键（或长按）插旗标记。首次点击必定安全，用时越短得分越高。',
    controls: [
      { keys: '左键', label: '翻开格子' },
      { keys: '右键 / 长按', label: '插旗 / 取消' },
    ],
    gradient: 'linear-gradient(135deg, #3a4a6b, #9aa3c0)',
    Component: lazy(() => import('./minesweeper/Minesweeper')),
  },
  {
    id: 'memory',
    name: '记忆翻牌',
    emoji: '🧠',
    category: '益智',
    description: '翻牌配对锻炼记忆力，步数越少得分越高。',
    howToPlay: '每次翻开两张牌，图案相同则配对消除。配齐全部 8 对即获胜，步数与用时越少得分越高。',
    controls: [{ keys: '点击', label: '翻开卡片' }],
    gradient: 'linear-gradient(135deg, #ff5ca8, #7c5cff)',
    Component: lazy(() => import('./memory/MemoryGame')),
  },
  {
    id: 'whackamole',
    name: '打地鼠',
    emoji: '🔨',
    category: '休闲',
    description: '限时 30 秒，手速与反应的终极考验。',
    howToPlay: '地鼠冒头时快速点击得分，普通地鼠 +10 分，金色地鼠 +30 分，别打空手哦。限时 30 秒。',
    controls: [{ keys: '点击 / 触碰', label: '敲击地鼠' }],
    gradient: 'linear-gradient(135deg, #2e8b57, #ffd166)',
    Component: lazy(() => import('./whackamole/WhackAMole')),
  },
  {
    id: 'sudoku',
    name: '数独',
    emoji: '🔢',
    category: '益智',
    description: '经典 9×9 数独，三档难度，保证唯一解，实时校验冲突。',
    howToPlay: '点击空格后用键盘或下方数字键填入 1-9。每行、每列、每个 3×3 宫内数字不重复即正确。支持候选数笔记(N)、一键校验与提示。完成越快、错误越少得分越高。',
    controls: [
      { keys: '点击', label: '选中格子' },
      { keys: '1-9', label: '填入数字' },
      { keys: 'N', label: '笔记模式' },
      { keys: 'Backspace', label: '清除' },
      { keys: '方向键', label: '移动选区' },
    ],
    gradient: 'linear-gradient(135deg, #3f7d6e, #7ceeff)',
    Component: lazy(() => import('./sudoku/Sudoku')),
  },
  {
    id: 'sokoban',
    name: '推箱子',
    emoji: '📦',
    category: '益智',
    description: '推动箱子到目标点，8 个关卡由浅入深，卡死可撤销重来。',
    howToPlay: '用方向键移动小人，把所有箱子推到目标点上即过关。一次只能推一个箱子，且不能拉。支持撤销(U)与重置(R)，全部通关累计得分。',
    controls: [
      { keys: '↑ ↓ ← → / WASD', label: '移动 / 推箱' },
      { keys: 'U', label: '撤销一步' },
      { keys: 'R', label: '重置本关' },
    ],
    gradient: 'linear-gradient(135deg, #d9903a, #7c5cff)',
    Component: lazy(() => import('./sokoban/Sokoban')),
  },
  {
    id: 'klotski',
    name: '华容道',
    emoji: '🧩',
    category: '益智',
    description: '滑动方块，助曹操从华容道底部出口脱困，步数越少越高分。',
    howToPlay: '拖动或点击滑动方块，把最大的「曹操」移到底部中央出口即获胜。提供横刀立马等经典布局，步数越接近参考步数得分越高。可撤销、可重置。',
    controls: [
      { keys: '拖拽 / 点击', label: '滑动方块' },
      { keys: '撤销 / 重置', label: '按钮操作' },
    ],
    gradient: 'linear-gradient(135deg, #d84a4a, #7c5cff)',
    Component: lazy(() => import('./klotski/Klotski')),
  },
  {
    id: 'gomoku',
    name: '五子棋',
    emoji: '⚫',
    category: '棋类',
    description: '15×15 五子连珠，黑白交替，中等/困难由 AI 对弈。',
    howToPlay: '点击棋盘交点落子，黑先白后，在横、竖、斜任意方向连成五子即胜。可选难度与先后手，中等/困难难度由 AI 生成候选走法。',
    controls: [
      { keys: '点击', label: '落子' },
    ],
    gradient: 'linear-gradient(135deg, #c89854, #2a2a2a)',
    Component: lazy(() => import('./gomoku/Gomoku')),
  },
  {
    id: 'xiangqi',
    name: '中国象棋',
    emoji: '帥',
    category: '棋类',
    description: '完整走法，蹩马腿/塞象眼/白脸将，中等/困难由 AI 对弈。',
    howToPlay: '红先黑后，点选己方棋子后点击绿点落子。车直走、马走日（蹩马腿）、象走田（塞象眼、不过河）、炮隔山吃、兵过河可横。吃掉对方将/帅即胜。',
    controls: [
      { keys: '点击', label: '选子 / 落子' },
    ],
    gradient: 'linear-gradient(135deg, #c02020, #f0d090)',
    Component: lazy(() => import('./xiangqi/Xiangqi')),
  },
  {
    id: 'chess',
    name: '国际象棋',
    emoji: '♔',
    category: '棋类',
    description: '六种棋子完整规则，含王车易位、吃过路兵、兵升变，中等/困难由 AI 对弈。',
    howToPlay: '白先黑后，点选己方棋子后点击绿点落子。含王车易位、吃过路兵、兵到底线自动升变为后。将死对方王即胜。',
    controls: [
      { keys: '点击', label: '选子 / 落子' },
    ],
    gradient: 'linear-gradient(135deg, #f0d9b5, #b58863)',
    Component: lazy(() => import('./chess/Chess')),
  },
  {
    id: 'go',
    name: '围棋',
    emoji: '⚫',
    category: '棋类',
    description: '19×19 棋盘，提子、打劫、数目，中等/困难由 AI 对弈。',
    howToPlay: '黑先白后，点击交叉点落子。无气则被提子，打劫不可立即回提。双方连续虚手即终局数目，黑贴白 6.5 目。围地多者胜。',
    controls: [
      { keys: '点击', label: '落子' },
      { keys: '虚手按钮', label: 'Pass' },
    ],
    gradient: 'linear-gradient(135deg, #e8c884, #c89854)',
    Component: lazy(() => import('./go/Go')),
  },
]

export const CATEGORIES: Array<'全部' | GameCategory> = [
  '全部',
  '街机',
  '益智',
  '休闲',
  '棋类',
]

export function getGame(id: string | undefined): GameMeta | undefined {
  return GAMES.find((g) => g.id === id)
}
