-- 0002: verwerking van de onafhankelijke QA- en security-review (docs/qa/2026-10-12-backend.md).
-- Let op: gaat uit van een lege database (op 2026-10-12 bestaat er nog geen omgeving met data).
-- Bestaande 'owner'-uitnodigingen of kluizen zonder ondertekenaars zouden eerst opgeschoond moeten worden.

-- Ondertekenaars per kluis. Eén rij per sleutel; een persoon kan meerdere sleutels houden
-- (bijv. een solo-ondernemer met 3 hardware wallets). Goedkeuringen wegen naar aantal sleutels.
CREATE TABLE vault_signers (
  vault_id  uuid NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
  position  int  NOT NULL CHECK (position BETWEEN 1 AND 15),
  user_id   uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (vault_id, position)
);
CREATE INDEX vault_signers_user_idx ON vault_signers(user_id);

-- Nieuwe leden zijn 'pending' tot een eigenaar ze bevestigt (na controle van de veiligheidscode).
ALTER TABLE memberships ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending'));

-- Uitnodigingen kunnen nooit eigenaarschap geven en kunnen worden ingetrokken.
ALTER TABLE invitations ADD COLUMN revoked_at timestamptz;
ALTER TABLE invitations ADD CONSTRAINT invitations_role_not_owner CHECK (role IN ('approver', 'viewer'));

-- Challenges voor step-up (verse passkey-bevestiging, gebonden aan één actie) en extra passkeys.
ALTER TABLE webauthn_challenges DROP CONSTRAINT webauthn_challenges_purpose_check;
ALTER TABLE webauthn_challenges ADD CONSTRAINT webauthn_challenges_purpose_check CHECK (purpose IN ('register', 'login', 'stepup', 'add_passkey'));
ALTER TABLE webauthn_challenges ADD COLUMN target text;
CREATE INDEX webauthn_challenges_expiry_idx ON webauthn_challenges(expires_at);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

-- TRUNCATE omzeilt rij-triggers; blokkeer het apart.
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();

-- End-to-end-versleuteling: publieke sleutel per gebruiker en per lid ingepakte organisatiesleutels.
-- De server bewaart alleen publieke sleutels en ingepakte (versleutelde) sleutels.
CREATE TABLE user_encryption_keys (
  user_id     uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  alg         text NOT NULL CHECK (alg IN ('x25519')),
  public_key  bytea NOT NULL CHECK (octet_length(public_key) = 32),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wrapped_org_keys (
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_id       text NOT NULL CHECK (key_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wrapped_key  bytea NOT NULL CHECK (octet_length(wrapped_key) BETWEEN 32 AND 512),
  wrapped_by   uuid NOT NULL REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, key_id, user_id)
);
