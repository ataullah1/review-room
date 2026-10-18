import { describe, expect, it } from "vitest";
import { seededDemo } from "../src/features/demo/state";
import {
  createShowcaseState,
  showcaseReducer,
} from "../src/features/marketing/showcase-state";

function preview() {
  return createShowcaseState(seededDemo());
}

describe("browser-only marketing preview", () => {
  it("keeps role changes local and enforces designer/client decision boundaries", () => {
    let state = preview();
    const seed = structuredClone(state.comments);
    expect(showcaseReducer(state, { type: "resolve" })).toBe(state);
    state = showcaseReducer(state, { type: "view", view: "DESIGNER" });
    expect(showcaseReducer(state, { type: "approve" })).toBe(state);
    expect(showcaseReducer(state, { type: "request-changes" })).toBe(state);
    state = showcaseReducer(state, {
      type: "reply",
      id: "designer-reply",
      body: "Updated the spacing.",
    });
    expect(state.comments.at(-1)).toMatchObject({
      author: "DESIGNER",
      parentId: state.selectedId,
      version: 2,
    });
    state = showcaseReducer(state, { type: "resolve" });
    expect(
      state.comments.find((comment) => comment.id === state.selectedId)
        ?.resolved,
    ).toBe(true);
    state = showcaseReducer(state, { type: "resolve" });
    expect(
      state.comments.find((comment) => comment.id === state.selectedId)
        ?.resolved,
    ).toBe(false);
    state = showcaseReducer(state, { type: "view", view: "CLIENT" });
    state = showcaseReducer(state, { type: "request-changes" });
    expect(
      state.decisions.find((decision) => decision.assetId === "identity")
        ?.decision,
    ).toBe("CHANGES_REQUESTED");
    state = showcaseReducer(state, { type: "approve" });
    expect(
      state.decisions.find((decision) => decision.assetId === "identity")
        ?.decision,
    ).toBe("APPROVED");
    expect(seed).toEqual(seededDemo().comments);
  });

  it("preserves conversation on role switch and rejects historical or invalid replies", () => {
    let state = showcaseReducer(preview(), {
      type: "pin",
      point: { xRatio: 0.2, yRatio: 0.4 },
    });
    state = showcaseReducer(state, { type: "view", view: "DESIGNER" });
    expect(state.draft).toBeNull();
    state = showcaseReducer(state, { type: "cancel" });
    for (const body of [" ", "x".repeat(301), "bad\u0000text"]) {
      expect(
        showcaseReducer(state, { type: "reply", id: "invalid", body }),
      ).toBe(state);
    }
    const historical = showcaseReducer(state, { type: "version", version: 1 });
    expect(
      showcaseReducer(historical, {
        type: "reply",
        id: "old-reply",
        body: "No changes here",
      }),
    ).toBe(historical);
    expect(showcaseReducer(historical, { type: "resolve" })).toBe(historical);
    const designer = showcaseReducer(state, {
      type: "pin",
      point: { xRatio: 0.1, yRatio: 0.2 },
    });
    const comment = showcaseReducer(designer, {
      type: "comment",
      id: "designer-pin",
      body: "Please review this detail.",
    });
    expect(comment.comments.at(-1)?.author).toBe("DESIGNER");
    expect(
      showcaseReducer(comment, { type: "reset", seed: seededDemo() }).view,
    ).toBe("CLIENT");
  });

  it("keeps added feedback on its own asset and version without mutating the seed", () => {
    const seed = seededDemo();
    const original = structuredClone(seed);
    let state = createShowcaseState(seed);
    state = showcaseReducer(state, {
      type: "pin",
      point: { xRatio: 0.3, yRatio: 0.7 },
    });
    state = showcaseReducer(state, {
      type: "comment",
      id: "local-comment",
      body: "  More contrast here.  ",
    });
    expect(
      state.comments.find((comment) => comment.id === "local-comment"),
    ).toMatchObject({
      assetId: "identity",
      version: 2,
      xRatio: 0.3,
      yRatio: 0.7,
      body: "More contrast here.",
    });
    state = showcaseReducer(state, { type: "asset", assetId: "journal" });
    expect(state.selectedId).not.toBe("local-comment");
    state = showcaseReducer(state, { type: "asset", assetId: "identity" });
    state = showcaseReducer(state, { type: "select", id: "local-comment" });
    expect(state.selectedId).toBe("local-comment");
    expect(seed).toEqual(original);
  });

  it("keeps historical versions read only and drops a draft when changing versions", () => {
    let state = showcaseReducer(preview(), {
      type: "pin",
      point: { xRatio: 0.5, yRatio: 0.5 },
    });
    state = showcaseReducer(state, { type: "version", version: 1 });
    expect(state.draft).toBeNull();
    const historical = state;
    for (const action of [
      { type: "pin", point: { xRatio: 0.5, yRatio: 0.5 } },
      { type: "comment", id: "old-comment", body: "Change an old version" },
      { type: "approve" },
    ] as const)
      state = showcaseReducer(state, action);
    expect(state).toBe(historical);
  });

  it("never selects a comment from another asset or revision", () => {
    const state = preview();
    const foreign = state.comments.find(
      (comment) => comment.assetId === "journal",
    )!;
    const old = state.comments.find(
      (comment) => comment.assetId === "identity" && comment.version === 1,
    )!;
    expect(showcaseReducer(state, { type: "select", id: foreign.id })).toBe(
      state,
    );
    expect(showcaseReducer(state, { type: "select", id: old.id })).toBe(state);
  });

  it("rejects malformed pin positions and invalid feedback", () => {
    const state = preview();
    for (const xRatio of [-0.1, 1.01, NaN, Infinity])
      expect(
        showcaseReducer(state, { type: "pin", point: { xRatio, yRatio: 0.5 } }),
      ).toBe(state);
    const draft = showcaseReducer(state, {
      type: "pin",
      point: { xRatio: 0, yRatio: 1 },
    });
    for (const body of [" ", "x".repeat(301), "bad\u0000text"])
      expect(
        showcaseReducer(draft, { type: "comment", id: "invalid", body }),
      ).toBe(draft);
  });

  it("records an approval only for the selected current version", () => {
    const state = showcaseReducer(preview(), { type: "approve" });
    expect(
      state.decisions.find(
        (decision) => decision.assetId === "identity" && decision.version === 2,
      )?.decision,
    ).toBe("APPROVED");
    const old = showcaseReducer(state, { type: "version", version: 1 });
    expect(
      old.decisions.some(
        (decision) =>
          decision.assetId === old.assetId && decision.version === old.version,
      ),
    ).toBe(false);
    expect(
      state.decisions.filter((decision) => decision.assetId !== "identity"),
    ).toEqual(seededDemo().decisions);
    expect(showcaseReducer(state, { type: "approve" }).decisions).toHaveLength(
      state.decisions.length,
    );
  });

  it("resets feedback, decisions, the selected asset and draft together", () => {
    const seed = seededDemo();
    let state = showcaseReducer(preview(), { type: "approve" });
    state = showcaseReducer(state, { type: "asset", assetId: "packaging" });
    state = showcaseReducer(state, {
      type: "pin",
      point: { xRatio: 0.1, yRatio: 0.9 },
    });
    expect(showcaseReducer(state, { type: "reset", seed })).toEqual(
      createShowcaseState(seed),
    );
  });
});
