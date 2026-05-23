import {
  SYNERGY_ENGINE_VERSION,
  buildSynergyReport,
} from './synergy-engine.js';

export const TACTICAL_FINDINGS_ADAPTER_VERSION = 'tactical-findings-adapter-v1';

function groupBy(list, getKey) {
  return (list || []).reduce((acc, item) => {
    const key = getKey(item) || 'unknown';
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});
}

function compactSubjects(subjects = []) {
  return subjects.map((subject) => ({
    type: subject.type,
    side: subject.side ?? null,
    slot: subject.slot ?? null,
    id: subject.id ?? null,
    label: subject.label,
  }));
}

export function findingsToQuickHighlights(findings = [], options = {}) {
  const limit = options.limit || 8;
  return findings.slice(0, limit).map((finding) => ({
    id: finding.id,
    family: finding.family,
    scope: finding.scope,
    severity: finding.severity,
    side: finding.side,
    label: finding.userMessage,
    response: finding.recommendedResponse,
    confidence: finding.confidence,
    subjects: compactSubjects(finding.subjects),
    evidenceCount: finding.evidence?.length || 0,
    tags: finding.tags || [],
  }));
}

export function findingsToHomeChips(findings = [], options = {}) {
  const limit = options.limit || 4;
  return findings.slice(0, limit).map((finding) => ({
    id: finding.id,
    family: finding.family,
    scope: finding.scope,
    severity: finding.severity,
    side: finding.side,
    label: finding.userMessage,
    response: finding.recommendedResponse,
    confidence: finding.confidence,
    subjects: compactSubjects(finding.subjects).slice(0, 3),
    evidenceCount: finding.evidence?.length || 0,
    tags: finding.tags || [],
  }));
}

export function findingsToThreatRows(findings = [], options = {}) {
  const minSeverity = options.minSeverity || 'info';
  const rank = { critical: 4, high: 3, medium: 2, watch: 1, info: 0 };
  const threshold = rank[minSeverity] ?? 0;
  return findings
    .filter((finding) => (rank[finding.severity] ?? 0) >= threshold)
    .map((finding) => ({
      id: finding.id,
      family: finding.family,
      side: finding.side,
      severity: finding.severity,
      scope: finding.scope,
      primarySubject: finding.subjects?.find((subject) => subject.type === 'pokemon') || finding.subjects?.[0] || null,
      subjects: compactSubjects(finding.subjects),
      message: finding.userMessage,
      recommendedResponse: finding.recommendedResponse,
      confidenceValue: finding.confidence?.value ?? null,
      confidenceLevel: finding.confidence?.level ?? null,
      evidence: finding.evidence || [],
    }));
}

export function buildTacticalSummary(snapshot, options = {}) {
  const report = buildSynergyReport(snapshot, options);
  const findings = report.findings || [];
  return {
    schema: 'tactical-summary-v1',
    version: TACTICAL_FINDINGS_ADAPTER_VERSION,
    sourceVersion: SYNERGY_ENGINE_VERSION,
    snapshotKey: report.snapshotKey,
    summary: report.summary,
    highlights: findingsToQuickHighlights(findings, { limit: options.highlightLimit || 8 }),
    threatRows: findingsToThreatRows(findings, { minSeverity: options.minThreatSeverity || 'medium' }),
    bySide: groupBy(findings, (finding) => finding.side || 'global'),
    byScope: groupBy(findings, (finding) => finding.scope),
    byFamily: groupBy(findings, (finding) => finding.family),
    graph: options.includeGraph === false ? null : report.graph,
    actionEvidence: options.includeActionEvidence === false ? null : report.actionEvidence,
  };
}

export default {
  TACTICAL_FINDINGS_ADAPTER_VERSION,
  buildTacticalSummary,
  findingsToHomeChips,
  findingsToQuickHighlights,
  findingsToThreatRows,
};
