import type { ActivityItem } from "./types";
export function activityDescription(
  item: Pick<ActivityItem, "kind" | "versionNumber" | "threadNumber">,
) {
  const version = item.versionNumber
      ? `version ${item.versionNumber}`
      : "an image version",
    thread = item.threadNumber ? `thread ${item.threadNumber}` : "a thread";
  switch (item.kind) {
    case "UPLOAD_READY":
      return `uploaded ${version}`;
    case "COMMENT_CREATED":
      return `added ${thread} on ${version}`;
    case "REPLY_CREATED":
      return `replied to ${thread} on ${version}`;
    case "THREAD_RESOLVED":
      return `resolved ${thread} on ${version}`;
    case "THREAD_REOPENED":
      return `reopened ${thread} on ${version}`;
    case "REVIEW_APPROVED":
      return `approved ${version}`;
    case "CHANGES_REQUESTED":
      return `requested changes on ${version}`;
    case "INVITE_ACCEPTED":
      return "joined the project";
  }
}
