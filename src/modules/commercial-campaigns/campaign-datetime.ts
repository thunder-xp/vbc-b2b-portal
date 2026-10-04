export function toCampaignDateTimeInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : date.toISOString().slice(0, 16);
}

export function fromCampaignDateTimeInput(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Invalid campaign date-time input.");
  }

  const date = new Date(`${value}:00.000Z`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("Invalid campaign date-time input.");
  }

  return date.toISOString();
}
