/**
 * Every query for categories.
 */

/**
 * Builds the category repository.
 */
export function createCategoryRepository(db) {
  const listStatement = db.prepare(
    "SELECT categories.id AS id," +
      " categories.name AS name," +
      " COUNT(themes.id) AS count" +
      " FROM categories" +
      " LEFT JOIN themes ON themes.category_id = categories.id" +
      " GROUP BY categories.id" +
      " ORDER BY categories.position"
  );

  const findStatement = db.prepare("SELECT id, name, position FROM categories WHERE id = ?");
  const nextPositionStatement = db.prepare(
    "SELECT COALESCE(MAX(position), 0) + 1 AS next FROM categories"
  );
  const insertStatement = db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)");
  const renameStatement = db.prepare("UPDATE categories SET name = ? WHERE id = ?");
  const deleteStatement = db.prepare("DELETE FROM categories WHERE id = ?");

  /**
   * Every category with how many themes it has, in display order.
   */
  function list() {
    return listStatement.all();
  }

  /**
   * One category, or undefined when there is none
   */
  function findById(id) {
    const numeric = Number(id);
    if (!Number.isInteger(numeric)) return undefined;
    return findStatement.get(numeric);
  }

  /**
   * Adds a category
   */
  const create = db.transaction((name) => {
    const { next } = nextPositionStatement.get();
    return Number(insertStatement.run(name, next).lastInsertRowid);
  });

  /**
   * Changes a category's name.
   */
  function rename(id, name) {
    renameStatement.run(name, Number(id));
  }

  /**
   * Deletes a category.
   */
  function remove(id) {
    deleteStatement.run(Number(id));
  }

  return { list, findById, create, rename, remove };
}
