interface Vendor {
  readonly name: string;
  readonly source: string;
  readonly subdir?: string;
  readonly excludedRoots: readonly string[];
  readonly staged: boolean;
}

export const VENDORS = [
  {
    excludedRoots: [
      "plugins/1password",
      "sources/1password-cursor-plugin",
      "sources/cursor-plugin",
    ],
    name: "1password",
    source: "1Password/cursor-plugin",
    staged: false,
  },
  {
    excludedRoots: ["plugins/cloudflare", "sources/cloudflare-skills"],
    name: "cloudflare",
    source: "cloudflare/skills",
    staged: false,
  },
  {
    excludedRoots: ["plugins/pstack", "sources/pstack-generic"],
    name: "pstack",
    source: "theacrat/pstack-generic",
    staged: true,
    subdir: "pstack",
  },
  {
    excludedRoots: ["sources/mattpocock-skills"],
    name: "mattpocock-skills",
    source: "mattpocock/skills",
    staged: true,
  },
] as const satisfies readonly Vendor[];
