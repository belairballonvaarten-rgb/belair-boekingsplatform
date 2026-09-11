const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ontbreekt — kopieer .env.example naar .env en vul aan.');
}

// Render.com externe Postgres-URL's vereisen meestal SSL.
const useSsl = process.env.DATABASE_URL.includes('render.com') || process.env.PGSSL === 'true';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error('Onverwachte fout op inactieve database-connectie:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool,
};
