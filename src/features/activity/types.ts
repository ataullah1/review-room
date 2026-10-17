export type ActivityKind =
  | "UPLOAD_READY"
  | "COMMENT_CREATED"
  | "REPLY_CREATED"
  | "THREAD_RESOLVED"
  | "THREAD_REOPENED"
  | "REVIEW_APPROVED"
  | "CHANGES_REQUESTED"
  | "INVITE_ACCEPTED";
export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  actorName: string;
  assetId: string | null;
  versionId: string | null;
  versionNumber: number | null;
  threadNumber: number | null;
  createdAt: string;
  unread: boolean;
};
export type ActivityPage = {
  items: ActivityItem[];
  next: string | null;
  headId: string;
  unreadCount: number;
  lastReadAt: string | null;
};
