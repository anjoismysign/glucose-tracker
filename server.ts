import "dotenv/config";
import express from "express";
import cors from "cors";
import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import axios from "axios";
import fs from "fs";
import Database from "better-sqlite3";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import { createServer } from "http";

const JWT_SECRET = process.env.JWT_SECRET || "caravana-rosa-secret-2026";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "kadjo5-davjar-Borkyd";

function authMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    res.status(401).json({ error: "Not authorized" });
    return;
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
      methods: ['GET', 'POST'],
    },
  });

  app.use(express.json());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGIN || 'http://localhost:3000',
    credentials: true,
  }));
  const PORT = 3000;

  const SYSTEM_PROMPT = fs.readFileSync("SYSTEM_PROMPT.txt", "utf-8");

  const WHITELIST = fs.readFileSync("WHITELIST.txt", "utf-8").split("\n").map(Number).filter(Boolean);

  const db = new Database("history.db");
  db.exec(`
  CREATE TABLE IF NOT EXISTS audios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_file_id TEXT UNIQUE,
    audio_data BLOB NOT NULL,
    mime_type TEXT DEFAULT 'audio/ogg'
  );
  CREATE TABLE IF NOT EXISTS glycemias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    glucose_level INTEGER NOT NULL,
    meal_type TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    note TEXT
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    role TEXT,
    content TEXT,
    is_transaction_end INTEGER DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

  const saveMessage = (
    chatId: number,
    role: "user" | "assistant",
    content: Anthropic.MessageParam['content'],
    isTransactionEnd: boolean = false
  ) => {
    db.prepare(
      "INSERT INTO messages (chat_id, role, content, is_transaction_end) VALUES (?, ?, ?, ?)"
    ).run(chatId, role, JSON.stringify(content), isTransactionEnd ? 1 : 0);
  };

  const getHistory = (chatId: number): Anthropic.MessageParam[] => {
    const rows = db.prepare(
      "SELECT role, content, is_transaction_end FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 60"
    ).all(chatId) as { role: "user" | "assistant"; content: string; is_transaction_end: number }[];

    const history: Anthropic.MessageParam[] = [];

    const endIdx = rows.findIndex(r => r.is_transaction_end === 1);
    const rowsToUse = endIdx !== -1 ? rows.slice(0, endIdx + 1) : rows;
    for (const row of rowsToUse.reverse()) {
      const content = JSON.parse(row.content);

      // Merge consecutive same-role messages
      const last = history[history.length - 1];
      if (last && last.role === row.role) {
        if (typeof last.content === "string" && typeof content === "string") {
          last.content = last.content + "\n" + content;
        } else {
          const lastBlocks = Array.isArray(last.content) ? last.content : [{ type: "text", text: last.content }];
          const curBlocks = Array.isArray(content) ? content : [{ type: "text", text: content }];
          last.content = [...lastBlocks, ...curBlocks] as any;
        }
        continue;
      }

      // Strip tool_use blocks from assistant messages (keep only text)
      if (row.role === "assistant" && Array.isArray(content)) {
        const textBlocks = content.filter((b: any) => b.type === "text");
        if (textBlocks.length > 0) {
          history.push({ role: row.role, content: textBlocks.map((b: any) => b.text).join("\n") });
        }
        continue;
      }

      // Skip tool_result blocks from user messages
      if (row.role === "user" && Array.isArray(content)) {
        const hasOnlyToolResults = content.every((b: any) => b.type === "tool_result");
        if (hasOnlyToolResults) {
          continue;
        }
      }

      history.push({ role: row.role, content });
    }

    // Ensure history doesn't start with assistant message
    while (history.length > 0 && history[0].role === "assistant") {
      history.shift();
    }

    return history;
  };

  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    baseURL: process.env.ANTHROPIC_BASE_URL,
  });
  const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20240620";

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    console.warn("TELEGRAM_BOT_TOKEN is missing.");
  } else {
    const bot = new Telegraf(botToken);

    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (userId && WHITELIST.includes(userId)) {
        return next();
      }
      console.log(`Access denied for user ID: ${userId}`);
      await ctx.reply(`Access denied.\n\nYour user ID is: ${userId}`);
    });

    const tools: Anthropic.Tool[] = [
      {
        name: "register_glycemia",
        description: "Register a glucose level. The meal type is optional; if not provided, it will be calculated automatically according to the current time.",
        input_schema: {
          type: "object",
          properties: {
            glucose_level: { type: "integer", description: "Glucose level in mg/dL" },
            meal_type: {
              type: "string",
              enum: ["BREAKFAST", "LUNCH", "DINNER", "OTHER"],
              description: "Meal type associated. Optional."
            },
            note: { type: "string", description: "Optional note about this reading" },
          },
          required: ["glucose_level"],
        },
      },
    ];

    function getAutomaticMealType(): string {
      const hour = new Date().getHours();

      if (hour >= 4 && hour < 9) return "BREAKFAST";
      if (hour >= 11 && hour < 14) return "LUNCH";
      if (hour >= 17 && hour < 21) return "DINNER";

      return "OTHER";
    }

    const handleToolCall = async (chatId: number, name: string, args: any) => {
      try {
        if (name === "register_glycemia") {
          const glucose_level = args.glucose_level;
          const note = args.note || null;
          const timestamp = Math.floor(Date.now() / 1000);

          const meal_type = args.meal_type || getAutomaticMealType();

          db.prepare("INSERT INTO glycemias (glucose_level, meal_type, timestamp, note) VALUES (?, ?, ?, ?)")
            .run(glucose_level, meal_type, timestamp, note);

          io.emit("glycemia_updated");

          return `✅ Glucose registered: ${glucose_level} mg/dL. Automatically detected as: ${meal_type}.`;
        }
      } catch (err: any) {
        return `Error executing tool: ${err.message}`;
      }
      return "Error: Tool not found.";
    };

    const processWithLLM = async (chatId: number, userText: string, audioId?: number) => {
      console.log(`\n[${new Date().toLocaleTimeString()}] 📥 INPUT: "${userText}"`);

      const historyForTurn = getHistory(chatId);
      saveMessage(chatId, "user", userText);
      let currentMessages = [...historyForTurn, { role: "user" as const, content: userText }];
      const nowUnix = Math.floor(Date.now() / 1000);

      const systemPrompt = SYSTEM_PROMPT
        .replace("%timestamp%", nowUnix.toString())
        .replace("%audioId%", audioId ? `Audio ID: ${audioId}` : "No audio");

      try {
        console.log(`[LLM Request] Sending ${currentMessages.length} messages. System length: ${systemPrompt.length}`);
        let msg = await anthropic.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: 1024,
          system: systemPrompt,
          messages: currentMessages,
          tools,
        });

        while (msg.stop_reason === "tool_use") {
          saveMessage(chatId, "assistant", msg.content);
          currentMessages.push({ role: "assistant", content: msg.content as any });

          const toolBlocks = msg.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];
          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const block of toolBlocks) {
            const result = await handleToolCall(chatId, block.name, block.input);
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: result,
            });
          }

          saveMessage(chatId, "user", toolResults);

          currentMessages.push({ role: "user", content: toolResults });

          msg = await anthropic.messages.create({
            model: ANTHROPIC_MODEL,
            max_tokens: 1024,
            system: systemPrompt,
            messages: currentMessages,
            tools,
          });
        }

        const assistantTextContent = msg.content.filter(b => b.type === "text").map(b => (b as any).text).join(" ");
        if (assistantTextContent) {
          saveMessage(chatId, "assistant", assistantTextContent, true);
        }

        const finalResponse = msg.content
          .filter(b => b.type === "text")
          .map(b => (b as any).text)
          .join(" ").trim() || "Operation completed.";

        console.log(`   📤 RESPONSE: "${finalResponse}"\n`);
        return finalResponse;

      } catch (error: any) {
        console.error("LLM Error:", error.message);
        return "Error processing request.";
      }
    };

    bot.on(message("text"), async (ctx) => {
      const reply = await processWithLLM(ctx.chat.id, ctx.message.text);
      ctx.reply(reply);
    });

    bot.on(message("voice"), async (ctx) => {
      try {
        const fileId = ctx.message.voice.file_id;
        const link = await ctx.telegram.getFileLink(fileId);

        const response = await axios({
          method: "GET",
          url: link.href,
          responseType: "arraybuffer"
        });
        const audioBuffer = Buffer.from(response.data);

        const insertAudio = db.prepare(`
      INSERT OR IGNORE INTO audios (telegram_file_id, audio_data, mime_type) 
      VALUES (?, ?, ?)
    `).run(fileId, audioBuffer, ctx.message.voice.mime_type || 'audio/ogg');

        let audioId: number;
        if (insertAudio.changes > 0) {
          audioId = insertAudio.lastInsertRowid as number;
        } else {
          const existing = db.prepare("SELECT id FROM audios WHERE telegram_file_id = ?").get(fileId) as any;
          audioId = existing.id;
        }

        const tempFile = `temp_${fileId}.ogg`;
        fs.writeFileSync(tempFile, audioBuffer);

        const trans = await groq.audio.transcriptions.create({
          file: fs.createReadStream(tempFile),
          model: "whisper-large-v3-turbo",
        });
        fs.unlinkSync(tempFile);

        if (trans.text) {
          ctx.reply(`🎤: "${trans.text}"`);
          const reply = await processWithLLM(ctx.chat.id, trans.text, audioId);
          ctx.reply(reply);
        }
      } catch (err) {
        console.error(err);
        ctx.reply("Error processing audio.");
      }
    });

    bot.launch();
  }

  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token });
    } else {
      res.status(401).json({ error: "Incorrect credentials" });
    }
  });

  app.get("/api/health", authMiddleware, (req, res) => {
    res.json({ status: "ok", botStarted: !!botToken });
  });

  app.get("/api/glycemias", authMiddleware, (req, res) => {
    const days = parseInt(req.query.days as string) || 7;
    const cutoff = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);

    const rows = db.prepare(`
      SELECT * FROM glycemias
      WHERE timestamp >= ?
      ORDER BY timestamp ASC
    `).all(cutoff) as any[];

    res.json(rows);
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();