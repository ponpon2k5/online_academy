import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { engine } from "express-handlebars";
import adminCategories from "./routes/admin.categories.js";
import session from "express-session";
import { ensureAuth } from "./middlewares/auth.js";
import instructorRoutes from "./routes/instructor.js";
import adminRoutes from "./routes/admin.js";
import { requireAuth, requireRole } from "./middlewares/auth.js";
import session from 'express-session';
import hbs_sections from 'express-handlebars-sections';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import FacebookStrategy from 'passport-facebook';
import userModel from './models/user.model.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(
  session({ secret: "dev-secret", resave: false, saveUninitialized: true })
);

app.use("/uploads", express.static("./public/uploads"));

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
      ne: function (a, b) {
        return a !== b;
      },
    },
  })
);
app.use(express.urlencoded({ extended: true })); //Giúp Express đọc dữ liệu trong form POST
app.use(express.json());
//session
app.set('trust proxy', 1) // trust first proxy
app.use(session({
    secret: 'duybodoi',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // secure = true chỉ dùng khi https
}))


app.use(async function (req, res, next) {
    if(req.session.isAuthenticated){
        res.locals.isAuthenticated = true;
        res.locals.authUser = req.session.authUser;
    }
    next();
});

//view engine
app.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
        section: hbs_sections(),
        eq: (a, b) => String(a) === String(b),
    }
}));
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

//static files
app.use("/images", express.static(path.join(__dirname, "statics", "img")));

// Khởi tạo Passport
app.use(passport.initialize());
app.use(passport.session());

app.use(async function (req, res, next) {
    if (req.session.isAuthenticated) {
        res.locals.isAuthenticated = true;
        res.locals.authUser = req.session.authUser;
    }
    next();
});
// Cấu hình serialize/deserialize
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await userModel.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Cấu hình Google Strategy
passport.use(new GoogleStrategy({
    clientID: 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: 'YOUR_GOOGLE_CLIENT_SECRET',
    callbackURL: '/account/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await userModel.findByEmail(profile.emails[0].value);
        if (!user) {
            user = {
                username: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                password: '',
                permission: 0
            };
            await userModel.add(user);
        }
        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

// Cấu hình Facebook Strategy
passport.use(new FacebookStrategy({
    clientID: 'YOUR_FACEBOOK_APP_ID',
    clientSecret: 'YOUR_FACEBOOK_APP_SECRET',
    callbackURL: '/account/auth/facebook/callback',
    profileFields: ['id', 'emails', 'displayName']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await userModel.findByEmail(profile.emails[0].value);
        if (!user) {
            user = {
                username: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                password: '',
                permission: 0
            };
            await userModel.add(user);
        }
        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));

app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Thêm để xử lý JSON trong fetch
app.use('/static', express.static('static'));

app.use("/images", express.static(path.join(__dirname, "statics", "img")));

// Parse urlencoded form bodies BEFORE routes
app.use(express.urlencoded({ extended: true }));

// Authentication/session bootstrap
app.use(ensureAuth);

app.get("/", (req, res) => {
  res.render("home");
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

import db from "./utils/db.js";

app.get("/debug/db", async (_req, res) => {
  try {
    const r = await db.raw("select 1 as ok");
    return res.json({ ok: true, row: r?.rows?.[0] ?? null });
  } catch (e) {
    // Mở bung AggregateError
    const detail = {
      name: e?.name,
      message: e?.message,
      code: e?.code,
      errno: e?.errno,
      address: e?.address,
      port: e?.port,
      stack: e?.stack,
    };

    // Nếu là AggregateError, liệt kê các lỗi con
    if (e?.errors && Array.isArray(e.errors)) {
      detail.inner = e.errors.map((err) => ({
        name: err?.name,
        message: err?.message,
        code: err?.code,
        errno: err?.errno,
        address: err?.address,
        port: err?.port,
        stack: err?.stack,
      }));
    }

    console.error("DB PING ERROR DETAIL:", detail);
    return res.status(500).json({ ok: false, error: "DB_ERROR", detail });
  }
});

app.get("/debug/seed-dev", async (req, res) => {
  try {
    if (!req.session?.user?.id) return res.status(400).send("Login first");
    const me = req.session.user;

    // upsert instructor profile theo id session (DÙNG name, KHÔNG dùng full_name)
    await db("profiles")
      .insert({
        id: me.id,
        name: "DEV Instructor",
        role: "instructor",
        email: "dev@local",
      })
      .onConflict("id")
      .merge({ role: "instructor" });

    // ensure 1 category 'development'
    await db.raw(`
      insert into categories (id, name, slug, level, sort_order)
      values (gen_random_uuid()::text, 'Development', 'development', 1, 0)
      on conflict (slug) do nothing;
    `);

    const cat = await db("categories").where("slug", "development").first();
    res.json({
      ok: true,
      session_user: me,
      category: { id: cat.id, name: cat.name },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Routes
app.use("/instructor", instructorRoutes);
app.use("/admin", adminRoutes);
app.use("/admin/categories", adminCategories);



//router
//student routes
import studentRouter from "./routes/student.route.js";
app.use("/student", studentRouter);
import accountRouter from "./routes/account.route.js";
app.use("/account", accountRouter);
import coursesRouter from "./routes/courses.route.js";
app.use("/courses", coursesRouter);
import adminRouter from "./routes/admin.categories.js";
app.use("/admin/categories", adminRouter);


//test homepage
app.get("/", (req, res) => {
  res.render("home", { layout: "main" });
});

//start server
app.use(express.urlencoded({ extended: true }));

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

app.get("/course/:id", (req, res) => {
  res.render("courseDetail", { layout: "main" });
});

app.use(function (req, res) {
    res.status(404).render('404');
});