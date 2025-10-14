import knex from "knex";
import "dotenv/config";

const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    pool: { min: 0, max: 15 },
  },
});

export default db;
