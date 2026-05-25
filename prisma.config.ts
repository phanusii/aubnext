import { defineConfig } from "prisma/config";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_URL_NON_POOLING;

if (!url) {
  throw new Error("Missing database URL for Prisma migrations.");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url,
  },
});
