import { z } from "zod";
import { SKILL_CATEGORIES, type Achievement, type Education, type Project, type Skill, type SkillCategory } from "@/lib/resources/types";
import {
  clean,
  guessAchievementKind,
  parseBrief,
  parseEducation,
  parseProjectName,
  parseTimestamp,
  parseYears,
  splitBullets,
  splitList,
} from "./parse";

export const PROJECT_SLOTS = 3;
const PROJECT_FIELDS = [
  { key: "name", label: "Name (and type)" },
  { key: "brief", label: "Brief & features" },
  { key: "client", label: "Client name" },
  { key: "responsibilities", label: "Responsibilities" },
  { key: "technologies", label: "Core technologies" },
  { key: "industry", label: "Industry / domain" },
] as const;

export type TargetField = { key: string; label: string; group: string };

/** Every app field a CSV column can be mapped to, grouped for the mapping screen. */
export const TARGET_FIELDS: TargetField[] = [
  { key: "timestamp", label: "Timestamp", group: "Person" },
  { key: "name", label: "Name", group: "Person" },
  { key: "email", label: "Email (optional)", group: "Person" },
  { key: "title", label: "Title / designation (optional)", group: "Person" },
  { key: "bachelors", label: "Bachelor's", group: "Person" },
  { key: "masters", label: "Master's", group: "Person" },
  { key: "yearsPrevious", label: "Years at previous workplaces", group: "Experience" },
  { key: "yearsEnosis", label: "Years at Enosis", group: "Experience" },
  { key: "majorExpertise", label: "Major expertise", group: "Experience" },
  { key: "achievements", label: "Achievements & certifications", group: "Experience" },
  ...SKILL_CATEGORIES.map((c) => ({ key: `skill.${c.key}`, label: c.label, group: "Tech stack" })),
  ...Array.from({ length: PROJECT_SLOTS }, (_, i) =>
    PROJECT_FIELDS.map((f) => ({ key: `project${i + 1}.${f.key}`, label: f.label, group: `Project ${i + 1}` })),
  ).flat(),
];

export type Mapping = Record<string, number>;

const SKILL_HEADERS: [RegExp, SkillCategory][] = [
  [/^programming languages?/, "languages"],
  [/^web technolog/, "web"],
  [/^frameworks?/, "frameworks"],
  [/^librar(y|ies)/, "libraries"],
  [/^databases?/, "databases"],
  [/^(other )?tools/, "tools"],
  [/^project management/, "project_management"],
  [/^cloud/, "cloud"],
];

/**
 * Guesses the mapping from header text. Built around our Google Form, whose repeated
 * "Client Name" and "Industry / Domain" questions belong to the project asked about just before them.
 */
export function autoDetectMapping(headers: string[]): Mapping {
  const mapping: Mapping = {};
  let currentProject = 0;
  const setOnce = (key: string, index: number) => {
    if (mapping[key] === undefined) mapping[key] = index;
  };

  headers.forEach((header, index) => {
    const h = header.split("\n")[0].trim().toLowerCase();
    const projectMatch = h.match(/project\s*(\d+)/);
    if (projectMatch && !h.startsWith("project management")) currentProject = Number(projectMatch[1]);

    if (h === "timestamp") return setOnce("timestamp", index);
    if (/^(full )?name\b/.test(h)) return setOnce("name", index);
    if (/e-?mail/.test(h)) return setOnce("email", index);
    if (/^(title|designation)\b/.test(h)) return setOnce("title", index);
    if (h.startsWith("bachelor")) return setOnce("bachelors", index);
    if (h.startsWith("master")) return setOnce("masters", index);
    if (h.includes("years of work experience")) return setOnce("yearsPrevious", index);
    if (h.includes("experience in enosis")) return setOnce("yearsEnosis", index);
    if (h.startsWith("major expertise")) return setOnce("majorExpertise", index);
    if (h.startsWith("achievement")) return setOnce("achievements", index);
    for (const [re, cat] of SKILL_HEADERS) if (re.test(h)) return setOnce(`skill.${cat}`, index);

    if (currentProject >= 1 && currentProject <= PROJECT_SLOTS) {
      const p = `project${currentProject}`;
      if (/project\s*\d+\s*name/.test(h)) return setOnce(`${p}.name`, index);
      if (/project\s*\d+\s*brief/.test(h)) return setOnce(`${p}.brief`, index);
      if (/project\s*\d+\s*responsibilit/.test(h)) return setOnce(`${p}.responsibilities`, index);
      if (/core technologies/.test(h)) return setOnce(`${p}.technologies`, index);
      if (h.startsWith("client")) return setOnce(`${p}.client`, index);
      if (h.startsWith("industry")) return setOnce(`${p}.industry`, index);
    }
  });
  return mapping;
}

