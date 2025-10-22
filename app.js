import express from "express";
import { engine } from "express-handlebars";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import session from 'express-session';
import hbs_sections from 'express-handlebars-sections';
import passport from 'passport';
import GoogleStrategy from 'passport-google-oauth20';
import GitHubStrategy from 'passport-github2';
// import FacebookStrategy from 'passport-facebook';
import userModel from './models/user.model.js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.urlencoded({ extended: true })); //Giúp Express đọc dữ liệu trong form POST
app.use(express.json());
app.use("/images", express.static(path.join(__dirname, "statics", "img")));

//session
app.set('trust proxy', 1) // trust first proxy
app.use(session({
    secret: 'duybodoi',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,          // dùng true nếu HTTPS
        httpOnly: false,        // cho phép JS đọc
        sameSite: 'lax'
    } // secure = true chỉ dùng khi https
}))

// app.use(async function (req, res, next) {
//     if (req.session.isAuthenticated) {
//         res.locals.isAuthenticated = true;
//         res.locals.authUser = req.session.authUser;
//     }
//     next();
// });

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
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/account/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await userModel.findByEmail(profile.emails[0].value);
        if (!user) {
            let total = await userModel.totalUser();
            const id = "p" + (Number(total) + 1);

            user = {
                id,
                username: profile.id,
                email: profile.emails?.[0]?.value || '',
                name: profile.displayName || 'Unknown',
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
// passport.use(new FacebookStrategy({
//     clientID: process.env.FACEBOOK_CLIENT_ID,
//     clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
//     callbackURL: '/account/auth/facebook/callback',
//     profileFields: ['id', 'emails', 'displayName']
// }, async (accessToken, refreshToken, profile, done) => {
//     try {
//         const email = profile.emails && profile.emails.length > 0
//             ? profile.emails[0].value
//             : `${profile.id}@facebook.com`;
//         let user = await userModel.findByEmail(email);
//         if (!user) {
//             let total = await userModel.totalUser();
//             const id = "p" + (Number(total) + 1);

//             user = {
//                 id,
//                 username: profile.id,
//                 email: profile.emails?.[0]?.value || '',
//                 name: profile.displayName || 'Unknown',
//                 password: '',
//                 permission: 0
//             };
//             await userModel.add(user);
//         }
//         done(null, user);
//     } catch (err) {
//         done(err, null);
//     }
// }));
// Cấu hình Github Strategy
passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/account/auth/github/callback',
    scope: ['user:email'] // Yêu cầu quyền truy cập email
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // GitHub có thể trả về email trong nhiều trường
        let email = null;
        if (profile.emails && profile.emails.length > 0) {
            // Tìm email chính (nếu có)
            const primaryEmail = profile.emails.find(e => e.primary);
            email = (primaryEmail || profile.emails[0]).value;
        }

        // Fallback nếu không có email (ví dụ: email để private)
        // Chúng ta sẽ dùng một email placeholder dựa trên username
        if (!email) {
            email = `${profile.username}@github.com`; 
        }

        let user = await userModel.findByEmail(email);
        if (!user) {
            let total = await userModel.totalUser();
            const id = "p" + (Number(total) + 1);

            user = {
                id,
                username: profile.id, // Dùng profile.id giống Google/Facebook
                email: email,
                name: profile.displayName || profile.username || 'Unknown', // Lấy tên hiển thị hoặc username
                password: '', // Không có mật khẩu cho OAuth
                permission: 0
            };
            await userModel.add(user);
        }
        done(null, user);
    } catch (err) {
        done(err, null);
    }
}));
//router


import accountRouter from "./routes/account.route.js";
app.use("/account", accountRouter);

//test homepage
app.get("/", (req, res) => {
    res.render("home", { layout: "main" });
});

//start server

app.listen(3000, () => {
    console.log("Server is running on port 3000");
});

app.use(function (req, res) {
    res.status(404).render('404');
});