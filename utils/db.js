<<<<<<< HEAD
import knex from 'knex';
const db = knex({
        client: 'pg',
        connection: {
            host: 'aws-1-ap-southeast-1.pooler.supabase.com',
            port: 5432,
            user: 'postgres.jpwictcnidovsyjbvuzq',
            password: 'onlineacademy',
            database: 'postgres'
        },
        pool: { min: 0, max: 15 }
    });
=======
import "dotenv/config";
import knex from "knex";

const db = knex({
  client: "pg",
  connection: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  },
  pool: { min: 0, max: 15 },
});

>>>>>>> origin/feat/admin-categories
export default db;
