/** Shared, framework-free types for the game engine. */

export type LText = { th: string; en: string };
export type Point = { x: number; y: number };

export const SYMBOLS = ['drop', 'leaf', 'spark', 'hex'] as const;
export type SymbolId = (typeof SYMBOLS)[number];
export type StationSymbol = SymbolId | 'any';

export type LineId = 'madder' | 'lapis' | 'turmeric' | 'plum';

export interface Station extends Point {
  id: string;
  symbol: StationSymbol;
  district: string;
  name: LText;
  landmark?: boolean;
  stamp?: boolean;
  loop?: boolean;
  hub?: boolean;
  /** Which side of the river, when the pack defines one. */
  bank?: 'a' | 'b';
}

export interface Edge {
  id: string;
  a: string;
  b: string;
  /** Number of times the straight segment crosses the pack's river. */
  river: number;
  /** Designated bridge, when the pack restricts river crossings to bridges. */
  bridge?: boolean;
  /** Needs a card with `tunnelPass`. */
  tunnel?: boolean;
  /** Ids of edges that geometrically intersect this one away from a station. */
  crosses: string[];
}

export interface District {
  id: string;
  name: LText;
  polygon: Point[];
  label: Point;
  satellite?: boolean;
}

export interface LineDef {
  id: LineId;
  name: LText;
  /** One start station, or two for dual-start packs. */
  starts: string[];
}

export type CardKind = 'symbol' | 'wild' | 'branch' | 'special';

export interface Card {
  id: string;
  kind: CardKind;
  symbol: StationSymbol;
  /** May start from any station already on the line instead of an endpoint. */
  anyOrigin?: boolean;
  /** Segments a player may draw on this card (default 1). */
  segments?: number;
  /** May cross existing track. */
  overpass?: boolean;
  /** May use tunnel edges. */
  tunnelPass?: boolean;
  /** Counts toward a lantern-triggered round end. */
  lantern?: boolean;
  /** Only included when this module is on. */
  module?: ModuleId;
}

export type ModuleId = 'objectives' | 'specials';

export type RoundEnd = { type: 'reveals'; count: number } | { type: 'lanterns'; count: number };

export type LineRule =
  | { type: 'districtTimesConcentration' }
  | { type: 'districtPoints'; per: number }
  | { type: 'concentrationPoints'; per: number }
  | { type: 'riverCrossings'; per: number }
  | { type: 'bridges'; table: number[] }
  | { type: 'lineLandmarks'; table: number[] }
  | { type: 'bankBalance'; per: number }
  | { type: 'hub'; points: number }
  | { type: 'stationCount'; per: number }
  | { type: 'linkStarts'; points: number };

export type FinalRule =
  | { type: 'landmarkTrack'; table: number[] }
  | { type: 'interchanges'; table: Record<2 | 3 | 4, number> }
  | { type: 'stamps'; table: number[] }
  | { type: 'loop'; missing: number; complete: number }
  | { type: 'linkedColors'; table: number[] }
  | { type: 'oneNetwork'; points: number };

export type ObjectiveRule =
  | { type: 'districts'; count: number }
  | { type: 'landmarks'; count: number }
  | { type: 'interchanges'; count: number }
  | { type: 'river'; count: number }
  | { type: 'longLine'; count: number }
  | { type: 'bigInterchange'; count: number }
  | { type: 'loopStations'; count: number };

export interface Objective {
  id: string;
  rule: ObjectiveRule;
  points: number;
}

export type TieBreaker = 'interchanges' | 'landmarks' | 'districts' | 'stations';

export interface CityPack {
  id: string;
  version: number;
  name: LText;
  subtitle: LText;
  description: LText;
  complexity: 1 | 2 | 3;
  minutes: [number, number];
  maxPlayers: number;
  width: number;
  height: number;
  stations: Station[];
  edges: Edge[];
  districts: District[];
  river?: Point[];
  lines: LineDef[];
  deck: Card[];
  roundEnd: RoundEnd;
  lineRules: LineRule[];
  finalRules: FinalRule[];
  objectives: Objective[];
  modules: ModuleId[];
  tieBreakers: TieBreaker[];
  /** Allows joining two components of the same colour (dual-start packs). */
  mergeComponents?: boolean;
  /** Bullet-point rules shown in the app. */
  rules: LText[];
  houseRuleNote: LText;
}

/* ------------------------------------------------------------------ state */

export interface Segment {
  edge: string;
  from: string;
  to: string;
  line: LineId;
  round: number;
  reveal: number;
}

export type TurnStatus = 'deciding' | 'built' | 'passed' | 'autoPassed' | 'skipped' | 'left';

export interface ScorePart {
  rule: LineRule['type'] | FinalRule['type'] | 'objective' | 'lines';
  points: number;
  /** Numbers that explain the points; keys are rule-specific. */
  detail: Record<string, number>;
  objectiveId?: string;
}

export interface LineScore {
  line: LineId;
  parts: ScorePart[];
  total: number;
}

export interface FinalScore {
  parts: ScorePart[];
  total: number;
  tie: number[];
}

export interface PlayerState {
  id: string;
  segments: Segment[];
  status: TurnStatus;
  /** Segments still allowed on the active card. */
  left: number;
  lineScores: LineScore[];
  final?: FinalScore;
  retired?: boolean;
}

export type GamePhase = 'playing' | 'roundScoring' | 'finished';

export interface RankEntry {
  playerId: string;
  rank: number;
  total: number;
}

export interface GameState {
  cityId: string;
  cityVersion: number;
  seed: string;
  modules: ModuleId[];
  autoPass: boolean;
  phase: GamePhase;
  round: number;
  lineOrder: LineId[];
  deck: Card[];
  /** Index of the active card in `deck`. */
  reveal: number;
  players: Record<string, PlayerState>;
  objectives: string[];
  /** Increments on every accepted action. */
  revision: number;
  /** Accepted actions, sufficient to replay the game from its seed. */
  log: GameAction[];
  ranking?: RankEntry[];
}

export type GameAction =
  | { type: 'build'; playerId: string; turn: string; from: string; edge: string }
  | { type: 'pass'; playerId: string; turn: string }
  | { type: 'skip'; playerId: string; turn: string }
  | { type: 'retire'; playerId: string }
  | { type: 'nextRound'; round: number };

export type RejectReason =
  | 'staleTurn'
  | 'notPlaying'
  | 'unknownPlayer'
  | 'alreadySubmitted'
  | 'noEdge'
  | 'symbolMismatch'
  | 'crossing'
  | 'edgeUsed'
  | 'notOnLine'
  | 'notEndpoint'
  | 'loop'
  | 'tunnel'
  | 'wrongPhase';

export type ActionResult = { ok: true; state: GameState } | { ok: false; reason: RejectReason };

export interface LegalMove {
  from: string;
  to: string;
  edge: string;
}
