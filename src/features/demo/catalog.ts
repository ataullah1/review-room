export const demoAssets = [
  {
    id: "identity",
    title: "Forma / identity",
    category: "Brand direction",
    versions: [
      { number: 1, width: 1448, height: 1086, src: "/demo/identity-v1.webp" },
      { number: 2, width: 1448, height: 1086, src: "/demo/identity-v2.webp" },
    ],
  },
  {
    id: "journal",
    title: "A slower kind of Sunday",
    category: "Editorial campaign",
    versions: [
      { number: 1, width: 1536, height: 1024, src: "/demo/journal-v1.webp" },
      { number: 2, width: 1086, height: 1448, src: "/demo/journal-v2.webp" },
    ],
  },
  {
    id: "packaging",
    title: "Forma / almond granola",
    category: "Packaging concept",
    versions: [
      { number: 1, width: 1448, height: 1086, src: "/demo/packaging-v1.webp" },
      { number: 2, width: 1448, height: 1086, src: "/demo/packaging-v2.webp" },
    ],
  },
] as const;
export type DemoAssetId = (typeof demoAssets)[number]["id"];
export const demoMarker = "REVIEW_ROOM_DEMO_V1";
