import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { engine } from "express-handlebars";
import session from 'express-session';
import hbs_sections from 'express-handlebars-sections';
import accountRouter from './routes/account.route.js';
import session from 'express-session';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import FacebookStrategy from 'passport-facebook';
import userModel from './models/user.model.js';
import adminCategories from "./routes/admin.categories.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('trust proxy', 1);
app.use(session({
    secret: 'lotusalone',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

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

app.engine("handlebars", engine({
    helpers: {
    fill_section: hbs_sections(),
    eq: (a, b) => a === b,
    format_number(value) {
      return new Intl.NumberFormat('en-US').format(value);
    }
  },
}));
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
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Thêm để xử lý JSON trong fetch
app.use('/static', express.static('static'));

app.use("/images", express.static(path.join(__dirname, "statics", "img")));

app.get("/", (req, res) => {
    if (req.session.isAuthenticated) {
        console.log('User is authenticated');
        console.log(req.session.authUser);
    }
    res.render('home');
});



import { checkAuthenticated, checkAdmin } from './middlewares/auth.mdw.js';

app.use('/account', accountRouter);

app.use(function (req, res) {
    res.status(404).render('404');
});

//view engine
app.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "views", "layouts"),
  partialsDir: path.join(__dirname, "views", "partials"),
  helpers: {
        section: hbs_sections()
    }
}));
//static files
app.use("/images", express.static(path.join(__dirname, "statics", "img")));


//router
//student routes
import studentRouter from "./routes/student.route.js";
app.use("/student", studentRouter);
import accountRouter from "./routes/account.route.js";
app.use("/account", accountRouter);
import coursesRouter from "./routes/courses.route.js";
app.use("/courses", coursesRouter);


//test homepage
app.get("/", (req, res) => {
  res.render("home", { layout: "main" });
});

//start server
app.use(express.urlencoded({ extended: true }));
app.use("/admin/categories", adminCategories);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});

app.get("/course/:id", (req, res) => {
  res.render("courseDetail", { layout: "main" });
});

app.get("/search", (req, res) => {
  res.render("search", { layout: "main" });
});

