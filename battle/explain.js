export const EXPLAIN_EVENT_VERSION = 'explain-event-v1';

export function createConfidence({
  value = 1,
  level = null,
  reasons = [],
  unsupported = [],
} = {}) {
  const numeric = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
  return {
    value: Number(numeric.toFixed(3)),
    level: level || (numeric >= 0.8 ? 'high' : numeric >= 0.55 ? 'medium' : 'low'),
    reasons: [...new Set((reasons || []).filter(Boolean).map(String))],
    unsupported: [...new Set((unsupported || []).filter(Boolean).map(String))],
  };
}

export function createExplainEvent({
  code = 'engine.note',
  message = '',
  severity = 'info',
  layer = 'engine',
  side = null,
  slot = null,
  actor = null,
  target = null,
  sourceId = null,
  targetId = null,
  data = {},
  confidence = 1,
  unsupported = [],
} = {}) {
  return {
    schema: EXPLAIN_EVENT_VERSION,
    code,
    severity,
    layer,
    side,
    slot,
    actor,
    target,
    sourceId,
    targetId,
    message,
    data: data && typeof data === 'object' ? { ...data } : {},
    confidence: createConfidence({
      value: typeof confidence === 'number' ? confidence : confidence?.value,
      level: confidence?.level,
      reasons: confidence?.reasons || [],
      unsupported,
    }),
  };
}

export function eventToExplainEvent(event = {}, context = {}) {
  const kind = event.kind || 'note';
  const move = event.move || null;
  const actor = event.actor || null;
  const target = event.target || null;
  const side = event.side || context.side || null;

  if (kind === 'hit') {
    return createExplainEvent({
      code: event.isKo ? 'turn.damage.ko' : 'turn.damage.hit',
      severity: event.isKo ? 'critical' : 'info',
      layer: 'resolution',
      side,
      actor,
      target,
      sourceId: move,
      message: `${actor || 'Pokemon'} usa ${move || 'movimiento'} sobre ${target || 'objetivo'}`,
      data: {
        move,
        damagePct: event.damagePct ?? null,
        hpPct: event.hpPct ?? null,
        isKo: !!event.isKo,
        isSpread: !!event.isSpread,
      },
    });
  }

  if (kind === 'blocked') {
    return createExplainEvent({
      code: 'turn.action.blocked',
      severity: 'warning',
      layer: 'resolution',
      side,
      actor,
      target,
      sourceId: move,
      message: event.reason
        ? `${move || 'Accion'} bloqueado: ${event.reason}`
        : `${move || 'Accion'} bloqueado`,
      data: {
        move,
        reason: event.reason || null,
      },
      confidence: event.reason ? 0.85 : 0.65,
    });
  }

  if (kind === 'support' || kind === 'effect') {
    return createExplainEvent({
      code: kind === 'support' ? 'turn.support.applied' : 'turn.effect.applied',
      severity: 'info',
      layer: 'resolution',
      side,
      actor,
      target,
      sourceId: move,
      message: event.text || `${move || 'Efecto'} aplicado`,
      data: {
        move,
        text: event.text || null,
      },
    });
  }

  if (kind === 'switch' || kind === 'pivot') {
    return createExplainEvent({
      code: kind === 'pivot' ? 'turn.switch.pivot' : 'turn.switch.manual',
      severity: 'info',
      layer: 'resolution',
      side,
      actor,
      target: event.into || null,
      message: `${actor || 'Pokemon'} cambia a ${event.into || 'reserva'}`,
      data: {
        into: event.into || null,
      },
    });
  }

  return createExplainEvent({
    code: `turn.${kind}`,
    severity: 'info',
    layer: 'resolution',
    side,
    actor,
    target,
    sourceId: move,
    message: event.text || event.reason || move || kind,
    data: { ...event },
  });
}

export function eventsToExplainEvents(events = [], context = {}) {
  return (events || []).map((event) => eventToExplainEvent(event, context));
}
