import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

// Original code-drawn artwork. No downloaded imagery or third-party brand marks.
export async function generateOliveAssets() {
  await mkdir("public/reviewer-demo", { recursive: true });
  for (const version of [1, 2])
    for (const type of ["identity", "menu"]) {
      const revised = version === 2;
      const leaf = `<g transform="translate(600 270) scale(${revised ? 0.72 : 1})"><path d="M-65 15Q-75-95 30-110Q100-20 20 40Q-20 70-65 15" fill="#587461"/><path d="M-40 32L30-80" fill="none" stroke="#f8f7f4" stroke-width="5"/></g>`;
      const content =
        type === "identity"
          ? `${leaf}<text x="600" y="465" font-family="Georgia,serif" font-size="112" fill="#273d30" text-anchor="middle">olive café</text><text x="600" y="535" font-family="Arial,sans-serif" font-size="19" letter-spacing="${revised ? 7 : 3}" fill="#587461" text-anchor="middle">GOOD FOOD. SLOW MORNINGS.</text><path d="M420 590H780" stroke="#c9d5c4"/><text x="600" y="645" font-family="Arial,sans-serif" font-size="14" fill="#65725f" text-anchor="middle">BRAND IDENTITY / ${revised ? "REFINED DIRECTION" : "FIRST DIRECTION"}</text>`
          : `<text x="100" y="150" font-family="Georgia,serif" font-size="57" fill="#273d30">olive café</text><text x="100" y="210" font-family="Arial,sans-serif" font-size="14" letter-spacing="5" fill="#587461">THE SEASONAL TABLE</text><path d="M100 255H1100" stroke="#c9d5c4"/>${[
              ["MORNING", "Garden toast", "Sourdough, herbs, soft egg", "12"],
              [
                "SOMETHING SLOW",
                "Roasted tomato bowl",
                "Seasonal greens, warm grains",
                "16",
              ],
              ["DRINKS", "House flat white", "Our daily coffee ritual", "5"],
            ]
              .map(
                (item, i) =>
                  `<text x="100" y="${325 + i * 125}" font-family="Arial,sans-serif" font-size="13" letter-spacing="3" fill="#587461">${item[0]}</text><text x="100" y="${365 + i * 125}" font-family="Georgia,serif" font-size="30" fill="#273d30">${item[1]}</text><text x="100" y="${397 + i * 125}" font-family="Arial,sans-serif" font-size="${revised ? 17 : 15}" fill="${revised ? "#435642" : "#8b9384"}">${item[2]}</text><text x="1100" y="${365 + i * 125}" font-family="Arial,sans-serif" font-size="${revised ? 27 : 20}" fill="#273d30" text-anchor="end">${item[3]}</text>`,
              )
              .join("")}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#f8f7f4"/><rect x="32" y="32" width="1136" height="736" rx="4" fill="none" stroke="#d6dfd1"/>${content}<text x="1100" y="730" text-anchor="end" font-family="Arial,sans-serif" font-size="11" letter-spacing="2" fill="#587461">OLIVE CAFÉ / SAMPLE CONCEPT</text></svg>`;
      await writeFile(
        `public/reviewer-demo/olive-${type}-v${version}.webp`,
        await sharp(Buffer.from(svg)).webp({ quality: 90 }).toBuffer(),
      );
    }
}

generateOliveAssets()
  .then(() => console.log("Generated four original Olive Café demo images."))
  .catch(() => {
    console.error("Could not generate Olive Café assets.");
    process.exitCode = 1;
  });
