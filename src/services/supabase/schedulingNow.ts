/**
 * Returns the current instant normalized through Europe/Rome wall-clock time.
 * Keep this aligned with edge `_shared/schedulingNow.ts`.
 */
export function getNowInRome(): Date {
    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23"
    });

    const parts = formatter.formatToParts(new Date());
    const read = (type: string) =>
        parts.find(part => part.type === type)?.value ?? "00";

    return new Date(
        Number(read("year")),
        Number(read("month")) - 1,
        Number(read("day")),
        Number(read("hour")),
        Number(read("minute")),
        Number(read("second"))
    );
}
