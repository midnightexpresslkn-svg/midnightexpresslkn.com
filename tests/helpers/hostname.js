export function hostnameOf(value) {
  try {
    return new URL(String(value)).hostname;
  } catch {
    return "";
  }
}
