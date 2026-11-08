// Keeps conversation context small: older messages are folded into a short rolling summary.
import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { costMicros } from "./models";

export async function summarize(previousSummary: string, transcript: string, client = new Anthropic()) {
  const response = await client.messages.create({
    model: env.aiModelRoutine,
    max_tokens: 1024,
    output_config: { effort: "low" },
    system:
      "You maintain a short memory of a sales chat between a Nigerian online shop's assistant and a customer. " +
      "Write at most 120 words of plain notes: who the customer is (name, phone, area/address if given), what they asked about or wanted, " +
      "products/sizes discussed, order numbers and their status, payment method, open questions, and anything the shop promised. " +
      "Do not include prices unless they are part of a placed order.",
    messages: [{
      role: "user",
      content: `Previous notes:\n${previousSummary || "(none)"}\n\nNew messages:\n${transcript}\n\nWrite the updated notes.`,
    }],
  });
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  return { summary: text, model: response.model, costMicros: costMicros(response.model, response.usage), usage: response.usage };
}
