/**
 * Polis 風の投票の集計を行うモジュールです。
 *
 * 参加者 × 意見の賛否の行列から、主成分分析で参加者を 2 次元に配置し、k-means で意見グループに分けます。
 * そのうえで、グループごとの代表的な意見（そのグループで特に賛成・反対が多い意見）と、
 * すべてのグループで賛成が多い意見（合意点）を求めます。
 *
 * 投票 CSV の形式（Polis のエクスポートの participant-votes.csv と同じ）:
 * - 1 列目の見出しは `participant` で、値は参加者の id
 * - 残りの列の見出しは意見の `comment-id`。値は `1`（賛成）・`-1`（反対）・`0` または空（未投票・パス）
 * - Polis のメタデータ列（xid・group-id・n-comments・n-votes・n-agree・n-disagree）は読み飛ばします
 */
import { chooseClusters, projectToPlane } from './clustering'
import { CsvFormatError } from './csv'

/** 投票 CSV の 1 列目の見出しです。 */
const PARTICIPANT_COLUMN = 'participant'

/** Polis のエクスポートにある、意見ではないメタデータ列です。 */
const POLIS_METADATA_COLUMNS = new Set(['xid', 'group-id', 'n-comments', 'n-votes', 'n-agree', 'n-disagree'])

/** セルの値と賛否の対応です。空は未投票として 0 にします。 */
const VOTE_VALUES = new Map<string, number>([
  ['1', 1],
  ['-1', -1],
  ['0', 0],
  ['', 0],
])

/** 意見グループの数の上限です。Polis と同じく 2〜5 グループの中から選びます。 */
const MAX_GROUPS = 5
/** k-means の乱数の種です。結果を再現できるように固定します。 */
const SEED = 1
/** 合意点とみなす、すべてのグループでの賛成率の下限です。 */
const CONSENSUS_THRESHOLD = 0.6
/** グループごとに表示する代表的な意見の件数の上限です。 */
const MAX_REPRESENTATIVE = 5

/** 参加者 × 意見の賛否の行列です。 */
export interface VoteMatrix {
  participants: string[]
  commentIds: string[]
  /** votes[参加者][意見] が 1（賛成）・-1（反対）・0（未投票・パス）です。 */
  votes: number[][]
}

/** CSV が投票 CSV（見出し行の 1 列目が participant）かを判定します。 */
export function isVoteTable(rows: string[][]): boolean {
  return rows[0]?.[0]?.trim() === PARTICIPANT_COLUMN
}

/**
 * 投票 CSV の行を、参加者 × 意見の賛否の行列にします。
 *
 * @param rows - parseCsv の結果（1 行目は見出し行）
 * @param knownCommentIds - 意見 CSV にある comment-id
 * @returns 賛否の行列
 * @throws CsvFormatError - 列名が意見 CSV に無い場合、値が 1・-1・0・空以外の場合（行と列を示します）
 */
export function parseVoteMatrix(rows: string[][], knownCommentIds: string[]): VoteMatrix {
  const [header = [], ...records] = rows
  const known = new Set(knownCommentIds)
  // 意見の列の位置です（1 列目の参加者とメタデータ列を除きます）
  const columns: number[] = []
  header.forEach((name, column) => {
    if (column === 0 || POLIS_METADATA_COLUMNS.has(name.trim())) return
    if (!known.has(name.trim())) throw new CsvFormatError(`${column + 1} 列目の意見「${name}」が意見 CSV にありません。`)
    columns.push(column)
  })

  const votes = records.map((record, position) =>
    columns.map((column) => {
      const cell = (record[column] ?? '').trim()
      const vote = VOTE_VALUES.get(cell)
      if (vote === undefined) {
        throw new CsvFormatError(`${position + 2} 行目・${column + 1} 列目（意見「${header[column]}」）の値「${cell}」は 1・-1・0・空のいずれでもありません。`)
      }
      return vote
    }),
  )
  return { participants: records.map((record) => record[0] ?? ''), commentIds: columns.map((column) => header[column].trim()), votes }
}

/** 意見に対する賛成・反対の数です。 */
interface VoteCounts {
  agree: number
  disagree: number
}

/** 代表的な意見 1 件です。 */
export interface RepresentativeComment {
  commentId: string
  /** グループで特に多いのが賛成か反対かです。 */
  direction: 'agree' | 'disagree'
  /** グループ内での、その向きの票の割合（ラプラス平滑化した値）です。 */
  groupRate: number
  /** グループ外での、その向きの票の割合（ラプラス平滑化した値）です。 */
  otherRate: number
}

/** 意見グループです。 */
export interface OpinionGroup {
  /** 0 から始まるグループの番号です。人数の多い順に振ります。 */
  id: number
  participants: string[]
  /** そのグループで特に賛成・反対が多い意見です（グループ外との比の大きい順）。 */
  representative: RepresentativeComment[]
}

