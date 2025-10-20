export function ensureAuth(req, _res, next) {
  if (!req.session) req.session = {};
  // DEV: nếu chưa login, tự set student để tránh null (có thể bỏ nếu muốn)
  if (!req.session.user)
    req.session.user = {
      id: "mock-uuid-student",
      role: "student",
      full_name: "DEV student",
    };
  // Đồng bộ req.user từ session để các middleware khác dùng chung
  req.user = req.session.user;
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
  // Đảm bảo có thông tin user từ session
  if (!req.session?.user) return res.status(401).send("Unauthorized");
  req.user = req.session.user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    const user = req.session?.user || req.user;
    if (!user) return res.status(401).send("Unauthorized");
    if (!roles.includes(user.role)) return res.status(403).send("Forbidden");
    // đồng bộ lại
    req.user = user;
    next();
  };
}
