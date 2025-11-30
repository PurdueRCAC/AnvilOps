ALTER TABLE "DeploymentConfig"
ADD COLUMN     "collectLogs" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "limits" JSONB,
ADD COLUMN     "mounts" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "port" INTEGER,
ADD COLUMN     "replicas" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requests" JSONB;

UPDATE "DeploymentConfig"
SET "collectLogs" = COALESCE(
  ("fieldValues"::json->>'collectLogs')::boolean,
  false
  ),
  "limits" = COALESCE(
  "fieldValues"::jsonb->'extra'->'limits',
  '{"cpu": "1000m", "memory": "1024Mi"}'::jsonb
  ),
  "requests" = COALESCE(
    "fieldValues"::jsonb->'extra'->'requests',
    '{"cpu": "1000m", "memory": "1024Mi"}'::jsonb
  ),
  "port" = ("fieldValues"::json->>'port')::integer,
  "replicas" = ("fieldValues"::json->>'replicas')::integer,
  "mounts" = COALESCE(
    "fieldValues"::jsonb->'mounts',
    '[]'::jsonb
  );

ALTER TABLE "DeploymentConfig" DROP COLUMN "fieldValues",
ALTER COLUMN "limits" SET NOT NULL,
ALTER COLUMN "requests" SET NOT NULL,
ALTER COLUMN "port" SET NOT NULL;