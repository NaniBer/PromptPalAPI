const express = require("express");
const bodyParser = require("body-parser");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const OpenAI = require("openai");
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: OPENROUTER_API_KEY,
});

const cors = require("cors");

const app = express();
app.use(cors());

app.use(express.json());

app.use(bodyParser.json());

app.get("/", (req, res) => {
  res.send("Hello, PromptPal Backend is running!");
});

app.post("/compare", async (req, res) => {
  const systemPrompt = `
You are a helpful, intelligent, and articulate AI assistant.
Your goal is to respond clearly, thoughtfully, and truthfully to the user's prompt.
Be consistent in tone and structure so your answer can be fairly compared with other models.
Avoid repeating the question. Focus on giving the best possible answer directly and accurately in under 1000 characters.
`;
  try {
    const { prompt, models } = req.body;

    if (!prompt || !Array.isArray(models) || models.length === 0) {
      return res.status(400).json({
        error: "Request must include 'prompt' and a non-empty 'models' array.",
      });
    }

    const totalStart = process.hrtime.bigint();

    const tasks = models.map(async (model) => {
      const start = process.hrtime.bigint();
      try {
        if (model.startsWith("openai/") || model.startsWith("deepseek/")) {
          const completion = await openai.chat.completions.create({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: prompt },
            ],
          });
          const choice = completion.choices?.[0] ?? {};
          const text =
            choice.message?.content ??
            choice.text ??
            (typeof choice === "string" ? choice : "");
          const tokenCount = completion.usage?.total_tokens ?? null;
          const durationSecRaw = Number(process.hrtime.bigint() - start) / 1e9;
          const durationSec = parseFloat(durationSecRaw.toFixed(2));
          return { model, text, tokenCount, durationSec };
        } else {
          const response = await ai.models.generateContent({
            model,
            contents: prompt,
            system_instruction: systemPrompt,
          });
          const text = response.text ?? response.output?.[0]?.content ?? "";
          const tokenCount = response.usageMetadata?.totalTokenCount ?? null;
          const durationSecRaw = Number(process.hrtime.bigint() - start) / 1e9;
          const durationSec = parseFloat(durationSecRaw.toFixed(2));
          return { model, text, tokenCount, durationSec };
        }
      } catch (err) {
        const durationSecRaw = Number(process.hrtime.bigint() - start) / 1e9;
        const durationSec = parseFloat(durationSecRaw.toFixed(2));
        return { model, error: err.message || String(err), durationSec };
      }
    });

    const results = await Promise.all(tasks);

    const totalElapsedRaw = Number(process.hrtime.bigint() - totalStart) / 1e9;
    const totalElapsedSec = parseFloat(totalElapsedRaw.toFixed(2));

    res.json({ message: "Comparison complete.", totalElapsedSec, results });
  } catch (err) {
    console.error("Compare route error:", err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);

  // startPolling(); // polling starts once server is up
});
