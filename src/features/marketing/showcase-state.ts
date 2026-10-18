import type { DemoAssetId } from "../demo/catalog";
import type { DemoComment, DemoState } from "../demo/state";
import type { ImagePoint } from "../comments/coordinates";

export type ShowcaseState = DemoState & {
  view: "DESIGNER" | "CLIENT";
  assetId: DemoAssetId;
  version: 1 | 2;
  selectedId: string | null;
  draft: ImagePoint | null;
};

export type ShowcaseAction =
  | { type: "view"; view: "DESIGNER" | "CLIENT" }
  | { type: "reply"; id: string; body: string }
  | { type: "resolve" }
  | { type: "request-changes" }
  | { type: "asset"; assetId: DemoAssetId }
  | { type: "version"; version: 1 | 2 }
  | { type: "select"; id: string }
  | { type: "pin"; point: ImagePoint }
  | { type: "cancel" }
  | { type: "comment"; id: string; body: string }
  | { type: "approve" }
  | { type: "reset"; seed: DemoState };

export function createShowcaseState(seed: DemoState): ShowcaseState {
  return {
    comments: [...seed.comments],
    decisions: [...seed.decisions],
    view: "CLIENT",
    assetId: "identity",
    version: 2,
    selectedId:
      seed.comments.find(
        (comment) =>
          comment.assetId === "identity" &&
          comment.version === 2 &&
          !comment.parentId,
      )?.id || null,
    draft: null,
  };
}

function firstThread(
  comments: DemoComment[],
  assetId: DemoAssetId,
  version: 1 | 2,
) {
  return (
    comments.find(
      (comment) =>
        comment.assetId === assetId &&
        comment.version === version &&
        !comment.parentId,
    )?.id || null
  );
}

// This reducer is deliberately independent of the demo API and customer data.
export function showcaseReducer(
  state: ShowcaseState,
  action: ShowcaseAction,
): ShowcaseState {
  switch (action.type) {
    case "view":
      return { ...state, view: action.view, draft: null };
    case "reply": {
      const body = action.body.trim();
      const parent = state.comments.find(
        (comment) =>
          comment.id === state.selectedId &&
          !comment.parentId &&
          comment.assetId === state.assetId &&
          comment.version === state.version,
      );
      if (
        state.version !== 2 ||
        !parent ||
        !body ||
        body.length > 300 ||
        body.includes("\u0000") ||
        state.comments.length >= 40 ||
        state.comments.some((comment) => comment.id === action.id)
      )
        return state;
      return {
        ...state,
        comments: [
          ...state.comments,
          {
            id: action.id,
            assetId: state.assetId,
            version: state.version,
            parentId: parent.id,
            threadNumber: null,
            xRatio: null,
            yRatio: null,
            body,
            author: state.view,
            resolved: false,
            createdAt: "2026-10-01T10:00:00.000Z",
          },
        ],
      };
    }
    case "resolve": {
      if (state.view !== "DESIGNER" || state.version !== 2) return state;
      return {
        ...state,
        comments: state.comments.map((comment) =>
          comment.id === state.selectedId &&
          !comment.parentId &&
          comment.assetId === state.assetId &&
          comment.version === state.version
            ? { ...comment, resolved: !comment.resolved }
            : comment,
        ),
      };
    }
    case "asset":
      return {
        ...state,
        assetId: action.assetId,
        version: 2,
        draft: null,
        selectedId: firstThread(state.comments, action.assetId, 2),
      };
    case "version":
      return {
        ...state,
        version: action.version,
        draft: null,
        selectedId: firstThread(state.comments, state.assetId, action.version),
      };
    case "select":
      return state.comments.some(
        (comment) =>
          comment.id === action.id &&
          comment.assetId === state.assetId &&
          comment.version === state.version &&
          !comment.parentId,
      )
        ? { ...state, selectedId: action.id, draft: null }
        : state;
    case "pin": {
      const { xRatio, yRatio } = action.point;
      if (
        state.version !== 2 ||
        ![xRatio, yRatio].every(
          (value) => Number.isFinite(value) && value >= 0 && value <= 1,
        )
      )
        return state;
      return { ...state, draft: action.point, selectedId: null };
    }
    case "cancel":
      return {
        ...state,
        draft: null,
        selectedId: firstThread(state.comments, state.assetId, state.version),
      };
    case "comment": {
      const body = action.body.trim();
      if (
        state.version !== 2 ||
        !state.draft ||
        state.comments.length >= 40 ||
        !body ||
        body.length > 300 ||
        body.includes("\u0000") ||
        state.comments.some((comment) => comment.id === action.id)
      )
        return state;
      const number =
        1 +
        Math.max(
          0,
          ...state.comments
            .filter(
              (comment) =>
                comment.assetId === state.assetId &&
                comment.version === state.version,
            )
            .map((comment) => comment.threadNumber || 0),
        );
      return {
        ...state,
        selectedId: action.id,
        draft: null,
        comments: [
          ...state.comments,
          {
            id: action.id,
            assetId: state.assetId,
            version: state.version,
            parentId: null,
            threadNumber: number,
            ...state.draft,
            body,
            author: state.view,
            resolved: false,
            createdAt: "2026-10-01T10:00:00.000Z",
          },
        ],
      };
    }
    case "approve":
    case "request-changes":
      if (state.version !== 2 || state.view !== "CLIENT") return state;
      return {
        ...state,
        decisions: [
          ...state.decisions.filter(
            (decision) =>
              decision.assetId !== state.assetId ||
              decision.version !== state.version,
          ),
          {
            assetId: state.assetId,
            version: state.version,
            decision:
              action.type === "approve" ? "APPROVED" : "CHANGES_REQUESTED",
            note:
              action.type === "approve"
                ? "Approved in this browser preview."
                : "Changes requested in this browser preview.",
            createdAt: "2026-10-01T10:00:00.000Z",
          },
        ],
      };
    case "reset":
      return createShowcaseState(action.seed);
  }
}
