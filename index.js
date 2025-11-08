import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "world",
  password: "radhikhushi",
  port: 5432,
});
await db.connect();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set("view engine", "ejs");

let currentUserId = 1;
let users = [];

// Get list of country codes visited by the current user
async function checkVisited() {
  const sql = `
    SELECT DISTINCT vc.country_code
    FROM visited_countries vc
    WHERE vc.user_id = $1
    ORDER BY vc.country_code;
  `;
  const { rows } = await db.query(sql, [currentUserId]);
  return rows.map(r => r.country_code);
}

// Load users and return the current one
async function getCurrentUser() {
  const all = await db.query("SELECT id, name, color FROM users ORDER BY id");
  users = all.rows;

  const { rows } = await db.query(
    "SELECT id, name, color FROM users WHERE id = $1",
    [currentUserId]
  );
  return rows[0] ?? users[0]; // fallback if current id missing
}

app.get("/", async (req, res) => {
  try {
    const [countries, currentUser] = await Promise.all([
      checkVisited(),
      getCurrentUser(),
    ]);
    res.render("index.ejs", {
      countries,
      total: countries.length,
      users,
      color: currentUser?.color ?? "teal",
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

app.post("/add", async (req, res) => {
  const inputRaw = req.body["country"] ?? "";
  const input = inputRaw.trim();

  if (!input) return res.redirect("/");

  try {
    // Try match by name prefix, else try exact country_code
    const findSql = `
      SELECT country_code
      FROM countries
      WHERE country_name ILIKE $1 || '%'
         OR country_code ILIKE $2
      ORDER BY country_name
      LIMIT 1;
    `;
    const { rows } = await db.query(findSql, [input, input]);

    if (rows.length === 0) {
      console.log("No matching country for:", input);
      return res.redirect("/");
    }

    const countryCode = rows[0].country_code;

    // Insert visit; ignore if already present (requires PK below)
    const insertSql = `
      INSERT INTO visited_countries (user_id, country_code)
      VALUES ($1, $2)
      ON CONFLICT (user_id, country_code) DO NOTHING;
    `;
    await db.query(insertSql, [currentUserId, countryCode]);

    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.post("/user", async (req, res) => {
  if (req.body.add === "new") {
    return res.render("new.ejs");
  }
  currentUserId = Number(req.body.user);
  res.redirect("/");
});

app.post("/new", async (req, res) => {
  const name = (req.body.name ?? "").trim();
  const color = (req.body.color ?? "").trim() || "teal";

  if (!name) return res.redirect("/");

  try {
    const result = await db.query(
      "INSERT INTO users (name, color) VALUES($1, $2) RETURNING id;",
      [name, color]
    );
    currentUserId = result.rows[0].id;
    res.redirect("/");
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
