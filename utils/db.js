import knex from "knex";

const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL } = process.env;

if (!DB_HOST || !DB_USER || !DB_PASSWORD || !DB_NAME) {
  throw new Error(
    "Database credentials are not fully configured. Please set DB_HOST, DB_USER, DB_PASSWORD, DB_NAME (and optionally DB_PORT/DB_SSL)."
  );
}

let sslConfig = undefined;
if (DB_SSL) {
  const enabled = DB_SSL === "true" || DB_SSL === "1";
  if (enabled) {
    sslConfig = { rejectUnauthorized: false };
  }
}

const db = knex({
  client: "pg",
  connection: {
    host: DB_HOST,
    port: DB_PORT ? Number(DB_PORT) : 5432,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: sslConfig,
  },
  pool: { min: 0, max: 20 },
});

export default db;
