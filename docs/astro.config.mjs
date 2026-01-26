// @ts-check
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

// https://astro.build/config
export default defineConfig({
  site: "https://purduercac.github.io",
  base: "/AnvilOps",
  integrations: [
    starlight({
      plugins: [starlightLinksValidator()],
      favicon: "/favicon.png",
      title: "AnvilOps Docs",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/PurdueRCAC/AnvilOps",
        },
      ],
      sidebar: [
        { label: "Intro", autogenerate: { directory: "intro" } },
        { label: "Guides", autogenerate: { directory: "guides" } },
        { label: "Reference", autogenerate: { directory: "reference" } },
      ],
      customCss: ["./src/styles/custom.css"],
      logo: {
        replacesTitle: true,
        src: "./src/assets/anvilops.png",
        alt: "AnvilOps Logo",
      },
    }),
  ],
});
