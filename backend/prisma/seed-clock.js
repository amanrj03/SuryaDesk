export const day = 86400_000
export const seedNow = new Date()
export const daysFrom = (date, days) => new Date(date.getTime() + days * day)
