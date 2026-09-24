-- Начальная схема до первого развёртывания. Дальнейшие изменения — новые миграции.
-- Не применяем новую историю поверх старой без отдельного переноса данных.
DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '001-cards') THEN
      RAISE EXCEPTION 'Old development schema detected. Back up and migrate it before initialization.';
    END IF;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash char(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  slug varchar(120) NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft) = 'object'),
  published_snapshot jsonb CHECK (jsonb_typeof(published_snapshot) = 'object'),
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (published_snapshot IS NOT NULL AND published_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS cards_owner_updated_idx ON cards(owner_user_id, updated_at DESC);

CREATE OR REPLACE VIEW published_cards AS
  SELECT slug, published_snapshot FROM cards
  WHERE status = 'published' AND published_snapshot IS NOT NULL AND published_at IS NOT NULL;

REVOKE ALL ON users, sessions, cards, published_cards FROM PUBLIC, cards_public, cards_auth, cards_editor;
GRANT SELECT ON published_cards TO cards_public;
GRANT SELECT, INSERT ON users TO cards_auth;
GRANT SELECT, INSERT, DELETE ON sessions TO cards_auth;
GRANT SELECT ON cards TO cards_editor;
GRANT INSERT (slug, draft, owner_user_id) ON cards TO cards_editor;
GRANT UPDATE (draft, updated_at) ON cards TO cards_editor;

-- Не выдаём редактору общий DELETE: владелец и статус проверяются одной операцией.
CREATE OR REPLACE FUNCTION public.delete_owned_draft(target_id uuid, target_owner uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  WITH deleted AS (
    DELETE FROM public.cards
    WHERE id = target_id AND owner_user_id = target_owner AND status = 'draft'
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM deleted);
$$;

-- Снимок копируется атомарно: параллельное редактирование не смешивает версии.
CREATE OR REPLACE FUNCTION public.publish_owned_card(target_id uuid, target_owner uuid)
RETURNS SETOF public.cards
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.cards
  SET published_snapshot = draft,
      status = 'published',
      published_at = now(),
      updated_at = now()
  WHERE id = target_id AND owner_user_id = target_owner
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_owned_card(target_id uuid, target_owner uuid)
RETURNS SETOF public.cards
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
  UPDATE public.cards
  SET status = 'draft', updated_at = now()
  WHERE id = target_id AND owner_user_id = target_owner
  RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.delete_owned_draft(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_owned_card(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unpublish_owned_card(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_owned_draft(uuid, uuid) TO cards_editor;
GRANT EXECUTE ON FUNCTION public.publish_owned_card(uuid, uuid) TO cards_editor;
GRANT EXECUTE ON FUNCTION public.unpublish_owned_card(uuid, uuid) TO cards_editor;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

REVOKE ALL ON schema_migrations FROM PUBLIC, cards_public, cards_auth, cards_editor;
INSERT INTO schema_migrations(name) VALUES ('001-initial') ON CONFLICT DO NOTHING;
