-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."WorkspaceRole" AS ENUM ('OWNER', 'DESIGNER', 'CLIENT');

-- CreateTable
CREATE TABLE "app"."UserProfile" (
    "id" UUID NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Workspace" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."Membership" (
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "app"."WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "app"."Project" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."ProjectMember" (
    "projectId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "Membership_userId_workspaceId_idx" ON "app"."Membership"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "Project_workspaceId_archivedAt_createdAt_id_idx" ON "app"."Project"("workspaceId", "archivedAt", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Project_id_workspaceId_key" ON "app"."Project"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "ProjectMember_workspaceId_userId_projectId_idx" ON "app"."ProjectMember"("workspaceId", "userId", "projectId");

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "app"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "app"."UserProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "app"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_workspaceId_fkey" FOREIGN KEY ("projectId", "workspaceId") REFERENCES "app"."Project"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."ProjectMember" ADD CONSTRAINT "ProjectMember_workspaceId_userId_fkey" FOREIGN KEY ("workspaceId", "userId") REFERENCES "app"."Membership"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Application tables are private by default. The owner-backed server must
-- enforce authorization; browser-facing grants are additionally hardened by
-- supabase/001_application_access.sql in the development Supabase project.
REVOKE ALL ON SCHEMA app FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA app FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA app REVOKE ALL ON TABLES FROM PUBLIC;
ALTER TABLE app."UserProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Workspace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."Project" ENABLE ROW LEVEL SECURITY;
ALTER TABLE app."ProjectMember" ENABLE ROW LEVEL SECURITY;
