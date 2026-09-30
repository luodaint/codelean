INSERT INTO organization (id, name, slug, "createdAt")
VALUES ('codelean-legacy', 'Original workspace', 'codelean-legacy', now());

CREATE TABLE installations (
  id bigint PRIMARY KEY,
  organization_id text NOT NULL REFERENCES organization(id),
  account_id bigint,
  account_login text,
  UNIQUE(id, organization_id)
);
INSERT INTO installations(id, organization_id)
SELECT DISTINCT installation_id, 'codelean-legacy' FROM repositories;

ALTER TABLE repositories ADD COLUMN organization_id text NOT NULL DEFAULT 'codelean-legacy' REFERENCES organization(id);
ALTER TABLE repositories ADD CONSTRAINT repositories_installation_workspace
  FOREIGN KEY (installation_id, organization_id) REFERENCES installations(id, organization_id);
ALTER TABLE repositories ALTER COLUMN organization_id DROP DEFAULT;
CREATE INDEX repositories_workspace ON repositories(organization_id);
CREATE UNIQUE INDEX member_workspace_user ON member("organizationId", "userId");
