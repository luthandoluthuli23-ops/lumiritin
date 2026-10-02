// LOCAL DEVELOPMENT ONLY. Loads the airfields plus a FICTIONAL demo dataset (operators, pilots, empty legs,
// crew requests). It also wipes demo operators' empty legs, crew requests, pings and bench earnings, so it
// refuses to run against anything but a local database. For production use `npm run db:seed:airfields`.
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../lib/password";
import { seedAirfields } from "./airfields";

const isLocal = (() => {
  try {
    return ["localhost", "127.0.0.1", "::1", "db"].includes(new URL(process.env.DATABASE_URL ?? "").hostname);
  } catch {
    return false;
  }
})();
if (!isLocal && process.env.ALLOW_DEMO_SEED !== "1") {
  console.error(
    "Refusing to run the demo seed: DATABASE_URL does not point at a local database.\n" +
      "This seed deletes data. For production run `npm run db:seed:airfields` instead.\n" +
      "(Set ALLOW_DEMO_SEED=1 only if you are certain this is a throwaway database.)",
  );
  process.exit(1);
}

const db = new PrismaClient();
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);

// ─── Demo data ──────────────────────────────────────────────────────────────

async function seedDemoPilot() {
  return db.person.upsert({
    where: { email: "demo.pilot@example.com" },
    update: {},
    create: {
      fullName: "Demo Pilot",
      email: "demo.pilot@example.com",
      homeAirfieldIcao: "FALA",
      travelRadiusKm: 300,
      consents: {
        create: [
          { scope: "sacaa_verification", textVersion: "dev-1" },
          { scope: "whatsapp_notifications", textVersion: "dev-1" },
        ],
      },
      credentials: {
        create: {
          licenceNumber: "0270999999",
          licenceCategory: "ATPL(A)",
          portalStatus: "Valid (demo data)",
          issuedAt: new Date("2018-03-15"),
          expiresAt: inDays(164),
          ratings: {
            create: [
              { name: "B737-300/900", category: "Type", expiresAt: inDays(25) },
              { name: "Instrument Rating", category: "Class", expiresAt: inDays(85) },
              { name: "Night Rating", category: "Class" },
            ],
          },
        },
      },
      medicals: { create: { class: 1, expiresAt: inDays(6) } },
      logbook: { create: { totalHours: 4250.5, picHours: 2100, turbineHours: 3900, asOf: new Date() } },
    },
  });
}

async function seedDemoOperator() {
  const operator = await db.operator.upsert({
    where: { aocNumber: "DEMO-AOC-001" },
    update: { baseIcao: "FALA" },
    create: { name: "Demo Air Charter", aocNumber: "DEMO-AOC-001", contactEmail: "demo.operator@example.com", baseIcao: "FALA" },
  });

  const fleet = [
    { registration: "ZS-DMO", typeDesignator: "C525", baseIcao: "FALA", seatCapacity: 6, hourlyRateZar: 42_000 },
    { registration: "ZS-DMP", typeDesignator: "E55P", baseIcao: "FACT", seatCapacity: 8, hourlyRateZar: 46_000 },
    { registration: "ZS-DMQ", typeDesignator: "PC12", baseIcao: "FADN", seatCapacity: 8, hourlyRateZar: 27_000 },
    { registration: "ZS-PRV", typeDesignator: "C680", baseIcao: "FAPM", seatCapacity: 9, hourlyRateZar: 58_000 },
  ];
  const aircraft = [];
  for (const a of fleet) {
    aircraft.push(await db.aircraft.upsert({ where: { registration: a.registration }, update: a, create: { ...a, operatorId: operator.id } }));
  }

  // Empty legs. Re-running resets these, including any bookings against them.
  const at = (days: number, hour: number) => {
    const d = new Date(Date.now() + days * 86_400_000);
    d.setUTCHours(hour - 2, 0, 0, 0); // SAST = UTC+2
    return d;
  };
  await db.emptyLeg.deleteMany({ where: { operatorId: operator.id } });
  const legs = [
    { ac: 0, from: "FALA", to: "FACT", day: 2, h: 8, win: 4, std: 18500, disc: 6900, seats: 6 },
    { ac: 1, from: "FACT", to: "FALA", day: 3, h: 14, win: 3, std: 21000, disc: 8400, seats: 8 },
    { ac: 2, from: "FADN", to: "FAPE", day: 4, h: 9, win: 5, std: 9800, disc: 3400, seats: 8 },
    { ac: 3, from: "FAPM", to: "FALA", day: 6, h: 11, win: 2, std: 7200, disc: 2800, seats: 9 },
    { ac: 1, from: "FAOR", to: "FAKN", day: 7, h: 7, win: 3, std: 12500, disc: 4900, seats: 8 },
  ];
  for (const l of legs) {
    await db.emptyLeg.create({
      data: {
        operatorId: operator.id,
        aircraftId: aircraft[l.ac].id,
        originIcao: l.from,
        destinationIcao: l.to,
        departureStart: at(l.day, l.h),
        departureEnd: at(l.day, l.h + l.win),
        seatsOffered: l.seats,
        standardPricePerSeatZar: l.std,
        discountedPricePerSeatZar: l.disc,
      },
    });
  }

  await db.crewRequest.deleteMany({ where: { operatorId: operator.id } });
  await db.crewRequest.create({
    data: {
      operatorId: operator.id,
      aircraftId: aircraft[3].id,
      role: "PILOT",
      requiredRatings: ["C680"],
      minTotalHours: 1500,
      departureIcao: "FAPM",
      startsAt: at(5, 6),
      endsAt: at(5, 18),
    },
  });

  console.log(`Seeded ${legs.length} empty legs, ${fleet.length} aircraft and 1 crew request for ${operator.name}`);
  return operator;
}

