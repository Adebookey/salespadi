import { Camera, MessageCircle } from "lucide-react";
import { cn } from "./ui";

/** Small WhatsApp/Instagram marker on a customer avatar. */
export function ChannelDot({ type }: { type: string }) {
  const wa = type === "whatsapp";
  return (
    <span className={cn("absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full ring-2 ring-surface",
      wa ? "bg-[#25d366] text-white" : "bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white")}
      title={wa ? "WhatsApp" : "Instagram"}>
      {wa ? <MessageCircle className="size-2.5" strokeWidth={3} /> : <Camera className="size-2.5" strokeWidth={3} />}
    </span>
  );
}
