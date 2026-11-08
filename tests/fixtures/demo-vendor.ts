// The demo vendor from supabase/seed.sql as an in-memory store, for tests and the offline eval.
import { MemoryStore, type MemoryCatalogItem } from "@/lib/ai/memory-store";
import type { VendorProfile } from "@/lib/ai/store";
import type { DeliveryZone } from "@/lib/types";

export const demoProfile: VendorProfile = {
  name: "Kicks by Tolu",
  city: "Lagos",
  tone: 'Warm, upbeat and brief, like a friendly Lagos shop assistant. Call customers "dear" sometimes. Use at most one emoji per message.',
  pidgin_enabled: true,
  sample_replies: [
    "Yes dear, we have it in size 42 and 43. It's ₦28,000. Should I reserve one for you?",
    "Delivery to Lekki is ₦3,500 and takes 1-2 days.",
  ],
  greeting: "Hello dear, welcome to Kicks by Tolu! 👟 What are you shopping for today?",
  policies: "Exchange within 3 days if the size does not fit, shoe must be unworn with the box.\nNo refunds on sale items.\nWe deliver Monday to Saturday.\nPayment before delivery for all orders outside Lagos.",
  faqs: [
    { q: "Are your shoes original?", a: "Yes, all our shoes are original. We import directly and you can check them on delivery." },
    { q: "Do you have a physical store?", a: "We are online only for now, but you can pick up from Yaba by appointment." },
    { q: "How do I know my size?", a: "Tell us your usual size in any brand and we will guide you. Our sizes are EU sizes." },
  ],
  handoff_rules: "Hand off for bulk orders above 10 pairs, custom colours, complaints about a delivered order, and any refund request.",
  business_hours: { open: "08:00", close: "20:00", days: [1, 2, 3, 4, 5, 6] },
  pay_on_delivery: false,
  bank: { name: "GTBank", account_name: "Kicks by Tolu Ventures", account_number: "0123456789" },
  paystack_enabled: true,
};

export const demoZones: DeliveryZone[] = [
  { id: "zone-mainland", vendor_id: "v", name: "Lagos Mainland", areas: ["Yaba", "Surulere", "Ikeja", "Maryland", "Gbagada", "Ogba", "Ojota", "Ketu", "Oshodi", "Mushin"], fee_kobo: 250000, eta: "Same day or next day" },
  { id: "zone-island", vendor_id: "v", name: "Lagos Island", areas: ["Lekki", "Ajah", "VI", "Victoria Island", "Ikoyi", "Obalende", "Oniru", "Chevron"], fee_kobo: 350000, eta: "1-2 days" },
  { id: "zone-outside", vendor_id: "v", name: "Outside Lagos", areas: ["Abuja", "Ibadan", "Port Harcourt", "Enugu", "Benin", "Abeokuta"], fee_kobo: 600000, eta: "2-4 days by courier" },
];

const P: [string, string, string, string, string[], number, string[], number][] = [
  ["p-sneakers", "Classic White Sneakers", "Clean all-white leather low-top sneakers. Goes with everything.", "Sneakers", ["white", "sneakers", "leather", "unisex"], 2800000, ["40", "41", "42", "43", "44"], 4],
  ["p-chelsea", "Black Chelsea Boots", "Suede Chelsea boots with elastic side panels. Smart-casual.", "Boots", ["black", "boots", "chelsea", "suede", "men"], 3500000, ["41", "42", "43", "44", "45"], 3],
  ["p-loafers", "Brown Leather Loafers", "Genuine leather penny loafers, brown. Perfect for office and owambe.", "Loafers", ["brown", "loafers", "leather", "men", "office"], 3200000, ["40", "41", "42", "43", "44", "45"], 3],
  ["p-redheels", "Red Block Heels", "Red patent block heels, 3-inch heel. Comfortable for all-day events.", "Heels", ["red", "heels", "women", "party"], 1800000, ["37", "38", "39", "40", "41"], 2],
  ["p-pumps", "Nude Pointed Pumps", "Nude stiletto pumps, 4-inch heel.", "Heels", ["nude", "pumps", "heels", "women", "office"], 2200000, ["37", "38", "39", "40"], 2],
  ["p-palm", "Palm Slippers (Men)", "Handmade leather palm slippers, black and brown.", "Slippers", ["palm", "slippers", "leather", "men", "native"], 1200000, ["41", "42", "43", "44", "45"], 6],
  ["p-trainers", "Running Trainers", "Lightweight mesh running trainers, grey/neon.", "Sneakers", ["running", "trainers", "sports", "gym", "unisex"], 2500000, ["39", "40", "41", "42", "43", "44"], 3],
  ["p-kids", "Kids Velcro Sneakers", "Easy velcro sneakers for kids, blue.", "Kids", ["kids", "children", "sneakers", "velcro", "school"], 900000, ["28", "30", "32", "34"], 5],
  ["p-sandals", "Ladies Flat Sandals", "Gold strappy flat sandals.", "Sandals", ["sandals", "flat", "gold", "women"], 1000000, ["37", "38", "39", "40", "41"], 4],
  ["p-oxford", "Men's Oxford Shoes", "Black leather lace-up Oxfords. Wedding and office ready.", "Formal", ["oxford", "formal", "black", "leather", "men", "wedding"], 4000000, ["41", "42", "43", "44", "45"], 0],
];

export function demoCatalog(): MemoryCatalogItem[] {
  return P.map(([id, name, description, category, tags, price, sizes, stock]) => ({
    id, name, description, category, tags,
    images: [`https://placehold.co/800x800/png?text=${encodeURIComponent(name)}`],
    variants: sizes.map((s) => ({ id: `${id}-${s}`, label: `Size ${s}`, size: s, colour: null, price_kobo: price, stock })),
  }));
}

export const demoStore = (overrides: Partial<VendorProfile> = {}) =>
  new MemoryStore({ ...demoProfile, ...overrides }, demoCatalog(), demoZones);
