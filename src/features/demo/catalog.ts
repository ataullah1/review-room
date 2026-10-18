export const demoAssets = [
  {
    id: "identity",
    title: "Forma / identity",
    category: "Brand direction",
    versions: [
      { number: 1, width: 1200, height: 800, src: "/demo/identity-v1.svg" },
      { number: 2, width: 1200, height: 800, src: "/demo/identity-v2.svg" },
    ],
  },
  {
    id: "journal",
    title: "A slower kind of Sunday",
    category: "Editorial campaign",
    versions: [
      { number: 1, width: 800, height: 1100, src: "/demo/journal-v1.svg" },
      { number: 2, width: 800, height: 1100, src: "/demo/journal-v2.svg" },
    ],
  },
  {
    id: "packaging",
    title: "Good things take root",
    category: "Packaging concept",
    versions: [
      { number: 1, width: 1000, height: 1000, src: "/demo/packaging-v1.svg" },
      { number: 2, width: 1000, height: 1000, src: "/demo/packaging-v2.svg" },
    ],
  },
] as const;
export type DemoAssetId = (typeof demoAssets)[number]["id"];
export const demoMarker = "REVIEW_ROOM_DEMO_V1";
