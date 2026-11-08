import { z } from "zod";

const hour = z.number().min(0).max(24).optional();
const optStr = (max: number) => z.string().trim().max(max).optional().or(z.literal("").transform(() => undefined));

/** One manually-entered or edited flight. Shared by the create and update routes. */
export const flightSchema = z.object({
  date: z.coerce.date(),
  departureIcao: z.string().trim().toUpperCase().max(8).optional().or(z.literal("").transform(() => undefined)),
  arrivalIcao: z.string().trim().toUpperCase().max(8).optional().or(z.literal("").transform(() => undefined)),
  aircraftType: optStr(16),
  aircraftReg: optStr(16),
  totalHours: z.number().min(0.1).max(24),
  picHours: hour,
  coPilotHours: hour,
  dualHours: hour,
  instructorHours: hour,
  nightHours: hour,
  instrumentHours: hour,
  multiEngineHours: hour,
  turbineHours: hour,
  dayLandings: z.number().int().min(0).max(50).optional(),
  nightLandings: z.number().int().min(0).max(50).optional(),
  certifier: optStr(80),
  remarks: optStr(300),
});

export type FlightInput = z.infer<typeof flightSchema>;

/** Map validated input to the columns shared by create and update (landings handled separately so edit can omit them). */
export function flightColumns(d: FlightInput) {
  return {
    date: d.date,
    departureIcao: d.departureIcao ?? null,
    arrivalIcao: d.arrivalIcao ?? null,
    aircraftType: d.aircraftType ?? null,
    aircraftReg: d.aircraftReg ?? null,
    totalHours: d.totalHours,
    picHours: d.picHours ?? null,
    coPilotHours: d.coPilotHours ?? null,
    dualHours: d.dualHours ?? null,
    instructorHours: d.instructorHours ?? null,
    nightHours: d.nightHours ?? null,
    instrumentHours: d.instrumentHours ?? null,
    multiEngineHours: d.multiEngineHours ?? null,
    turbineHours: d.turbineHours ?? null,
    dayLandings: d.dayLandings ?? 0,
    nightLandings: d.nightLandings ?? 0,
    certifier: d.certifier ?? null,
    remarks: d.remarks ?? null,
  };
}
