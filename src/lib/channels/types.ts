import type { ChannelType } from "../types";

/** A customer message normalised from either channel. */
export interface InboundMessage {
  channel: ChannelType;
  /** WhatsApp phone_number_id or Instagram account id: identifies the vendor's channel. */
  channelExternalId: string;
  customerExternalId: string;
  customerName?: string;
  externalMessageId: string;
  timestamp: Date;
  type: "text" | "image" | "audio" | "story_reply" | "other";
  text: string;
  /** WhatsApp media id or Instagram attachment URL. */
  mediaRef?: string;
  mediaMime?: string;
}

/** An Instagram comment that may trigger a comment-to-DM. */
export interface InboundComment {
  channelExternalId: string;
  commentId: string;
  text: string;
  mediaId?: string;
  fromId?: string;
  fromUsername?: string;
}

export interface StatusUpdate {
  externalMessageId: string;
  status: string;
}

export type OutboundMessage =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption?: string }
  | { kind: "template"; name: string; language?: string; params: readonly string[] };
