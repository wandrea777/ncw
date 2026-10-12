-- NCW initieel schema.
-- Principes (zie docs/adr): we bewaren NOOIT sleutels; vault-descriptors, xpubs en PSBT's zijn
-- client-side versleuteld (ciphertext); de server ziet alleen wat nodig is om de workflow af te dwingen.

CREATE TABLE users (
  id            uuid PRIMARY KEY,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 80),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Passkeys (WebAuthn). Alleen de publieke sleutel; de privésleutel blijft in de authenticator.
CREATE TABLE passkeys (
  credential_id  text PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key     bytea NOT NULL,
  counter        bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports     text[] NOT NULL DEFAULT '{}',
  device_type    text NOT NULL,
  backed_up      boolean NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_used_at   timestamptz
);
CREATE INDEX passkeys_user_idx ON passkeys(user_id);

-- Eenmalige WebAuthn-challenges (kort geldig, worden bij gebruik verwijderd).
CREATE TABLE webauthn_challenges (
  id          uuid PRIMARY KEY,
  purpose     text NOT NULL CHECK (purpose IN ('register', 'login')),
  challenge   text NOT NULL,
  user_id     uuid,
  display_name text,
  expires_at  timestamptz NOT NULL
);

-- Sessies: alleen de SHA-256-hash van het token wordt bewaard.
CREATE TABLE sessions (
  id            uuid PRIMARY KEY,
  token_hash    bytea NOT NULL UNIQUE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  idle_expires_at timestamptz NOT NULL,
  revoked_at    timestamptz
);
CREATE INDEX sessions_user_idx ON sessions(user_id);

CREATE TABLE organizations (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Rollen: owner = beheer + goedkeuren, approver = goedkeuren, viewer = alleen lezen (bijv. boekhouder).
CREATE TABLE memberships (
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'approver', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);

-- Uitnodigingen: alleen de hash van de code wordt bewaard; eenmalig en kort geldig.
CREATE TABLE invitations (
  id          uuid PRIMARY KEY,
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner', 'approver', 'viewer')),
  code_hash   bytea NOT NULL UNIQUE,
  created_by  uuid NOT NULL REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz
);

-- Kluis (multisig). Publiek: keten en drempel (nodig om de workflow af te dwingen).
-- Versleuteld: descriptor/xpubs/adressen (de server kan saldi en adressen niet zien).
CREATE TABLE vaults (
  id                    uuid PRIMARY KEY,
  org_id                uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  chain                 text NOT NULL CHECK (chain IN ('bitcoin', 'ethereum')),
  threshold             int NOT NULL,
  signer_count          int NOT NULL,
  descriptor_ciphertext bytea NOT NULL,
  encryption            jsonb NOT NULL,
  created_by            uuid NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (signer_count BETWEEN 2 AND 15),
  CHECK (threshold BETWEEN 2 AND signer_count)
);
CREATE INDEX vaults_org_idx ON vaults(org_id);

CREATE TABLE proposals (
  id                  uuid PRIMARY KEY,
  vault_id            uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  created_by          uuid NOT NULL REFERENCES users(id),
  status              text NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  required_approvals  int NOT NULL CHECK (required_approvals >= 1),
  payload_ciphertext  bytea NOT NULL,
  encryption          jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz
);
CREATE INDEX proposals_vault_idx ON proposals(vault_id);

CREATE TABLE approvals (
  proposal_id           uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES users(id),
  decision              text NOT NULL CHECK (decision IN ('approve', 'reject')),
  signature_ciphertext  bytea,
  created_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

-- Manipulatiebestendig auditlog: per keten (organisatie of systeem) een hash-keten.
-- UPDATE en DELETE worden door triggers geweigerd.
CREATE TABLE audit_log (
  chain       text NOT NULL,
  seq         bigint NOT NULL,
  actor_id    uuid,
  action      text NOT NULL,
  target      text,
  details     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL,
  prev_hash   text NOT NULL,
  hash        text NOT NULL,
  PRIMARY KEY (chain, seq)
);

CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_update BEFORE UPDATE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
CREATE TRIGGER audit_log_no_delete BEFORE DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
