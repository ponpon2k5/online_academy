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
export default db;