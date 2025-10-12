import knex from 'knex';

const db = knex({
  client: 'pg',
  connection: {
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 6543,
    user: 'postgres.jpwictcnidovsyjbvuzq',
    password: 'onlineacademy',
    database: 'postgres',
  },
  pool: { min: 0, max: 15 }
});

// Kiểm tra kết nối
db.raw('SELECT 1')
  .then(() => console.log('Kết nối Supabase thành công'))
  .catch((err) => console.error('Lỗi kết nối Supabase:', err));

export default db;