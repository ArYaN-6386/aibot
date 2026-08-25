import "dotenv/config";
import { prisma } from "./db";
import { tavily } from "@tavily/core";
import { Ollama } from "ollama";
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from "./prompt";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const ollama = new Ollama({
  host: "https://ollama.com",
  fetch: (input, init) => {
    return fetch(input, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${process.env.OLLAMA_API_KEY}`
      }
    });
  }
});

async function main() {
  try {
    const user = await prisma.user.findFirst();
    if (!user) throw new Error("No user found");
    const query = "What is the capital of France?";
    
    console.log("Creating conversation...");
    const conversation = await prisma.conversation.create({
      data: {
        title: "Test",
        slug: "test-" + Date.now(),
        userID: user.id
      }
    });

    console.log("Saving user message...");
    await prisma.message.create({
      data: {
        content: query,
        role: "user",
        conversationID: conversation.id
      }
    });

    console.log("Searching Tavily...");
    const webSearchResponse = await tavilyClient.search(query, { searchDepth: "advanced" });
    const prompt = PROMPT_TEMPLATE.replace("{{WebSearchResults}}", JSON.stringify(webSearchResponse.results)).replace("{{USER_QUERY}}", query);

    console.log("Calling Ollama...");
    const response = await ollama.chat({
      model: "gemma4:31b",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }],
      stream: true,
    });

    console.log("Streaming response...");
    let content = "";
    for await (const chunk of response) {
      content += chunk.message.content;
    }
    console.log("Response finished:", content.substring(0, 50) + "...");
    
    console.log("Saving assistant message...");
    await prisma.message.create({
      data: {
        content: content,
        role: "assistant",
        conversationID: conversation.id
      }
    });
    
    console.log("ALL SUCCESS");
  } catch (err) {
    console.error("Test failed:", err);
  }
}
main();
