import "dotenv/config";
import { prisma } from "./db";

async function main() {
  try {
    const users = await prisma.user.findMany();
    console.log("Success: found", users.length, "users");
  } catch (err) {
    console.error("Error from Prisma:", err);
  }
}
main();
