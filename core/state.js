import { RATING_STORAGE_KEY } from './constants.js';

export function createInitialState() {
  return {
    self: Array(6).fill(null),
    enemy: Array(6).fill(null),
    modal: { side: "self", index: 0 },
    pokedex: [],
    pickerSearch: {
      index: [],
      indexReady: false,
      highlightedIndex: 0,
      recent: [],
      lastQuery: "",
      quickFiltersOpen: true,
      filters: { type: null, form: null, role: null },
    },
    cache: new Map(),
    loadingList: false,
    moveTypeCache: {},
    smogonRaw: null,
    metaIndex: new Map(),
    fallbackIndex: new Map(),
    metaRanked: [],
    rating: localStorage.getItem(RATING_STORAGE_KEY) || "1760",
    loadingMeta: false,
    field: {
      // Clima y terreno
      weather: null,
      weatherTurns: 0,
      terrain: null,
      terrainTurns: 0,

      // Rooms
      trickRoom: false,
      trickRoomTurns: 0,

      // Tailwind
      tailwindSelf: false,
      tailwindSelfTurns: 0,
      tailwindEnemy: false,
      tailwindEnemyTurns: 0,

      // Pantallas / velos lado self
      reflectSelf: false,
      reflectSelfTurns: 0,
      lightScreenSelf: false,
      lightScreenSelfTurns: 0,
      auroraVeilSelf: false,
      auroraVeilSelfTurns: 0,

      // Pantallas / velos lado enemy
      reflectEnemy: false,
      reflectEnemyTurns: 0,
      lightScreenEnemy: false,
      lightScreenEnemyTurns: 0,
      auroraVeilEnemy: false,
      auroraVeilEnemyTurns: 0,

      // Hazards
      hazards: {
        self: { rocks: false, spikes: 0, tspikes: 0, web: false },
        enemy: { rocks: false, spikes: 0, tspikes: 0, web: false },
      },

      // Flags de turno para guard/redirección
      quickGuardSelf: false,
      wideGuardSelf: false,
      redirectionSelf: null,   // p.ej. slug del mon que redirige, o true
      quickGuardEnemy: false,
      wideGuardEnemy: false,
      redirectionEnemy: null,
    },
    matrixMode: "offensive",
    matrixDetailMode: "detailed",
    matrixHelpOpen: false,
    leads: { self: [], enemy: [] },
    uiMode: 'quick',
    chosenFour: [],
    chosenEnemyFour: [],
    battleFocus: 'active',
    activeSelfSlots: [0, 1],
    activeEnemySlots: [0, 1],
    selectedMatrixCell: null,
    turn1Custom: false,
    battleSheet: { open: false, side: null, slotKey: null, cell: null },
    setEditor: { index: null },
    setChoice: { kind: "", moveIndex: null, options: [], query: "" },
  };
}

export const state = createInitialState();
