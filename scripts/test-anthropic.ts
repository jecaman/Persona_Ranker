import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function test() {
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001",
    max_tokens: 64,
    messages: [{ role: "user", content: "Responde solo: API funcionando." }],
  });

  console.log(response.content[0]);
  console.log(`Tokens usados — entrada: ${response.usage.input_tokens}, salida: ${response.usage.output_tokens}`);
}

test();
