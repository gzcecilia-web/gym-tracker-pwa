import fs from "fs";
import path from "path";
// @ts-ignore pdf-parse has no bundled types in this setup
import pdfParse from "pdf-parse";

type Exercise = {
  name: string;
  reps: number[] | number | string;
  type: "normal" | "dropset";
  notes: string;
  sets?: number | null;
};

type Day = {
  day: number;
  exercises: Exercise[];
};

type Week = {
  week: number;
  days: Day[];
};

type Plan = {
  id: string;
  name: string;
  month: number;
  year: number;
  weeks: Week[];
};

type Profile = {
  id: string;
  name: string;
  plans: Plan[];
};

type PlansDb = {
  defaultSetsIfMissing: number;
  profiles: Profile[];
};

type ParsedCell = {
  sets?: number;
  reps: string;
  notes?: string;
};

type ParsedExerciseRow = {
  name: string;
  byWeek: Array<ParsedCell | null>;
};

type ParsedDayRows = {
  day: number;
  rows: ParsedExerciseRow[];
};

const DEFAULT_PLANS_PATH = path.resolve(process.cwd(), "plans.json");
const DEFAULT_ROUTINE_PATH = path.resolve(process.cwd(), "data/routine.json");
const PROFILE_ID = "default-profile";

function parseArgs(argv: string[]) {
  let month: number | undefined;
  let year: number | undefined;
  let profileArg: string | undefined;
  let planIdArg: string | undefined;
  let planNameArg: string | undefined;
  let plansPath = DEFAULT_PLANS_PATH;
  let routinePath = DEFAULT_ROUTINE_PATH;
  const pdfPaths: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];

    if (token === "--month" && next) {
      month = Number(next);
      i += 1;
      continue;
    }
    if (token === "--year" && next) {
      year = Number(next);
      i += 1;
      continue;
    }
    if (token === "--profile" && next) {
      profileArg = next;
      i += 1;
      continue;
    }
    if (token === "--plan-id" && next) {
      planIdArg = next.trim();
      i += 1;
      continue;
    }
    if (token === "--plan-name" && next) {
      planNameArg = next.trim();
      i += 1;
      continue;
    }
    if (token === "--plans" && next) {
      plansPath = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (token === "--routine" && next) {
      routinePath = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (!token.startsWith("--")) {
      pdfPaths.push(path.resolve(process.cwd(), token));
      continue;
    }
    throw new Error(`Unknown or incomplete option: ${token}`);
  }

  if (pdfPaths.length === 0) {
    throw new Error(
      "No PDF paths received. Usage: npm run import:plans -- --month 2 --year 2026 --profile cecilia path/al.pdf"
    );
  }
  if (month !== undefined && (Number.isNaN(month) || month < 1 || month > 12)) {
    throw new Error(`Invalid --month: ${month}`);
  }
  if (year !== undefined && (Number.isNaN(year) || year < 2000 || year > 2200)) {
    throw new Error(`Invalid --year: ${year}`);
  }

  return {
    month,
    year,
    profileArg,
    planIdArg,
    planNameArg,
    pdfPaths,
    plansPath,
    routinePath,
  };
}

