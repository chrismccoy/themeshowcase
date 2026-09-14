export function adminLocals(config) {
  return (req, res, next) => {
    res.locals.brand = config.brand;
    res.locals.adminUser = config.adminUsername;
    res.locals.active = null;
    res.locals.title = "";
    next();
  };
}
