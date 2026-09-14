CREATE TABLE categories (
  id       INTEGER PRIMARY KEY,
  name     TEXT    NOT NULL UNIQUE,
  position INTEGER NOT NULL
);

CREATE TABLE themes (
  id          INTEGER PRIMARY KEY,
  title       TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  image_file  TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  position    INTEGER NOT NULL,
  created_at  TEXT    NOT NULL
);

CREATE INDEX themes_category ON themes(category_id);
