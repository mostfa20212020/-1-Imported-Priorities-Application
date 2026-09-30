import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const sqlHost = process.env.MYSQL_HOST || process.env.SQL_HOST || "127.0.0.1";
const sqlDbName = process.env.MYSQL_DATABASE || process.env.SQL_DB_NAME || "idaratalawliyat";
const user = process.env.MYSQL_USER || process.env.SQL_ADMIN_USER || process.env.SQL_USER || "root";
const password = process.env.MYSQL_PASSWORD || process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || "";
const port = process.env.MYSQL_PORT
  ? Number(process.env.MYSQL_PORT)
  : process.env.SQL_PORT && !isNaN(Number(process.env.SQL_PORT))
  ? Number(process.env.SQL_PORT)
  : 3306;

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    host: sqlHost,
    port: port,
    user: user,
    password: password,
    database: sqlDbName,
  },
  verbose: true,
});
