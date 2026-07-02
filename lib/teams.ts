import "server-only";
import type { Team } from "./types";

// The camps and how many 團 each has; every 團 has 4 隊. Codes run T01.. in order.
const CAMPS: { name: string; groups: number }[] = [
  { name: "陽明營區", groups: 8 }, // T01–T32
  { name: "士商營區", groups: 5 }, // T33–T52
  { name: "蘭雅營區", groups: 5 }, // T53–T72
];

/** The built-in 72-team roster, used to seed the (admin-editable) DB team list. */
export function defaultTeams(): Team[] {
  const out: Team[] = [];
  let n = 0;
  for (const camp of CAMPS) {
    for (let g = 1; g <= camp.groups; g++) {
      for (let t = 1; t <= 4; t++) {
        n += 1;
        out.push({
          code: `T${String(n).padStart(2, "0")}`,
          name: `${camp.name}_第${g}團_第${t}隊`,
        });
      }
    }
  }
  return out;
}
