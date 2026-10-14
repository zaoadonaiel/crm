/**
 * Local Postgres for development without Neon/Docker.
 * Runs PGlite (Postgres compiled to WASM) behind a real Postgres socket.
 *   npm run db:local   → postgresql://postgres:postgres@127.0.0.1:5433/postgres
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const db = await PGlite.create("./.pglite");
const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log("Local Postgres (PGlite) listening on postgresql://postgres:postgres@127.0.0.1:5433/postgres");
process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
