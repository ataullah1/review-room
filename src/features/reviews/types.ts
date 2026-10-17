export type DecisionView = {
  id: string;
  versionId: string;
  reviewerId: string;
  reviewerName: string;
  decisionNumber: number;
  decision: "APPROVED" | "CHANGES_REQUESTED";
  note: string | null;
  createdAt: string;
};
export type DecisionPage = {
  history: DecisionView[];
  latest: DecisionView[];
  next: number | null;
};
export type VersionView = {
  id: string;
  versionNumber: number;
  uploader: string;
  createdAt: string;
};
export type VersionPage = { versions: VersionView[]; next: number | null };
