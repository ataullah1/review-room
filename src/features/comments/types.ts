export type CommentView = {
  id: string;
  versionId: string;
  authorId: string;
  authorName: string;
  parentId: string | null;
  body: string;
  xRatio: number | null;
  yRatio: number | null;
  threadNumber: number | null;
  resolvedAt: string | null;
  createdAt: string;
};
export type ThreadView = CommentView & {
  replies: CommentView[];
  replyTotal: number;
  replyCursor: string | null;
  moreReplies: boolean;
};
export type ThreadPage = {
  threads: ThreadView[];
  total: number;
  next: number | null;
};
