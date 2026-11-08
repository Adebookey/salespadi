import { describe, expect, it } from "vitest";
import { parseWhatsAppWebhook, templateSafe } from "@/lib/channels/whatsapp";
import { parseInstagramWebhook } from "@/lib/channels/instagram";

describe("WhatsApp webhook", () => {
  const body = {
    object: "whatsapp_business_account",
    entry: [{
      id: "WABA",
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: { display_phone_number: "2348000000000", phone_number_id: "PNID" },
          contacts: [{ profile: { name: "Amaka" }, wa_id: "2348031234567" }],
          messages: [
            { from: "2348031234567", id: "wamid.1", timestamp: "1762600000", type: "text", text: { body: "Hi, do you have size 42?" } },
            { from: "2348031234567", id: "wamid.2", timestamp: "1762600001", type: "image", image: { id: "MEDIA1", mime_type: "image/jpeg", caption: "this one" } },
            { from: "2348031234567", id: "wamid.3", timestamp: "1762600002", type: "audio", audio: { id: "MEDIA2", mime_type: "audio/ogg" } },
            { from: "2348031234567", id: "wamid.4", timestamp: "1762600003", type: "interactive", interactive: { button_reply: { title: "Yes" } } },
            { from: "2348031234567", id: "wamid.5", timestamp: "1762600004", type: "sticker", sticker: {} },
          ],
          statuses: [{ id: "wamid.out", status: "read" }],
        },
      }],
    }],
  };

  it("normalises messages of each type", () => {
    const { messages, statuses } = parseWhatsAppWebhook(body);
    expect(messages).toHaveLength(5);
    expect(messages[0]).toMatchObject({ channel: "whatsapp", channelExternalId: "PNID", customerExternalId: "2348031234567", customerName: "Amaka", type: "text", text: "Hi, do you have size 42?" });
    expect(messages[1]).toMatchObject({ type: "image", text: "this one", mediaRef: "MEDIA1" });
    expect(messages[2]).toMatchObject({ type: "audio", mediaRef: "MEDIA2" });
    expect(messages[3]).toMatchObject({ type: "text", text: "Yes" });
    expect(messages[4]).toMatchObject({ type: "other", text: "[sticker message]" });
    expect(statuses).toEqual([{ externalMessageId: "wamid.out", status: "read" }]);
  });
  it("ignores junk", () => {
    expect(parseWhatsAppWebhook({}).messages).toEqual([]);
    expect(parseWhatsAppWebhook(null).messages).toEqual([]);
  });
  it("makes template variables safe", () => {
    expect(templateSafe("Line 1\n\nLine 2\twith     spaces")).toBe("Line 1 · Line 2 with   spaces");
    expect(templateSafe("")).toBe("-");
  });
});

describe("Instagram webhook", () => {
  it("parses DMs, images, story replies and skips echoes", () => {
    const { messages } = parseInstagramWebhook({
      object: "instagram",
      entry: [{
        id: "IGACC",
        messaging: [
          { sender: { id: "U1" }, recipient: { id: "IGACC" }, timestamp: 1762600000000, message: { mid: "m1", text: "price?" } },
          { sender: { id: "U1" }, recipient: { id: "IGACC" }, timestamp: 1762600000001, message: { mid: "m2", attachments: [{ type: "image", payload: { url: "https://cdn/x.jpg" } }] } },
          { sender: { id: "U1" }, recipient: { id: "IGACC" }, timestamp: 1762600000002, message: { mid: "m3", text: "nice!", reply_to: { story: { id: "S1", url: "https://cdn/story.jpg" } } } },
          { sender: { id: "IGACC" }, recipient: { id: "U1" }, timestamp: 1762600000003, message: { mid: "m4", text: "our reply", is_echo: true } },
        ],
      }],
    });
    expect(messages.map((m) => [m.type, m.externalMessageId])).toEqual([["text", "m1"], ["image", "m2"], ["story_reply", "m3"]]);
    expect(messages[1].mediaRef).toBe("https://cdn/x.jpg");
    expect(messages[0].channelExternalId).toBe("IGACC");
  });
  it("parses comments and skips our own", () => {
    const { comments } = parseInstagramWebhook({
      object: "instagram",
      entry: [{
        id: "IGACC",
        changes: [
          { field: "comments", value: { id: "C1", text: "PRICE pls", media: { id: "MEDIA9" }, from: { id: "U2", username: "ada" } } },
          { field: "comments", value: { id: "C2", text: "thanks", from: { id: "IGACC", username: "shop" } } },
        ],
      }],
    });
    expect(comments).toEqual([{ channelExternalId: "IGACC", commentId: "C1", text: "PRICE pls", mediaId: "MEDIA9", fromId: "U2", fromUsername: "ada" }]);
  });
  it("ignores other objects", () => {
    expect(parseInstagramWebhook({ object: "page", entry: [] }).messages).toEqual([]);
  });
});