export type ParsedRow = {
  rowNumber: number; // 1-based row in the CSV, counting the header
  timestamp: number;
  name: string;
  email: string;
  title: string;
  yearsPrevious: number | null;
  yearsEnosis: number | null;
  majorExpertise: string;
  skills: Skill[];
  education: Education[];
  achievements: Achievement[];
  projects: Project[];
  warnings: string[];
};

/** Turns one CSV row into resource fields, applying the parsing rules for our form's free-text answers. */
export function parseRow(row: string[], mapping: Mapping, rowNumber: number): ParsedRow {
  const get = (key: string) => (mapping[key] === undefined ? "" : (row[mapping[key]] ?? ""));
  const warnings: string[] = [];

  const skills: Skill[] = SKILL_CATEGORIES.flatMap((c) =>
    splitList(get(`skill.${c.key}`)).map((name) => ({ category: c.key, name, proficiency: null, years: null })),
  );

  const education: Education[] = [];
  const bachelors = parseEducation(get("bachelors"));
  if (bachelors) education.push({ level: "bachelor", ...bachelors });
  const masters = parseEducation(get("masters"));
  if (masters) education.push({ level: "master", ...masters });

  const achievements: Achievement[] = splitBullets(get("achievements")).map((name) => ({
    kind: guessAchievementKind(name),
    name,
    issuer: "",
    year: "",
    credentialUrl: "",
  }));

  const projects: Project[] = [];
  for (let n = 1; n <= PROJECT_SLOTS; n++) {
    const { name, type } = parseProjectName(get(`project${n}.name`));
    if (!name) continue;
    const { brief, features } = parseBrief(get(`project${n}.brief`));
    const client = clean(get(`project${n}.client`));
    const contributions = splitBullets(get(`project${n}.responsibilities`));
    if (contributions.length === 0) warnings.push(`Project ${n} has no responsibilities.`);
    projects.push({
      name,
      type,
      brief,
      features,
      clientName: client,
      // The form asks for a client only for projects done at Enosis.
      atEnosis: client !== "",
      industry: clean(get(`project${n}.industry`)),
      duration: "",
      teamSize: "",
      role: "",
      technologies: splitList(get(`project${n}.technologies`)),
      contributions,
      outcomes: "",
    });
  }

  const name = clean(get("name")).replace(/\s+/g, " ");
  if (!name) warnings.push("Missing name; this row will be skipped.");
  if (skills.length === 0) warnings.push("No tech stack listed.");
  if (projects.length === 0) warnings.push("No projects listed.");

  const email = clean(get("email")).toLowerCase();
  return {
    rowNumber,
    timestamp: parseTimestamp(get("timestamp")),
    name,
    email: z.email().safeParse(email).success ? email : "",
    title: clean(get("title")),
    yearsPrevious: parseYears(get("yearsPrevious")),
    yearsEnosis: parseYears(get("yearsEnosis")),
    majorExpertise: clean(get("majorExpertise")),
    skills,
    education,
    achievements,
    projects,
    warnings,
  };
}
