import { PrismaClient } from "@prisma/client";

declare global {
  // Reuse the client during local hot reload so we do not create a new connection
  // on every file change in development.
  var prisma: PrismaClient | undefined;
}

export const db = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}
