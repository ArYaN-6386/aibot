import "dotenv/config";
import { tavily } from "@tavily/core";
import express from "express";
import cors from "cors";
import { Ollama } from "ollama";
import { SYSTEM_PROMPT, PROMPT_TEMPLATE } from "./prompt";

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
import { middleware } from "./middleware";
import { prisma } from "./db";

const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
const app = express();

app.use(cors());
app.use(express.json());

app.get("/conversations", middleware, async (req, res) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userID: req.userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" }
        }
      }
    });
    res.json(conversations);
  } catch (err) {
    console.error("Failed to fetch conversations:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/conversation/:conversationID", middleware, async (_req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

app.post("/aibot_ask", middleware, async (_req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

app.post("/aibot_ask/:follow_up", middleware, async (_req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

app.post("/conversation", middleware, async (req, res) => {
  const query = req.body?.query;
  const conversationID = req.body?.conversationID;

  if (!query) {
    res.status(400).json({ message: "Query is required" });
    return;
  }

  try {
    let conversation = null;
    if (conversationID) {
      conversation = await prisma.conversation.findUnique({ where: { id: conversationID } });
    }
    
    if (!conversation) {
      const title = query.length > 50 ? query.substring(0, 47) + "..." : query;
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      
      conversation = await prisma.conversation.create({
        data: {
          title: title || "New Conversation",
          slug: slug || "new-conversation",
          userID: req.userId as string,
        }
      });
    }

    // Save the user's message
    await prisma.message.create({
      data: {
        content: query,
        role: "user",
        conversationID: conversation.id
      }
    });

    const webSearchResponse = await tavilyClient.search(query, {
      searchDepth: "advanced",
    });

    const webSearchResults = webSearchResponse.results;

    const prompt = PROMPT_TEMPLATE.replace(
      "{{WebSearchResults}}",
      JSON.stringify(webSearchResponse.results)
    ).replace("{{USER_QUERY}}", query);

    const pastMessages = await prisma.message.findMany({
      where: { conversationID: conversation.id },
      orderBy: { createdAt: "asc" }
    });

    const ollamaMessages = pastMessages.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.role === "user" && msg.content === query ? prompt : msg.content
    }));

    const messagesToSend = [
      { role: "system", content: SYSTEM_PROMPT },
      ...(ollamaMessages.length > 0 ? ollamaMessages : [{ role: "user", content: prompt }])
    ];

    const response = await ollama.chat({
      model: "gemma4:31b",
      messages: messagesToSend,
      stream: true,
    });

    res.header("Cache-Control", "no-cache");
    res.header("Content-Type", "text/event-stream");
    
    // First, send the conversation ID so the client knows it
    res.write(JSON.stringify({ type: "conversation_id", conversationID: conversation.id }) + "\n\n");

    let assistantContent = "";
    for await (const textPart of response) {
      assistantContent += textPart.message.content;
      res.write(JSON.stringify({ type: "text", content: textPart.message.content }) + "\n\n");
    }

    const sourcesHtml = "\n\n**Sources:**\n" + webSearchResults.map((r) => `- [${r.title}](${r.url})`).join("\n");
    res.write(JSON.stringify({ type: "text", content: sourcesHtml }) + "\n\n");
    assistantContent += sourcesHtml;

    // Save the assistant's message
    await prisma.message.create({
      data: {
        content: assistantContent,
        role: "assistant",
        conversationID: conversation.id
      }
    });

    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ 
        message: err instanceof Error ? err.message : "Internal Server Error",
        error: String(err)
      });
    } else {
      res.end();
    }
  }
});

app.post("/followup", async (_req, res) => {
  res.status(501).json({ message: "Not implemented" });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
