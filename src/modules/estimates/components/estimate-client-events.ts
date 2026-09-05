export const ESTIMATE_DIRTY_STATE_EVENT = "novotech:estimate-dirty-state";

export type EstimateDirtyStateDetail = {
  estimateId: string;
  dirty: boolean;
};

export function notifyEstimateDirtyState(detail: EstimateDirtyStateDetail) {
  window.dispatchEvent(new CustomEvent<EstimateDirtyStateDetail>(ESTIMATE_DIRTY_STATE_EVENT, { detail }));
}
