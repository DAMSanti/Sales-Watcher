import type { Config } from "drizzle-kit";
import { cargarEnv } from "./src/cargar-env";

cargarEnv();

export default {
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