/** 合意点 1 件です。 */
export interface ConsensusComment {
  commentId: string
  /** グループごとの賛成率（ラプラス平滑化した値。groups と同じ順）です。 */
  agreeRates: number[]
}

/** 集計の結果です。 */
export interface VoteAnalysis {
  /** 参加者ごとの 2 次元の座標と、属するグループの番号です。 */
  points: { participant: string; x: number; y: number; group: number }[]
  groups: OpinionGroup[]
  /** すべてのグループで賛成が多い意見です（最も低いグループの賛成率の高い順）。 */
  consensus: ConsensusComment[]
}

/** 参加者の集合の、意見ごとの賛成・反対の数を数えます。 */
function countVotes(matrix: VoteMatrix, members: number[]): VoteCounts[] {
  return matrix.commentIds.map((_, comment) => {
    const counts = { agree: 0, disagree: 0 }
    for (const member of members) {
      const vote = matrix.votes[member][comment]
      if (vote === 1) counts.agree++
      else if (vote === -1) counts.disagree++
    }
    return counts
  })
}

/**
 * 賛成または反対の割合を、票の少ない意見で極端な値にならないようラプラス平滑化して求めます（Polis と同じ (n + 1) / (票数 + 2)）。
 */
function smoothedRate(count: number, counts: VoteCounts): number {
  return (count + 1) / (counts.agree + counts.disagree + 2)
}

/** グループの代表的な意見を求めます。グループ内の割合が過半で、グループ外より高い向きの意見を、比の大きい順に並べます。 */
function representativeComments(matrix: VoteMatrix, inside: VoteCounts[], outside: VoteCounts[]): RepresentativeComment[] {
  return matrix.commentIds
    .map((commentId, comment) => {
      const candidates = (['agree', 'disagree'] as const).map((direction) => ({
        commentId,
        direction,
        groupRate: smoothedRate(inside[comment][direction], inside[comment]),
        otherRate: smoothedRate(outside[comment][direction], outside[comment]),
      }))
      return candidates.reduce((best, candidate) => (candidate.groupRate / candidate.otherRate > best.groupRate / best.otherRate ? candidate : best))
    })
    .filter((item) => item.groupRate > 0.5 && item.groupRate > item.otherRate)
    .sort((a, b) => b.groupRate / b.otherRate - a.groupRate / a.otherRate)
    .slice(0, MAX_REPRESENTATIVE)
}

/**
 * 投票を集計して、参加者の配置・意見グループ・代表的な意見・合意点を求めます。
 *
 * 同じ入力からは同じ結果を返します（乱数の種を固定しています）。
 *
 * @param matrix - 賛否の行列
 * @returns 集計の結果
 * @throws Error - 参加者が 2 人未満でグループに分けられない場合
 */
export function analyzeVotes(matrix: VoteMatrix): VoteAnalysis {
  if (matrix.participants.length < 2) throw new Error('意見グループに分けるには、参加者が 2 人以上必要です。')
  const coordinates = projectToPlane(matrix.votes)
  const labels = chooseClusters(coordinates, { maxClusters: MAX_GROUPS, seed: SEED })

  // グループの番号を、人数の多い順（同数なら先に現れた順）に振り直します
  const clusterIds = [...new Set(labels)].sort((a, b) => labels.filter((label) => label === b).length - labels.filter((label) => label === a).length)
  const groupOf = labels.map((label) => clusterIds.indexOf(label))
  const membersOf = (group: number) => groupOf.map((value, index) => (value === group ? index : -1)).filter((index) => index >= 0)

  const groupCounts = clusterIds.map((_, group) => countVotes(matrix, membersOf(group)))
  const groups = clusterIds.map((_, group) => {
    const outsideMembers = groupOf.map((value, index) => (value !== group ? index : -1)).filter((index) => index >= 0)
    return {
      id: group,
      participants: membersOf(group).map((index) => matrix.participants[index]),
      representative: representativeComments(matrix, groupCounts[group], countVotes(matrix, outsideMembers)),
    }
  })

  const consensus = matrix.commentIds
    .map((commentId, comment) => ({ commentId, agreeRates: groupCounts.map((counts) => smoothedRate(counts[comment].agree, counts[comment])) }))
    .filter((item) => item.agreeRates.every((rate) => rate >= CONSENSUS_THRESHOLD))
    .sort((a, b) => Math.min(...b.agreeRates) - Math.min(...a.agreeRates))

  return {
    points: matrix.participants.map((participant, index) => ({ participant, x: coordinates[index][0], y: coordinates[index][1], group: groupOf[index] })),
    groups,
    consensus,
  }
}
