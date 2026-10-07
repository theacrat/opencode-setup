interface NativeSource {
  readonly name: string;
  readonly repository: string;
  readonly previous: string;
  readonly skills: readonly { readonly name: string; readonly directory: string }[];
}
const SOURCES: readonly NativeSource[] = [
  {
    name: "anthropics",
    previous: "anthropics-skills",
    repository: "anthropics/skills",
    skills: [{ directory: "skills/frontend-design", name: "frontend-design" }],
  },
  {
    name: "vercel",
    previous: "vercel-agent-skills",
    repository: "vercel-labs/agent-skills",
    skills: [
      { directory: "skills/web-design-guidelines", name: "web-design-guidelines" },
      { directory: "skills/react-best-practices", name: "vercel-react-best-practices" },
      { directory: "skills/composition-patterns", name: "vercel-composition-patterns" },
    ],
  },
  {
    name: "trailofbits",
    previous: "trailofbits-skills",
    repository: "trailofbits/skills",
    skills: [
      {
        directory: "plugins/property-based-testing/skills/property-based-testing",
        name: "property-based-testing",
      },
      { directory: "plugins/mutation-testing/skills/mutation-testing", name: "mutation-testing" },
      { directory: "plugins/sharp-edges/skills/sharp-edges", name: "sharp-edges" },
    ],
  },
];
export { SOURCES };
export type { NativeSource };
