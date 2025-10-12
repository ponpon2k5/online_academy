import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { engine } from "express-handlebars";
import adminCategories from "./routes/admin.categories.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

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

app.use(express.urlencoded({ extended: true }));
app.use("/admin/categories", adminCategories);

app.listen(3000, () => {
  console.log("Server is running on port 3000");
});
