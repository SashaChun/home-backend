import 'dotenv/config';
import { query } from '../services/db.js';

await query(`
  CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name  VARCHAR(60),
    phone         VARCHAR(20),
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS listings (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    type          VARCHAR(50),
    rent_term     VARCHAR(50),
    price         NUMERIC(10,2),
    rooms         SMALLINT,
    area          NUMERIC(8,2),
    floor         SMALLINT,
    floors_total  SMALLINT,
    city          VARCHAR(100),
    district      VARCHAR(80),
    address       TEXT,
    video_url     TEXT,
    lat           NUMERIC(10,7),
    lng           NUMERIC(10,7),
    amenities     TEXT[]      DEFAULT '{}',
    photos        TEXT[]      DEFAULT '{}',
    status        VARCHAR(20) DEFAULT 'active',
    views_count   INTEGER     DEFAULT 0,
    rating        NUMERIC(3,1) DEFAULT 0,
    reviews_count INTEGER     DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  CHAR(64) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS refresh_tokens_token_hash_idx ON refresh_tokens (token_hash);
  CREATE INDEX IF NOT EXISTS listings_owner_id_idx ON listings (owner_id);
  CREATE INDEX IF NOT EXISTS listings_status_created_at_idx ON listings (status, created_at DESC);
`);

console.log('[migrate] done');
process.exit(0);
