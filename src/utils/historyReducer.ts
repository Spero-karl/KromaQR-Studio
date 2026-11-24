import type { QrConfig, QrLayerId, QrLayerItem } from '../types/qr';

export interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export const MAX_HISTORY_STEPS = 40;

export function createHistoryState<T>(initial: T): HistoryState<T> {
  return {
    past: [],
    present: initial,
    future: [],
  };
}

export function pushHistoryState<T>(
  state: HistoryState<T>,
  next: T
): HistoryState<T> {
  if (JSON.stringify(state.present) === JSON.stringify(next)) {
    return state;
  }
  const past = [...state.past, state.present].slice(-MAX_HISTORY_STEPS);
  return {
    past,
    present: next,
    future: [],
  };
}

export function undoHistoryState<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state;
  const previous = state.past[state.past.length - 1];
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future].slice(0, MAX_HISTORY_STEPS),
  };
}

export function redoHistoryState<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state;
  const next = state.future[0];
  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY_STEPS),
    present: next,
    future: state.future.slice(1),
  };
}

export function moveLayer(
  layers: QrLayerItem[],
  id: QrLayerId,
  direction: 'up' | 'down'
): QrLayerItem[] {
  const index = layers.findIndex((l) => l.id === id);
  if (index === -1) return layers;
  // In SVG, later elements render on top ("up" moves toward the end of the array)
  const targetIndex = direction === 'up' ? index + 1 : index - 1;
  if (targetIndex < 0 || targetIndex >= layers.length) return layers;
  const copy = [...layers];
  const [item] = copy.splice(index, 1);
  copy.splice(targetIndex, 0, item);
  return copy;
}

export function toggleLayer(layers: QrLayerItem[], id: QrLayerId): QrLayerItem[] {
  return layers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
}

export function normalizeConfigWithDefaults(
  partial: Partial<QrConfig>,
  defaults: QrConfig
): QrConfig {
  return {
    ...defaults,
    ...partial,
    laserEnabled:
      typeof partial.laserEnabled === 'boolean'
        ? partial.laserEnabled
        : defaults.laserEnabled ?? true,
    layers:
      Array.isArray(partial.layers) && partial.layers.length > 0
        ? partial.layers
        : defaults.layers,
    extraTexts: Array.isArray(partial.extraTexts)
      ? partial.extraTexts
      : defaults.extraTexts,
  };
}
