export function ensureAuth(req, _res, next) {
  if (!req.session) req.session = {};
  // DEV: nếu chưa login, tự set student để tránh null (có thể bỏ nếu muốn)
  if (!req.session.user)
    req.session.user = {
      id: "mock-uuid-student",
      role: "student",
      full_name: "DEV student",
    };
  next();
}

export function isInstructor(req, res, next) {
  const r = req.session?.user?.role;
  if (r === "instructor" || r === "admin") return next();
  return res.status(403).send("Forbidden: Instructor only");
}

export function isAdmin(req, res, next) {
  const r = req.session?.user?.role;
  if (r === "admin") return next();
  return res.status(403).send("Forbidden: Admin only");
}
