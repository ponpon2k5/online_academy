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

export function requireAuth(req, res, next) {
  // TODO: thay bằng session/real auth
  if (!req.user) {
    // Temp for dev: mock a user (instructor)
    req.user = {
      id: "instructor-001",
      role: "instructor",
      name: "Dev Instructor",
    };
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).send("Unauthorized");
    if (!roles.includes(req.user.role))
      return res.status(403).send("Forbidden");
    next();
  };
}
