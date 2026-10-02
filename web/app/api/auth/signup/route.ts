import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { ICAO_RE } from "@/lib/airfields";
import { hashPassword } from "@/lib/password";
import { toE164 } from "@/lib/phone";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { ROLE_HOME } from "@/lib/roles";
import { startSession } from "@/lib/session";

/** Version of the POPIA consent wording shown on the sign-up form. Bump when the wording changes. */
const CONSENT_TEXT_VERSION = "signup-v1";

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const icao = z.string().trim().toUpperCase().pipe(z.string().regex(ICAO_RE, "must be a 4-letter ICAO code"));
const phone = z.string().trim().transform((v, ctx) => {
  const e164 = toE164(v);
  if (!e164) ctx.addIssue({ code: "custom", message: "enter a valid phone number, e.g. 082 123 4567" });
  return e164 ?? z.NEVER;
});

const account = {
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(10, "use at least 10 characters").max(128),
  firstName: text(1, 60),
  lastName: text(1, 60),
};

const signupSchema = z.discriminatedUnion("role", [
  z.object({ role: z.literal("PASSENGER"), ...account, phone, homeAirfieldIcao: icao.optional() }),
  z.object({
    role: z.literal("OPERATOR"),
    ...account,
    companyName: text(2, 120),
    aocNumber: z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9][A-Z0-9 /-]{2,29}$/, "enter your AOC number")),
    baseIcao: icao,
  }),
  z.object({
    role: z.literal("PILOT"),
    ...account,
    licenceNumber: z.string().trim().pipe(z.string().regex(/^[A-Za-z0-9-]{4,20}$/, "letters, digits and hyphens only")),
    whatsapp: phone.optional().or(z.literal("").transform(() => undefined)),
    /** Used to rank the pilot by distance when crew requests come in. */
    homeAirfieldIcao: icao.optional().or(z.literal("").transform(() => undefined)),
    typeRatings: z.array(z.string().trim().toUpperCase().pipe(z.string().regex(/^[A-Z0-9][A-Z0-9/-]{1,15}$/, "invalid rating"))).max(12),
    consentVerification: z.literal(true, { error: "consent is required to verify your licence" }),
    consentWhatsapp: z.boolean().default(false),
  }),
]);

const fail = (status: number, error: string, issues?: { path: string; message: string }[]) =>
  NextResponse.json({ error, issues }, { status });

export async function POST(req: NextRequest) {
  // 10 attempts/hour/IP in production; relaxed in development so automated tests can run.
  const maxPerHour = process.env.NODE_ENV === "production" ? 10 : 500;
  if (isRateLimited(`signup:${clientIp(req)}`, maxPerHour, 60 * 60_000)) return fail(429, "rate_limited");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(400, "invalid_json");
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return fail(422, "validation_failed", parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  const input = parsed.data;

  if (input.role === "PILOT" && input.whatsapp && !input.consentWhatsapp) {
    return fail(422, "validation_failed", [{ path: "consentWhatsapp", message: "consent is required to send WhatsApp reminders" }]);
  }

  // Airfields must be real rows, not just well-formed codes.
  const airfieldCode = input.role === "OPERATOR" ? input.baseIcao : input.homeAirfieldIcao;
  if (airfieldCode && !(await db.airfield.findUnique({ where: { icao: airfieldCode }, select: { icao: true } }))) {
    return fail(422, "validation_failed", [{ path: input.role === "OPERATOR" ? "baseIcao" : "homeAirfieldIcao", message: "unknown airfield" }]);
  }

  const passwordHash = await hashPassword(input.password);
  const common = { email: input.email, passwordHash, role: input.role, firstName: input.firstName, lastName: input.lastName };

  try {
    const user = await db.$transaction(async (tx) => {
      switch (input.role) {
        case "PASSENGER":
          return tx.user.create({ data: { ...common, phone: input.phone, homeAirfieldIcao: input.homeAirfieldIcao } });

        case "OPERATOR": {
          const operator = await tx.operator.create({
            data: { name: input.companyName, aocNumber: input.aocNumber, contactEmail: input.email, baseIcao: input.baseIcao },
          });
          return tx.user.create({ data: { ...common, operatorId: operator.id, homeAirfieldIcao: input.baseIcao } });
        }

        case "PILOT": {
          const person = await tx.person.create({
            data: {
              fullName: `${input.firstName} ${input.lastName}`,
              email: input.email,
              whatsappE164: input.whatsapp,
              homeAirfieldIcao: input.homeAirfieldIcao,
              role: "PILOT",
              consents: {
                create: [
                  { scope: "sacaa_verification", textVersion: CONSENT_TEXT_VERSION },
                  ...(input.whatsapp && input.consentWhatsapp ? [{ scope: "whatsapp_notifications", textVersion: CONSENT_TEXT_VERSION }] : []),
                ],
              },
              credentials: {
                create: {
                  licenceNumber: input.licenceNumber,
                  // Self-declared, no expiry: the nightly verifier fills real dates once the portal is connected.
                  ratings: { create: [...new Set(input.typeRatings)].map((name) => ({ name, category: "Type", source: "self-declared" })) },
                },
              },
            },
          });
          return tx.user.create({ data: { ...common, phone: input.whatsapp, personId: person.id } });
        }
      }
    });

    await startSession(user);
    return NextResponse.json({ redirect: ROLE_HOME[input.role] }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = String(err.meta?.target ?? "");
      if (target.includes("licenceNumber")) return fail(409, "licence_already_registered");
      if (target.includes("aocNumber")) return fail(409, "aoc_already_registered");
      return fail(409, "email_in_use");
    }
    throw err;
  }
}
