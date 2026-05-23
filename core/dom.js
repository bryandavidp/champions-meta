// core/dom.js
// Responsabilidad: Repositorio centralizado de nodos DOM estáticos compartidos.
// Este módulo lee el DOM una sola vez al importarse (o bajo demanda si el DOM no está listo).

// Cache local de nodos para evitar búsquedas repetidas
const cache = new Map();

/**
 * Obtiene un nodo del DOM por su ID, cacheadolo para futuras peticiones.
 * @param {string} id - El ID del elemento HTML.
 * @returns {HTMLElement|null}
 */
export function getEl(id) {
    if (cache.has(id)) return cache.get(id);
    const el = document.getElementById(id);
    if (el) cache.set(id, el);
    return el;
}

// ----------------------------------------------------------------------
// EXPORTS ESPECÍFICOS POR DOMINIO
// ----------------------------------------------------------------------

// 1. Dock & Equipos
export const DOCK = {
    get selfSlots() { return getEl("selfSlots"); },
    get enemySlots() { return getEl("enemySlots"); },
};

// 2. Modos Globales UI (Quick vs Expert vs Live)
export const UI_MODES = {
    get toggleGroup() { return getEl("uiModeToggle"); },
    get matrixSectionTitle() { return getEl("matrixSectionTitle"); },
    get insightGrid() { return document.querySelector(".insight-grid"); }, // Excepción con querySelector
    get defensiveAlertFloat() { return getEl("defensiveAlertFloat"); },
    get turnBranchesPanel() { return getEl("turnBranchesPanel"); }
};

// 2b. Home tactica mobile-first
export const HOME = {
    get header() { return getEl("homeTacticalHeader"); },
    get title() { return getEl("homeTacticalTitle"); },
    get fieldChip() { return getEl("homeFieldChip"); },
    get verdictChip() { return getEl("homeVerdictChip"); },
    get confidenceChip() { return getEl("homeConfidenceChip"); },
    get matchupPanel() { return getEl("homeMatchupPanel"); },
    get readyChip() { return getEl("homeReadyChip"); },
    get selfRail() { return getEl("homeSelfRail"); },
    get enemyRail() { return getEl("homeEnemyRail"); },
    get insightStrip() { return getEl("homeInsightStrip"); },
    get decisionPanel() { return getEl("homeDecisionPanel"); },
    get snapshotCard() { return getEl("homeSnapshotCard"); },
    get fieldRibbon() { return getEl("homeFieldRibbon"); },
    get recommendedBringCard() { return getEl("homeRecommendedBringCard"); },
    get leadPlanCard() { return getEl("homeLeadPlanCard"); },
    get threatLane() { return getEl("homeThreatLane"); },
    get detailTeasers() { return getEl("homeDetailTeasers"); },
    get mobileActionBar() { return getEl("homeMobileActionBar"); },
    get mobileActionKicker() { return getEl("homeMobileActionKicker"); },
    get mobileActionTitle() { return getEl("homeMobileActionTitle"); },
    get primaryCta() { return getEl("homePrimaryCta"); }
};

// 3. Matrix & Controls
export const MATRIX = {
    get container() { return getEl("matrixContainer"); },
    get placeholder() { return getEl("matrixPlaceholder"); },
    get status() { return getEl("matrixStatus"); },
    get sourceChip() { return getEl("matrixSourceChip"); },
    get modeToggleGroup() { return getEl("matrixModeToggleGroup"); },
    get detailToggleGroup() { return getEl("matrixDetailToggleGroup"); },
    get helpToggleBtn() { return getEl("matrixHelpToggleBtn"); },
    get fieldControls() { return getEl("matrixFieldControls"); }
};

// 4. Analíticas (Expert Mode)
export const ANALYSIS = {
    get threatList() { return getEl("threatList"); },
    get opportunityList() { return getEl("opportunityList"); },
    get strategyList() { return getEl("strategyList"); },
    get speedTierList() { return getEl("speedTierList"); }
};