// Demo logins exist for the dev-only role switcher. Their passwords are random and discarded, so nobody can sign in with them.
async function seedDemoUsers(personId: string, operatorId: string) {
  const unusable = () => hashPassword(randomBytes(32).toString("hex"));
  const users = [
    { email: "demo.passenger@example.com", role: "PASSENGER" as const, firstName: "Demo", lastName: "Passenger", homeAirfieldIcao: "FAPM" },
    { email: "demo.operator@example.com", role: "OPERATOR" as const, firstName: "Demo", lastName: "Operator", homeAirfieldIcao: "FALA", operatorId },
    { email: "demo.pilot@example.com", role: "PILOT" as const, firstName: "Demo", lastName: "Pilot", homeAirfieldIcao: "FALA", personId },
  ];
  for (const u of users) {
    await db.user.upsert({ where: { email: u.email }, update: { role: u.role }, create: { ...u, passwordHash: await unusable() } });
  }
  console.log(`Seeded ${users.length} demo users`);
}

// Fictional pilots chosen so the matching engine's every gate is visible in a demo. All hold a C680 rating unless noted.
//   Thandi (FAPM) / Sipho (FADN) / Anele (FACT)  freelancers, ranked by distance to a FAPM departure
//   Pieter (FALA)    rostered at Rival Charter and SHARED to the pool, so only operators that also share can reach him
//   Dirk (FAPM)      rostered at Rival Charter, NOT shared: never reachable by other operators
//   Lerato           medical expired        Johan  booked for the next 10 days     Zanele  holds E55P, not C680
//   Kabelo           never went available   Naledi  availability expired 2 h ago (auto-expiry → OFF)
async function seedPilotPool(demoOperatorId: string, demoPilotId: string) {
  const rival = await db.operator.upsert({
    where: { aocNumber: "DEMO-AOC-002" },
    update: {},
    create: { name: "Rival Charter (demo)", aocNumber: "DEMO-AOC-002", contactEmail: "rival@example.com", baseIcao: "FACT" },
  });

  type Spec = {
    n: number;
    name: string;
    home: string;
    ratings?: string[];
    hours: number;
    radius?: number;
    medicalDays?: number;
    available?: "yes" | "no" | "expired";
    bookedDays?: number;
    roster?: { operatorId: string; shared: boolean };
  };
  const pilots: Spec[] = [
    { n: 1, name: "Thandi Mokoena", home: "FAPM", hours: 3100, available: "yes" },
    { n: 2, name: "Pieter van Wyk", home: "FALA", hours: 6200, available: "yes", roster: { operatorId: rival.id, shared: true } },
    { n: 3, name: "Sipho Dlamini", home: "FADN", hours: 2100, radius: 100, available: "yes" },
    { n: 4, name: "Anele Naidoo", home: "FACT", hours: 4800, available: "yes" },
    { n: 5, name: "Lerato Khumalo", home: "FAPM", hours: 2500, medicalDays: -20, available: "yes" },
    { n: 6, name: "Johan Botha", home: "FAPM", hours: 3900, available: "yes", bookedDays: 10 },
    { n: 7, name: "Zanele Dube", home: "FAPM", hours: 2800, ratings: ["E55P"], available: "yes" },
    { n: 8, name: "Kabelo Sithole", home: "FAPM", hours: 3300, available: "no" },
    { n: 9, name: "Naledi Mbeki", home: "FAPM", hours: 3000, available: "expired" },
    { n: 10, name: "Dirk Pretorius", home: "FAPM", hours: 5200, available: "yes", roster: { operatorId: rival.id, shared: false } },
  ];

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  for (const p of pilots) {
    const email = `pool.pilot${p.n}@example.com`;
    const person = await db.person.upsert({
      where: { email },
      update: { homeAirfieldIcao: p.home, travelRadiusKm: p.radius ?? null },
      create: {
        fullName: p.name,
        email,
        homeAirfieldIcao: p.home,
        travelRadiusKm: p.radius ?? null,
        credentials: {
          create: {
            licenceNumber: `02710000${String(p.n).padStart(2, "0")}`,
            licenceCategory: "ATPL(A)",
            portalStatus: "Valid (demo data)",
            expiresAt: inDays(400),
            lastVerificationResult: "VERIFIED",
            lastVerifiedAt: hoursAgo(3),
            ratings: { create: (p.ratings ?? ["C680"]).map((name) => ({ name, category: "Type", expiresAt: inDays(300), source: "sacaa" })) },
          },
        },
        medicals: { create: { class: 1, expiresAt: inDays(p.medicalDays ?? 200) } },
        logbook: { create: { totalHours: p.hours, asOf: new Date() } },
      },
    });

    // Keep "verified recently" true on every re-seed, and reset the pilot's windows to the scenario.
    await db.credential.updateMany({ where: { personId: person.id }, data: { lastVerifiedAt: hoursAgo(3), lastVerificationResult: "VERIFIED" } });
    await db.availability.deleteMany({ where: { personId: person.id } });
    if (p.available === "yes") {
      await db.availability.create({ data: { personId: person.id, state: "AVAILABLE", source: "MANUAL", startsAt: hoursAgo(1), endsAt: inDays(6) } });
    } else if (p.available === "expired") {
      await db.availability.create({ data: { personId: person.id, state: "AVAILABLE", source: "MANUAL", startsAt: hoursAgo(30), endsAt: hoursAgo(2) } });
    }
    if (p.bookedDays) {
      await db.availability.create({ data: { personId: person.id, state: "BOOKED", source: "OPERATOR", operatorId: rival.id, startsAt: hoursAgo(1), endsAt: inDays(p.bookedDays), note: "Internal flights" } });
    }
    if (p.roster) {
      await db.crewRoster.upsert({
        where: { operatorId_personId: { operatorId: p.roster.operatorId, personId: person.id } },
        update: { status: "ACTIVE", sharedToPool: p.roster.shared },
        create: { operatorId: p.roster.operatorId, personId: person.id, status: "ACTIVE", sharedToPool: p.roster.shared },
      });
    }
  }

  // The demo pilot (the one the role switcher signs in as) is rostered at Demo Air Charter and shared to the pool,
  // which is what lets Demo Air reach Pieter in the shared pool. Reset to a clean slate each run.
  await db.credential.updateMany({ where: { personId: demoPilotId }, data: { lastVerifiedAt: hoursAgo(3), lastVerificationResult: "VERIFIED" } });
  await db.crewRoster.upsert({
    where: { operatorId_personId: { operatorId: demoOperatorId, personId: demoPilotId } },
    update: { status: "ACTIVE", sharedToPool: true },
    create: { operatorId: demoOperatorId, personId: demoPilotId, status: "ACTIVE", sharedToPool: true },
  });
  await db.availability.deleteMany({ where: { personId: demoPilotId } });
  await db.availability.create({ data: { personId: demoPilotId, state: "AVAILABLE", source: "MANUAL", startsAt: hoursAgo(1), endsAt: inDays(3) } });

  // Reset dispatch history so the demo starts clean.
  await db.benchEarning.deleteMany({});
  await db.crewPing.deleteMany({});
  console.log(`Seeded ${pilots.length} pool pilots, Rival Charter, and roster/availability for the demo pilot`);
}

async function main() {
  await seedAirfields(db);
  const person = await seedDemoPilot();
  console.log(`Seeded ${person.fullName}`);
  const operator = await seedDemoOperator();
  await seedDemoUsers(person.id, operator.id);
  await seedPilotPool(operator.id, person.id);
}

main().finally(() => db.$disconnect());
