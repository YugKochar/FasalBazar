-- ============================================================
-- Fasal Bazaar — Complete Database Schema
-- PostgreSQL
-- Rebuilt from project context v1.1 (March 2026)
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
-- (No PostGIS — Haversine formula used for geo distance)

-- ============================================================
-- ENUMS
-- ============================================================

-- User roles
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('buyer', 'seller', 'both');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Preferred language (all 16 supported languages)
DO $$ BEGIN
  CREATE TYPE preferred_language AS ENUM (
    'en', 'hi', 'ta', 'te', 'kn', 'ml',
    'bn', 'gu', 'mr', 'pa', 'or', 'as',
    'ne', 'ur', 'kok', 'mai'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Listing / request status
DO $$ BEGIN
  CREATE TYPE listing_status AS ENUM ('active', 'inactive', 'sold', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE request_status AS ENUM ('active', 'fulfilled', 'cancelled', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Delivery preference for buyer requests
DO $$ BEGIN
  CREATE TYPE delivery_preference AS ENUM ('pickup', 'delivery', 'either');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- TABLES
-- ============================================================

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                 SERIAL PRIMARY KEY,
  name               VARCHAR(255)        NOT NULL,
  email              VARCHAR(255)        UNIQUE NOT NULL,
  phone              VARCHAR(20),
  password_hash      VARCHAR(255)        NOT NULL,
  role               user_role           NOT NULL DEFAULT 'buyer',

  -- Location
  pincode            VARCHAR(10),
  city               VARCHAR(100),
  state              VARCHAR(100),
  country            VARCHAR(100)        DEFAULT 'India',
  lat                DOUBLE PRECISION,
  lng                DOUBLE PRECISION,

  -- Preferences
  preferred_language preferred_language  DEFAULT 'en',
  default_radius     INTEGER             DEFAULT 50,   -- km

  created_at         TIMESTAMP           DEFAULT NOW(),
  updated_at         TIMESTAMP           DEFAULT NOW()
);

-- ------------------------------------------------------------
-- listings
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listings (
  id              SERIAL PRIMARY KEY,
  seller_id       INTEGER             NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Crop details (stored in English as canonical form)
  crop_name       VARCHAR(255)        NOT NULL,
  amount          NUMERIC(10, 2)      NOT NULL,
  unit            VARCHAR(50)         DEFAULT 'kg',
  price           NUMERIC(10, 2)      NOT NULL,        -- price per unit
  description     TEXT,
  features        JSONB               DEFAULT '{}',
  delivery_cost   NUMERIC(10, 2)      DEFAULT 0,

  -- Location
  pincode         VARCHAR(10),
  city            VARCHAR(100),
  state           VARCHAR(100),
  country         VARCHAR(100)        DEFAULT 'India',
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,

  -- Status
  status          listing_status      DEFAULT 'active',

  -- Multilingual support
  original_lang   VARCHAR(10)         DEFAULT 'en',   -- language the farmer used when listing
  original_text   JSONB               DEFAULT '{}',   -- { crop_name, description, lang }
  translations    JSONB               DEFAULT '{}',   -- { "hi": { crop_name, description }, "ta": {...}, ... }

  created_at      TIMESTAMP           DEFAULT NOW(),
  updated_at      TIMESTAMP           DEFAULT NOW()
);

-- ------------------------------------------------------------
-- listing_images
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_images (
  id           SERIAL PRIMARY KEY,
  listing_id   INTEGER   NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  image_data   TEXT      NOT NULL,   -- base64-encoded image string
  is_primary   BOOLEAN   DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- ------------------------------------------------------------
-- requests  (buyer crop requests)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS requests (
  id                  SERIAL PRIMARY KEY,
  buyer_id            INTEGER              NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Crop details
  crop_name           VARCHAR(255)         NOT NULL,
  amount_required     NUMERIC(10, 2)       NOT NULL,
  unit                VARCHAR(50)          DEFAULT 'kg',
  budget              NUMERIC(10, 2),      -- budget per unit

  -- Preferences
  delivery_preference delivery_preference  DEFAULT 'either',
  requirements        TEXT,               -- free-text special requirements

  -- Location
  pincode             VARCHAR(10),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(100)         DEFAULT 'India',
  lat                 DOUBLE PRECISION,
  lng                 DOUBLE PRECISION,

  -- Status
  status              request_status       DEFAULT 'active',

  -- Multilingual support
  original_lang       VARCHAR(10)          DEFAULT 'en',
  translations        JSONB                DEFAULT '{}',

  created_at          TIMESTAMP            DEFAULT NOW(),
  updated_at          TIMESTAMP            DEFAULT NOW()
);

-- ------------------------------------------------------------
-- reviews
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
  id           SERIAL PRIMARY KEY,
  reviewer_id  INTEGER          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id    INTEGER          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id   INTEGER          REFERENCES listings(id) ON DELETE SET NULL,
  rating       SMALLINT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment      TEXT,
  created_at   TIMESTAMP        DEFAULT NOW()
);

-- ------------------------------------------------------------
-- transactions
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id            SERIAL PRIMARY KEY,
  buyer_id      INTEGER          NOT NULL REFERENCES users(id),
  seller_id     INTEGER          NOT NULL REFERENCES users(id),
  listing_id    INTEGER          REFERENCES listings(id) ON DELETE SET NULL,
  amount        NUMERIC(10, 2)   NOT NULL,
  quantity      NUMERIC(10, 2),
  unit          VARCHAR(50)      DEFAULT 'kg',
  status        VARCHAR(50)      DEFAULT 'pending',   -- pending, completed, cancelled
  notes         TEXT,
  created_at    TIMESTAMP        DEFAULT NOW(),
  updated_at    TIMESTAMP        DEFAULT NOW()
);

-- ------------------------------------------------------------
-- cart  (server-side cart — primary store is localStorage fb_cart)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id  INTEGER    NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  quantity    NUMERIC(10, 2) DEFAULT 1,
  added_at    TIMESTAMP  DEFAULT NOW(),
  UNIQUE (user_id, listing_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Speed up geo-distance queries (Haversine scans lat/lng)
CREATE INDEX IF NOT EXISTS idx_listings_lat_lng   ON listings (lat, lng);
CREATE INDEX IF NOT EXISTS idx_listings_status    ON listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_seller    ON listings (seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_crop      ON listings (LOWER(crop_name));
CREATE INDEX IF NOT EXISTS idx_listings_city      ON listings (LOWER(city));

CREATE INDEX IF NOT EXISTS idx_requests_lat_lng   ON requests (lat, lng);
CREATE INDEX IF NOT EXISTS idx_requests_status    ON requests (status);
CREATE INDEX IF NOT EXISTS idx_requests_buyer     ON requests (buyer_id);
CREATE INDEX IF NOT EXISTS idx_requests_crop      ON requests (LOWER(crop_name));

CREATE INDEX IF NOT EXISTS idx_reviews_seller     ON reviews (seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_listing    ON reviews (listing_id);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON listing_images (listing_id);

-- ============================================================
-- VIEWS
-- ============================================================

-- ------------------------------------------------------------
-- v_active_listings
-- Joins listings + seller info + primary image + avg rating
-- Used by GET /api/listings/ and GET /api/listings/<id>
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_listings AS
SELECT
  l.id,
  l.seller_id,
  u.name          AS seller_name,
  u.phone         AS seller_phone,
  u.email         AS seller_email,
  l.crop_name,
  l.amount,
  l.unit,
  l.price,
  l.description,
  l.features,
  l.delivery_cost,
  l.pincode,
  l.city,
  l.state,
  l.country,
  l.lat,
  l.lng,
  l.status,
  l.original_lang,
  l.original_text,
  l.translations,
  l.created_at,
  l.updated_at,
  -- Primary image (base64)
  (
    SELECT li.image_data
    FROM   listing_images li
    WHERE  li.listing_id = l.id
      AND  li.is_primary  = TRUE
    LIMIT  1
  ) AS image,
  -- Average seller rating
  (
    SELECT ROUND(AVG(r.rating)::numeric, 1)
    FROM   reviews r
    WHERE  r.seller_id = l.seller_id
  ) AS avg_rating,
  -- Total reviews for seller
  (
    SELECT COUNT(*)
    FROM   reviews r
    WHERE  r.seller_id = l.seller_id
  ) AS review_count
FROM  listings l
JOIN  users    u ON u.id = l.seller_id
WHERE l.status = 'active';

-- ------------------------------------------------------------
-- v_active_requests
-- Joins requests + buyer info
-- Used by GET /api/requests/
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW v_active_requests AS
SELECT
  r.id,
  r.buyer_id,
  u.name              AS buyer_name,
  u.phone             AS buyer_phone,
  u.email             AS buyer_email,
  r.crop_name,
  r.amount_required,
  r.unit,
  r.budget,
  r.delivery_preference,
  r.requirements,
  r.pincode,
  r.city,
  r.state,
  r.country,
  r.lat,
  r.lng,
  r.status,
  r.original_lang,
  r.translations,
  r.created_at,
  r.updated_at
FROM  requests r
JOIN  users    u ON u.id = r.buyer_id
WHERE r.status = 'active';

-- ============================================================
-- MIGRATIONS  (safe to run on existing DB — all use IF NOT EXISTS / DO blocks)
-- ============================================================

-- Expand preferred_language ENUM if needed
-- (Already handled above via DO $$ BEGIN ... EXCEPTION block)

-- Add multilingual columns to listings (if upgrading from pre-v1 schema)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS original_lang  VARCHAR(10) DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS original_text  JSONB       DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS translations   JSONB       DEFAULT '{}';

-- Add multilingual columns to requests (if upgrading from pre-v1 schema)
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS original_lang  VARCHAR(10) DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS translations   JSONB       DEFAULT '{}';

-- ============================================================
-- END OF SCHEMA
-- ============================================================
