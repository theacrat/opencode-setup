interface Vendor {
  readonly name: string;
  readonly source: string;
  readonly subdir?: string;
  readonly staged: boolean;
}

export const VENDORS = [
  {
    name: "1password",
    source: "1Password/cursor-plugin",
    staged: false,
  },
  {
    name: "cloudflare",
    source: "cloudflare/skills",
    staged: false,
  },
  {
    name: "pstack",
    source: "theacrat/pstack-generic",
    staged: true,
    subdir: "pstack",
  },
  {
    name: "mattpocock-skills",
    source: "mattpocock/skills",
    staged: true,
  },
] as const satisfies readonly Vendor[];
