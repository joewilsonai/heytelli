import { Router, type Request, type Response } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { GenerateBumbleReplyBody } from "@workspace/api-zod";

const router = Router();

router.post("/bumble-reply", async (req: Request, res: Response) => {
  const parseResult = GenerateBumbleReplyBody.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request: image field is required" });
    return;
  }

  const { image } = parseResult.data;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1024,
      messages: [
        {
          role: "system",
          content: `You are a witty, charming dating coach helping someone craft great replies on Bumble.

Given a screenshot of a Bumble conversation, analyze the chat history and generate exactly 3 distinct reply options.

Each reply should:
- Be natural and conversational
- Match the tone already established in the conversation
- Be engaging and show genuine interest
- Vary in style: one playful/flirty, one genuine/warm, one clever/witty
- Be concise — typically 1-3 sentences

Respond ONLY with a JSON array of exactly 3 strings, no extra text.
Example: ["Reply 1", "Reply 2", "Reply 3"]`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${image}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Here is the Bumble conversation screenshot. Please generate 3 great reply options.",
            },
          ],
        },
      ],
    });

    const content = completion.choices[0]?.message?.content ?? "[]";

    let replies: string[];
    try {
      replies = JSON.parse(content);
      if (!Array.isArray(replies) || replies.length === 0) {
        throw new Error("Invalid response format");
      }
    } catch {
      // Fallback: try to extract strings from the response
      const matches = content.match(/"([^"]+)"/g);
      replies = matches
        ? matches.map((m) => m.replace(/"/g, "")).slice(0, 3)
        : ["Couldn't generate replies — please try again with a clearer screenshot."];
    }

    res.json({ replies: replies.slice(0, 3) });
  } catch (err) {
    console.error("Error generating bumble reply:", err);
    res.status(500).json({ error: "Failed to generate replies. Please try again." });
  }
});

export default router;