export const TURN_BRANCHES = {
    get panel() { return getEl("turnBranchesPanel"); },
    get content() { return getEl("turnBranchesContent"); }
};

export const SPEED_ORDER = {
    get panel() { return getEl("speedOrderPanel"); },
    get content() { return getEl("speedOrderContent"); }
};

// 5. Quick Mode & Turn 1
export const QUICK = {
    get previewPanel() { return getEl("quickPreviewPanel"); },
    get turn1Panel() { return getEl("turn1SimulatorPanel"); },
    get combosSection() { return getEl("quickCombosSection"); },
    get combosList() { return getEl("quickCombosList"); },
    get mvpBanner() { return getEl("mvpBanner"); },
    get planRivalCard() { return getEl("planRivalCard"); },
    get planRivalList() { return getEl("planRivalList"); },
    get bestFourCard() { return getEl("bestFourCard"); },
    get noBringCard() { return getEl("noBringCard"); },
    get turn1PickZone() { return getEl("turn1PickZone"); },
    get selfPickRow() { return getEl("t1SelfPickRow"); },
    get enemyPickRow() { return getEl("t1EnemyPickRow"); },
    get turn1InsightsList() { return getEl("t1InsightsList"); },
    get turn1EmptyState() { return getEl("t1EmptyState"); },
    get turn1GlobalFieldState() { return getEl("t1GlobalFieldState"); },
    get momentumPanel() { return getEl("momentumPanel"); }
};

// 6. Modal / Picker de Pokémon
export const PICKER = {
    get modal() { return getEl("pickerModal"); },
    get searchInput() { return getEl("searchInput"); },
    get resultList() { return getEl("resultList"); },
    get title() { return getEl("modalTitle"); }
};

// 7. Editor de Sets (Set Editor)
export const SET_EDITOR = {
    get modal() { return getEl("setEditorModal"); },
    get body() { return getEl("setEditorBody"); },
    get title() { return getEl("setEditorTitle"); },
    get subtitle() { return getEl("setEditorSubtitle"); },
    
    // Sub-modal de opciones rápidas
    get choiceModal() { return getEl("setChoiceModal"); },
    get choiceTitle() { return getEl("setChoiceTitle"); },
    get choiceSubtitle() { return getEl("setChoiceSubtitle"); },
    get choiceSearch() { return getEl("setChoiceSearch"); },
    get choiceList() { return getEl("setChoiceList"); }
};

// 8. Live Mode (Simulador VGC)
export const LIVE = {
    get focusToggle() { return getEl("matrixFocusToggle"); },
    get matchupStrip() { return getEl("activeMatchupStrip"); },
    get selfSlotA() { return getEl("activeSelfSlotA"); },
    get selfSlotB() { return getEl("activeSelfSlotB"); },
    get enemySlotA() { return getEl("activeEnemySlotA"); },
    get enemySlotB() { return getEl("activeEnemySlotB"); },
    get battleToolbar() { return getEl("liveBattleToolbar"); },
    get urgencyThreats() { return getEl("battleUrgencyThreats"); },
    get urgencyKills() { return getEl("battleUrgencyKills"); },
    get urgencySafeSwitches() { return getEl("battleUrgencySafeSwitches"); },
    get sheetOverlay() { return getEl("battleSheetOverlay"); },
    get sheetModal() { return getEl("battleSheet"); },
    get sheetTitle() { return getEl("battleSheetTitle"); },
    get sheetBody() { return getEl("battleSheetBody"); },
    get closeSheetBtn() { return getEl("closeBattleSheetBtn"); },
    get statePanel() { return getEl("liveStatePanel"); },
    get stateSelfSlots() { return getEl("liveStateSelfSlots"); },
    get stateEnemySlots() { return getEl("liveStateEnemySlots"); },
    get fieldControls() { return getEl("liveFieldControls"); },
    get recommendations() { return getEl("liveRecommendations"); }
};
