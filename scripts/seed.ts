import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { createDb } from "@/db/client";
import { resources } from "@/db/schema";
import { createResource } from "@/lib/resources/service";
import { resourceInputSchema, type ResourceInput } from "@/lib/resources/types";

// Fictional people only. Shaped like our Google Form data; emails are sample, unverified addresses.
const SEED: Partial<ResourceInput>[] = [
  {
    name: "Ayesha Rahman",
    email: "ayesha.rahman@enosisbd.com",
    title: "Senior Software Engineer",
    seniority: "Senior",
    yearsPrevious: 2,
    yearsEnosis: 4,
    availabilityStatus: "available",
    majorExpertise:
      "Full-stack web developer focused on backend architecture and performance. Experienced in building multi-tenant SaaS and FinTech platforms with secure payment flows.",
    domains: ["FinTech", "B2B SaaS"],
    languages: ["English", "Bangla"],
    skills: [
      ["languages", "TypeScript"], ["languages", "JavaScript"], ["languages", "Python"],
      ["web", "HTML"], ["web", "CSS"], ["web", "Tailwind CSS"],
      ["frameworks", "React"], ["frameworks", "Next.js"], ["frameworks", "Node.js"], ["frameworks", "Express.js"],
      ["libraries", "Redux"], ["libraries", "Prisma"], ["libraries", "Jest"],
      ["databases", "PostgreSQL"], ["databases", "Redis"],
      ["tools", "Docker"], ["tools", "VS Code"], ["tools", "Postman"],
      ["project_management", "Jira"],
      ["cloud", "AWS Lambda"], ["cloud", "AWS S3"], ["cloud", "AWS RDS"],
    ].map(([category, name]) => ({ category, name })) as ResourceInput["skills"],
    education: [{ level: "bachelor", degree: "B.Sc. in Computer Science and Engineering", institution: "Sample University of Technology", year: "2018" }],
    achievements: [
      { kind: "certification", name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", year: "2024", credentialUrl: "" },
      { kind: "award", name: "Finalist, National Hackathon 2019", issuer: "", year: "2019", credentialUrl: "" },
    ],
    projects: [
      {
        name: "Merchant Payments Dashboard",
        type: "Web application",
        brief: "A web platform that lets small merchants accept card payments, track settlements, and reconcile payouts.",
        features: "Payment links, settlement reports, refund workflow, role-based access, audit log",
        clientName: "Sample Pay Inc.",
        atEnosis: true,
        industry: "FinTech",
        duration: "2023 – present",
        teamSize: "6",
        role: "Backend lead",
        technologies: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "AWS Lambda"],
        contributions: [
          "Designed the settlement reconciliation service and its database schema",
          "Built idempotent payment webhooks to prevent duplicate charges",
          "Reduced report generation time from 40s to 6s with query tuning and caching",
        ],
        outcomes: "Report generation time reduced from 40s to 6s",
      },
      {
        name: "Multi-tenant HR Portal",
        type: "Web application",
        brief: "An HR portal serving several companies from one codebase with isolated data per tenant.",
        features: "Tenant provisioning, leave management, payroll exports",
        clientName: "Sample HR Ltd.",
        atEnosis: true,
        industry: "B2B SaaS",
        technologies: ["Next.js", "React", "Prisma", "PostgreSQL"],
        contributions: ["Implemented schema-per-tenant provisioning", "Built the leave approval workflow UI in React"],
      },
    ] as ResourceInput["projects"],
  },
  {
    name: "Imran Hossain",
    email: "imran.hossain@enosisbd.com",
    title: "Software Engineer",
    seniority: "Mid",
    yearsPrevious: 0,
    yearsEnosis: 3,
    availabilityStatus: "allocated",
    availableFrom: "2027-01-15",
    majorExpertise: "Desktop application developer, native and cross-platform. Strong in performance tuning, hardware integration, and clean MVVM architecture.",
    domains: ["Networking"],
    skills: [
      ["languages", "C#"], ["languages", "C++"],
      ["frameworks", ".NET 8"], ["frameworks", "WPF"], ["frameworks", ".NET MAUI"],
      ["libraries", "Prism"], ["libraries", "MSTest"], ["libraries", "NSubstitute"],
      ["databases", "SQLite"],
      ["tools", "Visual Studio"], ["tools", "WiX"], ["tools", "Wireshark"],
      ["project_management", "Jira"],
    ].map(([category, name]) => ({ category, name })) as ResourceInput["skills"],
    education: [{ level: "bachelor", degree: "B.Sc. in Computer Science and Engineering", institution: "Sample National University", year: "2021" }],
    achievements: [{ kind: "publication", name: "Co-author, “Efficient Packet Classification on Commodity Hardware”, sample journal", issuer: "", year: "2022", credentialUrl: "" }],
    projects: [
      {
        name: "Wireless Signal Analyzer",
        type: "Desktop application",
        brief: "Desktop software that visualizes wireless signal data from USB analyzers and helps troubleshoot interference.",
        features: "Live spectrum charts, device hot-plug, report export",
        clientName: "Sample Networks LLC",
        atEnosis: true,
        industry: "Networking",
        technologies: ["C#", "WPF", ".NET 8", "SQLite", "Prism"],
        contributions: [
          "Built a C# interface library for proprietary USB devices",
          "Added hot plug/unplug support for analyzer hardware",
          "Cut large capture file load time by 70% with streaming parsing",
        ],
        outcomes: "File load time cut by 70%",
      },
    ] as ResourceInput["projects"],
  },
  {
    name: "Farhana Akter",
    email: "farhana.akter@enosisbd.com",
    title: "Senior SQA Engineer",
    seniority: "Senior",
    yearsPrevious: 1.5,
    yearsEnosis: 3.5,
    availabilityStatus: "partially_available",
    majorExpertise: "QA engineer specializing in test automation for web and API, CI integration, and test strategy for regulated healthcare products.",
    domains: ["Healthcare"],
    skills: [
      ["languages", "TypeScript"], ["languages", "Java"],
      ["frameworks", "Playwright"], ["frameworks", "Selenium"], ["frameworks", "TestNG"],
      ["tools", "Postman"], ["tools", "JMeter"], ["tools", "GitHub Actions"],
      ["project_management", "Jira"], ["project_management", "TestRail"],
    ].map(([category, name]) => ({ category, name })) as ResourceInput["skills"],
    education: [{ level: "bachelor", degree: "B.Sc. in Software Engineering", institution: "Sample Institute of Science", year: "2019" }],
    achievements: [{ kind: "certification", name: "ISTQB Certified Tester Foundation Level", issuer: "ISTQB", year: "2021", credentialUrl: "" }],
    projects: [
      {
        name: "Patient Engagement Portal",
        type: "Web application",
        brief: "A patient portal for appointment booking, forms, and payments for dental clinics.",
        clientName: "Sample Dental Co.",
        atEnosis: true,
        industry: "Healthcare",
        technologies: ["Playwright", "TypeScript", "GitHub Actions"],
        contributions: [
          "Built a Playwright regression suite of 400+ tests running in CI",
          "Reduced manual regression effort from 3 days to 4 hours",
        ],
        outcomes: "Regression effort reduced from 3 days to 4 hours",
      },
    ] as ResourceInput["projects"],
  },
  {
    name: "Mahmud Chowdhury",
    email: "mahmud.chowdhury@enosisbd.com",
    title: "Lead Software Engineer",
    seniority: "Lead",
    yearsPrevious: 4,
    yearsEnosis: 5,
    availabilityStatus: "available",
    majorExpertise: "Backend and data engineer. Builds Python APIs and data pipelines, and integrates machine learning models into production systems.",
    domains: ["Logistics", "E-commerce"],
    skills: [
      ["languages", "Python"], ["languages", "SQL"],
      ["frameworks", "Django"], ["frameworks", "Django REST Framework"], ["frameworks", "FastAPI"],
      ["libraries", "Pandas"], ["libraries", "Celery"], ["libraries", "scikit-learn"],
      ["databases", "PostgreSQL"], ["databases", "MongoDB"],
      ["tools", "Docker"], ["tools", "Airflow"],
      ["cloud", "Google Cloud Platform"],
    ].map(([category, name]) => ({ category, name })) as ResourceInput["skills"],
    education: [
      { level: "bachelor", degree: "B.Sc. in Computer Science and Engineering", institution: "Sample University", year: "2014" },
      { level: "master", degree: "M.Sc. in Computer Science", institution: "Sample University", year: "2017" },
    ],
    achievements: [{ kind: "award", name: "Ranked 15th, Sample National Collegiate Programming Contest 2013", issuer: "", year: "2013", credentialUrl: "" }],
    projects: [
      {
        name: "Delivery Route Optimizer",
        type: "Backend API",
        brief: "A service that plans daily delivery routes for a fleet of vans and predicts delivery time windows.",
        clientName: "Sample Logistics GmbH",
        atEnosis: true,
        industry: "Logistics",
        technologies: ["Python", "FastAPI", "PostgreSQL", "Celery", "scikit-learn"],
        contributions: ["Designed the route planning API", "Integrated an ETA prediction model into the dispatch flow", "Led a team of 4 engineers"],
      },
    ] as ResourceInput["projects"],
  },
  {
    name: "Sadia Karim",
    email: "sadia.karim@enosisbd.com",
    title: "Software Engineer",
    seniority: "Mid",
    yearsPrevious: 1,
    yearsEnosis: 2,
    availabilityStatus: "available",
    majorExpertise: "Mobile developer for native Android and cross-platform Flutter apps, with a focus on offline-first design and smooth UI.",
    domains: ["E-commerce"],
    skills: [
      ["languages", "Dart"], ["languages", "Kotlin"],
      ["frameworks", "Flutter"], ["frameworks", "Jetpack Compose"],
      ["libraries", "Riverpod"], ["libraries", "Retrofit"],
      ["databases", "SQLite"], ["databases", "Firestore"],
      ["cloud", "Firebase"],
    ].map(([category, name]) => ({ category, name })) as ResourceInput["skills"],
    education: [{ level: "bachelor", degree: "B.Sc. in Computer Science and Engineering", institution: "Sample Technical University", year: "2021" }],
    projects: [
      {
        name: "Grocery Delivery App",
        type: "Mobile application",
        brief: "A cross-platform shopping app with live order tracking.",
        clientName: "N/A",
        atEnosis: false,
        industry: "E-commerce",
        technologies: ["Flutter", "Dart", "Firebase", "Riverpod"],
        contributions: ["Built the cart and checkout flow", "Implemented offline caching of the product catalog"],
      },
    ] as ResourceInput["projects"],
  },
];

async function main() {
  const db = await createDb({ migrate: true });
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(resources);
  if (count > 0) {
    console.log(`Database already has ${count} resources; skipping seed.`);
    process.exit(0);
  }

  const actor = { email: "seed@enosisbd.com", source: "admin" as const };
  for (const raw of SEED) {
    const input = resourceInputSchema.parse(raw);
    await createResource(db, input, actor);
  }
  // Make one record stale so the stale filter has something to show.
  await db
    .update(resources)
    .set({ updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) })
    .where(eq(resources.email, "mahmud.chowdhury@enosisbd.com"));

  console.log(`Seeded ${SEED.length} sample resources (sample @enosisbd.com emails, unverified).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
