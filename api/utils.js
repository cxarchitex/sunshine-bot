export function extractEmail(text) {
  if (!text) return null;

  const match = text.match(
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/
  );

  return match ? match[1].toLowerCase() : null;
}
