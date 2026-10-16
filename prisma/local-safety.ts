export function assertLocalDatabase(
  connectionString: string | undefined,
  purpose: "seed" | "test",
) {
  let url: URL;
  try {
    url = new URL(connectionString ?? "");
  } catch {
    throw new Error(
      "Local database URL is missing or invalid. See .env.example.",
    );
  }
  const databases =
    purpose === "test"
      ? ["review_room_test"]
      : ["review_room_dev", "review_room_test"];
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.port !== "55432" ||
    url.username !== "review_room_local" ||
    !databases.includes(url.pathname.slice(1)) ||
    Boolean(url.hash) ||
    [...url.searchParams].some(
      ([key, value]) => key !== "schema" || value !== "app",
    )
  ) {
    throw new Error(
      "Refusing fixture writes: use the dedicated local Review Room database on port 55432.",
    );
  }
  return connectionString as string;
}
