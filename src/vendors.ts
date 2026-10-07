interface Vendor {
  readonly name: string;
  readonly source: string;
  readonly subdir?: string;
  readonly excludedRoots: readonly string[];
  readonly staged: boolean;
}

export const VENDORS = [
  {
    name: "1password",
    source: "1Password/cursor-plugin",
    staged: false,
    excludedRoots: [
      "plugins/1password",
      "sources/1password-cursor-plugin",
      "sources/cursor-plugin",
    ],
  },
  {
    name: "cloudflare",
    source: "cloudflare/skills",
    staged: false,
    excludedRoots: ["plugins/cloudflare", "sources/cloudflare-skills"],
  },
  {
    name: "pstack",
    source: "theacrat/pstack-generic",
    subdir: "pstack",
    staged: true,
    excludedRoots: ["plugins/pstack", "sources/pstack-generic"],
  },
  {
    name: "mattpocock-skills",
    source: "mattpocock/skills",
    staged: true,
    excludedRoots: ["sources/mattpocock-skills"],
  },
] as const satisfies readonly Vendor[];
