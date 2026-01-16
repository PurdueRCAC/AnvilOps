export const isRFC1123 = (value: string) =>
  value.length <= 63 &&
  value.match(/[a-zA-Z0-9]([-a-z0-9]*[a-z0-9])?$/) !== null;
