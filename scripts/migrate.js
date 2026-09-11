/**
 * Eenvoudige migratie-runner: voert .sql-bestanden uit src/db/migrations
 * uit in bestandsnaam-volgorde, en onthoudt wat al gedraaid is in de
 * tabel `schema_migraties`. Geen extra afhankelijkheden nodig.
 *
 * Gebruik: npm run migrate
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'src', 'db', 'migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL ontbreekt. Kopieer .env.example naar .env en vul aan.');
    process.exit(1);
  }

  const useSsl = process.env.DATABASE_URL.includes('render.com') || process.env.PGSSL === 'true';
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migraties (
        naam UUID DEFAULT NULL, -- niet gebruikt, placeholder
        bestand TEXT PRIMARY KEY,
        uitgevoerd_op TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const { rows: reedsUitgevoerd } = await client.query('SELECT bestand FROM schema_migraties');
    const uitgevoerdSet = new Set(reedsUitgevoerd.map((r) => r.bestand));

    const bestanden = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let aantalUitgevoerd = 0;
    for (const bestand of bestanden) {
      if (uitgevoerdSet.has(bestand)) {
        console.log(`- overslaan (al uitgevoerd): ${bestand}`);
        continue;
      }
      console.log(`- uitvoeren: ${bestand}`);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, bestand), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migraties (bestand) VALUES ($1)', [bestand]);
        await client.query('COMMIT');
        aantalUitgevoerd += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migratie ${bestand} is mislukt: ${err.message}`);
      }
    }

    console.log(`Klaar. ${aantalUitgevoerd} nieuwe migratie(s) uitgevoerd.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
