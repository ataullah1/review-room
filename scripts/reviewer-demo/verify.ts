import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import {
  productionOrigin,
  productionSupabaseRef,
} from "../../src/lib/config/deployment";
import { publicDemoAccounts } from "../../src/features/reviewer-demo/config";
import {
  demoWorkspaceId,
  demoProjects,
  demoId,
} from "../../src/features/reviewer-demo/seed";

config({ path: ".env", quiet: true });
async function main() {
  if (
    process.env.NEXT_PUBLIC_SUPABASE_URL !==
    `https://${productionSupabaseRef}.supabase.co`
  )
    throw new Error("Reviewer demo backend mismatch.");
  const accounts = publicDemoAccounts();
  const origin = new URL(productionOrigin);
  const base = `/app/${demoWorkspaceId}/projects/${demoProjects[0].id}/assets/${demoId("olive-identity")}`;
  const versionId = demoId("olive-identity:v2");
  const request = (path: string, cookie = "", method = "GET", body?: unknown) =>
    fetch(new URL(path, origin), {
      method,
      redirect: "manual",
      headers: {
        Origin: origin.origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60000),
    });
  const sessions = new Map<string, string>();
  const login = async (account: (typeof accounts)[number]) => {
    const response = await request("/auth/login", "", "POST", {
      email: account.email,
      password: account.password,
      next: "/app/",
    });
    const data = await response.json();
    if (!response.ok || data.redirectTo !== "/app/")
      throw new Error(`${account.role} sign-in/workspace redirect failed.`);
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    if (!cookie) throw new Error("No authenticated session cookie received.");
    return cookie;
  };
  try {
    for (const account of accounts) {
      const cookie = await login(account);
      sessions.set(account.role, cookie);
      const chooser = await request("/app", cookie);
      if (
        chooser.status !== 200 ||
        !(await chooser.text()).includes(`/app/${demoWorkspaceId}/projects`)
      )
        throw new Error(`${account.role} workspace chooser failed.`);
      const directory = await request(
        `/app/${demoWorkspaceId}/projects`,
        cookie,
      );
      const directoryHtml = await directory.text();
      if (
        directory.status !== 200 ||
        !directoryHtml.includes("Olive Café") ||
        !directoryHtml.includes("Forma") ||
        (account.role === "OWNER"
          ? !directoryHtml.includes("Studio Notes")
          : directoryHtml.includes("Studio Notes"))
      )
        throw new Error(
          `${account.role} project directory permissions failed.`,
        );
      const packaging = `/app/${demoWorkspaceId}/projects/${demoProjects[1].id}/assets/${demoId("forma-packaging")}`;
      for (const number of [1, 2]) {
        const image = await request(
          `${packaging}/file?preview=1&versionId=${demoId(`forma-packaging:v${number}`)}`,
          cookie,
        );
        if (
          !image.ok ||
          !image.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error(`${account.role} assigned packaging image failed.`);
        await image.arrayBuffer();
      }
      const threads = await request(
        `${base}/comments?versionId=${versionId}`,
        cookie,
      );
      const data = await threads.json();
      if (
        !threads.ok ||
        !data.threads?.some(
          (t: { authorName: string; replies: { authorName: string }[] }) =>
            t.authorName === "Client Demo" &&
            t.replies.some((r) => r.authorName === "Designer Demo"),
        )
      )
        throw new Error(
          `${account.role} authored version-bound feedback is missing.`,
        );
      for (const number of [1, 2]) {
        const image = await request(
          `${base}/file?preview=1&versionId=${demoId(`olive-identity:v${number}`)}`,
          cookie,
        );
        if (
          !image.ok ||
          !image.headers.get("content-type")?.startsWith("image/")
        )
          throw new Error(`${account.role} version ${number} image failed.`);
        await image.arrayBuffer();
      }
      const versionPage = await request(base, cookie);
      if (
        versionPage.status !== 200 ||
        !(await versionPage.text()).includes("Compare")
      )
        throw new Error(
          `${account.role} review/version-comparison entry failed.`,
        );
      if (account.role !== "OWNER") {
        const hidden = await request(
          `/app/${demoWorkspaceId}/projects/${demoProjects[2].id}/assets/${demoId("studio-journal")}/comments?versionId=${demoId("studio-journal:v2")}`,
          cookie,
        );
        if (![403, 404].includes(hidden.status))
          throw new Error("Unassigned project data was not denied.");
        if (account.role === "DESIGNER") {
          const denied = await request(`${base}/decisions`, cookie, "POST", {
            id: randomUUID(),
            expectedCurrentVersionId: versionId,
            decision: "APPROVED",
          });
          if (denied.status !== 403)
            throw new Error("Designer approval was not denied.");
        }
      }
      console.log(
        `PASS ${account.role}: real sign-in, workspace chooser, assigned project counts, authored feedback, V1/V2 images and private-project denial.`,
      );
    }
    if (process.argv.includes("--exercise-review")) {
      const client = sessions.get("CLIENT")!,
        designer = sessions.get("DESIGNER")!;
      const id = randomUUID();
      const comment = await request(
        `${base}/comments?versionId=${versionId}`,
        client,
        "POST",
        {
          operation: "create",
          input: {
            id,
            body: "Reviewer acceptance: please check this sample detail.",
            xRatio: 0.5,
            yRatio: 0.25,
          },
        },
      );
      if (!comment.ok) throw new Error("Client sample comment failed.");
      const reply = await request(
        `${base}/comments?versionId=${versionId}`,
        designer,
        "POST",
        {
          operation: "create",
          input: {
            id: randomUUID(),
            parentId: id,
            body: "Reviewer acceptance: checked and ready for approval.",
          },
        },
      );
      if (!reply.ok) throw new Error("Designer sample reply failed.");
      const resolved = await request(
        `${base}/comments?versionId=${versionId}`,
        designer,
        "POST",
        { operation: "resolve", id, resolved: true },
      );
      if (!resolved.ok) throw new Error("Designer resolve failed.");
      for (const decision of ["CHANGES_REQUESTED", "APPROVED"]) {
        const result = await request(`${base}/decisions`, client, "POST", {
          id: randomUUID(),
          expectedCurrentVersionId: versionId,
          decision,
          note: "Reviewer acceptance of the shared sample.",
        });
        if (!result.ok) throw new Error("Client review decision failed.");
      }
      await request("/auth/logout", client, "POST", {});
      sessions.delete("CLIENT");
      const cookie = await login(accounts.find((a) => a.role === "CLIENT")!);
      sessions.set("CLIENT", cookie);
      const persisted = await (
        await request(`${base}/comments?versionId=${versionId}`, cookie)
      ).text();
      if (!persisted.includes(id))
        throw new Error("Comment did not survive logout/login.");
      console.log(
        "PASS connected client/designer review actions and persistence after re-login. Sample changes retained until operator restore.",
      );
    }
  } finally {
    for (const cookie of sessions.values())
      await request("/auth/logout", cookie, "POST", {}).catch(() => undefined);
  }
}
main().catch(() => {
  console.error(
    "Reviewer demo verification failed. Check setup and server logs; no credentials are printed.",
  );
  process.exitCode = 1;
});
