import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { engine } from "express-handlebars";
import adminCategories from "./routes/admin.categories.js";
import session from "express-session";
import { ensureAuth } from "./middlewares/auth.js";
import instructorRoutes from "./routes/instructor.js";
import adminRoutes from "./routes/admin.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(
  session({ secret: "dev-secret", resave: false, saveUninitialized: true })
);

app.engine(
  "handlebars",
  engine({
    layoutsDir: path.join(__dirname, "views", "layouts"),
    defaultLayout: "main",
    extname: ".handlebars",
    helpers: {
      eq: function (a, b) {
        return a === b;
      },
    },
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

app.use("/images", express.static(path.join(__dirname, "statics", "img")));

app.get("/", (req, res) => {
  res.render("home", { title: "Trang chủ" });
});

app.get("/debug/login/:role", (req, res) => {
  const role = req.params.role; // "student" | "instructor" | "admin"
  // NOTE: nhớ thay "mock-uuid-instructor" bằng 1 id hợp lệ trong bảng profiles khi test thật.
  const id =
    role === "instructor"
      ? "mock-uuid-instructor"
      : role === "admin"
      ? "mock-uuid-admin"
      : "mock-uuid-student";

  req.session.user = { id, full_name: `DEV ${role}`, role };
  res.send(`Logged in as ${role}`);
});

app.get("/debug/me", (req, res) => {
  res.json(req.session.user ?? null);
});

app.use(express.urlencoded({ extended: true }));

// Authentication middleware
app.use(ensureAuth);

// Routes
app.use("/instructor", instructorRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/categories", adminCategories);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
