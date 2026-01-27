import type { Express } from "express";
import { createServer, type Server } from "node:http";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Receipt scanning endpoint
  app.post("/api/scan-receipt", async (req, res) => {
    try {
      const { image } = req.body;

      if (!image) {
        return res.status(400).json({ error: "Image is required" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a receipt scanning assistant. Analyze the receipt image and extract:
1. Total amount (as a number, e.g., 25.99)
2. A brief description of the purchase (e.g., "Lunch at Cafe Milano", "Grocery shopping at Whole Foods")
3. Category (one of: food, transport, utilities, entertainment, shopping, health, travel, home, other)

Respond in JSON format:
{
  "amount": number,
  "description": "string",
  "category": "string"
}

If you cannot read the receipt clearly, still try to provide your best guess. If completely unreadable, respond with:
{
  "error": "Could not read receipt"
}`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${image}`,
                },
              },
              {
                type: "text",
                text: "Please analyze this receipt and extract the total amount, description, and category.",
              },
            ],
          },
        ],
        max_completion_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        return res.status(500).json({ error: "Failed to analyze receipt" });
      }

      // Parse the JSON response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.error) {
            return res.status(400).json({ error: parsed.error });
          }
          return res.json({
            amount: parsed.amount,
            description: parsed.description,
            category: parsed.category,
          });
        }
        return res.status(500).json({ error: "Failed to parse receipt data" });
      } catch (parseError) {
        return res.status(500).json({ error: "Failed to parse receipt data" });
      }
    } catch (error: any) {
      console.error("Receipt scan error:", error);
      return res.status(500).json({ 
        error: error.message || "Failed to scan receipt" 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
