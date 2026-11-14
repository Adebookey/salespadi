import type { MetadataRoute } from "next";

// Lets people add SalesPadi to their phone's home screen with the proper icon and name.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SalesPadi",
    short_name: "SalesPadi",
    description: "Your padi for selling on WhatsApp and Instagram.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0d12",
    theme_color: "#0a0d12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
