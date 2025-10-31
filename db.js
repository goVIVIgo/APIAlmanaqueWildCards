import mysql from 'mysql2/promise';

// Cria um "pool" de conexões. É mais eficiente que criar uma nova conexão a cada query.
const pool = mysql.createPool({
  host: 'localhost',
  user: 'gamedev',
  password: 'senhagamedev',
  database: 'wildcards_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default pool;