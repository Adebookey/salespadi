import type { Faq } from "./types";

/** FAQs are written as blocks separated by a blank line: first line is the question, the rest the answer. */
export function parseFaqs(text: string): Faq[] {
  return text.split(/\n\s*\n/).map((block) => {
    const [q, ...a] = block.trim().split("\n");
    return { q: (q ?? "").replace(/^q:\s*/i, "").trim(), a: a.join(" ").replace(/^a:\s*/i, "").trim() };
  }).filter((x) => x.q && x.a);
}

export const faqsToText = (faqs: Faq[]) => faqs.map((f) => `${f.q}\n${f.a}`).join("\n\n");