function normalizeProfileId(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function profileNameFromId(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function detectProfile(text: string, filePath: string, profileArg?: string) {
  if (profileArg) {
    const id = normalizeProfileId(profileArg);
    return { id, name: profileNameFromId(id) };
  }

  const lower = text.toLowerCase();
  if (lower.includes("cecilia") || lower.includes("ceci")) {
    return { id: "cecilia", name: "Cecilia" };
  }
  if (lower.includes("gabriel") || lower.includes("gabi")) {
    return { id: "gabriel", name: "Gabriel" };
  }

  const base = path.basename(filePath, path.extname(filePath));
  const candidate = normalizeProfileId(base);
  if (candidate && !/^\d+$/.test(candidate)) {
    const first = candidate.split("-")[0];
    if (first && !/^\d+$/.test(first)) {
      return { id: first, name: profileNameFromId(first) };
    }
  }

  return { id: PROFILE_ID, name: profileNameFromId(PROFILE_ID) };
}

function detectMonthYear(
  filePath: string,
  cliMonth?: number,
  cliYear?: number
): { month: number; year: number } {
  const now = new Date();
  let month = cliMonth;
  let year = cliYear;

  const base = path.basename(filePath, path.extname(filePath));
  if (!month) {
    const monthMatch = base.match(/(?:^|[^0-9])(1[0-2]|0?[1-9])(?:[^0-9]|$)/);
    if (monthMatch) {
      month = Number(monthMatch[1]);
    }
  }
  if (!year) {
    const yearMatch = base.match(/(?:19|20)\d{2}/);
    if (yearMatch) {
      year = Number(yearMatch[0]);
    }
  }

  return {
    month: month ?? now.getMonth() + 1,
    year: year ?? now.getFullYear(),
  };
}

function tokenizePdfText(text: string): string[] {
  return text
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

function isDayToken(token: string): number | null {
  const m = token.match(/^DIA\s*([1-4])$/i);
  return m ? Number(m[1]) : null;
}

function isHeaderToken(token: string): boolean {
  return (
    /^EJERCICIO$/i.test(token) ||
    /^SERIES$/i.test(token) ||
    /^REPETICIONES$/i.test(token) ||
    /^PRIMERA\s+SEMANA$/i.test(token) ||
    /^SEGUNDA\s+SEMANA$/i.test(token) ||
    /^TERCERA\s+SEMANA$/i.test(token) ||
    /^CUARTA\s+SEMANA$/i.test(token)
  );
}

function isValueToken(token: string): boolean {
  const normalized = token.toUpperCase();
  return (
    /^\d+$/.test(token) ||
    /^\d+\s*-\s*\d+(?:\s*-\s*\d+)*$/.test(token) ||
    /^\d+\s*\+\s*\d+\s*\+\s*\d+$/.test(token) ||
    /^\d+\s*A\s*\d+$/.test(normalized)
  );
}

function normalizeSpaces(token: string): string {
  return token.replace(/\s+/g, " ").trim();
}

function splitIntoDayBlocks(tokens: string[]): Map<number, string[]> {
  const blocks = new Map<number, string[]>();
  for (let day = 1; day <= 4; day += 1) {
    blocks.set(day, []);
  }

  let currentDay: number | null = null;
  for (const token of tokens) {
    const maybeDay = isDayToken(token);
    if (maybeDay !== null) {
      currentDay = maybeDay;
      continue;
    }
    if (currentDay === null) {
      continue;
    }
    if (!isHeaderToken(token)) {
      blocks.get(currentDay)?.push(token);
    }
  }
  return blocks;
}

function decodeWeekCells(values: string[]): Array<ParsedCell | null> {
  const n = values.length;
  const combos: number[][] = [];

  function build(i: number, parts: number[]) {
    const sum = parts.reduce((acc, v) => acc + v, 0);
    if (sum > n || i > 4) return;
    if (i === 4 && sum === n) {
      combos.push([...parts]);
      return;
    }
    if (i === 4) return;
    build(i + 1, [...parts, 1]);
    build(i + 1, [...parts, 2]);
  }
  build(0, []);

  let best:
    | {
        score: number;
        out: Array<ParsedCell | null>;
      }
    | undefined;

  for (const combo of combos) {
    const out: Array<ParsedCell | null> = [];
    let cursor = 0;
    let score = 0;
    let valid = true;

    for (const size of combo) {
      if (size === 1) {
        const repsToken = values[cursor];
        if (!isValueToken(repsToken)) {
          valid = false;
          break;
        }
        out.push({ reps: normalizeSpaces(repsToken) });
        score += 1;
        cursor += 1;
      } else {
        const setsToken = values[cursor];
        const repsToken = values[cursor + 1];
        if (!/^\d+$/.test(setsToken) || !isValueToken(repsToken)) {
          valid = false;
          break;
        }
        out.push({ sets: Number(setsToken), reps: normalizeSpaces(repsToken) });
        score += 3;
        cursor += 2;
      }
    }

    if (!valid) {
      continue;
    }
    if (!best || score > best.score) {
      best = { score, out };
    }
  }

  if (best) {
    return best.out;
  }

  const fallback: Array<ParsedCell | null> = [null, null, null, null];
  if (n > 0) {
    fallback[0] = {
      reps: values[0],
      notes: `No se pudo mapear columnas con certeza: ${values.join(" | ")}`,
    };
  }
  return fallback;
}

function parseDayRows(dayTokens: string[]): ParsedExerciseRow[] {
  const rows: ParsedExerciseRow[] = [];
  let i = 0;

  while (i < dayTokens.length) {
    const token = normalizeSpaces(dayTokens[i]);
    if (isHeaderToken(token)) {
      i += 1;
      continue;
    }
    if (isValueToken(token)) {
      i += 1;
      continue;
    }

    let name = token;
    i += 1;
    while (i < dayTokens.length) {
      const maybeContinuation = normalizeSpaces(dayTokens[i]);
      if (isValueToken(maybeContinuation) || isHeaderToken(maybeContinuation)) {
        break;
      }
      name = `${name} ${maybeContinuation}`.trim();
      i += 1;
    }

    const values: string[] = [];
    while (i < dayTokens.length) {
      const next = normalizeSpaces(dayTokens[i]);
      if (!isValueToken(next)) {
        break;
      }
      values.push(next);
      i += 1;
    }

    const byWeek = decodeWeekCells(values);
    rows.push({ name, byWeek });
  }

  return rows;
}

function parsePdfToRows(text: string): ParsedDayRows[] {
  const tokens = tokenizePdfText(text);
  const blocks = splitIntoDayBlocks(tokens);
  const out: ParsedDayRows[] = [];

  for (let day = 1; day <= 4; day += 1) {
    const dayTokens = blocks.get(day) ?? [];
    if (dayTokens.length === 0) continue;
    out.push({ day, rows: parseDayRows(dayTokens) });
  }
  return out;
}

function normalizeReps(token: string): {
  reps: number[] | number | string;
  type: "normal" | "dropset";
  notes: string;
} {
  const compact = token.replace(/\s+/g, "");
  if (/^\d+\+\d+\+\d+$/.test(compact)) {
    return { reps: compact, type: "dropset", notes: "dropset" };
  }
  if (/^\d+(?:-\d+)+$/.test(compact)) {
    return {
      reps: compact.split("-").map((x) => Number(x)),
      type: "normal",
      notes: "",
    };
  }
  if (/^\d+$/.test(compact)) {
    return { reps: Number(compact), type: "normal", notes: "" };
  }
  return { reps: token, type: "normal", notes: "" };
}

function buildWeeks(parsedRows: ParsedDayRows[]): {
  weeks: Week[];
  dropsets: number;
  missingSets: number;
  exercisesByDay: Record<number, number>;
  missingWeekWarnings: string[];
} {
  const weeksMap = new Map<number, Map<number, Exercise[]>>();
  for (let w = 1; w <= 4; w += 1) {
    weeksMap.set(w, new Map<number, Exercise[]>());
  }

  const exercisesByDay: Record<number, number> = {};
  let dropsets = 0;
  let missingSets = 0;

  for (const dayRows of parsedRows) {
    exercisesByDay[dayRows.day] = dayRows.rows.length;
    for (let week = 1; week <= 4; week += 1) {
      const dayMap = weeksMap.get(week)!;
      if (!dayMap.has(dayRows.day)) {
        dayMap.set(dayRows.day, []);
      }
      const exercises = dayMap.get(dayRows.day)!;

      for (const row of dayRows.rows) {
        const weekCell = row.byWeek[week - 1];
        if (!weekCell) {
          continue;
        }
        const parsed = normalizeReps(weekCell.reps);
        const ex: Exercise = {
          name: row.name,
          reps: parsed.reps,
          type: parsed.type,
          notes: [parsed.notes, weekCell.notes].filter(Boolean).join(" | "),
        };

        if (weekCell.sets !== undefined) {
          ex.sets = weekCell.sets;
        } else {
          missingSets += 1;
        }
        if (parsed.type === "dropset") {
          dropsets += 1;
        }
        exercises.push(ex);
      }
    }
  }

  const weeks: Week[] = [];
  const missingWeekWarnings: string[] = [];
  for (let week = 1; week <= 4; week += 1) {
    const dayMap = weeksMap.get(week)!;
    const days: Day[] = [];
    for (let day = 1; day <= 4; day += 1) {
      const exercises = dayMap.get(day) ?? [];
      if (exercises.length > 0) {
        days.push({ day, exercises });
      }
    }
    if (days.length > 0) {
      weeks.push({ week, days });
    } else {
      missingWeekWarnings.push(`Semana ${week} no detectada en el parseo.`);
    }
  }

  return { weeks, dropsets, missingSets, exercisesByDay, missingWeekWarnings };
}

function loadPlansDb(plansPath: string): PlansDb {
  if (!fs.existsSync(plansPath)) {
    return { defaultSetsIfMissing: 4, profiles: [] };
  }
  const raw = fs.readFileSync(plansPath, "utf8");
  const parsed = JSON.parse(raw) as Partial<PlansDb>;
  return {
    defaultSetsIfMissing: parsed.defaultSetsIfMissing ?? 4,
    profiles: Array.isArray(parsed.profiles) ? (parsed.profiles as Profile[]) : [],
  };
}

function loadDb(pathToDb: string): PlansDb {
  if (!fs.existsSync(pathToDb)) {
    return { defaultSetsIfMissing: 4, profiles: [] };
  }
  const raw = fs.readFileSync(pathToDb, "utf8");
  const parsed = JSON.parse(raw) as Partial<PlansDb>;
  return {
    defaultSetsIfMissing: parsed.defaultSetsIfMissing ?? 4,
    profiles: Array.isArray(parsed.profiles) ? (parsed.profiles as Profile[]) : [],
  };
}

function saveDb(pathToDb: string, db: PlansDb) {
  fs.writeFileSync(pathToDb, JSON.stringify(db, null, 2), "utf8");
}

function splitSupersetName(name: string): string[] {
  if (!name.includes(" + ")) return [name.trim()];
  return name
    .split(" + ")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toRoutineWeeks(planWeeks: Week[]): Week[] {
  return planWeeks.map((week) => ({
    week: week.week,
    days: week.days.map((day) => ({
      day: day.day,
      exercises: day.exercises.flatMap((exercise) => {
        const names = splitSupersetName(exercise.name);
        return names.map((name) => ({
          ...exercise,
          name,
        }));
      }),
    })),
  }));
}

function upsertPlan(
  db: PlansDb,
  profile: { id: string; name: string },
  plan: Plan
): "creado" | "actualizado" {
  let profileEntry = db.profiles.find((p) => p.id === profile.id);
  if (!profileEntry) {
    profileEntry = { id: profile.id, name: profile.name, plans: [] };
    db.profiles.push(profileEntry);
  } else if (!profileEntry.name) {
    profileEntry.name = profile.name;
  }

  const existingPlanIndex = profileEntry.plans.findIndex((p) => p.id === plan.id);
  if (existingPlanIndex >= 0) {
    profileEntry.plans[existingPlanIndex] = plan;
    return "actualizado";
  }
  profileEntry.plans.push(plan);
  return "creado";
}

async function extractText(pdfPath: string): Promise<string> {
  const fileBuffer = fs.readFileSync(pdfPath);
  const data = await pdfParse(fileBuffer);
  return data.text || "";
}

async function run() {
  const {
    month: cliMonth,
    year: cliYear,
    profileArg,
    planIdArg,
    planNameArg,
    pdfPaths,
    plansPath,
    routinePath,
  } = parseArgs(
    process.argv.slice(2)
  );
  const plansDb = loadPlansDb(plansPath);
  const routineDb = loadDb(routinePath);

  for (const pdfPath of pdfPaths) {
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF not found: ${pdfPath}`);
    }

    const text = await extractText(pdfPath);
    const profile = detectProfile(text, pdfPath, profileArg);
    const { month, year } = detectMonthYear(pdfPath, cliMonth, cliYear);
    const planId = planIdArg?.length
      ? planIdArg
      : `${profile.id}-${year}-${String(month).padStart(2, "0")}`;
    const planName = planNameArg?.length
      ? planNameArg
      : `Rutina ${String(month).padStart(2, "0")}/${year} (${profile.name})`;

    const parsedRows = parsePdfToRows(text);
    const {
      weeks,
      dropsets,
      missingSets,
      exercisesByDay,
      missingWeekWarnings,
    } = buildWeeks(parsedRows);

    const nextPlansPlan: Plan = {
      id: planId,
      name: planName,
      month,
      year,
      weeks,
    };
    const nextRoutinePlan: Plan = {
      ...nextPlansPlan,
      weeks: toRoutineWeeks(weeks),
    };

    const action = upsertPlan(plansDb, profile, nextPlansPlan);
    upsertPlan(routineDb, profile, nextRoutinePlan);

    const missingDays = [1, 2, 3, 4].filter((d) => !Object.prototype.hasOwnProperty.call(exercisesByDay, d));
    const daySummary = [1, 2, 3, 4]
      .map((d) => `Día ${d}: ${exercisesByDay[d] ?? 0}`)
      .join(" | ");

    console.log(`\nArchivo: ${pdfPath}`);
    console.log(`Perfil detectado: ${profile.id} (${profile.name})`);
    console.log(`Plan ${action}: ${planId}`);
    console.log(`Cantidad de ejercicios por día: ${daySummary}`);
    console.log(`Detectados dropsets: ${dropsets}`);
    console.log(
      `Ejercicios sin sets (aplica default ${plansDb.defaultSetsIfMissing}): ${missingSets}`
    );
    for (const warning of missingWeekWarnings) {
      console.warn(`WARN: ${warning}`);
    }
    if (missingDays.length > 0) {
      console.warn(`WARN: Días faltantes detectados: ${missingDays.join(", ")}`);
    }
  }

  saveDb(plansPath, plansDb);
  saveDb(routinePath, routineDb);
  console.log(`\nplans.json actualizado: ${plansPath}`);
  console.log(`routine.json actualizado: ${routinePath}`);
}

run().catch((err) => {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
});
