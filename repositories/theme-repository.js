/**
 * Every query for themes.
 */

/**
 * Builds the theme repository.
 */
export function createThemeRepository(db) {
  const listStatement = db.prepare(
    "SELECT themes.id AS id," +
      " themes.title AS name," +
      " categories.name AS category," +
      " themes.url AS url," +
      " themes.description AS description," +
      " themes.pinned AS pinned" +
      " FROM themes" +
      " JOIN categories ON categories.id = themes.category_id" +
      " ORDER BY themes.pinned DESC," +
      " CASE WHEN themes.pinned = 1 THEN themes.position END," +
      " themes.created_at DESC," +
      " themes.id DESC"
  );

  const imageFileStatement = db.prepare("SELECT image_file FROM themes WHERE id = ?");

  const findStatement = db.prepare(
    "SELECT id, title, url, category_id, image_file, description, position, pinned" +
      " FROM themes WHERE id = ?"
  );
  const nextPositionStatement = db.prepare(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM themes"
  );
  const insertStatement = db.prepare(
    "INSERT INTO themes (title, url, category_id, image_file, description, position, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const updateAllStatement = db.prepare(
    "UPDATE themes SET title = ?, url = ?, category_id = ?, description = ?, image_file = ?" +
      " WHERE id = ?"
  );
  const updateFieldsStatement = db.prepare(
    "UPDATE themes SET title = ?, url = ?, category_id = ?, description = ? WHERE id = ?"
  );
  const deleteStatement = db.prepare("DELETE FROM themes WHERE id = ?");
  const neighbourAboveStatement = db.prepare(
    "SELECT id, position FROM themes" +
      " WHERE pinned = 1 AND position < ? ORDER BY position DESC LIMIT 1"
  );
  const neighbourBelowStatement = db.prepare(
    "SELECT id, position FROM themes" +
      " WHERE pinned = 1 AND position > ? ORDER BY position ASC LIMIT 1"
  );
  const setPositionStatement = db.prepare("UPDATE themes SET position = ? WHERE id = ?");
  const pinStatement = db.prepare(
    "UPDATE themes SET pinned = 1, position = ? WHERE id = ? AND pinned = 0"
  );
  const unpinStatement = db.prepare("UPDATE themes SET pinned = 0 WHERE id = ?");

  /**
   * Every listed theme
   */
  function list() {
    return listStatement.all().map((row) => ({
      id: String(row.id),
      name: row.name,
      category: row.category,
      image: `/media/theme/${row.id}`,
      url: row.url,
      description: row.description,
      pinned: row.pinned === 1,
    }));
  }

  /**
   * The filename for a theme
   */
  function findImageFile(id) {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return undefined;
    return imageFileStatement.get(numeric)?.image_file;
  }

  /**
   * Find theme by its ID
   */
  function findById(id) {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return undefined;

    const row = findStatement.get(numeric);
    if (!row) return undefined;

    return {
      id: row.id,
      title: row.title,
      url: row.url,
      categoryId: row.category_id,
      imageFile: row.image_file,
      description: row.description,
      position: row.position,
      pinned: row.pinned === 1,
    };
  }

  /**
   * Adds a theme
   */
  const create = db.transaction(({ title, url, categoryId, imageFile, description = "" }) => {
    const { next } = nextPositionStatement.get();
    const info = insertStatement.run(
      title,
      url,
      Number(categoryId),
      imageFile,
      description,
      next,
      new Date().toISOString()
    );
    return Number(info.lastInsertRowid);
  });

  /**
   * Changes a theme
   */
  function update(id, { title, url, categoryId, imageFile, description = "" }) {
    if (imageFile) {
      updateAllStatement.run(title, url, Number(categoryId), description, imageFile, Number(id));
      return;
    }
    updateFieldsStatement.run(title, url, Number(categoryId), description, Number(id));
  }

  /**
   * Deletes a theme
   */
  function remove(id) {
    const theme = findById(id);
    if (!theme) return undefined;
    deleteStatement.run(Number(id));
    return theme.imageFile;
  }

  /**
   * Swaps a theme with its neighbour in display order.
   */
  function swapWith(neighbourStatement) {
    return db.transaction((id) => {
      const theme = findById(id);
      if (!theme || !theme.pinned) return;

      const neighbour = neighbourStatement.get(theme.position);
      if (!neighbour) return;

      setPositionStatement.run(neighbour.position, theme.id);
      setPositionStatement.run(theme.position, neighbour.id);
    });
  }

  const moveUp = swapWith(neighbourAboveStatement);
  const moveDown = swapWith(neighbourBelowStatement);

  /**
   * Pins a theme to the bottom of the pinned group. A theme already pinned keeps its place.
   */
  const pin = db.transaction((id) => {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return;
    const { next } = nextPositionStatement.get();
    pinStatement.run(next, numeric);
  });

  /**
   * Returns a theme to date order.
   */
  function unpin(id) {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return;
    unpinStatement.run(numeric);
  }

  return { list, findImageFile, findById, create, update, remove, moveUp, moveDown, pin, unpin };
}
