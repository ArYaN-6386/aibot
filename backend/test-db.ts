import { prisma } from "./db";

async function main() {
  const users = await prisma.user.findMany();
  console.log("Users:", users);
  
  const conversations = await prisma.conversation.findMany({
    include: { messages: true }
  });
  console.log("Conversations:", conversations);
}

main().catch(console.error).finally(() => prisma.$disconnect());
